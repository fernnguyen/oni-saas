import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPrepStationPresets, isKitchenEligibleIndustry, kitchenDestinationLabel, resolvePrepStation, toPrepStation,
  type PrepStation, type PrepStationRoute,
} from '../../packages/core/src/kitchen'

test('eligibility: table/room verticals except lodging; never retail-like', () => {
  for (const t of ['fnb', 'billiards', 'sports_court', 'service_hourly']) assert.equal(isKitchenEligibleIndustry(t), true, t)
  for (const t of ['retail', 'fashion', 'lodging', 'unknown']) assert.equal(isKitchenEligibleIndustry(t), false, t)
})

test('presets: fnb gets Bếp (default) + Bar, others one Quầy nước, retail none', () => {
  assert.deepEqual(getPrepStationPresets('fnb').map((p) => [p.name, p.is_default]), [['Bếp', true], ['Bar', false]])
  assert.deepEqual(getPrepStationPresets('billiards').map((p) => p.name), ['Quầy nước'])
  assert.deepEqual(getPrepStationPresets('retail'), [])
})

test('toPrepStation normalises connector strings and bad enums', () => {
  const s = toPrepStation({ id: 'a', name: 'Bar', kind: 'bar', output: 'nope', is_default: 'TRUE', sort_order: '2' })
  assert.deepEqual(s, { id: 'a', name: 'Bar', kind: 'bar', output: 'print', is_default: true, sort_order: 2 })
  assert.equal(toPrepStation({ id: 'b', kind: 'x' }).kind, 'kitchen')
})

test('resolvePrepStation: product › category › default › null', () => {
  const kitchen: PrepStation = { id: 'k', name: 'Bếp', kind: 'kitchen', output: 'print', is_default: true, sort_order: 0 }
  const bar: PrepStation = { id: 'b', name: 'Bar', kind: 'bar', output: 'print', is_default: false, sort_order: 1 }
  const routes: PrepStationRoute[] = [
    { station_id: 'b', target_type: 'category', target_id: 'drinks' },
    { station_id: 'k', target_type: 'product', target_id: 'hot-coffee-with-food' },
    { station_id: 'gone', target_type: 'category', target_id: 'ghost' },
  ]
  assert.equal(resolvePrepStation({ category_id: 'drinks' }, [kitchen, bar], routes)?.id, 'b')
  assert.equal(resolvePrepStation({ product_id: 'hot-coffee-with-food', category_id: 'drinks' }, [kitchen, bar], routes)?.id, 'k')
  assert.equal(resolvePrepStation({ category_id: 'food' }, [kitchen, bar], routes)?.id, 'k')
  assert.equal(resolvePrepStation({ category_id: 'ghost' }, [kitchen, bar], routes)?.id, 'k') // route to deleted station
  assert.equal(resolvePrepStation({ category_id: 'food' }, [bar], routes), null)               // no default
  assert.equal(resolvePrepStation({ category_id: 'drinks' }, [], routes), null)
})

test('labels name the station the shop chose, never a hard-coded "bếp"', () => {
  assert.equal(kitchenDestinationLabel([{ name: 'Bar' }]), 'Bar')
  assert.equal(kitchenDestinationLabel([{ name: 'Quầy nước' }]), 'Quầy nước')
  assert.equal(kitchenDestinationLabel([{ name: 'Bếp' }, { name: 'Bar' }, { name: 'Bar' }]), 'Bếp + Bar')
  assert.equal(kitchenDestinationLabel([{ name: 'Bếp' }, { name: 'Bar' }, { name: 'Bếp nướng' }]), 'Bếp/Bar')
  assert.equal(kitchenDestinationLabel([]), 'Bếp/Bar')
  assert.equal(kitchenDestinationLabel([{ name: '  ' }], 'Bếp'), 'Bếp')
})
