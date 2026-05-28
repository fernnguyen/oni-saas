export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId);

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));

    // Get all user-departments entries for this department
    const result = await connector.list('user-departments', {
      page,
      limit,
      filters: { department_id: id },
      sortDesc: false
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET department members');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('departments.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage department members' }, { status: 403 });
    }

    const body = await req.json();
    const { user_id, is_manager = 'FALSE' } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Check if membership already exists
    const existingList = await connector.list('user-departments', {
      page: 1,
      limit: 10,
      filters: { department_id: id, user_id }
    });

    if (existingList.data && existingList.data.length > 0) {
      return NextResponse.json({ error: 'Member already exists in this department' }, { status: 400 });
    }

    const created = await connector.create('user-departments', {
      department_id: id,
      user_id,
      is_manager: String(is_manager).toUpperCase()
    });

    invalidate(shopId, 'departments');

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST department members');
  }
}
