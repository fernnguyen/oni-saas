import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kitchenActorOf } from '../../apps/web/lib/server/kitchen/actor'
import { summariseByActor, type VoidReportLine } from '../../apps/web/lib/server/kitchen/tickets'

// Bar/Bếp — audit of cancelled dishes (pure parts; the database side is in pg.integration.test.ts)

test('actor comes from the signed-in user: display name, else other names, else email', () => {
  assert.equal(kitchenActorOf(null), undefined)
  assert.equal(kitchenActorOf({ id: '' }), undefined)
  assert.deepEqual(kitchenActorOf({ id: 'u1', email: 'lan@x.vn', user_metadata: { display_name: ' Lan ' } }), { id: 'u1', name: 'Lan' })
  assert.deepEqual(kitchenActorOf({ id: 'u2', email: 'b@x.vn', user_metadata: { username: 'binh' } }), { id: 'u2', name: 'binh' })
  assert.deepEqual(kitchenActorOf({ id: 'u3', email: 'ha@x.vn', user_metadata: {} }), { id: 'u3', name: 'ha@x.vn' })
  assert.deepEqual(kitchenActorOf({ id: 'u4' }), { id: 'u4', name: 'Nhân viên' })
})

const line = (user: string, name: string, qty: number, unit: number, outcome: '' | 'made' | 'stopped'): VoidReportLine => ({
  id: `${user}-${qty}-${outcome}`, ticket_no: 1, business_date: '2026-11-06', created_at: '', station_name: 'Bar', resource_name: 'Bàn 1',
  product_name: 'Món', variant_label: '', qty, reason: '', outcome, unit_price: unit, value: qty * unit,
  cancelled_by_user: user, cancelled_by_name: name, answered_by_user: '', answered_by_name: '',
})

test('per-person summary: most waste first; unknown (before audit) kept as its own row', () => {
  const out = summariseByActor([
    line('u1', 'Lan', 1, 20000, 'stopped'),
    line('u2', 'Bình', 2, 30000, 'made'),
    line('u1', 'Lan', 1, 50000, 'made'),
    line('', '', 3, 10000, ''),
  ])
  assert.deepEqual(out.map((a) => [a.user_id, a.name, a.lines, a.qty, a.value, a.waste_value]), [
    ['u2', 'Bình', 1, 2, 60000, 60000],
    ['u1', 'Lan', 2, 2, 70000, 50000],
    ['', '', 1, 3, 30000, 0],
  ])
})
