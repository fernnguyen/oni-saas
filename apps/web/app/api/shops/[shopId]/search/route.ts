import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import crypto from 'crypto';

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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId) ||
                   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId);
    
    if (!isUuid) {
      const admin = getSupabaseAdminClient();
      const { data: shop } = await admin.from('shops_view').select('id').eq('slug', shopId).maybeSingle();
      if (!shop) {
        return NextResponse.json({ error: 'Shop not found', results: [] }, { status: 404 });
      }
      actualShopId = shop.id;
    }

    const { connector, shop } = await requireShopAccess(actualShopId);
    
    const searchParams = req.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();
    
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();
    const cleanQ = q.replace(/^#/, '').trim();
    const isNumeric = /^\d+$/.test(cleanQ);
    
    // Determine if it looks like a phone number (e.g., starts with '0' or '+' and has >= 8 digits)
    const isPhoneNumber = /^[0+]\d{7,14}$/.test(cleanQ.replace(/[\s.-]/g, ''));

    const tenantId = shop.tenant_id;
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase();

    // Document & entity prefix detection
    const isOrder = qUpper.startsWith('ORD') || qUpper.startsWith('RET');
    const isInventory = qUpper.startsWith('PX') || qUpper.startsWith('PN') || qUpper.startsWith('SM') || 
                        qUpper.startsWith('PDK') || qUpper.startsWith('PTH') || qUpper.startsWith('CKV') || 
                        qUpper.startsWith('CKX') || qUpper.startsWith('PNP2P');
    const isCashbook = qUpper.startsWith('CB');
    const isProduct = qUpper.startsWith('P-');
    const isCustomer = qUpper.startsWith('C-');
    const isAsset = qUpper.startsWith('AST');
    const isPR = qUpper.startsWith('PR');
    const isPO = qUpper.startsWith('PO');
    const isGRN = qUpper.startsWith('GRN');

    let results: GlobalSearchResult[] = [];
    const promises: Promise<void>[] = [];

    // Helper functions for fetching different modules
    const fetchOrders = async () => {
      try {
        if (isOrder) {
          // Normalize ORD search code
          const ordMatch = qUpper.match(/^ORD-?(.*)$/);
          let ordId = qUpper;
          if (ordMatch) {
            const suffix = ordMatch[1];
            ordId = suffix.includes('-') ? `ORD-${suffix}` : `ORD-${tenantHash}-${suffix}`;
          }

          let orderItem: any = null;
          // Try filtering by order_no first
          const orderList = await connector.list('orders', { filters: { order_no: ordId }, limit: 1 });
          if (orderList && orderList.data && orderList.data.length > 0) {
            orderItem = orderList.data[0];
          }
          if (!orderItem) {
            orderItem = await connector.findById('orders', ordId);
          }

          if (orderItem) {
            results.push({
              id: orderItem.order_id || orderItem.id,
              type: 'order',
              title: orderItem.order_no || orderItem.order_id || orderItem.id,
              subtitle: orderItem.customer_name || 'Khách lẻ',
              status: orderItem.status,
              amount: parseFloat(orderItem.total_amount || '0'),
              url: `orders?search=${orderItem.order_id || orderItem.id}`
            });
          }

          // Normalize RET search code
          const retMatch = qUpper.match(/^RET-?(.*)$/);
          let retId = qUpper;
          if (retMatch) {
            const suffix = retMatch[1];
            retId = suffix.includes('-') ? `RET-${suffix}` : `RET-${tenantHash}-${suffix}`;
          }

          let retItem: any = null;
          // Try filtering by return_no first
          const retList = await connector.list('returns', { filters: { return_no: retId }, limit: 1 });
          if (retList && retList.data && retList.data.length > 0) {
            retItem = retList.data[0];
          }
          if (!retItem) {
            retItem = await connector.findById('returns', retId);
          }

          if (retItem) {
            results.push({
              id: retItem.return_id || retItem.id,
              type: 'inventory',
              title: retItem.return_no || retItem.id,
              subtitle: `Đơn bán: ${retItem.order_no || 'N/A'}`,
              status: 'Trả hàng',
              url: `returns?search=${retItem.return_id || retItem.id}`
            });
          }
        }
      } catch (err) {
        console.error('Search orders error', err);
      }
    };

    const fetchInventory = async () => {
      try {
        if (isInventory) {
          const match = qUpper.match(/^(PX|PN|SM|PDK|PTH|CKV|CKX|PNP2P)-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const prefix = match[1];
            const suffix = match[2];
            candidateId = suffix.includes('-') ? `${prefix}-${suffix}` : `${prefix}-${tenantHash}-${suffix}`;
          }

          let item: any = null;
          // 1. Try finding by movement_no first (as IDs are UUIDs but codes are sequential)
          const listRes = await connector.list('stock-movements', { filters: { movement_no: candidateId }, limit: 1 });
          if (listRes && listRes.data && listRes.data.length > 0) {
            item = listRes.data[0];
          }
          // 2. Fallback to finding by primary key ID
          if (!item) {
            item = await connector.findById('stock-movements', candidateId);
          }

          if (item) {
            results.push({
              id: item.movement_id || item.id,
              type: 'inventory',
              title: item.movement_no || item.id,
              subtitle: `Tham chiếu: ${item.reference_no || 'N/A'}`,
              status: item.type === 'purchase_in' || item.type === 'p2p_purchase_in' || item.type === 'transfer_in' || item.type === 'return_in' ? 'Nhập kho' : 'Xuất kho',
              url: `inventory?search=${item.movement_id || item.id}`
            });
          }
        }
      } catch (err) {
        console.error('Search inventory error', err);
      }
    };

    const fetchAssets = async () => {
      try {
        if (isAsset) {
          const match = qUpper.match(/^AST-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `AST-${suffix}` : `AST-${tenantHash}-${suffix}`;
          }
          const item = await connector.findById('assets', candidateId);
          if (item) {
            results.push({
              id: item.asset_id || item.id,
              type: 'inventory',
              title: item.name || item.id,
              subtitle: `Mã tài sản: ${item.asset_id || item.id} • Nguyên giá: ${parseFloat(item.original_value || '0').toLocaleString('vi-VN')} đ`,
              status: item.status === 'active' ? 'Hoạt động' : (item.status === 'depreciated' ? 'Hao mòn hết' : 'Thanh lý'),
              url: `settings/assets?search=${item.asset_id || item.id}`
            });
          }
        }
      } catch (err) {
        console.error('Search assets error', err);
      }
    };

    const fetchP2PPurchases = async () => {
      try {
        if (isPR) {
          const match = qUpper.match(/^PR-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `PR-${suffix}` : `PR-${tenantHash}-${suffix}`;
          }
          const item = await connector.findById('purchase-requisitions', candidateId);
          if (item) {
            results.push({
              id: item.requisition_id || item.id,
              type: 'order',
              title: item.id || item.requisition_id,
              subtitle: `Đề xuất mua sắm: ${item.note || 'Không có mô tả'}`,
              status: item.status === 'APPROVED' ? 'Đã duyệt' : (item.status === 'DRAFT' ? 'Nháp' : 'Chờ duyệt'),
              url: `p2p/pr?search=${item.requisition_id || item.id}`
            });
          }
        }

        if (isPO) {
          const match = qUpper.match(/^PO-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `PO-${suffix}` : `PO-${tenantHash}-${suffix}`;
          }
          const item = await connector.findById('purchase-orders', candidateId);
          if (item) {
            results.push({
              id: item.purchase_order_id || item.id,
              type: 'order',
              title: item.id || item.purchase_order_id,
              subtitle: `Đơn mua hàng: ${item.supplier_name || 'NCC N/A'}`,
              status: item.status === 'APPROVED' ? 'Đã duyệt' : (item.status === 'DRAFT' ? 'Nháp' : 'Chờ duyệt'),
              url: `p2p/po?search=${item.purchase_order_id || item.id}`
            });
          }
        }

        if (isGRN) {
          const match = qUpper.match(/^GRN-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `GRN-${suffix}` : `GRN-${tenantHash}-${suffix}`;
          }
          const item = await connector.findById('goods-receipt-notes', candidateId);
          if (item) {
            results.push({
              id: item.grn_id || item.id,
              type: 'inventory',
              title: item.id || item.grn_id,
              subtitle: `Nhập kho mua hàng: ${item.supplier_name || 'NCC N/A'}`,
              status: item.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang xử lý',
              url: `p2p/grn?search=${item.grn_id || item.id}`
            });
          }
        }
      } catch (err) {
        console.error('Search P2P Purchases error', err);
      }
    };

    const fetchCashbook = async () => {
      try {
        if (isCashbook) {
          const match = qUpper.match(/^CB-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `CB-${suffix}` : `CB-${tenantHash}-${suffix}`;
          }

          let item: any = null;
          // Try filtering by cashbook code first
          const listRes = await connector.list('cashbook', { filters: { code: candidateId }, limit: 1 });
          if (listRes && listRes.data && listRes.data.length > 0) {
            item = listRes.data[0];
          }
          if (!item) {
            item = await connector.findById('cashbook', candidateId);
          }

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
        }
      } catch (err) {
        console.error('Search cashbook error', err);
      }
    };

    const fetchCustomers = async () => {
      try {
        // 1. Try to fetch by exact sequential ID if prefix matched
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
          } else {
            const match = qUpper.match(/^C-?(.*)$/);
            let candidateId = qUpper;
            if (match) {
              const suffix = match[1];
              candidateId = suffix.includes('-') ? `C-${suffix}` : `C-${tenantHash}-${suffix}`;
            }
            const item = await connector.findById('customers', candidateId);
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
          }
        } else {
          // 2. Perform database list search for customer name/phone/email
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

          // If numeric but not a phone number, only perform search if it's broad search
          const res = await connector.list('customers', { search: q, limit: 100 });
          const valid = res.data.filter(item => 
            (item.name || '').toLowerCase().includes(qLower) ||
            (item.phone || '').toLowerCase().includes(qLower) ||
            (item.email || '').toLowerCase().includes(qLower) ||
            (item.customer_code || '').toLowerCase().includes(qLower) ||
            (item.customer_id || item.id || '').toLowerCase().includes(qLower)
          );
          
          valid.slice(0, 5).forEach(item => {
            const alreadyAdded = results.some(r => r.id === (item.customer_id || item.id));
            if (!alreadyAdded) {
              results.push({
                id: item.customer_id || item.id,
                type: 'customer',
                title: item.name || 'Khách hàng',
                subtitle: item.phone || item.email || 'Không có SĐT',
                amount: parseFloat(item.debt_amount || '0'),
                url: `customers?search=${item.customer_id || item.id}`
              });
            }
          });
        }
      } catch (err) {
        console.error('Search customers error', err);
      }
    };

    const fetchProducts = async () => {
      try {
        if (isProduct) {
          const match = qUpper.match(/^P-?(.*)$/);
          let candidateId = qUpper;
          if (match) {
            const suffix = match[1];
            candidateId = suffix.includes('-') ? `P-${suffix}` : `P-${tenantHash}-${suffix}`;
          }
          const item = await connector.findById('products', candidateId);
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
            (item.barcode || '').toLowerCase().includes(qLower) ||
            (item.product_id || item.id || '').toLowerCase().includes(qLower)
          );
          
          valid.slice(0, 5).forEach(item => {
            const alreadyAdded = results.some(r => r.id === (item.product_id || item.id));
            if (!alreadyAdded) {
              results.push({
                id: item.product_id || item.id,
                type: 'product',
                title: item.name || item.id,
                subtitle: `SKU: ${item.sku || 'N/A'}`,
                amount: parseFloat(item.sell_price || item.price || item.retail_price || '0'),
                url: `products?search=${item.product_id || item.id}`
              });
            }
          });
        }
      } catch (err) {
        console.error('Search products error', err);
      }
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
    } else if (isAsset) {
      promises.push(fetchAssets());
    } else if (isPR || isPO || isGRN) {
      promises.push(fetchP2PPurchases());
    } else {
      // General search (no prefix)
      // Except for telephone numbers, all other documents require a prefix.
      // So if no prefix is matched:
      // We only query customers (phone/name) and products (name/sku/barcode)
      // We DO NOT query orders, inventory, cashbook, assets, or P2P to prevent heavy query load.
      if (isPhoneNumber) {
        promises.push(fetchCustomers());
      } else {
        promises.push(fetchCustomers());
        promises.push(fetchProducts());
      }
    }

    await Promise.all(promises);

    // If no results are found, and the query is a raw numeric sequence (e.g. '12615')
    if (results.length === 0 && isNumeric) {
      // Return beautiful suggestions/try-out options for each key document type using tenantHash
      results.push({
        id: `SUGGEST-SM-${cleanQ}`,
        type: 'inventory',
        title: `SM-${tenantHash}-${cleanQ}`,
        subtitle: 'Phiếu kho (Nhập/Xuất kho) - Nhấn để tìm mã đầy đủ',
        url: `inventory?search=SM-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-PDK-${cleanQ}`,
        type: 'inventory',
        title: `PDK-${tenantHash}-${cleanQ}`,
        subtitle: 'Phiếu Điều Kho (Kiểm kho) - Nhấn để tìm mã đầy đủ',
        url: `inventory?search=PDK-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-CB-${cleanQ}`,
        type: 'cashbook',
        title: `CB-${tenantHash}-${cleanQ}`,
        subtitle: 'Phiếu Thu/Chi (Sổ quỹ) - Nhấn để tìm mã đầy đủ',
        url: `cashbook?search=CB-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-ORD-${cleanQ}`,
        type: 'order',
        title: `ORD-${tenantHash}-${cleanQ}`,
        subtitle: 'Đơn hàng bán lẻ - Nhấn để tìm mã đầy đủ',
        url: `orders?search=ORD-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-PO-${cleanQ}`,
        type: 'order',
        title: `PO-${tenantHash}-${cleanQ}`,
        subtitle: 'Đơn đặt mua hàng (P2P PO) - Nhấn để tìm mã đầy đủ',
        url: `p2p/po?search=PO-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-AST-${cleanQ}`,
        type: 'inventory',
        title: `AST-${tenantHash}-${cleanQ}`,
        subtitle: 'Tài sản cố định - Nhấn để tìm mã đầy đủ',
        url: `settings/assets?search=AST-${tenantHash}-${cleanQ}`
      });

      results.push({
        id: `SUGGEST-C-${cleanQ}`,
        type: 'customer',
        title: `C-${tenantHash}-${cleanQ}`,
        subtitle: 'Khách hàng (Tra cứu nợ/lịch sử) - Nhấn để tìm mã đầy đủ',
        url: `customers?search=C-${tenantHash}-${cleanQ}`
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[Global Search API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', results: [] }, { status: 500 });
  }
}
