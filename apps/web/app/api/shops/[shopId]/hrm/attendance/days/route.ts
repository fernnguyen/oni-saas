import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmShiftNotFoundError } from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import {
  HrmAttendanceInputError,
  prepareAttendanceUpserts,
} from '@/lib/server/hrm/attendanceDays';
import { attendanceDaysUpsertSchema } from '@/lib/validators/hrm/attendanceDays';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function respondError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
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
  if (error instanceof HrmAttendanceInputError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 },
    );
  }
  if (error instanceof HrmShiftNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_ATTENDANCE_UPDATE_FAILED',
        message: 'Không thể cập nhật bảng công.',
      },
    },
    { status: 503 },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.attendance.manage');
    const input = attendanceDaysUpsertSchema.parse(await request.json());
    const rows = await prepareAttendanceUpserts({
      repository: access.repository,
      rows: input.rows,
      actorUserId: access.userId,
      source: input.source,
    });
    await access.repository.upsertAttendanceDays(rows);
    return NextResponse.json({ success: true, updated: rows.length });
  } catch (error) {
    return respondError(error);
  }
}
