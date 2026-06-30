import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../../../lib/server/supabaseAdmin';
import { getConnectorForShop } from '../../../../../../../../lib/server/connectorFactory';
import { invalidate } from '../../../../../../../../lib/server/cache';
import { getCacheService } from '@oni/adapters';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shopId: string }> }
) {
  try {
    const user = await getSuperAdminUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: tenantId, shopId: branchId } = await params;
    const body = await req.json().catch(() => ({}));

    const {
      wipe_products = false,
      wipe_customers = false,
      wipe_orders = false,
      wipe_cashbook = false,
    } = body;

    const admin = getSupabaseAdminClient();
    const connector = await getConnectorForShop(branchId, tenantId);

    let pgConnector = connector as any;
    if (pgConnector.inner) {
      pgConnector = pgConnector.inner;
    }
    const pool = pgConnector.pool;

    if (pool) {
      let attempt = 0;
      const maxRetries = 3;
      let lastError: any = null;

      while (attempt < maxRetries) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // WIPE ORDERS & RELATED TRANSACTIONS
          if (wipe_orders) {
            // Booking & QR & Shifts
            await client.query(`DELETE FROM qr_session_carts WHERE session_id IN (SELECT id FROM qr_ordering_sessions WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM qr_order_requests WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM qr_ordering_sessions WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM resource_occupants WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM reservations WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM ota_bookings WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM shop_shifts WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);

            // Returns
            await client.query(`DELETE FROM return_items WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM returns WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            
            // Orders
            await client.query(`DELETE FROM payments WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM order_items WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            // Note: if order_tracking does not have branch_id, delete via order_id
            await client.query(`DELETE FROM order_tracking WHERE order_id IN (SELECT id FROM orders WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]).catch(() => {});
            await client.query(`DELETE FROM orders WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
          }

          // WIPE CASHBOOK
          if (wipe_cashbook) {
            await client.query(`DELETE FROM cashbook WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM fund_audits WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
          }

          // WIPE CUSTOMERS
          if (wipe_customers) {
            await client.query(`DELETE FROM customer_branch_stats WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            // Only wipe customers specifically belonging to this branch to avoid destroying tenant-wide shared customers if they belong to another branch
            await client.query(`DELETE FROM customers WHERE tenant_id = $1 AND branch_id = $2 AND (id != 'C-DEFAULT-RETAIL' AND id != 'DEFAULT')`, [tenantId, branchId]);
          }

          // WIPE PRODUCTS & INVENTORY
          if (wipe_products) {
            // Purchases & Receipts
            await client.query(`DELETE FROM goods_receipt_note_items WHERE grn_id IN (SELECT id FROM goods_receipt_notes WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM goods_receipt_notes WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM purchase_orders WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM purchase_requisition_items WHERE requisition_id IN (SELECT id FROM purchase_requisitions WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM purchase_requisitions WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            
            // Inventory & Stock
            await client.query(`DELETE FROM inventory_batches WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM inventory WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            await client.query(`DELETE FROM stock_movements WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            
            // Product Details
            await client.query(`DELETE FROM product_bom WHERE parent_product_id IN (SELECT id FROM products WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM product_units WHERE product_id IN (SELECT id FROM products WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM price_lists WHERE product_id IN (SELECT id FROM products WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            await client.query(`DELETE FROM product_purchase_history WHERE product_id IN (SELECT id FROM products WHERE branch_id = $1 AND tenant_id = $2)`, [branchId, tenantId]);
            
            // Products
            await client.query(`DELETE FROM products WHERE branch_id = $1 AND tenant_id = $2`, [branchId, tenantId]);
            
            // Cleanup unreferenced categories
            await client.query(`DELETE FROM categories WHERE tenant_id = $1 AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE tenant_id = $1 AND category_id IS NOT NULL)`, [tenantId]);
          }

          await client.query('COMMIT');
          client.release();
          lastError = null;
          break; // Thành công, thoát vòng lặp retry
        } catch (err: any) {
          await client.query('ROLLBACK');
          client.release();
          lastError = err;
          attempt++;
          if (attempt < maxRetries) {
            // Retry backoff: đợi 500ms, 1000ms...
            await new Promise(res => setTimeout(res, 500 * attempt));
          }
        }
      }

      if (lastError) {
        throw lastError; // Ném lỗi nếu thất bại cả 3 lần
      }
    } else {
      // Fallback cross-connector logic
      if (wipe_products) {
        const listRes = await connector.list('products', { limit: 10000 });
        for (const p of listRes.data) await connector.delete('products', p.id || (p as any).product_id);
        const catRes = await connector.list('categories', { limit: 10000 });
        for (const c of catRes.data) await connector.delete('categories', c.id || (c as any).category_id);
      }
      if (wipe_orders) {
        const orderRes = await connector.list('orders', { limit: 10000 });
        for (const o of orderRes.data) await connector.delete('orders', o.id || (o as any).order_id);
      }
      if (wipe_cashbook) {
        const txRes = await connector.list('cashbook', { limit: 10000 });
        for (const tx of txRes.data) await connector.delete('cashbook', tx.id || (tx as any).transaction_id);
      }
      if (wipe_customers) {
        const cusRes = await connector.list('customers', { limit: 10000 });
        for (const c of cusRes.data) {
          const cid = c.id || (c as any).customer_id;
          if (cid !== 'C-DEFAULT-RETAIL' && cid !== 'DEFAULT') {
            await connector.delete('customers', cid);
          }
        }
      }
    }

    // Write audit log
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: 'shop.wipe_data',
      metadata: { shop_id: branchId, wiped_flags: { wipe_products, wipe_customers, wipe_orders, wipe_cashbook } },
    });

    // Invalidate caches (Next.js server cache tags)
    invalidate(branchId, 'products');
    invalidate(branchId, 'stock-movements');
    invalidate(branchId, 'inventory');
    invalidate(branchId, 'categories');
    invalidate(branchId, 'orders');
    invalidate(branchId, 'customers');
    invalidate(branchId, 'cashbook');

    // Tự động xoá toàn bộ Redis cache hoặc Memory cache lưu trữ ở tầng DataAdapter
    const cacheService = getCacheService();
    await cacheService.deletePattern(`oni:data:${tenantId}:${branchId}:*`);

    return NextResponse.json({ success: true, message: 'Dữ liệu đã được dọn dẹp thành công.' });
  } catch (e: any) {
    console.error('Wipe data error:', e);
    return NextResponse.json({ error: e.message || 'Wipe failed' }, { status: 500 });
  }
}
