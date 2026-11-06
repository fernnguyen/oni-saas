import assert from 'node:assert/strict'
import test from 'node:test'

import { diffCartToOps, mobileCartKey, mobileCartSubtotal, v2LinesToCart, type MobileCart } from '../../apps/mobile/lib/pos/tableCartV2'
import { tableLineKey } from '../../apps/web/lib/server/tableSessionReconciler'

// Mobile cart on table sync v2: server lines + pending ops, edits sent as deltas only.

const server = [
  { item_id: 'L1', product_id: 'P1', product_name: 'Cafe Đen', qty: '2', unit_price: '25000', active: 'TRUE' },
  { item_id: 'L2', product_id: 'P2', product_name: 'Trà sữa', qty: '1', unit_price: '30000', variant_label: 'Size L', modifiers: '[{"group":"Topping","option":"Trân châu"}]', modifier_total: '5000', active: 'TRUE' },
  { item_id: 'T', product_id: 'TIME_CHARGE', product_name: 'Tiền giờ Bàn 1', qty: '1', unit_price: '60000', active: 'TRUE' },
  { item_id: 'X', product_id: 'P9', product_name: 'Đã xoá', qty: '1', unit_price: '1', active: 'FALSE' },
]

test('server lines → mobile cart: time charge and inactive lines excluded, legacy keys kept', () => {
  const cart = v2LinesToCart(server, [])
  assert.deepEqual(Object.keys(cart).sort(), ['P1', 'P2_Size L_Trân châu'].sort())
  assert.equal(cart.P1.quantity, 2)
  assert.equal(cart.P1._serverItemId, 'L1')
  assert.equal(cart['P2_Size L_Trân châu'].modifier_total, 5000)
  assert.equal(mobileCartKey('P2', 'Size L', '[{"option":"Trân châu"}]'), 'P2_Size L_Trân châu')
})

test('pending ops are shown on top of server lines (offline edits survive a refresh)', () => {
  const cart = v2LinesToCart(server, [
    { type: 'change_qty', item_id: 'L1', delta: 1 },
    { type: 'add_item', product_id: 'P3', product_name: 'Bánh', unit_price: 15000, qty: 2 },
  ])
  assert.equal(cart.P1.quantity, 3)
  assert.equal(cart.P1._pending, true)
  assert.equal(cart.P3.quantity, 2)
  assert.equal(cart.P3._serverItemId, undefined)
})

test('diff: only the user\'s own change is sent, never absolute quantities', () => {
  const base = v2LinesToCart(server, [])
  const next: MobileCart = JSON.parse(JSON.stringify(base))
  next.P1.quantity = 5
  const ops = diffCartToOps(base, next)
  assert.deepEqual(ops, [{ type: 'change_qty', item_id: 'L1', delta: 3 }])
})

test('stale snapshot cannot undo another device: delta is relative to what this user started from', () => {
  // User opened "Gọi món" when P1 = 2; meanwhile another device made it 4 on the server.
  const snapshot = v2LinesToCart(server, [])
  const saved: MobileCart = JSON.parse(JSON.stringify(snapshot))
  saved.P1.quantity = 3 // user tapped + once
  assert.deepEqual(diffCartToOps(snapshot, saved), [{ type: 'change_qty', item_id: 'L1', delta: 1 }]) // server → 5, not 3
})

test('diff: new line → add_item with price/modifiers; removed line → remove_item; untouched → nothing', () => {
  const base = v2LinesToCart(server, [])
  const next: MobileCart = JSON.parse(JSON.stringify(base))
  delete next['P2_Size L_Trân châu']
  next.P4 = { productId: 'P4', name: 'Bạc xỉu', price: 29000, quantity: 2, variant_label: '', modifier_total: 0 }
  const ops = diffCartToOps(base, next)
  assert.equal(ops.length, 2)
  assert.deepEqual(ops.find((o) => o.type === 'remove_item'), { type: 'remove_item', item_id: 'L2' })
  const add = ops.find((o) => o.type === 'add_item') as any
  assert.equal(add.product_id, 'P4')
  assert.equal(add.qty, 2)
  assert.equal(add.unit_price, 29000)
})

test('lines not yet on the server are referenced by the same line key the server uses', () => {
  const base: MobileCart = { P5: { productId: 'P5', name: 'Nước', price: 10000, quantity: 1, variant_label: 'Lạnh', modifiers: [{ option: 'Ít đá' }] } }
  const next: MobileCart = { P5: { ...base.P5, quantity: 3 } }
  const [op] = diffCartToOps(base, next) as any[]
  assert.equal(op.type, 'change_qty')
  assert.equal(op.line_key, tableLineKey('P5', 'Lạnh', '[{"option":"Ít đá"}]'))
})

test('subtotal matches the server rule (price + modifier) × qty', () => {
  assert.equal(mobileCartSubtotal(v2LinesToCart(server, [])), 2 * 25000 + (30000 + 5000))
})

test('Bar/Bếp: kitchen_note rides add / qty-up ops only, and is stripped from the kept cart', async () => {
  const { withoutKitchenNotes } = await import('../../apps/mobile/lib/pos/tableCartV2')
  const line = (qty: number, extra: Record<string, unknown> = {}) =>
    ({ productId: 'P-CAFE', name: 'Cà phê', price: 25000, quantity: qty, ...extra }) as any
  const base: MobileCart = { a: line(1, { _serverItemId: 'OI-1' }) }
  const ops = diffCartToOps(base, {
    a: line(3, { _serverItemId: 'OI-1', kitchen_note: 'ít đá' }),
    b: { ...line(1, { kitchen_note: 'nóng' }), productId: 'P-TRA', name: 'Trà' },
  })
  assert.deepEqual(ops.map((o: any) => [o.type, o.note]), [['change_qty', 'ít đá'], ['add_item', 'nóng']])
  const down = diffCartToOps({ a: line(3, { _serverItemId: 'OI-1' }) }, { a: line(1, { _serverItemId: 'OI-1', kitchen_note: 'x' }) })
  assert.equal((down[0] as any).note, undefined, 'a reduction never carries the draft note')
  assert.deepEqual(Object.keys(withoutKitchenNotes({ a: line(1, { kitchen_note: 'ít đá' }) }).a).includes('kitchen_note'), false)
})
