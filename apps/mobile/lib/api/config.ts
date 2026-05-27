import { Platform, Alert } from 'react-native';
import { getAuthToken, supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// 1. Địa chỉ máy chủ cục bộ mặc định
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEFAULT_PORT = '3000'; // Có thể cấu hình đổi sang 3001 hoặc IP LAN ngoại vi

let cachedApiUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

// 2. Hàm lấy URL động thời gian thực (Tránh lỗi copy-by-value của string primitive)
export function getApiBaseUrl(): string {
  return cachedApiUrl;
}

// 3. Hàm tải URL từ AsyncStorage lúc khởi động
export async function loadApiBaseUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem('custom_api_base_url');
    if (saved) {
      cachedApiUrl = saved.trim();
    }
  } catch (err) {
    console.error('Lỗi khi đọc custom_api_base_url:', err);
  }
  return cachedApiUrl;
}

// 4. Hàm lưu trữ URL mới thiết lập
export async function saveApiBaseUrl(newUrl: string): Promise<void> {
  cachedApiUrl = newUrl.trim();
  await AsyncStorage.setItem('custom_api_base_url', cachedApiUrl);
}

// Khởi chạy ngầm tải URL đã lưu khi nạp module
loadApiBaseUrl();

// 3.5 Global Fetch Middleware Interceptor to catch 401 Unauthorized (Lost Session)
let isSessionExpiredAlertShowing = false;
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  try {
    const response = await originalFetch(input, init);
    
    // Bắt mã lỗi 401 Unauthorized từ REST API Next.js hoặc các dịch vụ khác
    if (response.status === 401 && !isSessionExpiredAlertShowing) {
      isSessionExpiredAlertShowing = true;
      console.warn('[API Middleware] Bắt được phản hồi 401 Unauthorized - Hết hạn phiên!');
      
      Alert.alert(
        'Phiên làm việc hết hạn',
        'Phiên làm việc của bạn đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại để tiếp tục (Dữ liệu ngoại tuyến và giỏ hàng của ca hiện tại vẫn được giữ nguyên).',
        [
          {
            text: 'Đăng nhập lại',
            onPress: async () => {
              try {
                // Chỉ đăng xuất khỏi Supabase Auth để người dùng đăng nhập lại
                // TUYỆT ĐỐI KHÔNG xóa các cấu hình CSDL offline (active_tenant_id), giỏ hàng tạm (temp_cart), vv.
                await supabase.auth.signOut();
                isSessionExpiredAlertShowing = false;
                router.replace('/(auth)/login');
              } catch (err) {
                console.error('Lỗi khi đăng xuất từ middleware:', err);
                isSessionExpiredAlertShowing = false;
                router.replace('/(auth)/login');
              }
            }
          }
        ],
        { cancelable: false }
      );
    }
    
    return response;
  } catch (error) {
    throw error;
  }
};

// Hàm tiện ích tạo Headers chuẩn hóa chứa Supabase JWT Token 
// dùng để gọi các REST API bảo mật của Next.js
export async function getApiHeaders(customHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const token = await getAuthToken();
  let tenantCode = null;
  try {
    tenantCode = await AsyncStorage.getItem('active_tenant_code');
  } catch (err) {
    console.error('Lỗi khi lấy active_tenant_code từ AsyncStorage:', err);
  }
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(tenantCode ? { 'x-tenant-slug': tenantCode } : {}),
    ...customHeaders,
  };
}
