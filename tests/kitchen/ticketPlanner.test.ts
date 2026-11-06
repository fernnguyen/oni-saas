import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrepStation, PrepStationRoute } from '../../packages/core/src/kitchen'
import { planKitchenTickets, type PlanInput, type SentInfo } from '../../apps/web/lib/server/kitchen/ticketPlanner'

const kitchen: PrepStation = { id: 'k', name: 'Bếp', kind: 'kitchen', output: 'print', is_default: true, sort_order: 0 }
const bar: PrepStation = { id: 'b', name: 'Bar', kind: 'bar', output: 'print', is_default: false, sort_order: 1 }
const routes: PrepStationRoute[] = [{ station_id: 'b', target_type: 'category', target_id: 'drinks' }]

const base = (over: Partial<PlanInput>): PlanInput => ({
  ops: [], results: [], stations: [kitchen, bar], routes,
  productCategories: new Map([['P-CAFE', 'drinks'], ['P-PHO', 'food']]),
  orderLines: new Map(), sent: new Map(), ...over,
})

const addOp = (op_id: string, product_id: string, qty = 1, extra: Record<string, unknown> = {}) =>
  ({ op_id, type: 'add_item', product_id, product_name: product_id === 'P-CAFE' ? 'Cà phê' : 'Phở', qty, ...extra })
const ok = (op_id: string, item_id: string, extra: Record<string, unknown> = {}) => ({ op_id, status: 'applied' as const, item_id, ...extra })

test('one send splits into one ticket per station, notes kept', () => {
  const t = planKitchenTickets(base({
    ops: [addOp('o1', 'P-CAFE', 2, { note: 'ít đá' }), addOp('o2', 'P-PHO'), addOp('o3', 'P-CAFE')],
    results: [ok('o1', 'i1'), ok('o2', 'i2'), ok('o3', 'i3')],
  }))
  assert.equal(t.length, 2)
  const barT = t.find((x) => x.station.id === 'b')!
  const kitT = t.find((x) => x.station.id === 'k')!
  assert.deepEqual(barT.lines.map((l) => [l.product_name, l.qty, l.note]), [['Cà phê', 2, 'ít đá'], ['Cà phê', 1, '']])
  assert.deepEqual(kitT.lines.map((l) => [l.product_name, l.qty]), [['Phở', 1]])
  assert.equal(barT.kind, 'order')
})

test('replayed / rejected / time-charge ops never produce lines', () => {
  const t = planKitchenTickets(base({
    ops: [addOp('o1', 'P-CAFE'), addOp('o2', 'P-PHO'), { op_id: 'o3', type: 'add_item', product_id: 'TIME_CHARGE', product_name: 'Tiền giờ', qty: 1 }],
    results: [ok('o1', 'i1', { replayed: true }), { op_id: 'o2', status: 'rejected', reason: 'session_not_open' }, ok('o3', 'i3')],
  }))
  assert.equal(t.length, 0)
})

test('no stations → nothing (feature off)', () => {
  assert.equal(planKitchenTickets(base({ stations: [], ops: [addOp('o1', 'P-PHO')], results: [ok('o1', 'i1')] })).length, 0)
})

test('change_qty(+) uses the current order line', () => {
  const t = planKitchenTickets(base({
    ops: [{ op_id: 'c1', type: 'change_qty', item_id: 'i1', delta: 2 }],
    results: [ok('c1', 'i1')],
    orderLines: new Map([['i1', { product_id: 'P-CAFE', product_name: 'Cà phê', variant_label: 'Size L', modifiers: '' }]]),
  }))
  assert.equal(t[0].station.id, 'b')
  assert.deepEqual(t[0].lines.map((l) => [l.product_name, l.variant_label, l.qty]), [['Cà phê', 'Size L', 2]])
})

test('voids only what was sent, on the station it was sent to', () => {
  const sent = new Map<string, SentInfo>([
    ['i1', { net_qty: 3, station_id: 'b', product_id: 'P-CAFE', product_name: 'Cà phê', variant_label: '', modifiers: '' }],
  ])
  const t = planKitchenTickets(base({
    ops: [
      { op_id: 'c1', type: 'change_qty', item_id: 'i1', delta: -1 },
      { op_id: 'r1', type: 'remove_item', item_id: 'i1' },
      { op_id: 'r2', type: 'remove_item', item_id: 'never-sent' },
    ],
    results: [ok('c1', 'i1'), ok('r1', 'i1'), ok('r2', 'never-sent')],
    sent,
  }))
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'void')
  assert.equal(t[0].station.id, 'b')
  assert.deepEqual(t[0].lines.map((l) => l.qty), [-1, -2]) // 3 sent: −1, then the remaining 2
})

test('add then remove in the same call: order + void lines', () => {
  const t = planKitchenTickets(base({
    ops: [addOp('a1', 'P-PHO', 2), { op_id: 'r1', type: 'remove_item', item_id: 'i9' }],
    results: [ok('a1', 'i9'), ok('r1', 'i9')],
  }))
  assert.deepEqual(t.map((x) => [x.kind, x.lines[0].qty]), [['order', 2], ['void', -2]])
})

test('remove that was already removed elsewhere is ignored', () => {
  const t = planKitchenTickets(base({
    ops: [{ op_id: 'r1', type: 'remove_item', item_id: 'i1' }],
    results: [{ op_id: 'r1', status: 'applied', reason: 'already_removed' }],
    sent: new Map([['i1', { net_qty: 1, station_id: 'k', product_id: 'P-PHO', product_name: 'Phở', variant_label: '', modifiers: '' }]]),
  }))
  assert.equal(t.length, 0)
})

test('batch_id separates tickets of the same station', () => {
  const t = planKitchenTickets(base({
    ops: [addOp('o1', 'P-PHO', 1, { batch_id: 'B1' }), addOp('o2', 'P-PHO', 1, { batch_id: 'B2' })],
    results: [ok('o1', 'i1'), ok('o2', 'i2')],
  }))
  assert.deepEqual(t.map((x) => x.batch_id).sort(), ['B1', 'B2'])
})

test('netPlannedTickets keeps only the net change per item', async () => {
  const { netPlannedTickets } = await import('../../apps/web/lib/server/kitchen/ticketPlanner')
  const line = (op_id: string, item: string, qty: number) =>
    ({ op_id, order_item_id: item, product_id: 'P', product_name: item, variant_label: '', modifiers: '', note: '', qty })
  const out = netPlannedTickets([
    { station: kitchen, kind: 'order', batch_id: 'b', lines: [line('a1', 'pho', 3), line('c1', 'cafe', 1), line('a2', 'pho', 1)] },
    { station: kitchen, kind: 'void', batch_id: 'b', lines: [line('r1', 'pho', -2), line('r2', 'cafe', -1), line('r3', 'tra', -1)] },
  ])
  // pho: 3+1-2 = 2 → latest order lines first: a2 (1) + 1 of a1; cafe: 0 → gone; tra: −1 kept
  assert.deepEqual(out.map((t) => [t.kind, t.lines.map((l) => [l.op_id, l.qty])]), [
    ['order', [['a1', 1], ['a2', 1]]],
    ['void', [['r3', -1]]],
  ])
})

test('mergeSameItemLines: same item + note + sign → one line', async () => {
  const { mergeSameItemLines } = await import('../../apps/web/lib/server/kitchen/ticketPlanner')
  const line = (op_id: string, item: string, qty: number, note = '') =>
    ({ op_id, order_item_id: item, product_id: 'P', product_name: item, variant_label: '', modifiers: '', note, qty })
  const out = mergeSameItemLines([
    { station: kitchen, kind: 'order', batch_id: 'b', lines: [line('a', 'cafe', 1), line('b', 'cafe', 1), line('c', 'cafe', 1, 'ít đá'), line('d', 'pho', 2)] },
  ])
  assert.deepEqual(out[0].lines.map((l) => [l.op_id, l.order_item_id, l.qty, l.note]), [
    ['a', 'cafe', 2, ''], ['c', 'cafe', 1, 'ít đá'], ['d', 'pho', 2, ''],
  ])
})
