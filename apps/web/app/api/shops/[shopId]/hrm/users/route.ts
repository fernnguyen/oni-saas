import { NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { listTenantUsers } from '@/lib/server/tenantUsers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.employee.manage');
    const users = await listTenantUsers(access.tenantId);
    const data = users
      .filter((user) => {
        const role = user.role as
          | { scope?: string; shop?: { id?: string } }
          | null;
        return (
          role?.scope === 'workspace' ||
          (role?.scope === 'shop' && role.shop?.id === shopId)
        );
      })
      .map((user) => ({
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
      }));

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof HrmAccessError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: 'HRM_USER_DIRECTORY_UNAVAILABLE',
          message: 'Không tải được danh sách tài khoản.',
        },
      },
      { status: 503 },
    );
  }
}
