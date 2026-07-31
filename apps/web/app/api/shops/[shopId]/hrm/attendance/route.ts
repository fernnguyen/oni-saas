import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { HrmAttendanceStateError } from '@oni/adapters';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';
import { attendanceActionSchema } from '@/lib/validators/hrm/profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const updateAttendanceDaySchema = z.object({
  employee_id: z.string(),
  work_date: z.string(),
  shift_template_id: z.string().nullable().optional(),
  clock_in: z.string().nullable().optional(),
  clock_out: z.string().nullable().optional(),
  shift_template_id_2: z.string().nullable().optional(),
  clock_in_2: z.string().nullable().optional(),
  clock_out_2: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

function respondError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof HrmAttendanceStateError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý chấm công.',
      },
    },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const selfEmployeeId =
      await access.repository.getEmployeeIdForAuthUser(access.userId);
    const searchParams = new URL(request.url).searchParams;
    const month = searchParams.get('month');

    if (month) {
      const match = /^(\d{4})-(\d{2})$/.exec(month);
      if (!match) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_VALIDATION_ERROR',
              message: 'Tháng bảng công không hợp lệ.',
            },
          },
          { status: 400 },
        );
      }
      const year = Number(match[1]);
      const monthNumber = Number(match[2]);
      if (monthNumber < 1 || monthNumber > 12) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_VALIDATION_ERROR',
              message: 'Tháng bảng công không hợp lệ.',
            },
          },
          { status: 400 },
        );
      }
      const periodStart = `${month}-01`;
      const lastDay = new Date(Date.UTC(year, monthNumber, 0))
        .getUTCDate()
        .toString()
        .padStart(2, '0');
      const periodEnd = `${month}-${lastDay}`;
      const departmentId = searchParams.get('department_id');
      const [data, shifts, holidays, settings] = await Promise.all([
        access.repository.listMonthlyAttendance({
          periodStart,
          periodEnd,
          departmentId: departmentId || null,
        }),
        access.repository.listShiftTemplates({ includeInactive: true }),
        access.repository.listHolidays(year),
        access.repository.getSettings(),
      ]);
      return NextResponse.json({
        mode: 'monthly',
        data,
        shifts,
        holidays,
        attendanceRules: settings.attendanceRules,
        canManage: access.permissions.includes('hrm.attendance.manage'),
        selfEmployeeId,
      });
    }

    const [data, shifts] = await Promise.all([
      access.repository.listTodayAttendance(),
      access.repository.listShiftTemplates({ includeInactive: true }),
    ]);

    return NextResponse.json({
      mode: 'today',
      data,
      shifts,
      canManage: access.permissions.includes('hrm.attendance.manage'),
      selfEmployeeId,
    });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const input = attendanceActionSchema.parse(await request.json());
    const selfEmployeeId =
      await access.repository.getEmployeeIdForAuthUser(access.userId);
    const employeeId = input.employee_id ?? selfEmployeeId;
    const canManage = access.permissions.includes('hrm.attendance.manage');

    if (!employeeId) {
      throw new HrmAttendanceStateError(
        'Tài khoản chưa được liên kết với nhân viên.',
      );
    }
    if (!canManage && employeeId !== selfEmployeeId) {
      throw new HrmAccessError(
        403,
        'HRM_PERMISSION_DENIED',
        'Bạn chỉ được chấm công cho chính mình.',
      );
    }

    if (input.action === 'check_in') {
      await access.repository.clockIn({
        attendanceId: `HRMA-${crypto.randomUUID()}`,
        profileId: `HRMP-${crypto.randomUUID()}`,
        employeeId,
        actorUserId: access.userId,
        source: employeeId === selfEmployeeId ? 'self' : 'manual',
        customTime: input.custom_time,
        note: input.note,
        shiftTemplateId: input.shift_template_id,
      });
    } else {
      await access.repository.clockOut({
        employeeId,
        actorUserId: access.userId,
        customTime: input.custom_time,
        note: input.note,
        shiftTemplateId: input.shift_template_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.attendance.manage');
    const input = updateAttendanceDaySchema.parse(await request.json());

    await access.repository.updateAttendanceDay({
      employeeId: input.employee_id,
      workDate: input.work_date,
      shiftTemplateId: input.shift_template_id,
      clockIn: input.clock_in,
      clockOut: input.clock_out,
      shiftTemplateId2: input.shift_template_id_2,
      clockIn2: input.clock_in_2,
      clockOut2: input.clock_out_2,
      note: input.note,
      status: input.status,
      actorUserId: access.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
