import { db, expoDb } from '../db/client';
import * as schema from '../db/schema';
import { getApiBaseUrl, getApiHeaders } from '../api/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq } from 'drizzle-orm';
import { formatDateTime } from '../utils/format';
import { isTimeChargeProduct } from '@oni/core';

function parseProductMetadata(value: string | null | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    // Old or manually edited local rows must not block the sync queue.
    return undefined;
  }
}

export class SyncManager {
  private static cashbookRetries: Record<string, number> = {};

  static clearCashbookRetry(id: string) {
    delete SyncManager.cashbookRetries[id];
  }

  static clearAllCashbookRetries() {
    SyncManager.cashbookRetries = {};
  }
  
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
      const baseUrl = getApiBaseUrl();

      onProgress(0.2);

      // --- FETCH TẤT CẢ API SONG SONG (PARALLEL) ĐỂ TĂNG TỐC ---
      const fetchJson = async (url: string, essential = false, errorMsg = '') => {
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            if (essential) throw new Error(errorMsg);
            return { data: [] };
          }
          return await res.json();
        } catch (err) {
          if (essential) throw new Error(errorMsg || (err as Error).message);
          console.warn(`Lỗi tải dữ liệu từ ${url}:`, err);
          return { data: [] };
        }
      };

      const [
        catData,
        prodData,
        tableData,
        activeOrdersData,
        custData,
        fundsData,
        cbData,
        methodsData,
        lockdownData,
        taxGroupsData,
        suppliersData
      ] = await Promise.all([
        fetchJson(`${baseUrl}/api/shops/${shopId}/categories?limit=500`, true, 'Không thể tải Danh mục sản phẩm từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/products?limit=5000&nocache=true`, true, 'Không thể tải danh mục Sản phẩm từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/location-resources?limit=500`, true, 'Không thể tải Sơ đồ phòng bàn từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/customers?limit=5000`, true, 'Không thể tải Danh sách khách hàng từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/payment-funds?active=TRUE`, true, 'Không thể tải danh sách Quỹ thanh toán từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/cashbook?limit=100`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/payment-methods?active=TRUE`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/reports/tax/lockdown`, false),
        fetchJson(`${baseUrl}/api/tax-groups`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/suppliers?limit=1000`, false),
      ]);

      onProgress(0.6);

      const rawCategories = catData.data || [];
      const rawProducts = prodData.data || [];
      const rawTables = tableData.data || [];
      const activeOrders = activeOrdersData.data || [];
      const rawCustomers = custData.data || [];
      const rawFunds = fundsData.data || [];
      const rawCashbook = cbData.data || [];
      const rawMethods = methodsData.data || [];
      const rawSuppliers = suppliersData?.data || [];
      let rawLocked = Array.isArray(lockdownData) ? lockdownData : (lockdownData?.data || []);
      if (!rawLocked || rawLocked.length === 0) {
        try {
          const cachedVal = await db
            .select()
            .from(schema.localCaches)
            .where(eq(schema.localCaches.cache_key, 'tax_locked_periods'))
            .limit(1);
          if (cachedVal.length > 0 && cachedVal[0].cache_value) {
            rawLocked = JSON.parse(cachedVal[0].cache_value);
          }
        } catch (e) {
          console.warn('Lỗi đọc cache local của tax_locked_periods:', e);
        }
      }
      
      let rawTaxGroups = taxGroupsData?.data || [];
      if (!rawTaxGroups || rawTaxGroups.length === 0) {
        try {
          const cachedVal = await db
            .select()
            .from(schema.localCaches)
            .where(eq(schema.localCaches.cache_key, 'system_tax_groups'))
            .limit(1);
          if (cachedVal.length > 0 && cachedVal[0].cache_value) {
            rawTaxGroups = JSON.parse(cachedVal[0].cache_value);
          }
        } catch (e) {
          console.warn('Lỗi đọc cache local của system_tax_groups:', e);
        }
      }
      if (!rawTaxGroups || rawTaxGroups.length === 0) {
        rawTaxGroups = [
          { code: 'phan_phoi', name: 'Phân phối, cung cấp hàng hóa', vat_rate: 1.0, pit_rate: 0.5 },
          { code: 'dich_vu', name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', vat_rate: 5.0, pit_rate: 2.0 },
          { code: 'san_xuat', name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', vat_rate: 3.0, pit_rate: 1.5 },
          { code: 'khac', name: 'Hoạt động kinh doanh khác', vat_rate: 2.0, pit_rate: 1.0 }
        ];
      }

      // Bản đồ hóa các active order theo resource_id để tra cứu nhanh
      const activeOrdersMap = new Map<string, any>();
      for (const order of activeOrders) {
        try {
          const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {});
          const rId = meta.resource_id;
          if (rId) {
            activeOrdersMap.set(rId, { order, meta });
          }
        } catch (e) {}
      }

      // --- BƯỚC E: LƯU TRỮ VÀO SQLITE NỘI ĐỊA CỦA ĐIỆN THOẠI (Drizzle Transaction) ---
      console.log('Đang ghi dữ liệu đồng bộ vào SQLite nội địa...');
      onProgress(0.7);
      
      // Xóa sạch dữ liệu cấu hình cũ để nạp mới đầu ca làm việc
      expoDb.execSync(`
        DELETE FROM categories WHERE sync_status != 'pending';
        DELETE FROM products WHERE sync_status != 'pending';
        DELETE FROM suppliers WHERE sync_status != 'pending';
        DELETE FROM location_resources;
        DELETE FROM customers;
        DELETE FROM payment_funds;
        DELETE FROM payment_methods;
        DELETE FROM cashbook WHERE sync_status = 'synced';
        DELETE FROM stock_movements WHERE sync_status = 'synced';
        DELETE FROM orders WHERE sync_status = 'synced';
        DELETE FROM order_items WHERE order_id NOT IN (SELECT id FROM orders WHERE sync_status = 'pending');
        DELETE FROM shop_shifts WHERE sync_status = 'synced';
      `);

      onProgress(0.8);

      // Sử dụng duy nhất 1 Transaction để ghi hàng nghìn bản ghi vào SQLite.
      // Điều này giúp SQLite chỉ thực hiện 1 lần commit xuống ổ đĩa (FSYNC) thay vì 5000 lần,
      // tăng tốc độ ghi từ 10-15 giây xuống chỉ còn ~100-200ms.
      await db.transaction(async (tx: any) => {
        // 1. Ghi Categories
        if (rawCategories.length > 0) {
          for (const cat of rawCategories) {
            await tx.insert(schema.categories).values({
              id: cat.id || cat.category_id,
              name: cat.name || '',
              parent_id: cat.parent_id || null,
              description: cat.description || null,
              tax_rate: cat.tax_rate || null,
              tax_group: cat.tax_group || null,
              sync_status: 'synced',
            }).onConflictDoUpdate({
              target: schema.categories.id,
              set: {
                name: cat.name || '',
                parent_id: cat.parent_id || null,
                description: cat.description || null,
                tax_rate: cat.tax_rate || null,
                tax_group: cat.tax_group || null,
                sync_status: 'synced',
              }
            });
          }
        }

        // 2. Ghi Products
        if (rawProducts.length > 0) {
          for (const prod of rawProducts) {
            const sellPrice = parseInt(prod.sell_price || '0', 10);
            const costPrice = parseInt(prod.cost_price || '0', 10);
            const stockQty = parseInt(prod.stock_qty || '0', 10);
            const weightVal = prod.weight ? parseInt(prod.weight, 10) : null;
            await tx.insert(schema.products).values({
              id: prod.id || prod.product_id,
              name: prod.name || '',
              sku: prod.sku || '',
              barcode: prod.barcode || '',
              category_id: prod.category_id || null,
              unit: prod.unit || '',
              sell_price: isNaN(sellPrice) ? 0 : sellPrice,
              cost_price: isNaN(costPrice) ? 0 : costPrice,
              stock_qty: isNaN(stockQty) ? 0 : stockQty,
              image_url: prod.image_url || null,
              description: prod.description || null,
              product_type: prod.product_type || 'simple',
              parent_id: prod.parent_id || null,
              variant_options: typeof prod.variant_options === 'object' ? JSON.stringify(prod.variant_options) : (prod.variant_options || null),
              modifier_groups: typeof prod.modifier_groups === 'object' ? JSON.stringify(prod.modifier_groups) : (prod.modifier_groups || null),
              active: prod.active || 'TRUE',
              weight: isNaN(weightVal as any) ? null : weightVal,
              item_class: prod.item_class || 'commercial',
              tax_rate: prod.tax_rate || null,
              input_tax_rate: prod.input_tax_rate || null,
              tax_group: prod.tax_group || null,
              metadata: typeof prod.metadata === 'object' ? JSON.stringify(prod.metadata) : (prod.metadata || null),
              sync_status: 'synced',
            }).onConflictDoUpdate({
              target: schema.products.id,
              set: {
                name: prod.name || '',
                sku: prod.sku || '',
                barcode: prod.barcode || '',
                category_id: prod.category_id || null,
                unit: prod.unit || '',
                sell_price: isNaN(sellPrice) ? 0 : sellPrice,
                cost_price: isNaN(costPrice) ? 0 : costPrice,
                stock_qty: isNaN(stockQty) ? 0 : stockQty,
                image_url: prod.image_url || null,
                description: prod.description || null,
                product_type: prod.product_type || 'simple',
                parent_id: prod.parent_id || null,
                variant_options: typeof prod.variant_options === 'object' ? JSON.stringify(prod.variant_options) : (prod.variant_options || null),
                modifier_groups: typeof prod.modifier_groups === 'object' ? JSON.stringify(prod.modifier_groups) : (prod.modifier_groups || null),
                active: prod.active || 'TRUE',
                weight: isNaN(weightVal as any) ? null : weightVal,
                item_class: prod.item_class || 'commercial',
                tax_rate: prod.tax_rate || null,
                input_tax_rate: prod.input_tax_rate || null,
                tax_group: prod.tax_group || null,
                metadata: typeof prod.metadata === 'object' ? JSON.stringify(prod.metadata) : (prod.metadata || null),
                sync_status: 'synced',
              }
            });
          }
        }

        // 3. Ghi Sơ đồ Bàn bi-a (hourly_rate từ String về Integer)
        if (rawTables.length > 0) {
          for (const table of rawTables) {
            const rate = parseInt(table.hourly_rate || '0', 10);
            const isOccupied = table.status === 'occupied' || table.status === 'playing';
            const tId = table.id || table.resource_id;
            const activeOrderSession = activeOrdersMap.get(tId);
            
            let resolvedStartTime: number | null = null;
            let mergedMetadata = typeof table.metadata === 'object' ? JSON.stringify(table.metadata) : (table.metadata || '{}');
            
            if (isOccupied && activeOrderSession) {
              const checkInStr = activeOrderSession.meta.check_in;
              if (checkInStr) {
                resolvedStartTime = new Date(checkInStr).getTime();
              }
              try {
                const tableMetaObj = JSON.parse(mergedMetadata);
                const cloudGuests = activeOrderSession.meta.guests_list || tableMetaObj.guests_list || [];
                mergedMetadata = JSON.stringify({
                  ...tableMetaObj,
                  rental_type: activeOrderSession.meta.rental_type || tableMetaObj.rental_type || 'hourly',
                  num_guests: cloudGuests.length > 0 ? cloudGuests.length : (activeOrderSession.meta.num_guests || tableMetaObj.num_guests || 1),
                  check_in: checkInStr || tableMetaObj.check_in,
                  guests_list: cloudGuests
                });
              } catch (e) {}
            }
            
            if (isOccupied && !resolvedStartTime) {
              resolvedStartTime = Date.now() - 3600000;
            }

            await tx.insert(schema.location_resources).values({
              id: tId,
              name: table.name || '',
              type: table.type || 'table',
              status: isOccupied ? 'occupied' : (table.status === 'dirty' || table.status === 'cleaning' ? table.status : 'available'),
              current_order_id: table.current_order_id || (activeOrderSession ? activeOrderSession.order.id : null),
              hourly_rate: isNaN(rate) ? 0 : rate,
              zone: table.zone || null,
              startTime: resolvedStartTime,
              metadata: mergedMetadata,
            }).onConflictDoUpdate({
              target: schema.location_resources.id,
              set: {
                name: table.name || '',
                type: table.type || 'table',
                status: isOccupied ? 'occupied' : (table.status === 'dirty' || table.status === 'cleaning' ? table.status : 'available'),
                current_order_id: table.current_order_id || (activeOrderSession ? activeOrderSession.order.id : null),
                hourly_rate: isNaN(rate) ? 0 : rate,
                zone: table.zone || null,
                startTime: resolvedStartTime,
                metadata: mergedMetadata,
              }
            });
          }
        }

        // 4. Ghi Danh sách Khách hàng
        if (rawCustomers.length > 0) {
          for (const cust of rawCustomers) {
            const spent = parseInt(cust.total_spent || '0', 10);
            const oCount = parseInt(cust.orders_count || '0', 10);
            const creditLimitVal = parseInt(cust.credit_limit || '0', 10);
            const prepaidVal = parseInt(cust.prepaid_balance || '0', 10);
            const loyaltyPointsVal = parseInt(cust.loyalty_points || '0', 10);
            const debtAmountVal = parseInt(cust.debt_amount || '0', 10);
            await tx.insert(schema.customers).values({
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
              credit_limit: isNaN(creditLimitVal) ? 0 : creditLimitVal,
              note: cust.note || null,
              prepaid_balance: isNaN(prepaidVal) ? 0 : prepaidVal,
              loyalty_points: isNaN(loyaltyPointsVal) ? 0 : loyaltyPointsVal,
              debt_amount: isNaN(debtAmountVal) ? 0 : debtAmountVal,
            }).onConflictDoNothing();
          }
        }

        // 5. Ghi Danh sách Quỹ/Tài khoản thanh toán
        if (rawFunds.length > 0) {
          for (const fund of rawFunds) {
            await tx.insert(schema.paymentFunds).values({
              id: fund.id,
              name: fund.name || '',
              type: fund.type || 'cash',
              branch_id: fund.branch_id || '',
              account_number: fund.account_number || null,
              account_name: fund.account_name || null,
              bank_name: fund.bank_name || null,
              is_default: fund.is_default === true || fund.is_default === 1 || fund.is_default === '1' || String(fund.is_default).toUpperCase() === 'TRUE',
              qr_template: fund.qr_template || 'compact2',
              initial_balance: isNaN(parseInt(fund.initial_balance)) ? 0 : parseInt(fund.initial_balance),
            }).onConflictDoNothing();
          }
        }

        // 5.5 Ghi Danh sách Phương thức thanh toán
        if (rawMethods.length > 0) {
          for (const m of rawMethods) {
            await tx.insert(schema.paymentMethods).values({
              id: m.id,
              name: m.name || '',
              type: m.type || 'cash',
              code: m.code || m.id,
              branch_id: m.branch_id || shopId,
              is_default: m.is_default === true || m.is_default === 1 || m.is_default === '1' || String(m.is_default).toUpperCase() === 'TRUE',
              active: m.active === 1 || m.active === true || m.active === 'TRUE' || m.active === '1' ? 1 : 0,
            }).onConflictDoNothing();
          }
        }

        // 5.6 Ghi Danh sách Nhà cung cấp
        if (rawSuppliers.length > 0) {
          for (const s of rawSuppliers) {
            await tx.insert(schema.suppliers).values({
              id: s.id,
              name: s.name || '',
              phone: s.phone || null,
              email: s.email || null,
              address: s.address || null,
              note: s.note || null,
              sync_status: 'synced',
            }).onConflictDoNothing();
          }
        }

        // 6. Ghi Phiếu Thu/Chi Sổ Quỹ
        if (rawCashbook.length > 0) {
          for (const cb of rawCashbook) {
            await tx.insert(schema.cashbook).values({
              id: cb.transaction_id || cb.id,
              branch_id: cb.branch_id || '',
              type: cb.type || 'receipt',
              amount: parseInt(cb.amount || '0', 10),
              method: cb.method || 'cash',
              category: cb.category || 'other_expense',
              reference_id: cb.reference_id || null,
              reference_name: cb.reference_name || null,
              employee_id: cb.employee_id || null,
              note: cb.note || null,
              date: cb.created_at || cb.date || new Date().toISOString(),
              fund_id: cb.fund_id || null,
              sync_status: 'synced',
            }).onConflictDoNothing();
          }
        }

        // 7. Ghi Kỳ Khóa Sổ Thuế (Tax Lockdown Cache)
        await tx.insert(schema.localCaches).values({
          cache_key: 'tax_locked_periods',
          cache_value: JSON.stringify(rawLocked),
          updated_at: Date.now(),
        }).onConflictDoUpdate({
          target: schema.localCaches.cache_key,
          set: {
            cache_value: JSON.stringify(rawLocked),
            updated_at: Date.now(),
          }
        });

        // 8. Ghi Biểu thuế chung hệ thống (System Tax Groups Cache)
        await tx.insert(schema.localCaches).values({
          cache_key: 'system_tax_groups',
          cache_value: JSON.stringify(rawTaxGroups),
          updated_at: Date.now(),
        }).onConflictDoUpdate({
          target: schema.localCaches.cache_key,
          set: {
            cache_value: JSON.stringify(rawTaxGroups),
            updated_at: Date.now(),
          }
        });
      });

      onProgress(1.0);
      console.log('Đồng bộ tải dữ liệu Cloud về SQLite thành công mỹ mãn!');
      await AsyncStorage.setItem('last_keep_alive_sync_time', String(Date.now()));
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

      // Lấy email user thực tế đang đăng nhập (đã lưu lúc login)
      let userEmail = 'mobile-app';
      try {
        const savedEmail = await AsyncStorage.getItem('saved_email');
        if (savedEmail) userEmail = savedEmail;
      } catch {}


      for (const order of pendingOrders) {
        try {
          // Lấy chi tiết các dòng sản phẩm của hóa đơn này từ SQLite
          const items = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, order.id));

          let serverOrderId = '';
          if ((order as any).metadata) {
            try {
              const parsedMeta = JSON.parse((order as any).metadata);
              if (parsedMeta && parsedMeta.server_order_id) {
                serverOrderId = parsedMeta.server_order_id;
              }
            } catch (e) {}
          }
          
          // Tự động chữa lành: Nếu ID cục bộ không bắt đầu bằng tiền tố local (ORD-T- hoặc ORD-R-) (tức là đã là ID từ server cấp),
          // Bắt buộc phải truyền nó làm server_order_id để Next.js cập nhật đơn hàng thay vì tạo mới (gây duplicate)
          if (!serverOrderId && order.id && !order.id.startsWith('ORD-T-') && !order.id.startsWith('ORD-R-') && !order.id.startsWith('ord-t-') && !order.id.startsWith('ord-r-')) {
            serverOrderId = order.id;
          }

          // Định dạng payload gửi lên REST API Next.js sync-batch
          const payload = {
            local_order_id: order.id,
            server_order_id: serverOrderId,
            order: {
              status: order.status,
              channel: 'pos-mobile',
              customer_id: order.customer_id || 'C-DEFAULT-RETAIL',
              customer_name: order.customer_name || 'Khách lẻ',
              branch_id: shopId,
              employee_id: userEmail,
              subtotal: order.total_amount + (order.discount_amount || 0),
              discount_amount: order.discount_amount || 0,
              tax_amount: (order as any).tax_amount || 0,
              total_amount: order.total_amount,
              paid_amount: order.paid_amount,
              debt_amount: order.total_amount - order.paid_amount,
              note: order.note || `Hóa đơn offline từ di động. Tạo lúc ${order.created_at}`,
              metadata: (order as any).metadata,
              shift_id: order.shift_id || '',
            },
            items: items.map((it: any) => ({
              product_id: it.product_id,
              product_name: it.product_name,
              qty: it.qty,
              unit_price: it.unit_price,
              original_price: it.original_price ?? it.unit_price,
              discount_amount: it.discount_amount || 0,
              line_total: it.line_total,
              tax_rate: it.tax_rate || '0',
              tax_amount: it.tax_amount || 0,
              tax_group: it.tax_group || '',
              tax_vat_rate: it.tax_vat_rate || '0',
              tax_pit_rate: it.tax_pit_rate || '0',
            })),
            payments: order.status === 'in_progress' ? [] : (() => {
              try {
                const parsed = JSON.parse(order.payment_method);
                if (Array.isArray(parsed)) {
                  return parsed.map((p: any) => ({
                    method: p.method === 'Chuyển khoản' ? 'bank_transfer' :
                            p.method === 'Thẻ ATM' ? 'card' :
                            p.method === 'Ví MoMo' ? 'momo' :
                            p.method === 'Ghi nợ' ? 'debt' : p.method,
                    amount: p.amount,
                  }));
                }
              } catch (e) {}
              return [
                {
                  method: order.payment_method === 'Chuyển khoản' ? 'bank_transfer' :
                          order.payment_method === 'Thẻ ATM' ? 'card' :
                          order.payment_method === 'Ví MoMo' ? 'momo' :
                          order.payment_method === 'Ghi nợ' ? 'debt' : order.payment_method,
                  amount: order.paid_amount,
                }
              ];
            })(),
            stock_movements: items
              .filter((it: any) => !isTimeChargeProduct(it.product_id, it.product_name))
              .map((it: any) => ({
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
            const resData = await response.json().catch(() => ({}))
            const serverId = resData.order_id
            const serverNo = resData.order_no

            // Preserve the local order ID as reference_no so it's searchable
            const localId = order.id

            if (serverId && serverId !== localId) {
              await db.update(schema.order_items)
                .set({ order_id: serverId })
                .where(eq(schema.order_items.order_id, localId))

              await db.update(schema.orders)
                .set({
                  id: serverId,
                  order_no: serverNo || order.order_no,
                  sync_status: 'synced',
                  // Keep local ID as reference_no for traceability
                  reference_no: localId,
                  updated_at: new Date().toISOString(),
                })
                .where(eq(schema.orders.id, localId))
            } else {
              await db.update(schema.orders)
                .set({ sync_status: 'synced', order_no: serverNo || order.order_no, updated_at: new Date().toISOString() })
                .where(eq(schema.orders.id, order.id))
            }

            successCount++
            console.log(`Đồng bộ hóa đơn #${localId} lên Cloud thành công! Server ID: ${serverId}, Server No: ${serverNo}`)
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
      const baseUrl = getApiBaseUrl();

      for (const shift of pendingShifts) {
        try {
          let currentShiftId = shift.id;
          let isNewOpeningSynced = false;

          // 1. Nếu ca được mở offline (ID có tiền tố 'shift-') -> POST lên server để mở ca trước
          if (currentShiftId.startsWith('shift-')) {
            const openRes = await fetch(`${baseUrl}/api/shops/${shopId}/shifts`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                branch_id: shopId,
                opening_cash: Number(shift.opening_cash),
              }),
            });

            if (openRes.ok) {
              const resJson = await openRes.json().catch(() => ({}));
              const serverShiftId = resJson.id;

              if (serverShiftId) {
                // Cập nhật ID ca làm việc trong SQLite
                await db.update(schema.shop_shifts)
                  .set({ id: serverShiftId })
                  .where(eq(schema.shop_shifts.id, shift.id));

                // Cập nhật AsyncStorage nếu là ca đang hoạt động
                const currentActiveShiftId = await AsyncStorage.getItem('active_shift_id');
                if (currentActiveShiftId === shift.id) {
                  await AsyncStorage.setItem('active_shift_id', serverShiftId);
                }

                // Cập nhật tất cả hóa đơn tham chiếu đến ca này
                await db.update(schema.orders)
                  .set({ shift_id: serverShiftId })
                  .where(eq(schema.orders.shift_id, shift.id));

                console.log(`[Sync Shift] Đã tạo ca thành công trên server. Cập nhật local ID ${shift.id} thành ${serverShiftId}`);
                currentShiftId = serverShiftId;
                isNewOpeningSynced = true;
              }
            } else {
              const errorText = await openRes.text().catch(() => '');
              console.warn(`[Sync Shift] Lỗi POST mở ca #${shift.id}: ${openRes.status}. Chi tiết: ${errorText}`);
              
              // Tự động dọn dẹp: Nếu server báo ca làm việc đã có ca mở hoặc trùng ca
              if (errorText.includes('đã có một ca làm việc đang mở') || openRes.status === 400) {
                await db.delete(schema.shop_shifts).where(eq(schema.shop_shifts.id, shift.id));
                console.log(`[Sync Shift] Đã tự động xóa ca kíp trùng lặp #${shift.id} khỏi SQLite cục bộ.`);
              }
              continue;
            }
          }

          // 2. Nếu ca đã đóng cục bộ -> Gửi PUT lên server để đóng ca
          if (shift.status === 'closed') {
            const closeRes = await fetch(`${baseUrl}/api/shops/${shopId}/shifts/${currentShiftId}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                actual_closing_cash: Number(shift.actual_closing_cash),
                note: shift.note || '',
              }),
            });

            if (closeRes.ok) {
              await db.update(schema.shop_shifts)
                .set({ sync_status: 'synced' })
                .where(eq(schema.shop_shifts.id, currentShiftId));
              console.log(`[Sync Shift] Đã đóng ca #${currentShiftId} thành công trên server!`);
            } else {
              const errorText = await closeRes.text().catch(() => '');
              console.warn(`[Sync Shift] Lỗi PUT đóng ca #${currentShiftId}: ${closeRes.status}. Chi tiết: ${errorText}`);
            }
          } else if (isNewOpeningSynced) {
            // Ca vẫn đang mở nhưng đã đồng bộ thành công việc mở ca lên server
            await db.update(schema.shop_shifts)
              .set({ sync_status: 'synced' })
              .where(eq(schema.shop_shifts.id, currentShiftId));
            console.log(`[Sync Shift] Ca đang mở #${currentShiftId} đã đồng bộ thành công!`);
          }
        } catch (e) {
          console.error(`[Sync Shift] Lỗi kết nối khi đồng bộ ca #${shift.id}:`, e);
        }
      }
      return true;
    } catch (err) {
      console.error('Lỗi khi đồng bộ Ca làm việc offline:', err);
      return false;
    }
  }

  // ==========================================
  // 4. ĐẨY PHIẾU THU/CHI SỔ QUỸ LÊN CLOUD
  // ==========================================
  static async pushOfflineCashbook(shopId: string): Promise<{ successCount: number; failedCount: number }> {
    let successCount = 0;
    let failedCount = 0;

    try {
      const pending = await db
        .select()
        .from(schema.cashbook)
        .where(eq(schema.cashbook.sync_status, 'pending'));

      if (pending.length === 0) return { successCount: 0, failedCount: 0 };

      console.log(`Phát hiện ${pending.length} phiếu sổ quỹ offline. Đang đồng bộ...`);
      const headers = await getApiHeaders();

      for (const item of pending) {
        try {
          let response;
          if (item.category === 'prepaid_deposit' && item.reference_id) {
            // Định tuyến nạp ví trả trước qua API deposit để tự động cập nhật số dư ví trên server
            response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/customers/${item.reference_id}/deposit`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: Number(item.amount),
                method: item.method,
                note: item.note || `Nạp tiền ví trả trước [Mobile]`,
                fund_id: item.fund_id || undefined,
                employee_id: item.employee_id || undefined,
                branch_id: shopId,
                auto_deduct_debt: false,
              }),
            });
          } else {
            // Định tuyến các loại phiếu thu chi thường qua API cashbook
            response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/cashbook`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: item.type,
                amount: Number(item.amount),
                method: item.method,
                category: item.category,
                reference_id: item.reference_id || undefined,
                reference_name: item.reference_name || undefined,
                note: item.note ? `${item.note} [Mobile]` : `Phiếu ghi nhận từ di động lúc ${item.date.includes('T') ? formatDateTime(item.date) : item.date}`,
                fund_id: item.fund_id || undefined,
                date: item.date,
                branch_id: shopId,
                employee_id: item.employee_id || undefined,
                order_allocations: item.order_allocations ? JSON.parse(item.order_allocations) : undefined,
              }),
            });
          }

          if (response.ok) {
            delete SyncManager.cashbookRetries[item.id];
            const resJson = await response.json().catch(() => ({}));
            const serverId = resJson.transaction_id || resJson.id || item.id;

            if (serverId && serverId !== item.id) {
              await db.delete(schema.cashbook).where(eq(schema.cashbook.id, item.id));
              await db.insert(schema.cashbook).values({
                ...item,
                id: serverId,
                sync_status: 'synced',
              }).onConflictDoNothing();
            } else {
              await db.update(schema.cashbook)
                .set({ sync_status: 'synced' })
                .where(eq(schema.cashbook.id, item.id));
            }
            successCount++;
          } else {
            failedCount++;
            console.warn(`Đồng bộ phiếu quỹ #${item.id} lỗi từ server: ${response.status}`);
            
            // Nếu lỗi 400 (Bad Request), đánh dấu là 'review' để xử lý bằng tay trên web
            if (response.status === 400) {
              delete SyncManager.cashbookRetries[item.id];
              await db.update(schema.cashbook)
                .set({ sync_status: 'review' })
                .where(eq(schema.cashbook.id, item.id));
            } else {
              // Lỗi kết nối/mạng khác hoặc lỗi máy chủ (5xx)
              const retries = (SyncManager.cashbookRetries[item.id] || 0) + 1;
              SyncManager.cashbookRetries[item.id] = retries;
              if (retries >= 3) {
                delete SyncManager.cashbookRetries[item.id];
                await db.update(schema.cashbook)
                  .set({ sync_status: 'failed' })
                  .where(eq(schema.cashbook.id, item.id));
                console.warn(`Phiếu quỹ #${item.id} đạt tối đa 3 lần thử lỗi server. Đã đánh dấu 'failed'.`);
              }
            }
          }
        } catch (e) {
          failedCount++;
          console.error(`Lỗi kết nối khi đồng bộ phiếu quỹ #${item.id}:`, e);
          const retries = (SyncManager.cashbookRetries[item.id] || 0) + 1;
          SyncManager.cashbookRetries[item.id] = retries;
          if (retries >= 3) {
            delete SyncManager.cashbookRetries[item.id];
            await db.update(schema.cashbook)
              .set({ sync_status: 'failed' })
              .where(eq(schema.cashbook.id, item.id));
            console.warn(`Phiếu quỹ #${item.id} đạt tối đa 3 lần thử lỗi mạng. Đã đánh dấu 'failed'.`);
          }
        }
      }
    } catch (err) {
      console.error('Lỗi nghiêm trọng khi đồng bộ sổ quỹ:', err);
    }
    return { successCount, failedCount };
  }

  // ==========================================
  // 4.5 ĐẨY NHÀ CUNG CẤP CỤC BỘ LÊN CLOUD
  // ==========================================
  static async pushOfflineSuppliers(shopId: string): Promise<boolean> {
    try {
      const pending = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.sync_status, 'pending'));

      if (pending.length === 0) return true;

      console.log(`[Sync Debug] Phát hiện ${pending.length} nhà cung cấp offline chờ đồng bộ.`);
      const headers = await getApiHeaders();

      for (const item of pending) {
        try {
          const url = `${getApiBaseUrl()}/api/shops/${shopId}/suppliers`;
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: item.name,
              phone: item.phone || '',
              email: item.email || '',
              address: item.address || '',
              note: item.note || '',
            }),
          });
          if (response.ok) {
            const resJson = await response.json();
            const serverId = resJson.id;
            if (serverId) {
              // Cập nhật tham chiếu supplier_id trong bảng stock_movements từ ID tạm sang ID thực tế trên server
              await db.update(schema.stockMovements)
                .set({ supplier_id: serverId })
                .where(eq(schema.stockMovements.supplier_id, item.id));

              // Xóa bản ghi tạm và chèn bản ghi đã đồng bộ
              await db.delete(schema.suppliers).where(eq(schema.suppliers.id, item.id));
              await db.insert(schema.suppliers).values({
                ...item,
                id: serverId,
                sync_status: 'synced',
              }).onConflictDoNothing();
              console.log(`[Sync Debug] Đồng bộ nhà cung cấp "${item.name}" thành công!`);
            }
          }
        } catch (e) {
          console.warn('Lỗi đồng bộ nhà cung cấp:', e);
        }
      }
      return true;
    } catch (e) {
      console.warn('Lỗi nghiêm trọng pushOfflineSuppliers:', e);
      return false;
    }
  }

  // ==========================================
  // 5. ĐẨY PHIẾU ĐIỀU CHỈNH KHO LÊN CLOUD
  // ==========================================
  static async pushOfflineStockMovements(shopId: string): Promise<{ successCount: number; failedCount: number }> {
    // 1. Đồng bộ nhà cung cấp trước để giải quyết ID tạm
    await SyncManager.pushOfflineSuppliers(shopId).catch(() => {});

    let successCount = 0;
    let failedCount = 0;

    try {
      const pending = await db
        .select()
        .from(schema.stockMovements)
        .where(eq(schema.stockMovements.sync_status, 'pending'));

      if (pending.length === 0) {
        console.log('[Sync Debug] Không có phiếu điều chỉnh kho offline nào chờ đồng bộ.');
        return { successCount: 0, failedCount: 0 };
      }

      console.log(`[Sync Debug] Phát hiện ${pending.length} phiếu điều chỉnh kho offline. Đang lấy Api Headers...`);
      const headers = await getApiHeaders();
      console.log(`[Sync Debug] Đã lấy Api Headers thành công. Bắt đầu gửi ${pending.length} phiếu...`);

      for (const item of pending) {
        try {
          const url = `${getApiBaseUrl()}/api/shops/${shopId}/stock-movements`;
          console.log(`[Sync Debug] Đang gửi POST tới: ${url} cho phiếu #${item.id}...`);
          console.log(`[Sync Debug] Payload gửi đi:`, {
            type: item.type,
            product_id: item.product_id,
            sku: item.sku,
            qty: String(item.qty),
            unit_cost: String(item.unit_cost),
            warehouse_id: item.warehouse_id,
            to_warehouse_id: item.to_warehouse_id,
            reason: item.reason,
            reference_no: item.reference_no,
            supplier_id: (item as any).supplier_id || '',
          });

          // Thêm timeout 10 giây cho fetch tránh bị treo vĩnh viễn
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn(`[Sync Debug] Yêu cầu gửi phiếu kho #${item.id} quá thời gian (Timeout 10s) và đã bị hủy.`);
            controller.abort();
          }, 10000);

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              type: item.type,
              product_id: item.product_id,
              sku: item.sku || '',
              variant_id: item.variant_id || '',
              qty: String(item.qty),
              unit_cost: String(item.unit_cost),
              branch_id: shopId,
              employee_id: item.employee_id || '',
              reason: item.reason || 'Điều chỉnh tồn kho di động',
              workflow_status: item.workflow_status,
              reference_no: item.reference_no || '',
              warehouse_id: item.warehouse_id || '',
              to_warehouse_id: item.to_warehouse_id || '',
              supplier_id: (item as any).supplier_id || '',
              payments: item.unit_cost > 0 && item.type === 'purchase_in' && (item as any).fund_id ? [
                {
                  amount: String(Math.abs(item.qty) * item.unit_cost),
                  method: (item as any).payment_method || 'cash',
                  fund_id: (item as any).fund_id
                }
              ] : [],
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          console.log(`[Sync Debug] Nhận phản hồi từ server cho phiếu #${item.id}. Status: ${response.status}`);

          if (response.ok) {
            const resJson = await response.json().catch(() => ({}));
            const serverId = resJson.movement_id || resJson.id;

            if (serverId && serverId !== item.id) {
              await db.delete(schema.stockMovements).where(eq(schema.stockMovements.id, item.id));
              await db.insert(schema.stockMovements).values({
                ...item,
                id: serverId,
                sync_status: 'synced',
              }).onConflictDoNothing();
            } else {
              await db.update(schema.stockMovements)
                .set({ sync_status: 'synced' })
                .where(eq(schema.stockMovements.id, item.id));
            }
            console.log(`[Sync Debug] Đồng bộ phiếu kho #${item.id} thành công!`);
            successCount++;
          } else {
            failedCount++;
            const errorText = await response.text().catch(() => '');
            console.warn(`[Sync Debug] Đồng bộ phiếu kho #${item.id} lỗi từ server: ${response.status}. Chi tiết: ${errorText}`);
          }
        } catch (e: any) {
          failedCount++;
          console.error(`[Sync Debug] Lỗi kết nối khi đồng bộ phiếu kho #${item.id}:`, e.message || e);
        }
      }
    } catch (err) {
      console.error('[Sync Debug] Lỗi nghiêm trọng khi đồng bộ điều chỉnh kho:', err);
    }
    return { successCount, failedCount };
  }

  // ==========================================
  // 6. TẢI SẢN PHẨM & DANH MỤC CHỦ ĐỘNG
  // ==========================================
  static async pullProductsAndCategories(
    shopId: string,
    onProgress: (progress: number) => void
  ): Promise<boolean> {
    try {
      console.log(`Bắt đầu đồng bộ chủ động Sản phẩm & Danh mục cho: ${shopId}...`);
      onProgress(0.1);
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();
      onProgress(0.2);

      // Tải song song Categories & Products
      const [catRes, prodRes] = await Promise.all([
        fetch(`${baseUrl}/api/shops/${shopId}/categories?limit=500`, { headers }),
        fetch(`${baseUrl}/api/shops/${shopId}/products?limit=5000&nocache=true`, { headers }),
      ]);

      if (!catRes.ok || !prodRes.ok) {
        throw new Error('Lỗi đường truyền hoặc không thể tải dữ liệu từ Cloud');
      }

      onProgress(0.5);
      const catData = await catRes.json();
      const prodData = await prodRes.json();
      onProgress(0.6);

      const rawCategories = catData.data || [];
      const rawProducts = prodData.data || [];

      // Sử dụng duy nhất 1 Transaction để ghi dữ liệu Sản phẩm & Danh mục vào SQLite
      await db.transaction(async (tx: any) => {
        // Ghi Categories
        if (rawCategories.length > 0) {
          for (const cat of rawCategories) {
            await tx.insert(schema.categories).values({
              id: cat.id || cat.category_id,
              name: cat.name || '',
              parent_id: cat.parent_id || null,
              description: cat.description || null,
              tax_rate: cat.tax_rate || null,
              tax_group: cat.tax_group || null,
              sync_status: 'synced',
            }).onConflictDoUpdate({
              target: schema.categories.id,
              set: {
                name: cat.name || '',
                parent_id: cat.parent_id || null,
                description: cat.description || null,
                tax_rate: cat.tax_rate || null,
                tax_group: cat.tax_group || null,
                sync_status: 'synced',
              }
            });
          }
        }
        
        // Ghi Products
        if (rawProducts.length > 0) {
          for (const prod of rawProducts) {
            const sellPrice = parseInt(prod.sell_price || '0', 10);
            const costPrice = parseInt(prod.cost_price || '0', 10);
            const stockQty = parseInt(prod.stock_qty || '0', 10);
            const weightVal = prod.weight ? parseInt(prod.weight, 10) : null;
            await tx.insert(schema.products).values({
              id: prod.id || prod.product_id,
              name: prod.name || '',
              sku: prod.sku || '',
              barcode: prod.barcode || '',
              category_id: prod.category_id || null,
              unit: prod.unit || '',
              sell_price: isNaN(sellPrice) ? 0 : sellPrice,
              cost_price: isNaN(costPrice) ? 0 : costPrice,
              stock_qty: isNaN(stockQty) ? 0 : stockQty,
              image_url: prod.image_url || null,
              description: prod.description || null,
              product_type: prod.product_type || 'simple',
              parent_id: prod.parent_id || null,
              variant_options: typeof prod.variant_options === 'object' ? JSON.stringify(prod.variant_options) : (prod.variant_options || null),
              modifier_groups: typeof prod.modifier_groups === 'object' ? JSON.stringify(prod.modifier_groups) : (prod.modifier_groups || null),
              active: prod.active || 'TRUE',
              weight: isNaN(weightVal as any) ? null : weightVal,
              item_class: prod.item_class || 'commercial',
              tax_rate: prod.tax_rate || null,
              input_tax_rate: prod.input_tax_rate || null,
              tax_group: prod.tax_group || null,
              sync_status: 'synced',
            }).onConflictDoUpdate({
              target: schema.products.id,
              set: {
                name: prod.name || '',
                sku: prod.sku || '',
                barcode: prod.barcode || '',
                category_id: prod.category_id || null,
                unit: prod.unit || '',
                sell_price: isNaN(sellPrice) ? 0 : sellPrice,
                cost_price: isNaN(costPrice) ? 0 : costPrice,
                stock_qty: isNaN(stockQty) ? 0 : stockQty,
                image_url: prod.image_url || null,
                description: prod.description || null,
                product_type: prod.product_type || 'simple',
                parent_id: prod.parent_id || null,
                variant_options: typeof prod.variant_options === 'object' ? JSON.stringify(prod.variant_options) : (prod.variant_options || null),
                modifier_groups: typeof prod.modifier_groups === 'object' ? JSON.stringify(prod.modifier_groups) : (prod.modifier_groups || null),
                active: prod.active || 'TRUE',
                weight: isNaN(weightVal as any) ? null : weightVal,
                item_class: prod.item_class || 'commercial',
                tax_rate: prod.tax_rate || null,
                input_tax_rate: prod.input_tax_rate || null,
                tax_group: prod.tax_group || null,
                sync_status: 'synced',
              }
            });
          }
        }
      });

      onProgress(1.0);
      return true;
    } catch (error) {
      console.error('Lỗi khi đồng bộ Sản phẩm/Danh mục:', error);
      return false;
    }
  }

  // ==========================================
  // 7. ĐẨY DANH MỤC OFFLINE LÊN CLOUD
  // ==========================================
  static async pushOfflineCategories(shopId: string): Promise<boolean> {
    try {
      const pendingCats = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.sync_status, 'pending'));

      if (pendingCats.length === 0) return true;

      console.log(`Phát hiện ${pendingCats.length} danh mục offline chờ đồng bộ...`);
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();

      for (const cat of pendingCats) {
        try {
          const response = await fetch(`${baseUrl}/api/shops/${shopId}/categories`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: cat.name,
              parent_id: cat.parent_id || '',
              description: cat.description || '',
            }),
          });

          if (response.ok) {
            const resJson = await response.json().catch(() => ({}));
            const serverId = resJson.category_id || resJson.id;

            if (serverId && serverId !== cat.id) {
              const oldId = cat.id;
              // 1. Cập nhật category_id của các sản phẩm cục bộ đang liên kết với danh mục tạm này
              await db.update(schema.products)
                .set({ category_id: serverId })
                .where(eq(schema.products.category_id, oldId));

              // 2. Xóa danh mục tạm, chèn danh mục chính thức từ server vào SQLite
              await db.delete(schema.categories).where(eq(schema.categories.id, oldId));
              await db.insert(schema.categories).values({
                ...cat,
                id: serverId,
                sync_status: 'synced',
              }).onConflictDoNothing();
            } else {
              await db.update(schema.categories)
                .set({ sync_status: 'synced' })
                .where(eq(schema.categories.id, cat.id));
            }
            console.log(`Đồng bộ danh mục #${cat.name} lên Cloud thành công!`);
          }
        } catch (err) {
          console.error(`Lỗi đồng bộ danh mục #${cat.name}:`, err);
        }
      }
      return true;
    } catch (err) {
      console.error('Lỗi quy trình đồng bộ danh mục offline:', err);
      return false;
    }
  }

  // ==========================================
  // 8. ĐẨY SẢN PHẨM OFFLINE LÊN CLOUD
  // ==========================================
  static async pushOfflineProducts(shopId: string): Promise<boolean> {
    try {
      const pendingProds = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.sync_status, 'pending'));

      if (pendingProds.length === 0) return true;

      console.log(`Phát hiện ${pendingProds.length} sản phẩm offline chờ đồng bộ...`);
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();

      for (const prod of pendingProds) {
        try {
          const payload = {
            name: prod.name,
            sku: prod.sku || '',
            barcode: prod.barcode || '',
            category_id: prod.category_id || '',
            unit: prod.unit || '',
            sell_price: String(prod.sell_price || 0),
            cost_price: String(prod.cost_price || 0),
            active: prod.active || 'TRUE',
            description: prod.description || '',
            product_type: prod.product_type || 'simple',
            parent_id: prod.parent_id || '',
            weight: prod.weight ? String(prod.weight) : '',
            item_class: prod.item_class || 'commercial',
            image_url: prod.image_url || '',
            variant_options: prod.variant_options || '',
            modifier_groups: prod.modifier_groups || '',
            metadata: parseProductMetadata(prod.metadata),
          };

          const isNewProduct = prod.id.startsWith('PROD-') || prod.id.startsWith('prod-') || prod.id.startsWith('temp-');
          const url = isNewProduct 
            ? `${baseUrl}/api/shops/${shopId}/products` 
            : `${baseUrl}/api/shops/${shopId}/products/${prod.id}`;
          const method = isNewProduct ? 'POST' : 'PUT';

          const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const resJson = await response.json().catch(() => ({}));
            const serverId = resJson.product_id || resJson.id || prod.id;

            if (serverId && serverId !== prod.id) {
              const oldId = prod.id;
              
              // Cập nhật các bảng liên quan đến ID sản phẩm nếu có
              await db.update(schema.order_items)
                .set({ product_id: serverId })
                .where(eq(schema.order_items.product_id, oldId));

              await db.update(schema.stockMovements)
                .set({ product_id: serverId })
                .where(eq(schema.stockMovements.product_id, oldId));

              // Xóa sản phẩm tạm và chèn lại sản phẩm chính thức từ Server
              await db.delete(schema.products).where(eq(schema.products.id, oldId));
              await db.insert(schema.products).values({
                ...prod,
                id: serverId,
                sync_status: 'synced',
              }).onConflictDoNothing();
            } else {
              await db.update(schema.products)
                .set({ sync_status: 'synced' })
                .where(eq(schema.products.id, prod.id));
            }
            console.log(`Đồng bộ sản phẩm #${prod.name} lên Cloud thành công!`);
          }
        } catch (err) {
          console.error(`Lỗi đồng bộ sản phẩm #${prod.name}:`, err);
        }
      }
      return true;
    } catch (err) {
      console.error('Lỗi quy trình đồng bộ sản phẩm offline:', err);
      return false;
    }
  }

  // ==========================================
  // 9. TẢI SƠ ĐỒ PHÒNG BÀN & ĐƠN HÀNG ĐANG CHẠY (POS TARGETED PULL)
  // ==========================================
  static async pullTableLayoutAndActiveOrders(shopId: string): Promise<boolean> {
    try {
      console.log(`[Sync] Bắt đầu đồng bộ riêng Sơ đồ bàn & Đơn hàng đang chạy cho: ${shopId}...`);
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();

      const [tableData, activeOrdersData] = await Promise.all([
        fetch(`${baseUrl}/api/shops/${shopId}/location-resources?limit=500`, { headers }).then(res => res.ok ? res.json() : { data: [] }),
        fetch(`${baseUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100`, { headers }).then(res => res.ok ? res.json() : { data: [] }),
      ]);

      const rawTables = tableData.data || [];
      const activeOrders = activeOrdersData.data || [];

      // Bản đồ hóa các active order theo resource_id để tra cứu nhanh
      const activeOrdersMap = new Map<string, any>();
      for (const order of activeOrders) {
        try {
          const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {});
          const rId = meta.resource_id;
          if (rId) {
            activeOrdersMap.set(rId, { order, meta });
          }
        } catch (e) {}
      }

      // Ghi dữ liệu vào SQLite sử dụng duy nhất một Transaction để tối ưu hiệu năng
      await db.transaction(async (tx: any) => {
        await tx.delete(schema.location_resources);

        if (rawTables.length > 0) {
          for (const table of rawTables) {
            const rate = parseInt(table.hourly_rate || '0', 10);
            const isOccupied = table.status === 'occupied' || table.status === 'playing';
            const tId = table.id || table.resource_id;
            const activeOrderSession = activeOrdersMap.get(tId);
            
            let resolvedStartTime: number | null = null;
            let mergedMetadata = typeof table.metadata === 'object' ? JSON.stringify(table.metadata) : (table.metadata || '{}');
            
            if (isOccupied && activeOrderSession) {
              const checkInStr = activeOrderSession.meta.check_in;
              if (checkInStr) {
                resolvedStartTime = new Date(checkInStr).getTime();
              }
              try {
                const tableMetaObj = JSON.parse(mergedMetadata);
                const cloudGuests = activeOrderSession.meta.guests_list || tableMetaObj.guests_list || [];
                mergedMetadata = JSON.stringify({
                  ...tableMetaObj,
                  rental_type: activeOrderSession.meta.rental_type || tableMetaObj.rental_type || 'hourly',
                  num_guests: cloudGuests.length > 0 ? cloudGuests.length : (activeOrderSession.meta.num_guests || tableMetaObj.num_guests || 1),
                  check_in: checkInStr || tableMetaObj.check_in,
                  guests_list: cloudGuests
                });
              } catch (e) {}
            }
            
            if (isOccupied && !resolvedStartTime) {
              resolvedStartTime = Date.now() - 3600000;
            }

            await tx.insert(schema.location_resources).values({
              id: tId,
              name: table.name || '',
              type: table.type || 'table',
              status: isOccupied ? 'occupied' : (table.status === 'dirty' || table.status === 'cleaning' ? table.status : 'available'),
              current_order_id: table.current_order_id || (activeOrderSession ? activeOrderSession.order.id : null),
              hourly_rate: isNaN(rate) ? 0 : rate,
              zone: table.zone || null,
              startTime: resolvedStartTime,
              metadata: mergedMetadata,
            }).onConflictDoUpdate({
              target: schema.location_resources.id,
              set: {
                name: table.name || '',
                type: table.type || 'table',
                status: isOccupied ? 'occupied' : (table.status === 'dirty' || table.status === 'cleaning' ? table.status : 'available'),
                current_order_id: table.current_order_id || (activeOrderSession ? activeOrderSession.order.id : null),
                hourly_rate: isNaN(rate) ? 0 : rate,
                zone: table.zone || null,
                startTime: resolvedStartTime,
                metadata: mergedMetadata,
              }
            });
          }
        }
      });
      return true;
    } catch (error) {
      console.error('Lỗi khi đồng bộ riêng Sơ đồ bàn POS:', error);
      return false;
    }
  }

  // ==========================================
  // 10. TẢI PHIẾU THU/CHI SỔ QUỸ (CASHBOOK TARGETED PULL)
  // ==========================================
  static async pullCashbook(shopId: string): Promise<boolean> {
    try {
      console.log(`[Sync] Bắt đầu đồng bộ riêng Sổ Quỹ cho: ${shopId}...`);
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();

      const res = await fetch(`${baseUrl}/api/shops/${shopId}/cashbook?limit=100`, { headers });
      if (!res.ok) {
        throw new Error('Lỗi đường truyền hoặc không thể tải dữ liệu Sổ Quỹ từ Cloud');
      }

      const cbData = await res.json();
      const rawCashbook = cbData.data || [];

      // Xóa các giao dịch đã đồng bộ (synced) và chèn dữ liệu mới trong một Transaction duy nhất
      await db.transaction(async (tx: any) => {
        await tx.delete(schema.cashbook).where(eq(schema.cashbook.sync_status, 'synced'));

        if (rawCashbook.length > 0) {
          for (const cb of rawCashbook) {
            await tx.insert(schema.cashbook).values({
              id: cb.transaction_id || cb.id,
              branch_id: cb.branch_id || '',
              type: cb.type || 'receipt',
              amount: parseInt(cb.amount || '0', 10),
              method: cb.method || 'cash',
              category: cb.category || 'other_expense',
              reference_id: cb.reference_id || null,
              reference_name: cb.reference_name || null,
              employee_id: cb.employee_id || null,
              note: cb.note || null,
              date: cb.created_at || cb.date || new Date().toISOString(),
              fund_id: cb.fund_id || null,
              sync_status: 'synced',
            }).onConflictDoNothing();
          }
        }
      });
      return true;
    } catch (error) {
      console.error('Lỗi khi đồng bộ riêng Sổ Quỹ:', error);
      return false;
    }
  }
}
