import { NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý yêu cầu.',
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
    // hrm.view is sufficient to read public settings (like leave advance rules)
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const settings = await access.repository.getSettings();

    return NextResponse.json({ data: settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    
    const body = await request.json();
    const updatePayload: { maxUploadSizeMb?: number; attendanceRules?: Record<string, unknown> } = {};

    if (body.max_upload_size_mb !== undefined) {
      const maxUploadSizeMb = Number(body.max_upload_size_mb);
      if (isNaN(maxUploadSizeMb) || maxUploadSizeMb <= 0 || maxUploadSizeMb > 100) {
        return NextResponse.json({ error: { message: 'Dung lượng tối đa không hợp lệ (1-100MB)' } }, { status: 400 });
      }
      updatePayload.maxUploadSizeMb = maxUploadSizeMb;
    }

    if (body.attendance_rules !== undefined) {
      if (typeof body.attendance_rules !== 'object' || body.attendance_rules === null) {
        return NextResponse.json({ error: { message: 'Cấu hình chấm công không hợp lệ' } }, { status: 400 });
      }
      updatePayload.attendanceRules = body.attendance_rules;
    }

    await access.repository.updateSettings(updatePayload);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
