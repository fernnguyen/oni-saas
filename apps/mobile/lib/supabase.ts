import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// LIVE Supabase URL và Publishable Anon Key (được đồng bộ từ .env.local của WebApp)
const SUPABASE_URL = 'https://ddkjsthxnskdncefnuhi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0tpKMXkxF8NMQOFTAQHZlg_29Pkt61f';

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

// Helper lấy JWT token của user hiện tại để gửi đính kèm REST API Header của Next.js
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch (error) {
    console.error('Lỗi khi lấy Supabase Session Token:', error);
    return null;
  }
}
