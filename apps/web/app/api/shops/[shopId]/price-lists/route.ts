import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { shopTag, shopCache } from '@/lib/server/cache';
import { cacheTTL } from '@/lib/env';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId, 'products.view');

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(10000, Math.max(1, parseInt(sp.get('limit') ?? '50')));
    const active = sp.get('active') ?? '';
    
    const filters: Record<string, string> = {};
    if (active) {
      filters.active = active.toUpperCase() === 'TRUE' || active === 'true' ? 'TRUE' : 'FALSE';
    }

    const result = await shopCache(
      () => connector.list('price-lists', { page, limit, filters, sortDesc: true }),
      ['price-lists', shopId, String(page), String(limit), active],
      { tags: [shopTag(shopId, 'price-lists')], revalidate: cacheTTL.priceLists }
    );

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET price-lists');
  }
}
