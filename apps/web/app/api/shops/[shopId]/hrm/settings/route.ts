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
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
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
    const maxUploadSizeMb = Number(body.max_upload_size_mb);
    if (isNaN(maxUploadSizeMb) || maxUploadSizeMb <= 0 || maxUploadSizeMb > 100) {
      return NextResponse.json({ error: { message: 'Dung lượng tối đa không hợp lệ (1-100MB)' } }, { status: 400 });
    }

    await access.repository.updateSettings({ maxUploadSizeMb });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
