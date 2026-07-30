import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmShiftInUseError, HrmShiftNotFoundError } from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { updateHrmShiftSchema } from '@/lib/validators/hrm/shifts';

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
  if (error instanceof HrmShiftNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  if (error instanceof HrmShiftInUseError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể cập nhật ca làm.',
      },
    },
    { status: 503 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shopId: string; shiftId: string }> },
) {
  try {
    const { shopId, shiftId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    const input = updateHrmShiftSchema.parse(await request.json());
    await access.repository.updateShiftTemplate({
      id: shiftId,
      name: input.name,
      startTime: input.start_time,
      endTime: input.end_time,
      breakMinutes: input.break_minutes,
      lateGraceMinutes: input.late_grace_minutes,
      active: input.active,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ shopId: string; shiftId: string }> },
) {
  try {
    const { shopId, shiftId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    await access.repository.deleteUnusedShiftTemplate(shiftId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
