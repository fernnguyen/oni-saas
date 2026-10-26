import { Platform, Alert } from 'react-native';
import { getAuthToken, supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// 1. Địa chỉ máy chủ cục bộ mặc định
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEFAULT_PORT = '3000'; // Có thể cấu hình đổi sang 3001 hoặc IP LAN ngoại vi

let cachedApiUrl = 'https://oni.vn';

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

// 3.5 Global Fetch Middleware Interceptor to catch 401 Unauthorized & Auto-Refresh JWT
const originalFetch = global.fetch;
let activeRefreshPromise: Promise<string | null> | null = null;

global.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  const requestUrl = typeof input === 'string' ? input : (input as any)?.url || '';

  // Chỉ can thiệp 401 từ REST API của hệ thống (bỏ qua request nội bộ tới supabase.co để tránh vòng lặp)
  if (response.status === 401 && !requestUrl.includes('supabase.co')) {
    console.warn('[API Middleware] Bắt được phản hồi 401 Unauthorized - Thử làm mới phiên (refreshSession)...');

    try {
      if (!activeRefreshPromise) {
        activeRefreshPromise = (async () => {
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            const errMsg = (error.message || '').toLowerCase();
            const isFatalAuthError =
              errMsg.includes('invalid refresh token') ||
              errMsg.includes('refresh_token_not_found') ||
              errMsg.includes('invalid_grant') ||
              error.status === 400;
            if (isFatalAuthError) {
              return '__FATAL_AUTH__';
            }
            return null;
          }
          return data.session?.access_token ?? null;
        })().finally(() => {
          activeRefreshPromise = null;
        });
      }

      const refreshResult = await activeRefreshPromise;

      // Nếu refresh thành công -> tự động gắn token mới và gọi lại request vừa bị 401
      if (refreshResult && refreshResult !== '__FATAL_AUTH__') {
        const nextHeaders = new Headers(init?.headers || {});
        nextHeaders.set('Authorization', `Bearer ${refreshResult}`);
        return await originalFetch(input, {
          ...init,
          headers: nextHeaders,
        });
      }

      // Chỉ đăng xuất khi Refresh Token thực sự không còn hợp lệ (tránh văng tài khoản khi mạng chập chờn)
      if (refreshResult === '__FATAL_AUTH__') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.auth.signOut();
          if (Platform.OS === 'android') {
            const { ToastAndroid } = require('react-native');
            ToastAndroid.show('Phiên làm việc hết hạn. Vui lòng đăng nhập lại.', ToastAndroid.LONG);
          }
          router.replace('/(auth)/login');
        }
      }
    } catch (err) {
      console.warn('[API Middleware] Không thể làm mới token khi gặp 401:', err);
    }
  }

  return response;
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
