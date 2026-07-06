import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { dispatchNotification } from '../../../../lib/server/notifications';
import { startOfDay, endOfDay, format } from 'date-fns';

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  // 1. Verify Authorization
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  
  // 2. Fetch all shops with their tenant slug
  const { data: shops, error: shopError } = await admin
    .from('shops')
    .select(`
      id, name, slug, tenant_id,
      tenants:tenant_id ( slug )
    `);

  if (shopError || !shops) {
    return NextResponse.json({ message: 'Failed to fetch shops', error: shopError }, { status: 500 });
  }

  if (shops.length === 0) {
    return NextResponse.json({ success: true, results: [] });
  }

  const shopIds = shops.map((s: any) => s.id);

  // 3. Fetch all events and settings at once to avoid n+1 queries
  const { data: allEvents } = await admin
    .from('tenant_notification_events')
    .select('shop_id, event_name, is_enabled')
    .in('shop_id', shopIds);

  const { data: allSettings } = await admin
    .from('tenant_shop_settings')
    .select('shop_id, allow_negative_stock')
    .in('shop_id', shopIds);

  // 4. Process all shops in parallel
  const promises = shops.map(async (shop) => {
    try {
      const shopEvents = allEvents?.filter((e: any) => e.shop_id === shop.id) || [];
      const shopSettings = allSettings?.find((s: any) => s.shop_id === shop.id) || {};
      const shopResult = await processShopDailyScan(admin, shop, shopEvents, shopSettings);
      return { shopId: shop.id, ...shopResult };
    } catch (err: any) {
      console.error(`Error processing shop ${shop.id}:`, err);
      return { shopId: shop.id, error: err.message };
    }
  });

  const allResults = await Promise.all(promises);
  const results = allResults.filter(
    (r: any) => r.error || r.dailyDigestSent || r.expiringBatchesAlertsSent > 0 || r.outOfStockAlertsSent > 0
  );

  return NextResponse.json({ success: true, processedShops: allResults.length, results });
}

async function processShopDailyScan(admin: any, shop: any, events: any[], settings: any) {
  const result = {
    dailyDigestSent: false,
    expiringBatchesAlertsSent: 0,
    outOfStockAlertsSent: 0,
  };

  const { id: shopId, tenant_id: tenantId, name: shopName, slug: shopSlug } = shop;
  const tenantSlug = shop.tenants?.slug || 'app';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://oni.vn';
  const protocol = baseUrl.startsWith('https') ? 'https://' : 'http://';
  const domain = baseUrl.replace(protocol, '');
  const shopDomainUrl = `${protocol}${tenantSlug}.${domain}/${shopSlug}`;

  // Check which events are enabled for this shop
  const isDailyDigestEnabled = events?.find((e: any) => e.event_name === 'DAILY_DIGEST')?.is_enabled;
  const isExpiringBatchesEnabled = events?.find((e: any) => e.event_name === 'EXPIRING_BATCHES')?.is_enabled ?? true; // Default true
  const isLowStockEnabled = events?.find((e: any) => e.event_name === 'LOW_STOCK')?.is_enabled ?? true; // Default true
  
  // -- 1. DAILY DIGEST --
  if (isDailyDigestEnabled) {
    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd = endOfDay(new Date()).toISOString();

    const { data: orders } = await admin
      .from('orders')
      .select('id, total_amount, status')
      .eq('branch_id', shopId)
      .eq('status', 'completed')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd);

    if (orders) {
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum: number, order: any) => {
        return sum + (Number(order.total_amount) || 0);
      }, 0);

      const formattedRevenue = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalRevenue);

      await dispatchNotification(tenantId, shopId, 'DAILY_DIGEST', {
        title: `📊 Báo cáo cuối ngày - ${shopName}`,
        message: `Tổng kết doanh thu ngày ${format(new Date(), 'dd/MM/yyyy')}:\n\n- Số đơn hàng: ${totalOrders}\n- Tổng doanh thu: ${formattedRevenue}`,
        url: `${shopDomainUrl}/reports`
      });
      result.dailyDigestSent = true;
    }
  }

  // -- 2. EXPIRING BATCHES --
  if (isExpiringBatchesEnabled) {
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const expiryThreshold = format(in30Days, 'yyyy-MM-dd');

    const { data: expiringBatches } = await admin
      .from('inventory_batches')
      .select('id, batch_no, expiry_date, stock_qty, product_id')
      .eq('branch_id', shopId)
      .lte('expiry_date', expiryThreshold);

    if (expiringBatches && expiringBatches.length > 0) {
      const validBatches = expiringBatches.filter((b: any) => Number(b.stock_qty) > 0);
      
      if (validBatches.length > 0) {
        await dispatchNotification(tenantId, shopId, 'EXPIRING_BATCHES', {
          title: `⚠️ Cảnh báo Hết hạn - ${shopName}`,
          message: `Có ${validBatches.length} lô hàng sắp hết hạn trong 30 ngày tới. Vui lòng kiểm tra và có kế hoạch xử lý.`,
          url: `${shopDomainUrl}/inventory/expiring-batches`
        });
        result.expiringBatchesAlertsSent = validBatches.length;
      }
    }
  }

  // -- 3. OUT OF STOCK (LOW STOCK) --
  if (isLowStockEnabled) {
    const allowNegativeStock = settings?.allow_negative_stock === true || settings?.allow_negative_stock === 'TRUE';

    if (!allowNegativeStock) {
      const { data: inventoryData } = await admin
        .from('inventory')
        .select('product_id, stock_qty, min_stock, sku')
        .eq('branch_id', shopId);

      if (inventoryData) {
        const lowStockItems = inventoryData.filter((inv: any) => {
          const stock = Number(inv.stock_qty || 0);
          const min = Number(inv.min_stock || 0);
          return stock <= min && min > 0; // Only alert if min_stock is set > 0 to avoid spamming
        });

        if (lowStockItems.length > 0) {
          await dispatchNotification(tenantId, shopId, 'LOW_STOCK', {
            title: `📦 Cảnh báo Hết hàng - ${shopName}`,
            message: `Có ${lowStockItems.length} sản phẩm sắp hoặc đã hết hàng (dưới định mức tối thiểu).`,
            url: `${shopDomainUrl}/inventory`
          });
          result.outOfStockAlertsSent = lowStockItems.length;
        }
      }
    }
  }

  return result;
}
