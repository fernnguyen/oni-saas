import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool as PgPool } from 'pg'

import { PostgresConnector } from '../../packages/adapters/src/postgresAdapter'
import type { TableOp } from '../../apps/web/lib/server/tableSync/engine'
import {
  applyTableSessionOps, cancelTableSession, closeTableSessionForOrder, endTableSessionForCancelledOrder, transferTableSession,
} from '../../apps/web/lib/server/tableSync/service'
import {
  fireKitchenForSession, generateKitchenTicketsForQr, getSessionKitchenStatus, listKitchenTickets, listUnavailableProducts, listVoidReport,
  markTicketItemUnavailable, markTicketPrinted, setProductUnavailable, setTicketDone, setTicketItemStatus, setVoidOutcome,
  voidKitchenForCancelledTable,
} from '../../apps/web/lib/server/kitchen/tickets'
import { getKitchenSettings, saveKitchenSettings } from '../../apps/web/lib/server/kitchen/settings'

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
  for (const t of ['kitchen_settings', 'kitchen_unavailable_products', 'kitchen_fired_ops', 'kitchen_ticket_items', 'kitchen_tickets', 'prep_station_routes', 'prep_stations', 'products',
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
  assert.deepEqual(st.items[barT.items[0].order_item_id], { sent: 2, ready: 0, unavailable: 0, station_id: 'ST-B', station_name: 'Bar', station_kind: 'bar' })

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
  // the coffee was cancelled down to nothing above: struck, never "made"
  assert.deepEqual(t?.items.map((i) => i.status), ['voided'])
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

test('table moved → tickets show the new table; table cancelled → open tickets leave the screen', { skip }, async () => {
  await seedSession('KS-3', 'KO-3', 'KR-3')
  await pool.query(
    `INSERT INTO location_resources (id, tenant_id, branch_id, name, status, hourly_rate) VALUES ('KR-3B', $1, $2, 'Bàn mới', 'available', '0')`,
    [TENANT, BRANCH],
  )
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-3', deviceId: 'd1', ops: [add('k3-a', 'KP-PHO', 1, { kitchen_fire: true })] })
  assert.equal((await ticketsOf('KS-3')).length, 1)

  await transferTableSession(connector, BRANCH, 'KS-3', { target_resource_id: 'KR-3B' })
  let t = await ticketsOf('KS-3')
  assert.deepEqual(t.map((x) => [x.resource_id, x.resource_name]), [['KR-3B', 'Bàn mới']])

  // Remove the item (prints a void), then cancel the now-empty table: the order ticket closes, the
  // cancel ticket stays for the kitchen to see, and no second cancel is made for the same dish.
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-3', deviceId: 'd1', ops: [{ op_id: 'k3-b', type: 'remove_item', item_id: r.results[0].item_id, kitchen_fire: true } as TableOp],
  })
  // the only dish is cancelled: its order ticket closes (struck line), the cancel ticket is open
  assert.deepEqual((await ticketsOf('KS-3')).filter((x) => x.status === 'open').map((x) => x.kind), ['void'])
  await cancelTableSession(connector, BRANCH, 'KS-3')
  t = await ticketsOf('KS-3')
  assert.deepEqual(t.map((x) => [x.kind, x.status]).sort(), [['order', 'done'], ['void', 'open']])
})

test('kitchen screen ignores open tickets older than yesterday', { skip }, async () => {
  await seedSession('KS-4', 'KO-4', 'KR-4')
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-4', deviceId: 'd1', ops: [add('k4-a', 'KP-PHO', 1, { kitchen_fire: true })] })
  const [ticket] = await ticketsOf('KS-4')
  const visible = async () => (await listKitchenTickets(connector, BRANCH, { status: 'open' })).some((x) => x.id === ticket.id)
  assert.equal(await visible(), true)
  await pool.query(`UPDATE kitchen_tickets SET business_date = '2026-01-01' WHERE id = $1`, [ticket.id])
  assert.equal(await visible(), false)
})

test('notes typed at send time land on the order lines; void reason rides the op note', { skip }, async () => {
  await seedSession('KS-5', 'KO-5', 'KR-5')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-5', deviceId: 'd1', ops: [add('k5-a', 'KP-CAFE', 2), add('k5-b', 'KP-PHO', 1, { note: 'không hành' })] })
  const cafeId = r.results[0].item_id!
  const phoId = r.results[1].item_id!
  await fireKitchenForSession(connector, BRANCH, 'KS-5', { notes: { [cafeId]: 'ít đá', [phoId]: 'ignored: op note wins' } })
  const lines = (await ticketsOf('KS-5')).flatMap((t) => t.items.map((i) => [i.product_name, i.note]))
  assert.deepEqual(lines.sort(), [['Cà phê', 'ít đá'], ['Phở', 'không hành']])

  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-5', deviceId: 'd1',
    ops: [{ op_id: 'k5-c', type: 'change_qty', item_id: cafeId, delta: -1, note: 'Lý do: Khách đổi ý', kitchen_fire: true } as TableOp],
  })
  const v = (await ticketsOf('KS-5')).find((t) => t.kind === 'void')!
  assert.deepEqual(v.items.map((i) => [i.qty, i.note]), [[-1, 'Lý do: Khách đổi ý']])
})

test('kitchen reports "hết món": line unavailable, table status shows it, product on today\'s sold-out list', { skip }, async () => {
  await seedSession('KS-6', 'KO-6', 'KR-6')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-6', deviceId: 'd1', ops: [add('k6-a', 'KP-PHO', 2, { kitchen_fire: true }), add('k6-b', 'KP-CAFE', 1, { kitchen_fire: true })] })
  const phoId = r.results[0].item_id!
  const pho = (await ticketsOf('KS-6')).find((t) => t.station_id === 'ST-K')!
  const t = await markTicketItemUnavailable(connector, BRANCH, pho.items[0].id, { soldOutToday: true })
  assert.equal(t?.items[0].status, 'unavailable')
  assert.equal(t?.status, 'done', 'nothing left to cook on that ticket')
  const st = await getSessionKitchenStatus(connector, BRANCH, 'KS-6')
  assert.deepEqual(st.items[phoId], { sent: 2, ready: 0, unavailable: 2, station_id: 'ST-K', station_name: 'Bếp', station_kind: 'kitchen' })
  assert.deepEqual(st.unavailable_products, ['KP-PHO'])
  assert.deepEqual((await listUnavailableProducts(connector, BRANCH)).map((p) => p.product_id), ['KP-PHO'])
  // Kitchen found more after all: undo, and take it off the list
  const back = await setTicketItemStatus(connector, BRANCH, pho.items[0].id, false)
  assert.equal(back?.items[0].status, 'pending')
  assert.deepEqual(await setProductUnavailable(connector, BRANCH, { product_id: 'KP-PHO' }, false), [])
})

test('removing a dish the kitchen reported sold out files the cancel ticket as done; a plain "Hết món" cancel stays open', { skip }, async () => {
  await seedSession('KS-7', 'KO-7', 'KR-7')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-7', deviceId: 'd1', ops: [add('k7-a', 'KP-PHO', 1, { kitchen_fire: true }), add('k7-b', 'KP-CAFE', 1, { kitchen_fire: true })] })
  const phoId = r.results[0].item_id!
  const cafeId = r.results[1].item_id!
  const pho = (await ticketsOf('KS-7')).find((t) => t.station_id === 'ST-K')!
  await markTicketItemUnavailable(connector, BRANCH, pho.items[0].id, { soldOutToday: false })
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-7', deviceId: 'd1',
    ops: [
      { op_id: 'k7-c', type: 'remove_item', item_id: phoId, note: 'Lý do: Hết món', kitchen_fire: true } as TableOp,
      { op_id: 'k7-d', type: 'remove_item', item_id: cafeId, note: 'Lý do: Hết món', kitchen_fire: true } as TableOp,
    ],
  })
  const voids = (await ticketsOf('KS-7')).filter((t) => t.kind === 'void')
  const byStation = Object.fromEntries(voids.map((t) => [t.station_id, t.status]))
  assert.equal(byStation['ST-K'], 'done', 'kitchen asked for it: nothing to acknowledge')
  assert.equal(byStation['ST-B'], 'open', 'bar never reported it: it must see the cancel')
  assert.deepEqual((await getSessionKitchenStatus(connector, BRANCH, 'KS-7')).items[phoId]?.unavailable ?? 0, 0)
})

test('kitchen settings: auto send defaults on, is saved per branch, and shows in the table status', { skip }, async () => {
  assert.deepEqual(await getKitchenSettings(connector, BRANCH), { auto_send: true })
  await seedSession('KS-8', 'KO-8', 'KR-8')
  assert.equal((await getSessionKitchenStatus(connector, BRANCH, 'KS-8')).auto_send, true)
  await saveKitchenSettings(connector, BRANCH, { auto_send: false })
  assert.deepEqual(await getKitchenSettings(connector, BRANCH), { auto_send: false })
  assert.equal((await getSessionKitchenStatus(connector, BRANCH, 'KS-8')).auto_send, false)
  assert.deepEqual(await getKitchenSettings(connector, 'other-branch'), { auto_send: true })
  await saveKitchenSettings(connector, BRANCH, { auto_send: true })
  assert.equal((await getKitchenSettings(connector, BRANCH)).auto_send, true)
})

// ── Cancels while the kitchen is cooking ────────────────────────────────────

const fireAdd = (op_id: string, product_id: string, qty = 1) => add(op_id, product_id, qty, { kitchen_fire: true })
const voidsOf = async (sessionId: string) => (await ticketsOf(sessionId)).filter((t) => t.kind === 'void')
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

test('order cancelled while cooking: the kitchen gets a cancel ticket, ticked dishes count as waste, answers close it', { skip }, async () => {
  await seedSession('KS-9', 'KO-9', 'KR-9')
  const before = await listVoidReport(connector, BRANCH, { from: today(), to: today() })
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-9', deviceId: 'd1', ops: [fireAdd('k9-a', 'KP-PHO', 2), fireAdd('k9-b', 'KP-CAFE', 1)] })
  const barOrder = (await ticketsOf('KS-9')).find((t) => t.station_id === 'ST-B')!
  await setTicketItemStatus(connector, BRANCH, barOrder.items[0].id, true) // bar already made the coffee

  await pool.query(`UPDATE orders SET status = 'cancelled' WHERE id = 'KO-9' AND tenant_id = $1`, [TENANT])
  await endTableSessionForCancelledOrder(connector, BRANCH, 'KO-9', { session_id: 'KS-9' })

  const voids = await voidsOf('KS-9')
  const barVoid = voids.find((t) => t.station_id === 'ST-B')!
  const kitVoid = voids.find((t) => t.station_id === 'ST-K')!
  assert.deepEqual(barVoid.items.map((i) => [i.product_name, i.qty, i.void_outcome, i.note]), [['Cà phê', -1, 'made', 'Lý do: Huỷ đơn']])
  assert.equal(barVoid.status, 'done', 'made already: nothing for the bar to stop')
  assert.deepEqual(kitVoid.items.map((i) => [i.product_name, i.qty, i.void_outcome]), [['Phở', -2, '']])
  assert.equal(kitVoid.status, 'open', 'still cooking: the kitchen must see it')
  assert.ok((await ticketsOf('KS-9')).filter((t) => t.kind === 'order').every((t) => t.status === 'done'))

  // Cancelling again (retry, second device) makes nothing new
  assert.equal((await voidKitchenForCancelledTable(connector, BRANCH, { sessionId: 'KS-9', orderId: 'KO-9' })).length, 0)
  assert.equal((await voidsOf('KS-9')).length, 2)

  // The kitchen answers; clearing the answer reopens the ticket
  const line = kitVoid.items[0]
  assert.equal((await setVoidOutcome(connector, BRANCH, line.id, 'stopped'))?.status, 'done')
  assert.equal((await setVoidOutcome(connector, BRANCH, line.id, null))?.status, 'open')
  const answered = await setVoidOutcome(connector, BRANCH, line.id, 'made')
  assert.deepEqual([answered?.status, answered?.items[0].void_outcome], ['done', 'made'])
  // Only cancel lines take an answer
  assert.equal(await setVoidOutcome(connector, BRANCH, barOrder.items[0].id, 'made'), null)

  const after = await listVoidReport(connector, BRANCH, { from: today(), to: today() })
  assert.equal(after.totals.made_qty - before.totals.made_qty, 3)
  assert.equal(after.totals.waste_value - before.totals.waste_value, 3 * 30000)
  const mine = after.lines.filter((l) => l.resource_name === 'Bàn KR-9')
  assert.deepEqual(mine.map((l) => [l.product_name, l.qty, l.outcome, l.reason, l.value]).sort(), [
    ['Cà phê', 1, 'made', 'Huỷ đơn', 30000], ['Phở', 2, 'made', 'Huỷ đơn', 60000],
  ])
})

test('cancel after an earlier partial cancel and a sold-out report: only what is left, sold out = stopped', { skip }, async () => {
  await seedSession('KS-10', 'KO-10', 'KR-10')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-10', deviceId: 'd1', ops: [fireAdd('k10-a', 'KP-PHO', 3)] })
  const phoId = r.results[0].item_id!
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-10', deviceId: 'd1',
    ops: [{ op_id: 'k10-b', type: 'change_qty', item_id: phoId, delta: -1, note: 'Lý do: Khách đổi ý', kitchen_fire: true } as TableOp],
  })
  const order = (await ticketsOf('KS-10')).find((t) => t.kind === 'order')!
  await markTicketItemUnavailable(connector, BRANCH, order.items[0].id, { soldOutToday: false })

  const created = await voidKitchenForCancelledTable(connector, BRANCH, { sessionId: 'KS-10', orderId: 'KO-10', reason: 'Khách bỏ về' })
  assert.equal(created.length, 1)
  assert.deepEqual(created[0].items.map((i) => [i.qty, i.void_outcome, i.note]), [[-2, 'stopped', 'Lý do: Khách bỏ về']])
  assert.equal(created[0].status, 'done', 'the kitchen already knows it cannot make it')
})

test('paying keeps dishes not ticked yet on the kitchen screen (pay-first cafés)', { skip }, async () => {
  await seedSession('KS-11', 'KO-11', 'KR-11')
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-11', deviceId: 'd1', ops: [fireAdd('k11-a', 'KP-CAFE', 2)] })
  await pool.query(`UPDATE orders SET status = 'completed' WHERE id = 'KO-11' AND tenant_id = $1`, [TENANT])
  await closeTableSessionForOrder(connector, BRANCH, { orderId: 'KO-11', orderMetadata: { session_id: 'KS-11' } })
  const { rows } = await pool.query(`SELECT status FROM table_sessions WHERE id = 'KS-11' AND tenant_id = $1`, [TENANT])
  assert.equal(rows[0].status, 'closed')
  assert.deepEqual((await ticketsOf('KS-11')).map((t) => [t.kind, t.status]), [['order', 'open']])
  assert.equal((await voidsOf('KS-11')).length, 0, 'paying is not a cancel')
})

test('POS cancels a dish the kitchen already made ("Vẫn huỷ – ghi hao hụt"): waste line, no alarm', { skip }, async () => {
  await seedSession('KS-12', 'KO-12', 'KR-12')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-12', deviceId: 'd1', ops: [fireAdd('k12-a', 'KP-PHO', 2)] })
  const order = (await ticketsOf('KS-12')).find((t) => t.kind === 'order')!
  await setTicketItemStatus(connector, BRANCH, order.items[0].id, true)
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-12', deviceId: 'd1',
    ops: [{ op_id: 'k12-b', type: 'change_qty', item_id: r.results[0].item_id, delta: -1, note: 'Lý do: Khách đổi ý', kitchen_fire: true, kitchen_made: true } as TableOp],
  })
  const v = (await voidsOf('KS-12'))[0]
  assert.deepEqual(v.items.map((i) => [i.qty, i.void_outcome, i.unit_price]), [[-1, 'made', 30000]])
  assert.equal(v.status, 'done')
  // Without the flag (dish still cooking) the cancel opens for the kitchen
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-12', deviceId: 'd1',
    ops: [{ op_id: 'k12-c', type: 'change_qty', item_id: r.results[0].item_id, delta: -1, note: 'Lý do: Nhập nhầm', kitchen_fire: true } as TableOp],
  })
  const open = (await voidsOf('KS-12')).filter((t) => t.status === 'open')
  assert.deepEqual(open.map((t) => t.items.map((i) => [i.qty, i.void_outcome])), [[[-1, '']]])
})

test('nothing sent yet → cancelling the table tells the kitchen nothing', { skip }, async () => {
  await seedSession('KS-13', 'KO-13', 'KR-13')
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-13', deviceId: 'd1', ops: [add('k13-a', 'KP-PHO', 1)] })
  assert.equal((await voidKitchenForCancelledTable(connector, BRANCH, { sessionId: 'KS-13', orderId: 'KO-13' })).length, 0)
  assert.equal((await ticketsOf('KS-13')).length, 0)
})

test('QR order cancelled (no table session): cancel ticket per station by order id', { skip }, async () => {
  await generateKitchenTicketsForQr(connector, BRANCH, {
    requestId: 'QR-REQ-9', orderId: 'KO-QR9', resourceId: 'KR-QR9', resourceName: 'Bàn QR9',
    items: [{ product_id: 'KP-CAFE', product_name: 'Cà phê', qty: 2, order_item_id: 'OI-QR9-1' }, { product_id: 'KP-PHO', product_name: 'Phở', qty: 1, order_item_id: 'OI-QR9-2' }],
  })
  const created = await voidKitchenForCancelledTable(connector, BRANCH, { orderId: 'KO-QR9' })
  assert.deepEqual(created.map((t) => [t.station_id, t.resource_name, t.items.map((i) => i.qty)]).sort(), [
    ['ST-B', 'Bàn QR9', [-2]], ['ST-K', 'Bàn QR9', [-1]],
  ])
  assert.ok(created.every((t) => t.status === 'open'))
})

test('table status names the station of each dish and where the next send goes', { skip }, async () => {
  await seedSession('KS-14', 'KO-14', 'KR-14')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-14', deviceId: 'd1', ops: [fireAdd('k14-a', 'KP-CAFE', 1)] })
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-14', deviceId: 'd1', ops: [add('k14-b', 'KP-PHO', 1)] })
  const st = await getSessionKitchenStatus(connector, BRANCH, 'KS-14')
  assert.deepEqual([st.items[r.results[0].item_id!].station_name, st.items[r.results[0].item_id!].station_kind], ['Bar', 'bar'])
  assert.deepEqual(st.unsent_stations.map((s) => s.name), ['Bếp'])
  assert.deepEqual(st.stations.map((s) => s.name).sort(), ['Bar', 'Bếp'])
})

test('a dish cancelled down to nothing is struck on its order ticket; a partial cancel is not', { skip }, async () => {
  await seedSession('KS-15', 'KO-15', 'KR-15')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-15', deviceId: 'd1', ops: [fireAdd('k15-a', 'KP-PHO', 2), fireAdd('k15-b', 'KP-CAFE', 2)] })
  const [phoId, cafeId] = [r.results[0].item_id!, r.results[1].item_id!]
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-15', deviceId: 'd1',
    ops: [
      { op_id: 'k15-c', type: 'remove_item', item_id: phoId, note: 'Lý do: Nhập nhầm', kitchen_fire: true } as TableOp,
      { op_id: 'k15-d', type: 'change_qty', item_id: cafeId, delta: -1, note: 'Lý do: Khách đổi ý', kitchen_fire: true } as TableOp,
    ],
  })
  const orders = (await ticketsOf('KS-15')).filter((t) => t.kind === 'order')
  const pho = orders.find((t) => t.station_id === 'ST-K')!
  const cafe = orders.find((t) => t.station_id === 'ST-B')!
  assert.deepEqual([pho.items[0].status, pho.status], ['voided', 'done'], 'nothing left to cook: struck and closed')
  assert.deepEqual([cafe.items[0].status, cafe.status], ['pending', 'open'], '1 of 2 still to make')
})

test('a late send for a table already paid or cancelled reaches no kitchen', { skip }, async () => {
  await seedSession('KS-16', 'KO-16', 'KR-16')
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-16', deviceId: 'd1', ops: [add('k16-a', 'KP-PHO', 1)] })
  await pool.query(`UPDATE table_sessions SET status = 'cancelled' WHERE id = 'KS-16' AND tenant_id = $1`, [TENANT])
  assert.deepEqual(await fireKitchenForSession(connector, BRANCH, 'KS-16'), [])
  assert.equal((await ticketsOf('KS-16')).length, 0)
})

// ── Audit: who cancelled / who answered ──────────────────────────────────────

const LAN = { id: 'U-LAN', name: 'Lan thu ngân' }
const BINH = { id: 'U-BINH', name: 'Bình bếp' }

test('audit: the cancel ticket records who cancelled; the kitchen answer records who answered', { skip }, async () => {
  await seedSession('KS-17', 'KO-17', 'KR-17')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-17', deviceId: 'd1', ops: [fireAdd('k17-a', 'KP-PHO', 2)] }, { actor: LAN })
  const order = (await ticketsOf('KS-17')).find((t) => t.kind === 'order')!
  assert.equal(order.created_by_name, 'Lan thu ngân', 'who sent it to the kitchen')
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-17', deviceId: 'd1',
    ops: [{ op_id: 'k17-b', type: 'change_qty', item_id: r.results[0].item_id, delta: -1, note: 'Lý do: Khách đổi ý', kitchen_fire: true } as TableOp],
  }, { actor: LAN })
  const v = (await voidsOf('KS-17'))[0]
  assert.equal(v.created_by_name, 'Lan thu ngân')

  const answered = await setVoidOutcome(connector, BRANCH, v.items[0].id, 'made', BINH)
  assert.equal(answered?.items[0].answered_by_name, 'Bình bếp')
  const { rows } = await pool.query(`SELECT answered_by_user, answered_at FROM kitchen_ticket_items WHERE id = $1`, [v.items[0].id])
  assert.equal(rows[0].answered_by_user, 'U-BINH')
  assert.ok(rows[0].answered_at, 'answer time kept')
  // Clearing the answer clears who answered
  const cleared = await setVoidOutcome(connector, BRANCH, v.items[0].id, null, BINH)
  assert.equal(cleared?.items[0].answered_by_name, '')
  await setVoidOutcome(connector, BRANCH, v.items[0].id, 'made', BINH)

  const rep = await listVoidReport(connector, BRANCH, { from: today(), to: today() })
  const mine = rep.lines.filter((l) => l.resource_name === 'Bàn KR-17')
  assert.deepEqual(mine.map((l) => [l.cancelled_by_user, l.cancelled_by_name, l.answered_by_user, l.answered_by_name]), [['U-LAN', 'Lan thu ngân', 'U-BINH', 'Bình bếp']])
  const lan = rep.by_actor.find((a) => a.user_id === 'U-LAN')!
  assert.ok(lan.waste_value >= 30000)
})

test('audit: an order cancelled by a manager names the manager on the cancel ticket', { skip }, async () => {
  await seedSession('KS-18', 'KO-18', 'KR-18')
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-18', deviceId: 'd1', ops: [fireAdd('k18-a', 'KP-CAFE', 1)] }, { actor: LAN })
  await pool.query(`UPDATE orders SET status = 'cancelled' WHERE id = 'KO-18' AND tenant_id = $1`, [TENANT])
  await endTableSessionForCancelledOrder(connector, BRANCH, 'KO-18', { session_id: 'KS-18' }, { actor: { id: 'U-QL', name: 'Quản lý Hà' } })
  assert.deepEqual((await voidsOf('KS-18')).map((t) => t.created_by_name), ['Quản lý Hà'])
})

test('audit: an "actor" smuggled in the table-cancel body is ignored (only the server sets it)', { skip }, async () => {
  await seedSession('KS-19', 'KO-19', 'KR-19')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-19', deviceId: 'd1', ops: [fireAdd('k19-a', 'KP-PHO', 1)] }, { actor: LAN })
  // remove WITHOUT firing: the cancel ticket is made by the table cancel below
  await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-19', deviceId: 'd1', ops: [{ op_id: 'k19-b', type: 'remove_item', item_id: r.results[0].item_id } as TableOp] }, { actor: LAN })
  const body = { reason: 'Khách bỏ về', actor: { id: 'U-EVIL', name: 'Giả danh' } } as unknown as { reason: string }
  await cancelTableSession(connector, BRANCH, 'KS-19', body, { actor: BINH })
  const names = (await ticketsOf('KS-19')).map((t) => t.created_by_name)
  assert.ok(!names.includes('Giả danh'))
  assert.ok(names.includes('Bình bếp'), 'the cancel ticket names the signed-in user')
})

test('audit: struck order lines are not cancel lines and take no answer', { skip }, async () => {
  await seedSession('KS-20', 'KO-20', 'KR-20')
  const r = await applyTableSessionOps(connector, BRANCH, { sessionId: 'KS-20', deviceId: 'd1', ops: [fireAdd('k20-a', 'KP-PHO', 1)] })
  await applyTableSessionOps(connector, BRANCH, {
    sessionId: 'KS-20', deviceId: 'd1', ops: [{ op_id: 'k20-b', type: 'remove_item', item_id: r.results[0].item_id, note: 'Lý do: Nhập nhầm', kitchen_fire: true } as TableOp],
  })
  const order = (await ticketsOf('KS-20')).find((t) => t.kind === 'order')!
  assert.equal(order.items[0].status, 'voided')
  assert.equal(await setVoidOutcome(connector, BRANCH, order.items[0].id, 'made', BINH), null)
})
