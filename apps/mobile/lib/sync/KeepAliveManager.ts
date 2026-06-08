import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncManager } from './SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../api/config';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 60 phút

export class KeepAliveManager {
  private static appStateSubscription: any = null;
  private static isSyncing = false;

  static initialize() {
    if (this.appStateSubscription) return;

    console.log('[KeepAliveManager] Đang khởi tạo bộ lắng nghe trạng thái AppState...');
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    
    // Tự động chạy một lần khi ứng dụng vừa khởi động
    setTimeout(() => this.triggerSyncIfNeeded(true), 1500);
  }

  static destroy() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private static handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('[KeepAliveManager] Ứng dụng hoạt động trở lại. Kiểm tra đồng bộ...');
      this.triggerSyncIfNeeded(false);
    }
  };

  /**
   * Thực hiện đồng bộ nếu đã quá 60 phút hoặc có dữ liệu pending chưa đẩy lên.
   * @param force Nếu true, bỏ qua kiểm tra 60 phút đối với việc kéo cấu hình/quyền hạn
   */
  static async triggerSyncIfNeeded(force = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id');
      const tenantId = await AsyncStorage.getItem('active_tenant_id');
      if (!shopId || !tenantId) {
        this.isSyncing = false;
        return; // Chưa chọn chi nhánh làm việc
      }

      // --- PHẦN 1: LUÔN LUÔN ĐẨY DỮ LIỆU OFFLINE LÊN CLOUD CÀNG SỚM CÀNG TỐT ---
      await this.pushPendingData(shopId);

      // --- PHẦN 2: CHỈ CẬP NHẬT QUYỀN HẠN & DANH MỤC NẾU FORCE HOẶC QUÁ 60 PHÚT ---
      const now = Date.now();
      const lastSyncStr = await AsyncStorage.getItem('last_keep_alive_sync_time');
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

      if (force || now - lastSync > SYNC_INTERVAL_MS) {
        console.log('[KeepAliveManager] Đang cập nhật quyền hạn người dùng & danh mục mới...');
        
        // A. Cập nhật quyền hạn từ Web Backend
        await this.syncUserPermissions(shopId);

        // B. Cập nhật nhẹ danh mục sản phẩm (Delta/Full Pull)
        await SyncManager.pullFullDatabase(shopId, tenantId, () => {});

        await AsyncStorage.setItem('last_keep_alive_sync_time', String(now));
        console.log('[KeepAliveManager] Đồng bộ định kỳ keep-alive thành công.');
      }
    } catch (err) {
      console.warn('[KeepAliveManager] Lỗi tiến trình đồng bộ nền:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Đẩy toàn bộ dữ liệu pending (Hóa đơn, Ca, Sổ quỹ, Kho)
   */
  private static async pushPendingData(shopId: string) {
    try {
      // 1. Đẩy Ca làm việc pending
      await SyncManager.pushOfflineShifts(shopId);

      // 2. Đẩy Hóa đơn pending
      await SyncManager.pushOfflineOrders(shopId);

      // 3. Đẩy Sổ quỹ pending
      if (typeof (SyncManager as any).pushOfflineCashbook === 'function') {
        await (SyncManager as any).pushOfflineCashbook(shopId);
      }

      // 4. Đẩy Điều chỉnh kho pending
      if (typeof (SyncManager as any).pushOfflineStockMovements === 'function') {
        await (SyncManager as any).pushOfflineStockMovements(shopId);
      }
    } catch (e) {
      console.warn('[KeepAliveManager] Lỗi đẩy dữ liệu pending:', e);
    }
  }

  /**
   * Gọi API lấy và lưu quyền hạn người dùng
   */
  private static async syncUserPermissions(shopId: string) {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/permissions`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.permissions)) {
          await AsyncStorage.setItem('active_user_permissions', JSON.stringify(data.permissions));
          console.log('[KeepAliveManager] Đã cập nhật quyền người dùng:', data.permissions);
        }
        if (data && data.role) {
          await AsyncStorage.setItem('active_user_role_code', data.role.code || 'staff');
          await AsyncStorage.setItem('active_user_role_name', data.role.name || 'Nhân viên');
          console.log('[KeepAliveManager] Đã cập nhật vai trò người dùng:', data.role);
        }
      } else {
        console.warn(`[KeepAliveManager] API permissions trả về lỗi: ${res.status}`);
      }
    } catch (err) {
      console.warn('[KeepAliveManager] Không thể kết nối API lấy quyền hạn (Chế độ offline):', err);
    }
  }
}
