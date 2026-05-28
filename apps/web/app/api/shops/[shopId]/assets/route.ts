export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    // Xem tài sản yêu cầu quyền assets.view hoặc quản trị chung settings.manage
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasViewAccess = permissions.includes('assets.view') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasViewAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to view assets' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100')));
    const type = sp.get('type'); // 'ccdc' | 'tscd'

    const filter: Record<string, string> = {};
    if (type) filter.type = type;

    const result = await connector.list('assets', { page, limit, filters: filter, sortDesc: false });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET assets');
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
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetCreateSchema.parse(body);

    const created = await connector.create('assets', data);
    invalidate(shopId, 'assets');

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST assets');
  }
}
