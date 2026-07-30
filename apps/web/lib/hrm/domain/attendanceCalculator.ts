export interface AttendanceCalculationInput {
  shiftStart: string;
  shiftEnd: string;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes?: number;
  lateGraceMinutes?: number;
}

export interface AttendanceCalculationResult {
  complete: boolean;
  overnightShift: boolean;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

function parseTime(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid HRM time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function calculateAttendance(
  input: AttendanceCalculationInput,
): AttendanceCalculationResult {
  const shiftStart = parseTime(input.shiftStart);
  const rawShiftEnd = parseTime(input.shiftEnd);
  const overnightShift = rawShiftEnd <= shiftStart;
  const shiftEnd = rawShiftEnd + (overnightShift ? 24 * 60 : 0);
  const emptyResult = {
    complete: false,
    overnightShift,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
  };
  if (!input.clockIn || !input.clockOut) return emptyResult;

  let clockIn = parseTime(input.clockIn);
  let clockOut = parseTime(input.clockOut);
  if (overnightShift) {
    if (clockIn <= rawShiftEnd) clockIn += 24 * 60;
    if (clockOut < shiftStart) clockOut += 24 * 60;
  } else if (clockOut < clockIn) {
    clockOut += 24 * 60;
  }

  const breakMinutes = Math.max(0, Math.round(input.breakMinutes ?? 0));
  const lateGraceMinutes = Math.max(
    0,
    Math.round(input.lateGraceMinutes ?? 0),
  );

  return {
    complete: true,
    overnightShift,
    workedMinutes: Math.max(0, clockOut - clockIn - breakMinutes),
    lateMinutes: Math.max(0, clockIn - shiftStart - lateGraceMinutes),
    earlyLeaveMinutes: Math.max(0, shiftEnd - clockOut),
    overtimeMinutes: Math.max(0, clockOut - shiftEnd),
  };
}
