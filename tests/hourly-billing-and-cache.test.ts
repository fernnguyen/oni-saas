import assert from 'node:assert/strict';
import { calculateHourlyBilling } from '../packages/core/src/hourlyBilling';
import { CachedDataConnector } from '../packages/adapters/src/cache/CachedDataConnector';

async function runTests() {
  console.log('--- 1. Testing Billiards Per-Minute Billing (calculateHourlyBilling) ---');
  const checkIn = new Date('2026-10-23T10:00:00.000Z');
  const checkOut15m = new Date('2026-10-23T10:15:00.000Z');
  const checkOut60m = new Date('2026-10-23T11:00:00.000Z');
  const checkOut75m = new Date('2026-10-23T11:15:00.000Z');

  // Case A: Default hourly block mode (charge_by_minute = false) -> 15 mins @ 30k/h charges 1 full hour = 30,000đ
  const resStandard15m = calculateHourlyBilling({
    checkIn,
    checkOut: checkOut15m,
    standardRate: 30000,
    config: { enabled: false, base_hours: 1, base_price: 30000, grace_minutes: 0, charge_by_minute: false }
  });
  assert.equal(resStandard15m.totalAmount, 30000, 'Standard hourly mode: 15m @ 30k/h should be 30,000đ');
  assert.equal(resStandard15m.durationLabel, '0h 15p');

  // Case B: Per-minute mode (charge_by_minute = true) -> 15 mins @ 30k/h charges (30,000 / 60) * 15 = 7,500đ
  const resPerMin15m = calculateHourlyBilling({
    checkIn,
    checkOut: checkOut15m,
    standardRate: 30000,
    config: { enabled: false, base_hours: 1, base_price: 0, grace_minutes: 0, charge_by_minute: true }
  });
  assert.equal(resPerMin15m.totalAmount, 7500, 'Per-minute mode: 15m @ 30k/h must be 7,500đ');
  assert.equal(resPerMin15m.durationLabel, '0h 15p');
  assert.equal(resPerMin15m.detailsLabel, '15 phút (tính theo phút)');

  // Case C: Per-minute mode -> 60 mins @ 30k/h = 30,000đ
  const resPerMin60m = calculateHourlyBilling({
    checkIn,
    checkOut: checkOut60m,
    standardRate: 30000,
    config: { enabled: false, base_hours: 1, base_price: 0, grace_minutes: 0, charge_by_minute: true }
  });
  assert.equal(resPerMin60m.totalAmount, 30000, 'Per-minute mode: 60m @ 30k/h must be 30,000đ');

  // Case D: Per-minute mode -> 75 mins (1h 15p) @ 30k/h = 37,500đ
  const resPerMin75m = calculateHourlyBilling({
    checkIn,
    checkOut: checkOut75m,
    standardRate: 30000,
    config: { enabled: false, base_hours: 1, base_price: 0, grace_minutes: 0, charge_by_minute: true }
  });
  assert.equal(resPerMin75m.totalAmount, 37500, 'Per-minute mode: 75m @ 30k/h must be 37,500đ');

  // Case E: Per-minute mode combined with progressive rates (Hour 1 = 30k/h, Hour 2 = 24k/h) -> 75 mins = 30,000 + 6,000 = 36,000đ
  const resPerMinProg75m = calculateHourlyBilling({
    checkIn,
    checkOut: checkOut75m,
    standardRate: 30000,
    config: {
      enabled: true,
      base_hours: 1,
      base_price: 30000,
      next_hourly_rate: 24000,
      grace_minutes: 0,
      charge_by_minute: true
    }
  });
  assert.equal(resPerMinProg75m.totalAmount, 36000, 'Per-minute progressive mode: 75m (30k h1 + 24k h2) must be 36,000đ');

  console.log('✅ All calculateHourlyBilling tests passed!');

  console.log('--- 2. Testing CachedDataConnector Excluded Entities ---');
  let listCalls = 0;
  let cacheGetCalls = 0;
  const mockInner: any = {
    list: async () => {
      listCalls++;
      return { data: [{ id: `tbl-${listCalls}` }], total: 1, page: 1, limit: 20 };
    }
  };
  const mockCache: any = {
    get: async () => {
      cacheGetCalls++;
      return { data: [{ id: 'stale' }], total: 1, page: 1, limit: 20 };
    },
    set: async () => {},
    delete: async () => {},
    deletePattern: async () => {}
  };
  const connector = new CachedDataConnector(mockInner, mockCache, 'tenant-1', 'branch-1');
  const r1 = await connector.list('location-resources');
  const r2 = await connector.list('location-resources');
  assert.equal(cacheGetCalls, 0, 'location-resources must bypass cache completely');
  assert.equal(listCalls, 2, 'location-resources must hit underlying DB on every list call');
  assert.equal(r1.data[0].id, 'tbl-1');
  assert.equal(r2.data[0].id, 'tbl-2');

  // Verify retail products STILL use cache
  await connector.list('products');
  assert.equal(cacheGetCalls, 1, 'Retail products must still use cache as before');

  console.log('✅ All CachedDataConnector exclusion & retail preservation tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
