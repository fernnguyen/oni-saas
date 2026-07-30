import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareAttendanceUpserts } from '../../../apps/web/lib/server/hrm/attendanceDays';
import type { PostgresHrmRepository } from '../../../packages/adapters/src/hrm';

function repositoryWithShifts(
  shifts: Array<{
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    lateGraceMinutes: number;
    active: boolean;
    usageCount: number;
  }>,
) {
  return {
    async listShiftTemplates() {
      return shifts;
    },
    async listScopedAttendanceEmployeeIds(employeeIds: string[]) {
      return employeeIds;
    },
  } as PostgresHrmRepository;
}

const dayShift = {
  id: 'HRMS-DAY',
  name: 'Ca ngày',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  lateGraceMinutes: 5,
  active: true,
  usageCount: 0,
};

test('manual attendance upsert calculates minutes from the selected shift', async () => {
  const [prepared] = await prepareAttendanceUpserts({
    repository: repositoryWithShifts([dayShift]),
    actorUserId: '00000000-0000-4000-8000-000000000001',
    source: 'manual',
    rows: [
      {
        employee_id: 'EMP-1',
        work_date: '2026-07-30',
        shift_template_id: dayShift.id,
        clock_in: '08:12',
        clock_out: '17:30',
        status: 'present',
        note: null,
      },
    ],
  });

  assert.equal(prepared?.workedMinutes, 498);
  assert.equal(prepared?.lateMinutes, 7);
  assert.equal(prepared?.overtimeMinutes, 30);
  assert.equal(prepared?.clockIn, '2026-07-30T01:12:00.000Z');
  assert.equal(prepared?.clockOut, '2026-07-30T10:30:00.000Z');
});

test('attendance upsert stores an overnight clock-out on the next date', async () => {
  const nightShift = {
    ...dayShift,
    id: 'HRMS-NIGHT',
    name: 'Ca đêm',
    startTime: '22:00',
    endTime: '06:00',
    breakMinutes: 30,
  };
  const [prepared] = await prepareAttendanceUpserts({
    repository: repositoryWithShifts([nightShift]),
    actorUserId: '00000000-0000-4000-8000-000000000001',
    source: 'manual',
    rows: [
      {
        employee_id: 'EMP-1',
        work_date: '2026-07-30',
        shift_template_id: nightShift.id,
        clock_in: '22:10',
        clock_out: '06:30',
        status: 'present',
      },
    ],
  });

  assert.equal(prepared?.clockOut, '2026-07-30T23:30:00.000Z');
  assert.equal(prepared?.workedMinutes, 470);
});

test('non-working status clears shift and clock values', async () => {
  const [prepared] = await prepareAttendanceUpserts({
    repository: repositoryWithShifts([dayShift]),
    actorUserId: '00000000-0000-4000-8000-000000000001',
    source: 'manual',
    rows: [
      {
        employee_id: 'EMP-1',
        work_date: '2026-07-30',
        shift_template_id: dayShift.id,
        clock_in: '08:00',
        clock_out: '17:00',
        status: 'paid_leave',
      },
    ],
  });

  assert.equal(prepared?.shiftTemplateId, null);
  assert.equal(prepared?.clockIn, null);
  assert.equal(prepared?.clockOut, null);
  assert.equal(prepared?.workedMinutes, 0);
});

test('bulk attendance rejects duplicate employee and work date rows', async () => {
  await assert.rejects(
    prepareAttendanceUpserts({
      repository: repositoryWithShifts([]),
      actorUserId: '00000000-0000-4000-8000-000000000001',
      source: 'import',
      rows: [
        {
          employee_id: 'EMP-1',
          work_date: '2026-07-30',
          status: 'absent',
        },
        {
          employee_id: 'EMP-1',
          work_date: '2026-07-30',
          status: 'holiday',
        },
      ],
    }),
    /bị trùng/,
  );
});

test('attendance preview rejects employees outside the current branch', async () => {
  const repository = {
    async listShiftTemplates() {
      return [];
    },
    async listScopedAttendanceEmployeeIds() {
      return [];
    },
  } as unknown as PostgresHrmRepository;

  await assert.rejects(
    prepareAttendanceUpserts({
      repository,
      actorUserId: '00000000-0000-4000-8000-000000000001',
      source: 'import',
      rows: [
        {
          employee_id: 'EMP-OTHER-BRANCH',
          work_date: '2026-07-30',
          status: 'absent',
        },
      ],
    }),
    /không thuộc chi nhánh hiện tại/,
  );
});
