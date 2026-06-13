import { db, expoDb } from '../db/client';
import * as schema from '../db/schema';
import { getApiBaseUrl, getApiHeaders } from '../api/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq } from 'drizzle-orm';
import { formatDateTime } from '../utils/format';

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
        methodsData
      ] = await Promise.all([
        fetchJson(`${baseUrl}/api/shops/${shopId}/categories?limit=500`, true, 'Không thể tải Danh mục sản phẩm từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/products?limit=2000&nocache=true`, true, 'Không thể tải danh mục Sản phẩm từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/location-resources?limit=500`, true, 'Không thể tải Sơ đồ phòng bàn từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/customers?limit=2000`, true, 'Không thể tải Danh sách khách hàng từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/payment-funds?active=TRUE`, true, 'Không thể tải danh sách Quỹ thanh toán từ Cloud'),
        fetchJson(`${baseUrl}/api/shops/${shopId}/cashbook?limit=100`, false),
        fetchJson(`${baseUrl}/api/shops/${shopId}/payment-methods?active=TRUE`, false),
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
        DELETE FROM categories;
        DELETE FROM products;
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

      // Lưu trữ tuần tự (Sequential) để đảm bảo an toàn dữ liệu trên SQLite
      // Tránh việc Promise.all đẩy quá nhiều connection cùng lúc làm rớt frame/dữ liệu

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

      // 2. Ghi Products
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

      onProgress(0.9);

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

          await db.insert(schema.location_resources).values({
            id: tId,
            name: table.name || '',
            type: table.type || 'table',
            status: isOccupied ? 'occupied' : 'available',
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
              status: isOccupied ? 'occupied' : 'available',
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
          await db.insert(schema.paymentFunds).values({
            id: fund.id,
            name: fund.name || '',
            type: fund.type || 'cash',
            branch_id: fund.branch_id || '',
            account_number: fund.account_number || null,
            account_name: fund.account_name || null,
            bank_name: fund.bank_name || null,
            is_default: fund.is_default === true,
            qr_template: fund.qr_template || 'compact2',
            initial_balance: isNaN(parseInt(fund.initial_balance)) ? 0 : parseInt(fund.initial_balance),
          }).onConflictDoNothing();
        }
      }

      // 5.5 Ghi Danh sách Phương thức thanh toán
      if (rawMethods.length > 0) {
        for (const m of rawMethods) {
          await db.insert(schema.paymentMethods).values({
            id: m.id,
            name: m.name || '',
            type: m.type || 'cash',
            code: m.code || m.id,
            branch_id: m.branch_id || shopId,
            is_default: m.is_default === 'TRUE' || m.is_default === true,
            active: m.active === 'TRUE' || m.active === true,
          }).onConflictDoNothing();
        }
      }

      // 6. Ghi Phiếu Thu/Chi Sổ Quỹ
      if (rawCashbook.length > 0) {
        for (const cb of rawCashbook) {
          await db.insert(schema.cashbook).values({
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
              customer_id: order.customer_id || '',
              customer_name: order.customer_name || 'Khách lẻ',
              branch_id: shopId,
              employee_id: userEmail,
              subtotal: order.total_amount + (order.discount_amount || 0),
              discount_amount: order.discount_amount || 0,
              tax_amount: 0,
              total_amount: order.total_amount,
              paid_amount: order.paid_amount,
              debt_amount: order.total_amount - order.paid_amount,
              note: order.note || `Hóa đơn offline từ di động. Tạo lúc ${order.created_at}`,
              metadata: (order as any).metadata,
            },
            items: items.map((it: any) => ({
              product_id: it.product_id,
              product_name: it.product_name,
              qty: it.qty,
              unit_price: it.unit_price,
              discount_amount: 0,
              line_total: it.line_total,
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
                })
                .where(eq(schema.orders.id, localId))
            } else {
              await db.update(schema.orders)
                .set({ sync_status: 'synced', order_no: serverNo || order.order_no })
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
  // 5. ĐẨY PHIẾU ĐIỀU CHỈNH KHO LÊN CLOUD
  // ==========================================
  static async pushOfflineStockMovements(shopId: string): Promise<{ successCount: number; failedCount: number }> {
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
}
