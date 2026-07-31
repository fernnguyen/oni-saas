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
        message: 'Không thể xử lý yêu cầu về ngày lễ.',
      },
    },
    { status: 503 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shopId: string; holidayId: string }> },
) {
  try {
    const { shopId, holidayId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    
    await access.repository.deleteHoliday(holidayId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
