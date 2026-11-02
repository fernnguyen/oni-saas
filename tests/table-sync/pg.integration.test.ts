import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool as PgPool } from 'pg'

import { PostgresConnector } from '../../packages/adapters/src/postgresAdapter'
import { applyTableOps, type TableOp } from '../../apps/web/lib/server/tableSync/engine'
import { createPgTableSyncRepo } from '../../apps/web/lib/server/tableSync/pgRepository'
import { createTableSyncOutbox, catchUpTableChanges, type TableSyncStorage, type TableSyncTransport } from '../../packages/core/src/tableSync/client'
import { TableSyncError } from '../../apps/web/lib/server/tableSync/engine'
import {
  applyTableSessionOps,
  cancelTableSession,
  closeTableSessionForOrder,
  endTableSessionForCancelledOrder,
  getTableSyncChanges,
  quoteTableSession,
  transferTableSession,
} from '../../apps/web/lib/server/tableSync/service'

// Plan: docs/TABLE-SESSION-SYNC-PLAN.md – Phase 1 (1.1 schema, 1.2 transactions, 1.3 ops).
// Needs a DISPOSABLE database with the drizzle schema pushed:
//   createdb oni_table_sync_test
//   LOCAL_PG_URI=<uri> pnpm -C packages/adapters exec drizzle-kit push --config=drizzle.pg.config.ts --force
//   TABLE_SYNC_TEST_PG_URI=<uri> pnpm test:table-sync
// Skipped when TABLE_SYNC_TEST_PG_URI is not set. Refuses to run on a database whose name
// does not contain "test".

const uri = process.env.TABLE_SYNC_TEST_PG_URI || ''
const skip = !uri ? 'TABLE_SYNC_TEST_PG_URI not set' : false

const TENANT = 'tenant-tsync-test'
const BRANCH = 'branch-tsync-test'
// `pg` is a dependency of packages/adapters, not of the repo root
const requireFromAdapters = createRequire(path.resolve(process.cwd(), 'packages/adapters/package.json'))
let pool: PgPool
let connector: PostgresConnector

async function seedResource(id: string, extra: { status?: string; hourly_rate?: string; metadata?: Record<string, unknown>; current_order_id?: string } = {}) {
  await pool.query(
    `INSERT INTO location_resources (id, tenant_id, branch_id, name, status, current_order_id, hourly_rate, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, TENANT, BRANCH, `Bàn ${id}`, extra.status || 'available', extra.current_order_id || '', extra.hourly_rate || '60000', JSON.stringify(extra.metadata || { charge_by_minute: true })]
  )
}

async function seedSession(sessionId: string, orderId: string, resourceId: string, status = 'open', checkIn = '2026-11-02T01:00:00.000Z') {
  await pool.query(
    `INSERT INTO orders (id, tenant_id, branch_id, status, subtotal, total_amount, discount_amount, tax_amount, shipping_fee, metadata)
     VALUES ($1, $2, $3, $4, '0', '0', '0', '0', '0', $5)`,
    [orderId, TENANT, BRANCH, status === 'open' ? 'in_progress' : 'completed', JSON.stringify({ resource_id: resourceId, session_id: sessionId })]
  )
  await pool.query(
    `INSERT INTO table_sessions (id, tenant_id, branch_id, resource_id, order_id, status, check_in, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
    [sessionId, TENANT, BRANCH, resourceId, orderId, status, checkIn]
  )
}

const apply = (sessionId: string, deviceId: string, ops: TableOp[], c: PostgresConnector = connector) =>
  c.withTransaction((tx) => applyTableOps(createPgTableSyncRepo(tx), { sessionId, deviceId, ops }))

const add = (op_id: string, qty = 1): TableOp => ({ op_id, type: 'add_item', product_id: 'P-BIA', product_name: 'Bia', unit_price: 20000, qty })

before(async () => {
  if (skip) return
  const { Pool } = requireFromAdapters('pg') as typeof import('pg')
  pool = new Pool({ connectionString: uri, max: 20 })
  const { rows } = await pool.query('SELECT current_database() AS db')
  if (!String(rows[0].db).includes('test')) throw new Error(`Refusing to run on non-test database ${rows[0].db}`)
  for (const t of ['table_sync_events', 'order_item_ops', 'table_sessions', 'order_items', 'orders', 'location_resources']) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT])
  }
  connector = new PostgresConnector(uri, TENANT, BRANCH)
})

after(async () => {
  if (skip) return
  // PostgresConnector's module-level pool cache stays open; the npm script uses --test-force-exit
  await pool.end()
})

test('pg: ops persist lines, totals, op log and events in one transaction', { skip }, async () => {
  await seedSession('S-basic-0001', 'O-basic-1', 'T-basic')
  const r = await apply('S-basic-0001', 'dev-A', [add('basic-1', 2), add('basic-2', 1)])
  assert.equal(r.session_version, 3)
  const items = (await pool.query(`SELECT qty, line_total, active FROM order_items WHERE order_id = 'O-basic-1'`)).rows
  assert.equal(items.length, 1)
  assert.equal(items[0].qty, '3')
  assert.equal(items[0].line_total, '60000')
  const order = (await pool.query(`SELECT subtotal, total_amount, metadata FROM orders WHERE id = 'O-basic-1'`)).rows[0]
  assert.equal(order.total_amount, '60000')
  assert.equal(order.metadata.cartItemsCount, 3)
  assert.equal(Number((await pool.query(`SELECT count(*) FROM order_item_ops WHERE session_id = 'S-basic-0001'`)).rows[0].count), 2)
  assert.equal(Number((await pool.query(`SELECT count(*) FROM table_sync_events WHERE session_id = 'S-basic-0001'`)).rows[0].count), 2)
})

test('pg: 10 devices adding concurrently never lose an increment', { skip }, async () => {
  await seedSession('S-conc-0001', 'O-conc-1', 'T-conc')
  await Promise.all(Array.from({ length: 10 }, (_, i) => apply('S-conc-0001', `dev-${i}`, [add(`conc-${i}`)])))
  const items = (await pool.query(`SELECT qty FROM order_items WHERE order_id = 'O-conc-1' AND active = 'TRUE'`)).rows
  assert.equal(items.length, 1)
  assert.equal(items[0].qty, '10')
  const s = (await pool.query(`SELECT version FROM table_sessions WHERE id = 'S-conc-0001'`)).rows[0]
  assert.equal(s.version, 11)
})

test('pg: the same op_id sent 5 times in parallel (retries) is applied once', { skip }, async () => {
  await seedSession('S-idem-0001', 'O-idem-1', 'T-idem')
  const results = await Promise.all(Array.from({ length: 5 }, () => apply('S-idem-0001', 'dev-A', [add('idem-op', 2)])))
  const items = (await pool.query(`SELECT qty FROM order_items WHERE order_id = 'O-idem-1'`)).rows
  assert.equal(items[0].qty, '2')
  assert.equal(results.filter((r) => !r.results[0].replayed).length, 1)
})

test('pg: a failing batch rolls back every op of that batch', { skip }, async () => {
  // Session points at an order row that does not exist → insertLine throws mid-batch
  await pool.query(
    `INSERT INTO table_sessions (id, tenant_id, branch_id, resource_id, order_id, status, check_in, version)
     VALUES ('S-rb-00001', $1, $2, 'T-rb', 'O-missing', 'open', '2026-11-02T01:00:00.000Z', 1)`,
    [TENANT, BRANCH]
  )
  await assert.rejects(apply('S-rb-00001', 'dev-A', [add('rb-1')]))
  assert.equal(Number((await pool.query(`SELECT count(*) FROM order_item_ops WHERE session_id = 'S-rb-00001'`)).rows[0].count), 0)
  assert.equal(Number((await pool.query(`SELECT count(*) FROM table_sync_events WHERE session_id = 'S-rb-00001'`)).rows[0].count), 0)
  assert.equal((await pool.query(`SELECT version FROM table_sessions WHERE id = 'S-rb-00001'`)).rows[0].version, 1)
})

test('pg: only one open session per resource (partial unique index), closed ones are fine', { skip }, async () => {
  await seedSession('S-uq-00001', 'O-uq-1', 'T-uq', 'closed')
  await seedSession('S-uq-00002', 'O-uq-2', 'T-uq', 'open')
  await assert.rejects(seedSession('S-uq-00003', 'O-uq-3', 'T-uq', 'open'), (e: any) => e.code === '23505')
})

test('pg: another tenant cannot touch the session', { skip }, async () => {
  await seedSession('S-ten-0001', 'O-ten-1', 'T-ten')
  const other = new PostgresConnector(uri, 'tenant-other', BRANCH)
  await assert.rejects(apply('S-ten-0001', 'dev-X', [add('ten-1')], other), (e: any) => e.status === 404)
})

test('pg: closed session rejects late offline ops and keeps the paid order unchanged', { skip }, async () => {
  await seedSession('S-closed-01', 'O-closed-1', 'T-closed', 'closed')
  const r = await apply('S-closed-01', 'dev-A', [add('late-1')])
  assert.equal(r.results[0].reason, 'session_not_open')
  assert.equal(Number((await pool.query(`SELECT count(*) FROM order_items WHERE order_id = 'O-closed-1'`)).rows[0].count), 0)
})

test('pg: change feed returns ordered events after a cursor, paginated', { skip }, async () => {
  const all = await getTableSyncChanges(connector as any, BRANCH, 0, 1000)
  assert.ok(all.events.length >= 5)
  const seqs = all.events.map((e) => e.seq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b))
  const page = await getTableSyncChanges(connector as any, BRANCH, 0, 2)
  assert.equal(page.events.length, 2)
  assert.equal(page.has_more, true)
  const next = await getTableSyncChanges(connector as any, BRANCH, page.cursor, 1000)
  assert.equal(next.events[0].seq > page.cursor, true)
  const otherBranch = await getTableSyncChanges(connector as any, 'branch-other', 0, 1000)
  assert.equal(otherBranch.events.length, 0)
})

// ── Phase 2: quote / close / cancel / transfer ────────────────────────────────

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0]

test('pg: quote computes the time charge server-side from a frozen pricing snapshot', { skip }, async () => {
  await seedResource('T-q1', { status: 'occupied', current_order_id: 'O-q1' })
  await seedSession('S-quote-01', 'O-q1', 'T-q1', 'open', minutesAgo(90))
  await apply('S-quote-01', 'dev-A', [add('q1-beer', 2)])
  const q = await quoteTableSession(connector as any, BRANCH, 'S-quote-01', { device_id: 'dev-A' })
  assert.ok(q.time_charge.amount >= 90000 && q.time_charge.amount <= 92000, `amount ${q.time_charge.amount}`)
  assert.equal(q.order_totals?.total_amount, 40000 + q.time_charge.amount)
  assert.ok(new Date(q.expires_at).getTime() > Date.now())

  // owner raises the price mid-session → the open bill keeps the snapshot
  await pool.query(`UPDATE location_resources SET hourly_rate = '999999' WHERE id = 'T-q1'`)
  const q2 = await quoteTableSession(connector as any, BRANCH, 'S-quote-01', {})
  assert.ok(q2.time_charge.amount < 100000)
  const tcLines = (await pool.query(`SELECT count(*)::int AS n FROM order_items WHERE order_id = 'O-q1' AND active = 'TRUE' AND product_id LIKE 'TIME_CHARGE%'`)).rows[0]
  assert.equal(tcLines.n, 1, 're-quote replaces the single time-charge line')
})

test('pg: quote accepts a plausible device checkout time, ignores a future one', { skip }, async () => {
  await seedResource('T-q2')
  await seedSession('S-quote-02', 'O-q2', 'T-q2', 'open', minutesAgo(120))
  const past = await quoteTableSession(connector as any, BRANCH, 'S-quote-02', { checkout_at: minutesAgo(60) })
  assert.equal(past.checkout_source, 'client')
  assert.ok(past.time_charge.amount >= 60000 && past.time_charge.amount <= 61000)
  const future = await quoteTableSession(connector as any, BRANCH, 'S-quote-02', { checkout_at: new Date(Date.now() + 3600_000).toISOString() })
  assert.equal(future.checkout_source, 'server')
})

test('pg: quote on a closed session → 409', { skip }, async () => {
  await seedResource('T-q3')
  await seedSession('S-quote-03', 'O-q3', 'T-q3', 'closed')
  await assert.rejects(quoteTableSession(connector as any, BRANCH, 'S-quote-03', {}), (e: any) => e.status === 409)
})

test('pg: checkout with a valid quote closes the session without discrepancy; repeat is idempotent', { skip }, async () => {
  await seedResource('T-c1', { status: 'occupied', current_order_id: 'O-c1' })
  await seedSession('S-close-01', 'O-c1', 'T-c1', 'open', minutesAgo(30))
  const q = await quoteTableSession(connector as any, BRANCH, 'S-close-01', {})
  const meta = { resource_id: 'T-c1', session_id: 'S-close-01', quote_id: q.quote_id, check_out: q.checkout_at }
  const r = await closeTableSessionForOrder(connector, BRANCH, { orderId: 'O-c1', orderMetadata: meta, clientTimeCharge: q.time_charge.amount })
  assert.ok(r && 'closed' in r)
  const s = await one(`SELECT status, check_out, metadata FROM table_sessions WHERE id = 'S-close-01'`)
  assert.equal(s.status, 'closed')
  assert.equal(s.metadata.billing.billing_discrepancy, false)
  assert.equal(s.metadata.billing.quote_valid, true)
  const again = await closeTableSessionForOrder(connector, BRANCH, { orderId: 'O-c1', orderMetadata: meta, clientTimeCharge: 1 })
  assert.ok(again && 'alreadyClosed' in again)
})

test('pg: offline provisional close with a wrong amount is closed but flagged (paid amount untouched)', { skip }, async () => {
  await seedResource('T-c2')
  await seedSession('S-close-02', 'O-c2', 'T-c2', 'open', minutesAgo(180))
  const checkOut = minutesAgo(60) // device closed 1h ago, syncs now
  const meta = { resource_id: 'T-c2', session_id: 'S-close-02', check_out: checkOut, provisional_close: true }
  // correct for 120 min @ 60k/h per-minute = 120000 → within tolerance
  const ok = await closeTableSessionForOrder(connector, BRANCH, { orderId: 'O-c2', orderMetadata: meta, clientTimeCharge: 121000 })
  assert.ok(ok && 'closed' in ok && ok.billing.billing_discrepancy === false)
  assert.equal(ok && 'closed' in ok && ok.billing.provisional, true)

  await seedResource('T-c3')
  await seedSession('S-close-03', 'O-c3', 'T-c3', 'open', minutesAgo(180))
  const bad = await closeTableSessionForOrder(connector, BRANCH, {
    orderId: 'O-c3',
    orderMetadata: { ...meta, session_id: 'S-close-03', resource_id: 'T-c3' },
    clientTimeCharge: 50000,
  })
  assert.ok(bad && 'closed' in bad && bad.billing.billing_discrepancy === true)
  assert.equal((await one(`SELECT status FROM table_sessions WHERE id = 'S-close-03'`)).status, 'closed')
})

test('pg: close hook ignores orders without a v2 session or with a mismatched order id', { skip }, async () => {
  assert.equal(await closeTableSessionForOrder(connector, BRANCH, { orderId: 'O-retail', orderMetadata: { channel: 'pos' } }), null)
  await seedResource('T-c4')
  await seedSession('S-close-04', 'O-c4', 'T-c4', 'open')
  assert.equal(await closeTableSessionForOrder(connector, BRANCH, { orderId: 'O-other', orderMetadata: { session_id: 'S-close-04' } }), null)
  assert.equal((await one(`SELECT status FROM table_sessions WHERE id = 'S-close-04'`)).status, 'open')
})

test('pg: cancel refuses a session with items, cancels an empty one and frees the table', { skip }, async () => {
  await seedResource('T-x1', { status: 'occupied', current_order_id: 'O-x1' })
  await seedSession('S-cancel-1', 'O-x1', 'T-x1', 'open')
  await apply('S-cancel-1', 'dev-A', [add('x1-beer')])
  await assert.rejects(cancelTableSession(connector as any, BRANCH, 'S-cancel-1', {}), (e: any) => e.code === 'session_has_items')

  await seedResource('T-x2', { status: 'occupied', current_order_id: 'O-x2' })
  await seedSession('S-cancel-2', 'O-x2', 'T-x2', 'open')
  await cancelTableSession(connector as any, BRANCH, 'S-cancel-2', { reason: 'khách về' })
  assert.equal((await one(`SELECT status FROM table_sessions WHERE id = 'S-cancel-2'`)).status, 'cancelled')
  assert.equal((await one(`SELECT status FROM orders WHERE id = 'O-x2'`)).status, 'cancelled')
  const res = await one(`SELECT status, current_order_id FROM location_resources WHERE id = 'T-x2'`)
  assert.equal(res.status, 'available')
  assert.equal(res.current_order_id, '')
})

test('pg: transfer moves session + order to a free table and frees the source', { skip }, async () => {
  await seedResource('T-from', { status: 'occupied', current_order_id: 'O-tr1' })
  await seedResource('T-to')
  await seedSession('S-trans-01', 'O-tr1', 'T-from', 'open')
  await transferTableSession(connector as any, BRANCH, 'S-trans-01', { target_resource_id: 'T-to' })
  assert.equal((await one(`SELECT resource_id FROM table_sessions WHERE id = 'S-trans-01'`)).resource_id, 'T-to')
  const order = await one(`SELECT resource_id, metadata FROM orders WHERE id = 'O-tr1'`)
  assert.equal(order.resource_id, 'T-to')
  assert.equal(order.metadata.resource_id, 'T-to')
  assert.equal(order.metadata.session_id, 'S-trans-01')
  const to = await one(`SELECT status, current_order_id FROM location_resources WHERE id = 'T-to'`)
  assert.deepEqual([to.status, to.current_order_id], ['occupied', 'O-tr1'])
  const from = await one(`SELECT status, current_order_id FROM location_resources WHERE id = 'T-from'`)
  assert.deepEqual([from.status, from.current_order_id], ['available', ''])
})

test('pg: transfer onto a table with an open session → 409, nothing moves', { skip }, async () => {
  await seedResource('T-busy-a', { status: 'occupied', current_order_id: 'O-tr2' })
  await seedResource('T-busy-b', { status: 'occupied', current_order_id: 'O-tr3' })
  await seedSession('S-trans-02', 'O-tr2', 'T-busy-a', 'open')
  await seedSession('S-trans-03', 'O-tr3', 'T-busy-b', 'open')
  await assert.rejects(transferTableSession(connector as any, BRANCH, 'S-trans-02', { target_resource_id: 'T-busy-b' }), (e: any) => e.code === 'target_occupied')
  assert.equal((await one(`SELECT resource_id FROM table_sessions WHERE id = 'S-trans-02'`)).resource_id, 'T-busy-a')
  assert.equal((await one(`SELECT current_order_id FROM location_resources WHERE id = 'T-busy-a'`)).current_order_id, 'O-tr2')
})

// ── End-to-end: client outbox ⇄ real server engine (one device offline, one online) ──

function memStorage(): TableSyncStorage & { state: any } {
  const state = { outbox: [] as any[], inbox: [] as any[], cursor: 0 }
  return {
    state,
    async loadOutbox() { return JSON.parse(JSON.stringify(state.outbox)) },
    async saveOutbox(e) { state.outbox = JSON.parse(JSON.stringify(e)) },
    async loadInbox() { return JSON.parse(JSON.stringify(state.inbox)) },
    async saveInbox(i) { state.inbox = JSON.parse(JSON.stringify(i)) },
    async loadCursor() { return state.cursor },
    async saveCursor(c) { state.cursor = c },
  }
}

/** In-process transport hitting the real service layer; `online()` toggles the network. */
function serviceTransport(isOnline: () => boolean): TableSyncTransport {
  const guard = () => { if (!isOnline()) throw new Error('network down') }
  const wrap = async (fn: () => Promise<any>) => {
    try { return { status: 200, body: await fn() } } catch (e: any) {
      if (e instanceof TableSyncError) return { status: e.status, body: { error: e.code } }
      throw e
    }
  }
  return {
    async openSession() { guard(); return { status: 200, body: {} } },
    async sendOps(sessionId, body) { guard(); return wrap(() => applyTableSessionOps(connector as any, BRANCH, { sessionId, deviceId: body.device_id, ops: body.ops as any })) },
    async getChanges(since, limit) { guard(); return wrap(() => getTableSyncChanges(connector as any, BRANCH, since, limit)) },
  }
}

test('e2e: device A offline + device B online on the same table → nothing lost, quantities summed', { skip }, async () => {
  await seedResource('T-e2e1', { status: 'occupied', current_order_id: 'O-e2e1' })
  await seedSession('S-e2e-0001', 'O-e2e1', 'T-e2e1', 'open', minutesAgo(30))
  let aOnline = true
  const storeA = memStorage()
  const storeB = memStorage()
  const A = createTableSyncOutbox({ storage: storeA, transport: serviceTransport(() => aOnline), deviceId: 'dev-A' })
  const B = createTableSyncOutbox({ storage: storeB, transport: serviceTransport(() => true), deviceId: 'dev-B' })
  const beerOp = { type: 'add_item' as const, product_id: 'P-BIA', product_name: 'Bia', unit_price: 20000, qty: 1 }

  aOnline = false
  await A.enqueueOps('S-e2e-0001', [beerOp, { type: 'add_item', product_id: 'P-LAC', product_name: 'Lạc', unit_price: 15000, qty: 1 }])
  const offlineFlush = await A.flush()
  assert.equal(offlineFlush.offline, true)

  await B.enqueueOps('S-e2e-0001', [{ ...beerOp, qty: 2 }])
  await B.flush()

  aOnline = true
  await A.flush()
  await A.flush() // a second flush after reconnect must not duplicate anything
  assert.equal(storeA.state.outbox.length, 0)

  const lines = (await pool.query(`SELECT product_id, qty FROM order_items WHERE order_id = 'O-e2e1' AND active = 'TRUE' ORDER BY product_id`)).rows
  assert.deepEqual(lines.map((l: any) => [l.product_id, l.qty]), [['P-BIA', '3'], ['P-LAC', '1']])
  assert.equal((await one(`SELECT total_amount FROM orders WHERE id = 'O-e2e1'`)).total_amount, '75000')

  const feed = await catchUpTableChanges(serviceTransport(() => true), storeA)
  assert.ok(feed.events.some((e) => e.session_id === 'S-e2e-0001' && e.payload?.device_id === 'dev-B'))
})

test('e2e: B checks out while A is offline → A\'s late items go to A\'s conflict inbox, paid order untouched', { skip }, async () => {
  await seedResource('T-e2e2', { status: 'occupied', current_order_id: 'O-e2e2' })
  await seedSession('S-e2e-0002', 'O-e2e2', 'T-e2e2', 'open', minutesAgo(30))
  let aOnline = false
  const storeA = memStorage()
  const A = createTableSyncOutbox({ storage: storeA, transport: serviceTransport(() => aOnline), deviceId: 'dev-A' })
  await A.enqueueOps('S-e2e-0002', [{ type: 'add_item', product_id: 'P-BIA', product_name: 'Bia', unit_price: 20000, qty: 4 }])
  await A.flush()

  // B (online) quotes and checks out through the normal checkout pipeline → session closed
  const q = await quoteTableSession(connector as any, BRANCH, 'S-e2e-0002', { device_id: 'dev-B' })
  await closeTableSessionForOrder(connector, BRANCH, {
    orderId: 'O-e2e2',
    orderMetadata: { session_id: 'S-e2e-0002', quote_id: q.quote_id, check_out: q.checkout_at },
    clientTimeCharge: q.time_charge.amount,
  })
  await pool.query(`UPDATE orders SET status = 'completed' WHERE id = 'O-e2e2'`)

  aOnline = true
  const r = await A.flush()
  assert.equal(r.rejected, 1)
  assert.equal(storeA.state.outbox.length, 0)
  assert.equal(storeA.state.inbox.length, 1)
  assert.equal(storeA.state.inbox[0].reason, 'session_not_open')
  const beer = (await pool.query(`SELECT count(*)::int AS n FROM order_items WHERE order_id = 'O-e2e2' AND product_id = 'P-BIA'`)).rows[0]
  assert.equal(beer.n, 0, 'late offline items never land in the paid order')
})

test('pg: cancelling an order through the legacy route ends its v2 session', { skip }, async () => {
  await seedResource('T-lc1')
  await seedSession('S-legacy-01', 'O-lc1', 'T-lc1', 'open')
  await apply('S-legacy-01', 'dev-A', [add('lc1-beer')])
  await pool.query(`UPDATE orders SET status = 'cancelled' WHERE id = 'O-lc1'`)
  assert.equal(await endTableSessionForCancelledOrder(connector, BRANCH, 'O-lc1', { session_id: 'S-legacy-01' }), true)
  assert.equal((await one(`SELECT status FROM table_sessions WHERE id = 'S-legacy-01'`)).status, 'cancelled')
  // retail / legacy orders without session_id: no-op
  assert.equal(await endTableSessionForCancelledOrder(connector, BRANCH, 'O-retail', { channel: 'pos' }), false)
  // order still in progress: never ended
  await seedResource('T-lc2')
  await seedSession('S-legacy-02', 'O-lc2', 'T-lc2', 'open')
  assert.equal(await endTableSessionForCancelledOrder(connector, BRANCH, 'O-lc2', { session_id: 'S-legacy-02' }), false)
  assert.equal((await one(`SELECT status FROM table_sessions WHERE id = 'S-legacy-02'`)).status, 'open')
})
