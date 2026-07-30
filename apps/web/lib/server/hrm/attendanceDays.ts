import crypto from 'node:crypto';
import type {
  HrmAttendanceUpsertInput,
  HrmShiftTemplate,
  PostgresHrmRepository,
} from '@oni/adapters';
import { calculateAttendance } from '../../hrm/domain/attendanceCalculator';
import type { AttendanceDayInput } from '../../validators/hrm/attendanceDays';

const LOCAL_TIME_ZONE_OFFSET = '+07:00';

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function localTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time}:00${LOCAL_TIME_ZONE_OFFSET}`).toISOString();
}

export class HrmAttendanceInputError extends Error {
  readonly code = 'HRM_ATTENDANCE_INPUT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'HrmAttendanceInputError';
  }
}

function prepareRow(
  row: AttendanceDayInput,
  shifts: Map<string, HrmShiftTemplate>,
  actorUserId: string,
  source: 'manual' | 'import',
): HrmAttendanceUpsertInput {
  const isNonWorkingStatus = row.status !== 'present';
  const clockInTime = isNonWorkingStatus ? null : (row.clock_in ?? null);
  const clockOutTime = isNonWorkingStatus ? null : (row.clock_out ?? null);
  const shiftId = isNonWorkingStatus ? null : (row.shift_template_id ?? null);
  const shift = shiftId ? shifts.get(shiftId) : undefined;
  if (shiftId && !shift) throw new HrmAttendanceInputError('Ca làm không thuộc chi nhánh hiện tại.');

  let workedMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  let clockIn: string | null = null;
  let clockOut: string | null = null;

  const overnightShift = Boolean(
    shift && shift.endTime <= shift.startTime,
  );
  if (clockInTime) {
    const clockInAfterMidnight =
      overnightShift &&
      shift &&
      minutesOfDay(clockInTime) <= minutesOfDay(shift.endTime);
    clockIn = localTimestamp(
      clockInAfterMidnight ? nextDate(row.work_date) : row.work_date,
      clockInTime,
    );
  }
  if (clockInTime && clockOutTime) {
    const crossesMidnight = shift
      ? overnightShift
      : minutesOfDay(clockOutTime) < minutesOfDay(clockInTime);
    clockOut = localTimestamp(
      crossesMidnight ? nextDate(row.work_date) : row.work_date,
      clockOutTime,
    );
    if (shift) {
      const result = calculateAttendance({
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        clockIn: clockInTime,
        clockOut: clockOutTime,
        breakMinutes: shift.breakMinutes,
        lateGraceMinutes: shift.lateGraceMinutes,
      });
      workedMinutes = result.workedMinutes;
      lateMinutes = result.lateMinutes;
      earlyLeaveMinutes = result.earlyLeaveMinutes;
      overtimeMinutes = result.overtimeMinutes;
    } else {
      let end = minutesOfDay(clockOutTime);
      const start = minutesOfDay(clockInTime);
      if (end < start) end += 24 * 60;
      workedMinutes = Math.max(0, end - start);
    }
  }

  return {
    attendanceId: `HRMA-${crypto.randomUUID()}`,
    profileId: `HRMP-${crypto.randomUUID()}`,
    auditId: `HRML-${crypto.randomUUID()}`,
    employeeId: row.employee_id,
    workDate: row.work_date,
    shiftTemplateId: shiftId,
    clockIn,
    clockOut,
    workedMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    status: row.status,
    note: row.note ?? null,
    source,
    actorUserId,
  };
}

export async function prepareAttendanceUpserts(input: {
  repository: PostgresHrmRepository;
  rows: AttendanceDayInput[];
  actorUserId: string;
  source: 'manual' | 'import';
}): Promise<HrmAttendanceUpsertInput[]> {
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const row of input.rows) {
    const key = `${row.employee_id}:${row.work_date}`;
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
  }
  if (duplicateKeys.size > 0) {
    throw new HrmAttendanceInputError(
      'Dữ liệu có nhân viên và ngày công bị trùng.',
    );
  }

  const employeeIds = [...new Set(input.rows.map((row) => row.employee_id))];
  const [shiftRows, scopedEmployeeIds] = await Promise.all([
    input.repository.listShiftTemplates({ includeInactive: true }),
    input.repository.listScopedAttendanceEmployeeIds(employeeIds),
  ]);
  const scopedEmployees = new Set(scopedEmployeeIds);
  const unknownEmployees = employeeIds.filter((id) => !scopedEmployees.has(id));
  if (unknownEmployees.length > 0) {
    throw new HrmAttendanceInputError(
      `Nhân viên không thuộc chi nhánh hiện tại: ${unknownEmployees.slice(0, 5).join(', ')}.`,
    );
  }

  const shifts = new Map(shiftRows.map((shift) => [shift.id, shift]));
  return input.rows.map((row) =>
    prepareRow(row, shifts, input.actorUserId, input.source),
  );
}
