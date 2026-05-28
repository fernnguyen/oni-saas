export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../_helpers';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage asset allocations' }, { status: 403 });
    }

    await connector.delete('asset-allocations', id);
    invalidate(shopId, 'assets');

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE asset allocation');
  }
}
