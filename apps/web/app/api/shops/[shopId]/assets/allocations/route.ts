export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetAllocationCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '@/app/api/shops/_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasViewAccess = permissions.includes('assets.view') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasViewAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to view asset allocations' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));
    const assetId = sp.get('asset_id');

    const filters: Record<string, string> = {};
    if (assetId) filters.asset_id = assetId;

    const result = await connector.list('asset-allocations', { page, limit, filters, sortDesc: false });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET asset allocations');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage asset allocations' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetAllocationCreateSchema.parse(body);

    const created = await connector.create('asset-allocations', data);
    invalidate(shopId, 'assets');

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST asset allocations');
  }
}
