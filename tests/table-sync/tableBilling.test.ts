import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTablePricingSnapshot, computeTableTimeCharge } from '../../packages/core/src/tableBilling'
import { calculateHourlyBilling } from '../../packages/core/src/hourlyBilling'

// Plan: docs/TABLE-SESSION-SYNC-PLAN.md 0.9 / 2.1 / 2.4 – one pricing function for server + clients.

const at = (iso: string) => new Date(iso)

test('snapshot: order metadata wins over resource; charge_by_minute top-level or nested', () => {
  const resource = { hourly_rate: '60000', metadata: JSON.stringify({ rental_type: 'hourly', charge_by_minute: true, overnight_rate: 300000 }) }
  const s1 = buildTablePricingSnapshot(resource)
  assert.equal(s1.hourly_rate, 60000)
  assert.equal(s1.advanced_pricing?.charge_by_minute, true)
  assert.equal(s1.overnight_rate, 300000)

  const s2 = buildTablePricingSnapshot(resource, { rental_type: 'overnight', advanced_pricing: { charge_by_minute: false } })
  assert.equal(s2.rental_type, 'overnight')
  assert.equal(s2.advanced_pricing?.charge_by_minute, false)

  const s3 = buildTablePricingSnapshot({ hourly_rate: 50000, metadata: { rental_type: 'weird' } })
  assert.equal(s3.rental_type, 'hourly')
  assert.equal(s3.advanced_pricing, undefined)
})

test('hourly: identical to calculateHourlyBilling (block and per-minute)', () => {
  const checkIn = at('2026-11-02T03:00:00.000Z')
  const checkOut = at('2026-11-02T04:15:00.000Z')
  for (const charge_by_minute of [false, true]) {
    const snap = buildTablePricingSnapshot({ hourly_rate: 60000, metadata: { charge_by_minute } })
    const ours = computeTableTimeCharge(snap, checkIn, checkOut)
    const legacy = calculateHourlyBilling({ checkIn, checkOut, standardRate: 60000, config: snap.advanced_pricing })
    assert.equal(ours.amount, Math.round(legacy.totalAmount))
    assert.equal(ours.unit, 'hour')
  }
  const perMinute = computeTableTimeCharge(buildTablePricingSnapshot({ hourly_rate: 60000, metadata: { charge_by_minute: true } }), checkIn, checkOut)
  assert.equal(perMinute.amount, 75000)
  assert.equal(perMinute.billable_minutes, 75)
})

test('hourly: checkout before check-in never bills negative', () => {
  const snap = buildTablePricingSnapshot({ hourly_rate: 60000, metadata: { charge_by_minute: true } })
  const r = computeTableTimeCharge(snap, at('2026-11-02T05:00:00Z'), at('2026-11-02T04:00:00Z'))
  assert.equal(r.billable_minutes, 0)
  assert.ok(r.amount >= 0)
})

test('overnight: nights counted by Vietnam calendar day, regardless of process TZ', () => {
  const snap = buildTablePricingSnapshot({ hourly_rate: 100000, metadata: { rental_type: 'overnight', overnight_rate: 400000 } })
  // 21:00 → 11:00 next day in GMT+7 (14:00Z → 04:00Z): crosses one VN midnight → 1 night
  const one = computeTableTimeCharge(snap, at('2026-11-02T14:00:00Z'), at('2026-11-03T04:00:00Z'))
  assert.equal(one.qty, 1)
  assert.equal(one.amount, 400000)
  // 23:00 → 06:30 GMT+7 but UTC dates are the same day (16:00Z → 23:30Z): still 1 night
  const sameUtcDay = computeTableTimeCharge(snap, at('2026-11-02T16:00:00Z'), at('2026-11-02T23:30:00Z'))
  assert.equal(sameUtcDay.qty, 1)
  // Overstay beyond 24h × days + grace → extra night
  const over = computeTableTimeCharge(snap, at('2026-11-02T14:00:00Z'), at('2026-11-03T15:30:00Z'))
  assert.equal(over.qty, 2)
})

test('daily: grace hours before an extra day; defaults to 2h grace', () => {
  const snap = buildTablePricingSnapshot({ hourly_rate: 100000, metadata: { rental_type: 'daily', daily_rate: 500000 } })
  const inGrace = computeTableTimeCharge(snap, at('2026-11-02T03:00:00Z'), at('2026-11-03T04:30:00Z')) // 25.5h
  assert.equal(inGrace.qty, 1)
  const overGrace = computeTableTimeCharge(snap, at('2026-11-02T03:00:00Z'), at('2026-11-03T05:30:00Z')) // 26.5h
  assert.equal(overGrace.qty, 2)
  assert.equal(overGrace.amount, 1000000)
  const short = computeTableTimeCharge(snap, at('2026-11-02T03:00:00Z'), at('2026-11-02T04:00:00Z'))
  assert.equal(short.qty, 1)
})

test('rate fallbacks match the legacy UI (daily → overnight → hourly×3 → 200k)', () => {
  const t0 = at('2026-11-02T03:00:00Z')
  const t1 = at('2026-11-02T05:00:00Z')
  assert.equal(computeTableTimeCharge(buildTablePricingSnapshot({ hourly_rate: 0, metadata: { rental_type: 'daily', overnight_rate: 350000 } }), t0, t1).amount, 350000)
  assert.equal(computeTableTimeCharge(buildTablePricingSnapshot({ hourly_rate: 80000, metadata: { rental_type: 'daily' } }), t0, t1).amount, 240000)
  assert.equal(computeTableTimeCharge(buildTablePricingSnapshot({ hourly_rate: 0, metadata: { rental_type: 'overnight' } }), t0, t1).amount, 200000)
})
