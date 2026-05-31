export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { costAllocationTemplateCreateSchema } from '@/lib/validators/assets';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.view');

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));

    // Force strict branch filtering
    const result = await connector.list('cost-allocation-templates', { 
      page, 
      limit, 
      filters: { branch_id: shopId },
      sortDesc: false 
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET cost allocation templates');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    const body = await req.json();
    const data = costAllocationTemplateCreateSchema.parse(body);

    // Force strict branch scoping on write
    data.branch_id = shopId;

    const created = await connector.create('cost-allocation-templates', data);

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST cost allocation template');
  }
}
