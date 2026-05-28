export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetUpdateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../_helpers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetUpdateSchema.parse(body);

    const updated = await connector.update('assets', id, data);
    invalidate(shopId, 'assets');

    return NextResponse.json(updated);
  } catch (e) {
    return handleApiError(e, 'PATCH asset');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    await connector.delete('assets', id);
    invalidate(shopId, 'assets');

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE asset');
  }
}
