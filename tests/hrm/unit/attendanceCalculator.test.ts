import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAttendance } from '../../../apps/web/lib/hrm/domain/attendanceCalculator';

test('attendance calculator applies break and late grace minutes', () => {
  assert.deepEqual(
    calculateAttendance({
      shiftStart: '08:00',
      shiftEnd: '17:00',
      clockIn: '08:12',
      clockOut: '17:30',
      breakMinutes: 60,
      lateGraceMinutes: 5,
    }),
    {
      complete: true,
      overnightShift: false,
      workedMinutes: 498,
      lateMinutes: 7,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 30,
    },
  );
});

test('attendance calculator handles early leave', () => {
  const result = calculateAttendance({
    shiftStart: '08:00',
    shiftEnd: '17:00',
    clockIn: '07:55',
    clockOut: '16:40',
    breakMinutes: 60,
  });

  assert.equal(result.workedMinutes, 465);
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.earlyLeaveMinutes, 20);
  assert.equal(result.overtimeMinutes, 0);
});

test('attendance calculator handles a shift crossing midnight', () => {
  assert.deepEqual(
    calculateAttendance({
      shiftStart: '22:00',
      shiftEnd: '06:00',
      clockIn: '22:10',
      clockOut: '06:30',
      breakMinutes: 30,
      lateGraceMinutes: 5,
    }),
    {
      complete: true,
      overnightShift: true,
      workedMinutes: 470,
      lateMinutes: 5,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 30,
    },
  );
});

test('attendance calculator returns an incomplete result for a missing clock', () => {
  const result = calculateAttendance({
    shiftStart: '08:00',
    shiftEnd: '17:00',
    clockIn: '08:00',
    clockOut: null,
  });

  assert.equal(result.complete, false);
  assert.equal(result.workedMinutes, 0);
});

test('attendance calculator rejects malformed time values', () => {
  assert.throws(
    () =>
      calculateAttendance({
        shiftStart: '25:00',
        shiftEnd: '17:00',
      }),
    /Invalid HRM time/,
  );
});
