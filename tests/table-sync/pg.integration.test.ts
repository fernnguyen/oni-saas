import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool as PgPool } from 'pg'

import { PostgresConnector } from '../../packages/adapters/src/postgresAdapter'
import { applyTableOps, type TableOp } from '../../apps/web/lib/server/tableSync/engine'
import { createPgTableSyncRepo } from '../../apps/web/lib/server/tableSync/pgRepository'
import { getTableSyncChanges } from '../../apps/web/lib/server/tableSync/service'

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

async function seedSession(sessionId: string, orderId: string, resourceId: string, status = 'open') {
  await pool.query(
    `INSERT INTO orders (id, tenant_id, branch_id, status, subtotal, total_amount, discount_amount, tax_amount, shipping_fee, metadata)
     VALUES ($1, $2, $3, $4, '0', '0', '0', '0', '0', $5)`,
    [orderId, TENANT, BRANCH, status === 'open' ? 'in_progress' : 'completed', JSON.stringify({ resource_id: resourceId })]
  )
  await pool.query(
    `INSERT INTO table_sessions (id, tenant_id, branch_id, resource_id, order_id, status, check_in, version)
     VALUES ($1, $2, $3, $4, $5, $6, '2026-11-02T01:00:00.000Z', 1)`,
    [sessionId, TENANT, BRANCH, resourceId, orderId, status]
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
  for (const t of ['table_sync_events', 'order_item_ops', 'table_sessions', 'order_items', 'orders']) {
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
