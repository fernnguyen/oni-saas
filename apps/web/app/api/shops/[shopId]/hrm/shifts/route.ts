import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { createHrmShiftSchema } from '@/lib/validators/hrm/shifts';

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
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý ca làm.',
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
    const canManage = access.permissions.includes('hrm.settings.manage');
    const includeInactive =
      canManage &&
      new URL(request.url).searchParams.get('include_inactive') === '1';
    return NextResponse.json({
      data: await access.repository.listShiftTemplates({ includeInactive }),
      canManage,
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
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    const input = createHrmShiftSchema.parse(await request.json());
    await access.repository.createShiftTemplate({
      id: `HRMS-${crypto.randomUUID()}`,
      name: input.name,
      startTime: input.start_time,
      endTime: input.end_time,
      breakMinutes: input.break_minutes,
      lateGraceMinutes: input.late_grace_minutes,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
