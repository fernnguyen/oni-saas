import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatHrmDate,
  formatHrmDateTime,
  formatHrmPayPeriod,
  formatHrmPayPeriodLong,
} from '../../../apps/web/lib/hrm/formatDate';

test('HRM date formatter displays ISO business dates as dd/mm/yyyy', () => {
  assert.equal(formatHrmDate('2026-07-30'), '30/07/2026');
  assert.equal(
    formatHrmDate('2026-07-30T10:15:00.000Z'),
    '30/07/2026',
  );
  assert.equal(formatHrmDate('2024-02-29'), '29/02/2024');
});

test('HRM date formatter is deterministic for empty and invalid values', () => {
  assert.equal(formatHrmDate(null), '—');
  assert.equal(formatHrmDate('', 'Chưa có'), 'Chưa có');
  assert.equal(formatHrmDate('2026-02-30'), '2026-02-30');
  assert.equal(formatHrmDate('không xác định'), 'không xác định');
});

test('HRM datetime formatter displays Vietnam time with seconds', () => {
  assert.equal(
    formatHrmDateTime('2026-08-03T03:04:05.000Z'),
    '10:04:05 03/08/2026',
  );
  assert.equal(formatHrmDateTime(null), '—');
  assert.equal(formatHrmDateTime('không xác định'), 'không xác định');
});

test('HRM pay period formatter displays yyyy-mm as mm/yyyy', () => {
  assert.equal(formatHrmPayPeriod('2026-08'), '08/2026');
  assert.equal(formatHrmPayPeriod('2026-12'), '12/2026');
  assert.equal(formatHrmPayPeriod(null), '—');
  assert.equal(formatHrmPayPeriod('', 'Chưa có'), 'Chưa có');
  assert.equal(formatHrmPayPeriod('invalid-format'), 'invalid-format');
});

test('HRM long pay period formatter displays yyyy-mm as Tháng m/yyyy', () => {
  assert.equal(formatHrmPayPeriodLong('2026-08'), 'Tháng 8/2026');
  assert.equal(formatHrmPayPeriodLong('2026-10'), 'Tháng 10/2026');
  assert.equal(formatHrmPayPeriodLong(null), '—');
  assert.equal(formatHrmPayPeriodLong('', 'Chưa có'), 'Chưa có');
  assert.equal(formatHrmPayPeriodLong('invalid-format'), 'invalid-format');
});
