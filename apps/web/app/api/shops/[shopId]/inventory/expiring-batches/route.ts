import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const supabase = await getSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Fetch batches that have stock > 0, have an expiry date, and expiry date <= futureDate
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select(`
        *,
        product:products!product_id(
          name, 
          image_url, 
          sku, 
          barcode, 
          unit
        )
      `)
      .eq('branch_id', shopId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', futureDateStr)
      // Only get batches that actually have stock left
      // Since stock_qty is a string in the DB, we have to fetch them and filter locally or cast in Postgrest if possible.
      // But we can just fetch and filter locally since there shouldn't be too many expiring soon.
      .order('expiry_date', { ascending: true });

    if (error) {
      console.error('Error fetching expiring batches:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out batches with 0 stock
    const filteredBatches = (batches || []).filter((b: any) => {
      const qty = parseFloat(b.stock_qty || '0');
      return qty > 0;
    });

    return NextResponse.json({ data: filteredBatches });
  } catch (err: any) {
    console.error('Unexpected error in expiring batches API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
