import { db, expoDb } from '../db/client';
import * as schema from '../db/schema';
import { getApiBaseUrl, getApiHeaders } from '../api/config';
import { eq } from 'drizzle-orm';

export class SyncManager {
  
  // ==========================================
  // 1. TẢI TOÀN BỘ DỮ LIỆU ĐẦU PHIÊN (FULL SYNC PULL)
  // ==========================================
  static async pullFullDatabase(
    shopId: string, 
    tenantId: string, 
    onProgress: (progress: number) => void
  ): Promise<boolean> {
    try {
      console.log(`Bắt đầu đồng bộ đầu ca cho chi nhánh: ${shopId}...`);
      onProgress(0.1);
      
      const headers = await getApiHeaders();

      // --- BƯỚC A: TẢI DANH MỤC SẢN PHẨM ---
      onProgress(0.2);
      const catRes = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/categories?limit=500`, { headers });
      if (!catRes.ok) throw new Error('Không thể tải Danh mục sản phẩm từ Cloud');
      const catData = await catRes.json();
      const rawCategories = catData.data || [];

      // --- BƯỚC B: TẢI DANH SÁCH SẢN PHẨM ---
      onProgress(0.4);
      const prodRes = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/products?limit=2000&nocache=true`, { headers });
      if (!prodRes.ok) throw new Error('Không thể tải danh mục Sản phẩm từ Cloud');
      const prodData = await prodRes.json();
      const rawProducts = prodData.data || [];

      // --- BƯỚC C: TẢI DANH SÁCH BÀN CHƠI BI-A / PHÒNG BAN ---
      onProgress(0.6);
      const tableRes = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/location-resources?limit=500`, { headers });
      if (!tableRes.ok) throw new Error('Không thể tải Sơ đồ phòng bàn từ Cloud');
      const tableData = await tableRes.json();
      const rawTables = tableData.data || [];

      // --- BƯỚC D: TẢI DANH SÁCH KHÁCH HÀNG ---
      onProgress(0.8);
      const custRes = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/customers?limit=2000`, { headers });
      if (!custRes.ok) throw new Error('Không thể tải Danh sách khách hàng từ Cloud');
      const custData = await custRes.json();
      const rawCustomers = custData.data || [];

      // --- BƯỚC E: LƯU TRỮ VÀO SQLITE NỘI ĐỊA CỦA ĐIỆN THOẠI (Drizzle Transaction) ---
      console.log('Đang ghi dữ liệu đồng bộ vào SQLite nội địa...');
      
      // Xóa sạch dữ liệu cấu hình cũ để nạp mới đầu ca làm việc
      expoDb.execSync(`
        DELETE FROM categories;
        DELETE FROM products;
        DELETE FROM location_resources;
        DELETE FROM customers;
      `);

      // 1. Ghi Categories
      if (rawCategories.length > 0) {
        for (const cat of rawCategories) {
          await db.insert(schema.categories).values({
            id: cat.id || cat.category_id,
            name: cat.name || '',
            parent_id: cat.parent_id || null,
            description: cat.description || null,
          }).onConflictDoNothing();
        }
      }

      // 2. Ghi Products (Lưu ý parse giá bán sell_price từ String về Integer để tránh lỗi tính toán)
      if (rawProducts.length > 0) {
        for (const prod of rawProducts) {
          const sellPrice = parseInt(prod.sell_price || '0', 10);
          const stockQty = parseInt(prod.stock_qty || '0', 10);
          await db.insert(schema.products).values({
            id: prod.id || prod.product_id,
            name: prod.name || '',
            sku: prod.sku || '',
            barcode: prod.barcode || '',
            category_id: prod.category_id || null,
            unit: prod.unit || '',
            sell_price: isNaN(sellPrice) ? 0 : sellPrice,
            stock_qty: isNaN(stockQty) ? 0 : stockQty,
            image_url: prod.image_url || null,
            description: prod.description || null,
          }).onConflictDoNothing();
        }
      }

      // 3. Ghi Sơ đồ Bàn bi-a (hourly_rate từ String về Integer)
      if (rawTables.length > 0) {
        for (const table of rawTables) {
          const rate = parseInt(table.hourly_rate || '0', 10);
          await db.insert(schema.location_resources).values({
            id: table.id || table.resource_id,
            name: table.name || '',
            type: table.type || 'table',
            status: table.status || 'idle',
            current_order_id: table.current_order_id || null,
            hourly_rate: isNaN(rate) ? 0 : rate,
            zone: table.zone || null,
            startTime: table.status === 'playing' ? Date.now() - 3600000 : null, // Mặc định chơi được 1 tiếng nếu đang chơi
          }).onConflictDoNothing();
        }
      }

      // 4. Ghi Danh sách Khách hàng
      if (rawCustomers.length > 0) {
        for (const cust of rawCustomers) {
          const spent = parseInt(cust.total_spent || cust.prepaid_balance || '0', 10);
          const oCount = parseInt(cust.orders_count || '0', 10);
          await db.insert(schema.customers).values({
            id: cust.id || cust.customer_id,
            name: cust.name || '',
            phone: cust.phone || '',
            email: cust.email || null,
            address: cust.address || null,
            customer_code: cust.customer_code || null,
            customer_type: cust.customer_type || 'Thành viên',
            total_spent: isNaN(spent) ? 0 : spent,
            orders_count: isNaN(oCount) ? 0 : oCount,
            sync_status: 'synced',
          }).onConflictDoNothing();
        }
      }

      onProgress(1.0);
      console.log('Đồng bộ tải dữ liệu Cloud về SQLite thành công mỹ mãn!');
      return true;
    } catch (error) {
      console.error('Lỗi nghiêm trọng khi đồng bộ tải dữ liệu từ Cloud:', error);
      return false;
    }
  }

  // ==========================================
  // 2. ĐẨY HÓA ĐƠN OFFLINE LÊN CLOUD (BATCH SYNC PUSH)
  // ==========================================
  static async pushOfflineOrders(shopId: string): Promise<{ successCount: number; failedCount: number }> {
    let successCount = 0;
    let failedCount = 0;

    try {
      // Truy vấn tất cả hóa đơn lưu trữ cục bộ có sync_status là 'pending'
      const pendingOrders = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.sync_status, 'pending'));

      if (pendingOrders.length === 0) {
        console.log('Không có hóa đơn offline nào chờ đồng bộ.');
        return { successCount: 0, failedCount: 0 };
      }

      console.log(`Phát hiện ${pendingOrders.length} hóa đơn offline. Đang bắt đầu đẩy lên Cloud...`);
      const headers = await getApiHeaders();

      for (const order of pendingOrders) {
        try {
          // Lấy chi tiết các dòng sản phẩm của hóa đơn này từ SQLite
          const items = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, order.id));

          // Định dạng payload gửi lên REST API Next.js sync-batch
          const payload = {
            local_order_id: order.id,
            order: {
              status: order.status,
              customer_id: order.customer_id || '',
              customer_name: order.customer_name || 'Khách lẻ',
              branch_id: shopId,
              employee_id: 'mobile-app', // Đánh dấu nguồn gốc di động
              subtotal: order.total_amount,
              discount_amount: 0,
              tax_amount: 0,
              total_amount: order.total_amount,
              paid_amount: order.paid_amount,
              debt_amount: order.total_amount - order.paid_amount,
              note: `Hóa đơn offline từ di động. Tạo lúc ${order.created_at}`,
            },
            items: items.map((it: any) => ({
              product_id: it.product_id,
              product_name: it.product_name,
              qty: it.qty,
              unit_price: it.unit_price,
              discount_amount: 0,
              line_total: it.line_total,
            })),
            payments: [
              {
                method: order.payment_method === 'Chuyển khoản' ? 'bank_transfer' : 'cash',
                amount: order.paid_amount,
              }
            ],
            stock_movements: items.map((it: any) => ({
              type: 'sale_out',
              product_id: it.product_id,
              qty: -it.qty,
              branch_id: shopId,
            })),
          };

          // Gửi POST đồng bộ hóa dạng Transaction Batch lên Next.js Cloud
          const response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/orders/sync-batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            // Cập nhật trạng thái trong SQLite nội địa thành 'synced' khi thành công
            await db
              .update(schema.orders)
              .set({ sync_status: 'synced' })
              .where(eq(schema.orders.id, order.id));
            
            successCount++;
            console.log(`Đồng bộ hóa đơn #${order.id} lên Cloud thành công!`);
          } else {
            failedCount++;
            const errorJson = await response.json().catch(() => ({}));
            console.warn(`Đồng bộ hóa đơn #${order.id} thất bại. Lỗi từ Server:`, errorJson.message || response.statusText);
          }
        } catch (singleErr) {
          failedCount++;
          console.error(`Lỗi đường truyền khi đồng bộ hóa đơn #${order.id}:`, singleErr);
        }
      }
    } catch (error) {
      console.error('Lỗi nghiêm trọng trong tiến trình đẩy dữ liệu POS offline:', error);
    }

    return { successCount, failedCount };
  }

  // ==========================================
  // 3. ĐẨY CA LÀM VIỆC OFFLINE LÊN CLOUD
  // ==========================================
  static async pushOfflineShifts(shopId: string): Promise<boolean> {
    try {
      const pendingShifts = await db
        .select()
        .from(schema.shop_shifts)
        .where(eq(schema.shop_shifts.sync_status, 'pending'));

      if (pendingShifts.length === 0) return true;

      const headers = await getApiHeaders();
      for (const shift of pendingShifts) {
        // Gọi API POST /api/shops/[shopId]/shifts để tạo/cập nhật ca thực tế
        const response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/shifts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: shift.id,
            opened_at: shift.opened_at,
            closed_at: shift.closed_at,
            status: shift.status,
            opening_cash: String(shift.opening_cash),
            actual_closing_cash: String(shift.actual_closing_cash),
          }),
        });

        if (response.ok) {
          await db
            .update(schema.shop_shifts)
            .set({ sync_status: 'synced' })
            .where(eq(schema.shop_shifts.id, shift.id));
          console.log(`Đồng bộ Ca làm việc #${shift.id} thành công!`);
        }
      }
      return true;
    } catch (err) {
      console.error('Lỗi khi đồng bộ Ca làm việc offline:', err);
      return false;
    }
  }
}
