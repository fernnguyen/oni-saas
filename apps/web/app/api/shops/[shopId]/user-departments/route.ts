export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId);

    const sp = req.nextUrl.searchParams;
    const userId = sp.get('user_id');
    const deptId = sp.get('department_id');

    const filters: Record<string, string> = {};
    if (userId) filters.user_id = userId;
    if (deptId) filters.department_id = deptId;

    const result = await connector.list('user-departments', {
      page: 1,
      limit: 500,
      filters,
      sortDesc: false
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET user departments');
  }
}
