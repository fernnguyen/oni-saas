import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { handleApiError } from '../../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    
    // Authenticate and verify user has access to this shop
    const { connector } = await requireShopAccess(shopId);

    // List sepay webhook logs from the branch connector database (MySQL or PostgreSQL)
    const logsRes = await connector.list('sepay-webhook-logs', {
      page: 1,
      limit: 100,
      sortDesc: true,
    });

    return NextResponse.json({ data: logsRes.data || [] });
  } catch (err: any) {
    if (err.name === 'ShopAccessError') {
      return NextResponse.json({ message: err.message }, { status: err.status });
    }
    return handleApiError(err, 'GET sepay webhook logs');
  }
}
