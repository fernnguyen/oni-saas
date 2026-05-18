import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export interface GlobalSearchResult {
  id: string;
  type: 'customer' | 'order' | 'inventory' | 'cashbook' | 'product';
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  url: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    
    // Resolve slug to UUID if necessary
    let actualShopId = shopId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId);
    
    if (!isUuid) {
      const admin = getSupabaseAdminClient();
      const { data: shop } = await admin.from('shops_view').select('id').eq('slug', shopId).maybeSingle();
      if (!shop) {
        return NextResponse.json({ error: 'Shop not found', results: [] }, { status: 404 });
      }
      actualShopId = shop.id;
    }

    // We require read access. 'shops.read' is standard, or just any valid shop access.
    // 'orders.read' is a safe baseline for global search, or just rely on shopAccess.
    const { connector } = await requireShopAccess(actualShopId);
    
    const searchParams = req.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();
    
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const qUpper = q.toUpperCase();
    let results: GlobalSearchResult[] = [];

    const qLower = q.toLowerCase();

    // Pattern matching to optimize routing
    const isOrder = qUpper.startsWith('ORD') || qUpper.startsWith('RET');
    const isInventory = qUpper.startsWith('PX') || qUpper.startsWith('PN') || qUpper.startsWith('SM');
    const isCashbook = qUpper.startsWith('CB');
    const isProduct = qUpper.startsWith('P-');
    const isCustomer = qUpper.startsWith('C-');
    
    // If it has a specific prefix, we only query that collection
    const promises: Promise<void>[] = [];

    const fetchOrders = async () => {
      try {
        const item = await connector.findById('orders', qUpper);
        if (item) {
          results.push({
            id: item.order_id || item.id,
            type: 'order',
            title: item.order_no || item.order_id || item.id,
            subtitle: item.customer_name || 'Khách lẻ',
            status: item.status,
            amount: parseFloat(item.total_amount || '0'),
            url: `orders?search=${item.order_id || item.id}`
          });
        }
      } catch (err) { console.error('Search orders error', err); }
    };

    const fetchInventory = async () => {
      try {
        const item = await connector.findById('stock-movements', qUpper);
        if (item) {
          results.push({
            id: item.movement_id || item.id,
            type: 'inventory',
            title: item.movement_no || item.id,
            subtitle: `Tham chiếu: ${item.reference_no || 'N/A'}`,
            status: item.type === 'purchase_in' || item.type === 'transfer_in' || item.type === 'return_in' ? 'Nhập kho' : 'Xuất kho',
            url: `inventory?search=${item.movement_id || item.id}`
          });
        }
      } catch (err) { console.error('Search inventory error', err); }
    };

    const fetchCashbook = async () => {
      try {
        const item = await connector.findById('cashbook', qUpper);
        if (item) {
          results.push({
            id: item.transaction_id || item.id,
            type: 'cashbook',
            title: item.code || item.transaction_id || item.id,
            subtitle: item.note || item.category || 'N/A',
            status: item.type === 'receipt' ? 'Thu' : 'Chi',
            amount: parseFloat(item.amount || '0'),
            url: `cashbook?search=${item.transaction_id || item.id}`
          });
        }
      } catch (err) { console.error('Search cashbook error', err); }
    };

    const fetchCustomers = async () => {
      try {
        if (isCustomer) {
          if (qUpper === 'C-DEFAULT-RETAIL') {
            results.push({
              id: 'C-DEFAULT-RETAIL',
              type: 'customer',
              title: 'Khách lẻ',
              subtitle: 'Khách vãng lai',
              amount: 0,
              url: `customers?search=C-DEFAULT-RETAIL`
            });
            return;
          }
          const item = await connector.findById('customers', qUpper);
          if (item) {
            results.push({
              id: item.customer_id || item.id,
              type: 'customer',
              title: item.name || 'Khách hàng',
              subtitle: item.phone || item.email || 'Không có SĐT',
              amount: parseFloat(item.debt_amount || '0'),
              url: `customers?search=${item.customer_id || item.id}`
            });
          }
        } else {
          const isRetailCustomerMatch = 'khách lẻ'.includes(qLower) || 'khach le'.includes(qLower);
          if (isRetailCustomerMatch) {
            results.push({
              id: 'C-DEFAULT-RETAIL',
              type: 'customer',
              title: 'Khách lẻ',
              subtitle: 'Khách vãng lai',
              amount: 0,
              url: `customers?search=C-DEFAULT-RETAIL`
            });
          }

          const res = await connector.list('customers', { search: q, limit: 100 });
          const valid = res.data.filter(item => 
            (item.name || '').toLowerCase().includes(qLower) ||
            (item.phone || '').toLowerCase().includes(qLower) ||
            (item.email || '').toLowerCase().includes(qLower) ||
            (item.customer_code || '').toLowerCase().includes(qLower)
          );
          
          valid.slice(0, 5).forEach(item => {
            results.push({
              id: item.customer_id || item.id,
              type: 'customer',
              title: item.name || 'Khách hàng',
              subtitle: item.phone || item.email || 'Không có SĐT',
              amount: parseFloat(item.debt_amount || '0'),
              url: `customers?search=${item.customer_id || item.id}`
            });
          });
        }
      } catch (err) { console.error('Search customers error', err); }
    };

    const fetchProducts = async () => {
      try {
        if (isProduct) {
          const item = await connector.findById('products', qUpper);
          if (item) {
            results.push({
              id: item.product_id || item.id,
              type: 'product',
              title: item.name || item.id,
              subtitle: `SKU: ${item.sku || 'N/A'}`,
              amount: parseFloat(item.sell_price || item.price || item.retail_price || '0'),
              url: `products?search=${item.product_id || item.id}`
            });
          }
        } else {
          const res = await connector.list('products', { search: q, limit: 100 });
          const valid = res.data.filter(item => 
            (item.name || '').toLowerCase().includes(qLower) ||
            (item.sku || '').toLowerCase().includes(qLower) ||
            (item.barcode || '').toLowerCase().includes(qLower)
          );
          
          valid.slice(0, 5).forEach(item => {
            results.push({
              id: item.product_id || item.id,
              type: 'product',
              title: item.name || item.id,
              subtitle: `SKU: ${item.sku || 'N/A'}`,
              amount: parseFloat(item.sell_price || item.price || item.retail_price || '0'),
              url: `products?search=${item.product_id || item.id}`
            });
          });
        }
      } catch (err) { console.error('Search products error', err); }
    };

    // Route based on prefix
    if (isOrder) {
      promises.push(fetchOrders());
    } else if (isInventory) {
      promises.push(fetchInventory());
    } else if (isCashbook) {
      promises.push(fetchCashbook());
    } else if (isProduct) {
      promises.push(fetchProducts());
    } else if (isCustomer) {
      promises.push(fetchCustomers());
    } else {
      // General search (name, phone, sku, etc.)
      promises.push(fetchCustomers());
      promises.push(fetchProducts());
      // For general text we might also want to search orders by customer name, 
      // but to keep it fast we'll just prioritize customers and products as requested.
      // E.g. "ngoại trừ số điện thoại, text hoặc email > về User"
    }

    await Promise.all(promises);

    return NextResponse.json({ results });

  } catch (error) {
    console.error('[Global Search API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', results: [] }, { status: 500 });
  }
}
