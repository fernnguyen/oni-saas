import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmAttendanceStateError } from '@oni/adapters';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';
import { attendanceActionSchema } from '@/lib/validators/hrm/profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const selfEmployeeId =
      await access.repository.getEmployeeIdForAuthUser(access.userId);
    return NextResponse.json({
      data: await access.repository.listTodayAttendance(),
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
      });
    } else {
      await access.repository.clockOut({
        employeeId,
        actorUserId: access.userId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
