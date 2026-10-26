import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Supabase credentials — read from Expo config (EAS secrets) with hardcoded fallback
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl ?? 'https://ddkjsthxnskdncefnuhi.supabase.co';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey ?? 'sb_publishable_0tpKMXkxF8NMQOFTAQHZlg_29Pkt61f';

// Khởi tạo Supabase client gọn nhẹ, chỉ tập trung xử lý Xác thực (Supabase Auth)
// và tự động lưu phiên (persist session) qua AsyncStorage di động.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

let inflightRefreshPromise: Promise<string | null> | null = null;

// Helper lấy JWT token của user hiện tại để gửi đính kèm REST API Header của Next.js
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Nếu token sắp hết hạn trong vòng 90 giây hoặc đã hết hạn -> chủ động refresh trước khi gửi request
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAtMs > 0 && expiresAtMs - Date.now() < 90_000) {
      if (!inflightRefreshPromise) {
        inflightRefreshPromise = supabase.auth
          .refreshSession()
          .then(({ data }) => data.session?.access_token ?? session.access_token ?? null)
          .catch(() => session.access_token ?? null)
          .finally(() => {
            inflightRefreshPromise = null;
          });
      }
      return await inflightRefreshPromise;
    }

    return session.access_token ?? null;
  } catch (error) {
    console.error('Lỗi khi lấy Supabase Session Token:', error);
    return null;
  }
}
