import { NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    
    // Auth and getting the connector for the specific shop
    const { connector } = await requireShopAccess(shopId, 'inventory.view');

    const { searchParams } = new URL(req.url);
    const daysStr = searchParams.get('days');
    let daysToLookAhead = 30; // default to 30 days
    if (daysStr) {
      daysToLookAhead = parseInt(daysStr, 10);
      if (isNaN(daysToLookAhead) || daysToLookAhead < 0) {
        daysToLookAhead = 30;
      }
    }

    const today = new Date();
    const futureDate = new Date(today.getTime() + daysToLookAhead * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    // Fetch all batches and filter locally
    const batchesRes = await connector.list('inventory-batches', { limit: 10000 });
    const batches = batchesRes.data || [];

    const expiringBatches = batches.filter((b: any) => {
      if (!b.expiry_date) return false;
      // We only want batches expiring on or before futureDateStr
      if (b.expiry_date > futureDateStr) return false;
      const qty = parseFloat(b.stock_qty || '0');
      return qty > 0;
    });

    // If we have expiring batches, we need to attach their product details
    let finalBatches = expiringBatches;
    
    if (expiringBatches.length > 0) {
      // Fetch products to attach
      const productsRes = await connector.list('products', { limit: 10000 });
      const productsMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));
      
      finalBatches = expiringBatches.map(b => ({
        ...b,
        product: productsMap.get(b.product_id) || null
      }));
    }

    // Sort by expiry_date ascending
    finalBatches.sort((a, b) => {
      const dateA = new Date(a.expiry_date).getTime();
      const dateB = new Date(b.expiry_date).getTime();
      return dateA - dateB;
    });

    return NextResponse.json({ data: finalBatches });
  } catch (err: any) {
    console.error('Unexpected error in expiring batches API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
