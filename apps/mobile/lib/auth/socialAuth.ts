/**
 * socialAuth.ts
 * Tập hợp helper xử lý đăng nhập mạng xã hội:
 *  - Apple  → expo-apple-authentication + Supabase signInWithIdToken
 *  - Google → expo-auth-session (PKCE) + Supabase signInWithIdToken
 *  - Zalo   → react-native-zalo-kit (native SDK) + Supabase Edge Function
 *
 * LƯU Ý BẢO MẬT:
 *  - Apple/Google token không bao giờ lưu vào storage — chỉ dùng 1 lần để lấy Supabase session.
 *  - Zalo oauthCode trao đổi phía server (Edge Function) — không expose app_secret ra client.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

// Đảm bảo WebBrowser session đóng đúng khi quay lại app
WebBrowser.maybeCompleteAuthSession();

// ─── Lấy client IDs từ app.json extra ─────────────────────────────────────────
const GOOGLE_IOS_CLIENT_ID: string =
  Constants.expoConfig?.extra?.googleIosClientId ?? '';
const GOOGLE_ANDROID_CLIENT_ID: string =
  Constants.expoConfig?.extra?.googleAndroidClientId ?? '';
const GOOGLE_WEB_CLIENT_ID: string =
  Constants.expoConfig?.extra?.googleWebClientId ?? '';
const ZALO_APP_ID: string =
  Constants.expoConfig?.extra?.zaloAppId ?? '';

// ─── Kiểu trả về thống nhất ───────────────────────────────────────────────────
export interface SocialAuthResult {
  userId: string;
  email: string | null;
  fullName: string | null;
  provider: 'apple' | 'google' | 'zalo';
}

// ─── 1. APPLE SIGN IN ─────────────────────────────────────────────────────────
/**
 * Đăng nhập bằng Apple.
 * Chỉ hiển thị trên iOS — gọi isAvailableAsync() trước khi render nút.
 * Apple chỉ trả về email & fullName ở lần đăng nhập đầu tiên — sau đó trả về null.
 */
export async function signInWithApple(): Promise<SocialAuthResult> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple không trả về identity token. Vui lòng thử lại.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Không thể tạo phiên Apple. Vui lòng thử lại.');

  const user = data.user;
  // Ghép họ tên từ Apple credential (chỉ có lần đầu)
  const appleName =
    credential.fullName?.givenName || credential.fullName?.familyName
      ? `${credential.fullName?.givenName ?? ''} ${credential.fullName?.familyName ?? ''}`.trim()
      : null;
  const fullName =
    appleName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Người dùng Apple';

  return {
    userId: user.id,
    email: user.email ?? credential.email ?? null,
    fullName,
    provider: 'apple',
  };
}

// ─── 2. GOOGLE SIGN IN ────────────────────────────────────────────────────────
/**
 * Đăng nhập bằng Google sử dụng expo-auth-session PKCE flow.
 * Cần được gọi trong component vì hook useAuthRequest phải chạy trong React context.
 * Hàm này nhận `idToken` đã được resolve từ hook bên ngoài.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<SocialAuthResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Không thể tạo phiên Google. Vui lòng thử lại.');

  const user = data.user;
  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Người dùng Google';

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName,
    provider: 'google',
  };
}

// Export Google client IDs để dùng trong hook tại login.tsx
export { GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID };

// ─── 3. ZALO SIGN IN (Native SDK) ────────────────────────────────────────────
/**
 * Đăng nhập bằng Zalo qua react-native-zalo-kit.
 * Flow:
 *   1. Gọi ZaloKit.login() → SDK mở app Zalo hoặc WebView
 *   2. Nhận oauthCode + codeVerifier (PKCE)
 *   3. Gửi lên Supabase Edge Function "zalo-auth"
 *   4. Edge Function trao đổi token với Zalo API và tạo Supabase session
 *   5. Set session trong supabase client
 */
export async function signInWithZalo(): Promise<SocialAuthResult> {
  // Import động để tránh lỗi trên web/simulator không có native module
  let ZaloKit: any;
  try {
    ZaloKit = require('react-native-zalo-kit');
  } catch (e) {
    throw new Error('Zalo SDK chưa được cài đặt đúng cách. Vui lòng build lại app.');
  }

  // Gọi native SDK — mở app Zalo nếu có, không thì mở WebView.
  // SDK sẽ tự xử lý deep link callback nội bộ (qua ZDKApplicationDelegate)
  // rồi resolve Promise với oauthCode.
  const zaloResult = await ZaloKit.login('AUTH_VIA_APP_OR_WEB');

  if (!zaloResult?.oauthCode) {
    throw new Error('Zalo không trả về mã xác thực. Vui lòng thử lại.');
  }

  return await exchangeZaloCodeForSession(
    zaloResult.oauthCode,
    zaloResult.codeVerifier ?? ''
  );
}

/**
 * Dùng chung cho cả signInWithZalo (SDK Promise) và ZaloOAuthCallback (deep link).
 * Trao đổi oauthCode → Supabase session qua Edge Function zalo-auth.
 */
export async function exchangeZaloCodeForSession(
  oauthCode: string,
  codeVerifier: string
): Promise<SocialAuthResult> {
  // Dùng hằng số module-level ZALO_APP_ID (đã khai báo ở trên, tránh shadow variable)
  const { data: fnData, error: fnError } = await supabase.functions.invoke('zalo-auth', {
    body: {
      oauthCode,
      codeVerifier,
      appId: ZALO_APP_ID,
    },
  });

  if (fnError) {
    throw new Error(`Lỗi xác thực Zalo: ${fnError.message}`);
  }

  if (!fnData?.access_token || !fnData?.refresh_token) {
    throw new Error('Không nhận được phiên từ máy chủ sau khi xác thực Zalo.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: fnData.access_token,
    refresh_token: fnData.refresh_token,
  });

  if (sessionError) throw sessionError;
  if (!sessionData.user) throw new Error('Không thể thiết lập phiên Zalo.');

  const user = sessionData.user;
  const fullName =
    fnData.user?.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    'Người dùng Zalo';

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName,
    provider: 'zalo',
  };
}

// ─── Kiểm tra Apple có khả dụng không (iOS only) ─────────────────────────────
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
