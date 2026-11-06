import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool as PgPool } from 'pg'

import { PostgresConnector } from '../../packages/adapters/src/postgresAdapter'
import type { TableOp } from '../../apps/web/lib/server/tableSync/engine'
import { applyTableSessionOps } from '../../apps/web/lib/server/tableSync/service'
import {
  fireKitchenForSession, generateKitchenTicketsForQr, getSessionKitchenStatus, listKitchenTickets, markTicketPrinted, setTicketDone, setTicketItemStatus,
} from '../../apps/web/lib/server/kitchen/tickets'

// Bar/Bếp K1 against a DISPOSABLE Postgres (same DB as the table-sync integration tests):
//   KITCHEN_TEST_PG_URI=<uri of a db whose name contains "test"> pnpm test:kitchen
// Falls back to TABLE_SYNC_TEST_PG_URI. Skipped when neither is set.

const uri = process.env.KITCHEN_TEST_PG_URI || process.env.TABLE_SYNC_TEST_PG_URI || ''
const skip = !uri ? 'KITCHEN_TEST_PG_URI / TABLE_SYNC_TEST_PG_URI not set' : false

const TENANT = 'tenant-kitchen-test'
const BRANCH = 'branch-kitchen-test'
const requireFromAdapters = createRequire(path.resolve(process.cwd(), 'packages/adapters/package.json'))
let pool: PgPool
let connector: PostgresConnector

async function seedSession(sessionId: string, orderId: string, resourceId: string) {
  await pool.query(
    `INSERT INTO location_resources (id, tenant_id, branch_id, name, status, hourly_rate) VALUES ($1, $2, $3, $4, 'occupied', '0')`,
    [resourceId, TENANT, BRANCH, `Bàn ${resourceId}`],
  )
  await pool.query(
    `INSERT INTO orders (id, tenant_id, branch_id, status, subtotal, total_amount, discount_amount, tax_amount, shipping_fee, metadata)
     VALUES ($1, $2, $3, 'in_progress', '0', '0', '0', '0', '0', $4)`,
    [orderId, TENANT, BRANCH, JSON.stringify({ resource_id: resourceId, session_id: sessionId })],
  )
  await pool.query(
    `INSERT INTO table_sessions (id, tenant_id, branch_id, resource_id, order_id, status, check_in, version)
     VALUES ($1, $2, $3, $4, $5, 'open', '2026-11-06T01:00:00.000Z', 1)`,
    [sessionId, TENANT, BRANCH, resourceId, orderId],
  )
}

async function seedStations() {
  await pool.query(
    `INSERT INTO prep_stations (id, tenant_id, branch_id, name, kind, output, is_default) VALUES
       ('ST-K', $1, $2, 'Bếp', 'kitchen', 'print', 'TRUE'), ('ST-B', $1, $2, 'Bar', 'bar', 'print', 'FALSE')`,
    [TENANT, BRANCH],
  )
  await pool.query(
    `INSERT INTO prep_station_routes (id, tenant_id, branch_id, station_id, target_type, target_id)
     VALUES ('R1', $1, $2, 'ST-B', 'category', 'CAT-DRINK')`,
    [TENANT, BRANCH],
  )
  await pool.query(
    `INSERT INTO products (id, tenant_id, branch_id, name, category_id) VALUES
       ('KP-CAFE', $1, $2, 'Cà phê', 'CAT-DRINK'), ('KP-PHO', $1, $2, 'Phở', 'CAT-FOOD')`,
    [TENANT, BRANCH],
  )
}

const add = (op_id: string, product_id: string, qty = 1, extra: Record<string, unknown> = {}): TableOp =>
  ({ op_id, type: 'add_item', product_id, product_name: product_id === 'KP-CAFE' ? 'Cà phê' : 'Phở', unit_price: 30000, qty, ...extra }) as TableOp

const ticketsOf = async (sessionId: string) =>
  (await listKitchenTickets(connector, BRANCH, { status: 'all', limit: 300 })).filter((t) => t.session_id === sessionId)

before(async () => {
  if (skip) return
  const { Pool } = requireFromAdapters('pg') as typeof import('pg')
  pool = new Pool({ connectionString: uri, max: 10 })
  const { rows } = await pool.query('SELECT current_database() AS db')
  if (!String(rows[0].db).includes('test')) throw new Error(`Refusing to run on non-test database ${rows[0].db}`)
  for (const t of ['kitchen_fired_ops', 'kitchen_ticket_items', 'kitchen_tickets', 'prep_station_routes', 'prep_stations', 'products',
    'table_sync_events', 'order_item_ops', 'table_sessions', 'order_items', 'orders', 'location_resources']) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT])
  }
  connector = new PostgresConnector(uri, TENANT, BRANCH)
})

after(async () => {
  if (skip) return
  await pool.end()
})

test('no station → ops work as before and no ticket is created', { skip }, async () => {
  await seedSession('KS-0', 'KO-0', 'KR-0')
  const res = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-0', deviceId: 'd1', ops: [add('k0-a', 'KP-PHO')] })
  assert.equal(res.results[0].status, 'applied')
  assert.equal((await ticketsOf('KS-0')).length, 0)
})

test('saving never prints; "Gửi bếp" sends per station, idempotent; voids; status; print', { skip }, async () => {
  await seedStations()
  await seedSession('KS-1', 'KO-1', 'KR-1')

  const ops = [add('k1-a', 'KP-CAFE', 2, { note: 'ít đá' }), add('k1-b', 'KP-PHO', 1)]
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-1', deviceId: 'd1', ops })
  assert.equal((await ticketsOf('KS-1')).length, 0, 'saving items alone prints nothing')
  let st = await getSessionKitchenStatus(connector, BRANCH, 'KS-1')
  assert.deepEqual([st.enabled, st.unsent_lines, st.unsent_qty], [true, 2, 3])

  await fireKitchenForSession(connector, BRANCH, 'KS-1', { deviceId: 'd1' })
  let tickets = await ticketsOf('KS-1')
  assert.equal(tickets.length, 2)
  const barT = tickets.find((t) => t.station_id === 'ST-B')!
  const kitT = tickets.find((t) => t.station_id === 'ST-K')!
  assert.equal(barT.resource_name, 'Bàn KR-1')
  assert.deepEqual(barT.items.map((i) => [i.product_name, i.qty, i.note, i.status]), [['Cà phê', 2, 'ít đá', 'pending']])
  assert.deepEqual(kitT.items.map((i) => [i.product_name, i.qty]), [['Phở', 1]])
  assert.notEqual(barT.ticket_no, kitT.ticket_no)
  st = await getSessionKitchenStatus(connector, BRANCH, 'KS-1')
  assert.equal(st.unsent_lines, 0)
  assert.deepEqual(st.items[barT.items[0].order_item_id], { sent: 2, ready: 0 })

  // Double tap / two devices: nothing new
  await Promise.all([fireKitchenForSession(connector, BRANCH, 'KS-1'), fireKitchenForSession(connector, BRANCH, 'KS-1')])
  assert.equal((await ticketsOf('KS-1')).length, 2)

  // Cancel one coffee after it was sent, then send → void ticket on the bar
  const cafeItemId = barT.items[0].order_item_id
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-1', deviceId: 'd1', ops: [{ op_id: 'k1-c', type: 'change_qty', item_id: cafeItemId, delta: -1, kitchen_fire: true } as TableOp],
  })
  tickets = await ticketsOf('KS-1')
  const voidT = tickets.find((t) => t.kind === 'void')!
  assert.equal(voidT.station_id, 'ST-B')
  assert.deepEqual(voidT.items.map((i) => [i.product_name, i.qty, i.status]), [['Cà phê', -1, 'voided']])

  // Remove the coffee line entirely ("Lưu & báo bếp" flag) → voids only the 1 still sent
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-1', deviceId: 'd1', ops: [{ op_id: 'k1-d', type: 'remove_item', item_id: cafeItemId, kitchen_fire: true } as TableOp],
  })
  const voids = (await ticketsOf('KS-1')).filter((t) => t.kind === 'void').flatMap((t) => t.items.map((i) => i.qty))
  assert.deepEqual(voids.sort(), [-1, -1])

  // Kitchen ticks the pho → order ticket done; undo → open again
  const phoItem = kitT.items[0]
  let t = await setTicketItemStatus(connector, BRANCH, phoItem.id, true)
  assert.equal(t?.status, 'done')
  assert.equal(t?.items[0].status, 'ready')
  t = await setTicketItemStatus(connector, BRANCH, phoItem.id, false)
  assert.equal(t?.status, 'open')

  // Whole ticket done, then reprint counter
  t = await setTicketDone(connector, BRANCH, barT.id, true)
  assert.equal(t?.status, 'done')
  assert.ok(t?.items.every((i) => i.status === 'ready'))
  // Two print stations race to auto-print: only one claims it; a manual reprint always counts
  const [c1, c2] = await Promise.all([
    markTicketPrinted(connector, BRANCH, barT.id, { claim: true }),
    markTicketPrinted(connector, BRANCH, barT.id, { claim: true }),
  ])
  assert.deepEqual([c1.claimed, c2.claimed].sort(), [false, true])
  const re = await markTicketPrinted(connector, BRANCH, barT.id)
  assert.equal(re.claimed, true)
  assert.equal(re.ticket?.print_count, 2)

  const open = await listKitchenTickets(connector, BRANCH, { status: 'open', stationId: 'ST-K' })
  assert.ok(open.some((x) => x.id === kitT.id))
  assert.ok(!open.some((x) => x.station_id !== 'ST-K'))
})

test('added then removed before sending → nothing printed; net change only', { skip }, async () => {
  await seedSession('KS-2', 'KO-2', 'KR-2')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-2', deviceId: 'd1', ops: [add('k2-a', 'KP-PHO', 3), add('k2-b', 'KP-CAFE', 1)] })
  const phoId = r.results[0].item_id!
  const cafeId = r.results[1].item_id!
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-2', deviceId: 'd1',
    ops: [{ op_id: 'k2-c', type: 'change_qty', item_id: phoId, delta: -2 } as TableOp, { op_id: 'k2-d', type: 'remove_item', item_id: cafeId } as TableOp],
  })
  assert.deepEqual((await getSessionKitchenStatus(connector, BRANCH, 'KS-2')).unsent_qty, 1)
  await fireKitchenForSession(connector, BRANCH, 'KS-2')
  const tickets = await ticketsOf('KS-2')
  assert.equal(tickets.length, 1, 'no ticket at all for the coffee, no void for the pho')
  assert.deepEqual(tickets[0].items.map((i) => [i.product_name, i.qty]), [['Phở', 1]])
  // Next send: the netted-out ops never resurface as lines
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-2', deviceId: 'd1', ops: [add('k2-e', 'KP-PHO', 1, { kitchen_fire: true })] })
  const all = (await ticketsOf('KS-2')).flatMap((t) => t.items.map((i) => [i.product_name, i.qty]))
  assert.deepEqual(all, [['Phở', 1], ['Phở', 1]])
})

test('QR accept: accepted items ticketed per station, idempotent per request', { skip }, async () => {
  const input = {
    requestId: 'QR-REQ-1', orderId: 'KO-QR', resourceId: 'KR-QR', resourceName: 'Bàn QR',
    items: [{ product_id: 'KP-CAFE', product_name: 'Cà phê', qty: 2, order_item_id: 'OI-QR-1' }, { product_id: 'KP-PHO', product_name: 'Phở', qty: 1 }],
  }
  const first = await generateKitchenTicketsForQr(connector, BRANCH, input)
  assert.deepEqual(first.map((t) => [t.station_id, t.source, t.resource_name]).sort(), [['ST-B', 'qr', 'Bàn QR'], ['ST-K', 'qr', 'Bàn QR']])
  assert.equal((await generateKitchenTicketsForQr(connector, BRANCH, input)).length, 0)
})
