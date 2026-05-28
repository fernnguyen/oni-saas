export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../../../_helpers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string; memberId: string }> }
) {
  try {
    const { shopId, memberId } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('departments.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage department members' }, { status: 403 });
    }

    const body = await req.json();
    const { is_manager } = body;

    const data: Record<string, string> = {};
    if (is_manager !== undefined) {
      data.is_manager = String(is_manager).toUpperCase();
    }

    const updated = await connector.update('user-departments', memberId, data);
    invalidate(shopId, 'departments');

    return NextResponse.json(updated);
  } catch (e) {
    return handleApiError(e, 'PATCH department member');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string; memberId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('departments.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage department members' }, { status: 403 });
    }

    const { memberId } = await params;
    await connector.delete('user-departments', memberId);
    invalidate(shopId, 'departments');

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE department member');
  }
}
