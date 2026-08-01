import { NextRequest, NextResponse } from 'next/server';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = access.permissions.includes('hrm.attendance.manage');
    const selfProfileId = await access.repository.getProfileIdForAuthUser(access.userId);

    const url = request.nextUrl;
    const profileId = url.searchParams.get('profile_id');
    const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);

    if (!profileId) {
      return NextResponse.json({ error: { message: 'profile_id là bắt buộc.' } }, { status: 422 });
    }
    if (!canManage && profileId !== selfProfileId) {
      return NextResponse.json({ error: { message: 'Không có quyền xem quỹ phép của nhân viên khác.' } }, { status: 403 });
    }

    const data = await access.repository.getLeaveBalance(profileId, year);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof HrmAccessError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Lỗi không xác định.';
    return NextResponse.json({ error: { message: msg } }, { status: 500 });
  }
}
