/**
 * app/oauthcode.tsx
 *
 * Deep link handler chính cho Zalo OAuth callback trên iOS.
 * Zalo SDK sau khi xác thực thành công sẽ redirect về:
 *   oni-pos://oauthcode?success=OAUTH_CODE&code_challenge=XXX
 *
 * Route này bắt deep link đó, gọi backend Việt Nam để
 * trao đổi lấy Supabase session rồi điều hướng tiếp.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exchangeZaloCodeForSession } from '../lib/auth/socialAuth';

export default function ZaloOAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    success?: string;
    code_challenge?: string;
    error?: string;
  }>();

  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Log để debug — xem Zalo thực sự gửi param tên gì
      console.log('[oauthcode] URL params nhận được:', JSON.stringify(params));

      // Zalo có thể gửi oauthCode qua các tên param khác nhau tuỳ version
      const oauthCode =
        params.success ||           // dạng: oni-pos://oauthcode?success=XXX
        (params as any).code ||     // dạng: oni-pos://oauthcode?code=XXX
        (params as any).oauth_code; // fallback

      // codeVerifier chỉ có trong SDK Promise, không có trong deep link URL
      // → gửi chuỗi rỗng, Edge Function sẽ bỏ qua nếu không cần PKCE
      // code_challenge là SHA-256 của verifier, không thể dùng thay code_verifier.
      const codeVerifier = (params as any).code_verifier ?? '';

      if (!oauthCode) {
        const errDetail = (params as any).error ?? params.error ?? 'Không nhận được mã xác thực từ Zalo.';
        throw new Error(errDetail);
      }

      // Dùng helper dùng chung: exchange oauthCode → Supabase session
      const result = await exchangeZaloCodeForSession(oauthCode as string, codeVerifier as string);
      await AsyncStorage.setItem('auth_login_type', 'zalo');
      await AsyncStorage.removeItem('active_tenant_code');
      if (result.fullName) {
        await AsyncStorage.setItem('user_name', result.fullName);
      }

      // Thành công → điều hướng đến chọn chi nhánh
      router.replace('/(auth)/select-branch');
    } catch (err: any) {
      console.error('[ZaloOAuthCallback] Lỗi:', err);
      setErrorMsg(err?.message ?? 'Đã xảy ra lỗi không xác định.');
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0068ff" />
        <Text style={{ marginTop: 16, fontSize: 14, color: '#64748b', fontWeight: '500' }}>
          Đang xác thực Zalo...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 8, textAlign: 'center' }}>
        Đăng nhập Zalo thất bại
      </Text>
      <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
        {errorMsg}
      </Text>
      <TouchableOpacity
        onPress={() => router.replace('/(auth)/login')}
        style={{
          backgroundColor: '#0068ff',
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 14,
        }}
      >
        <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>
          Quay lại đăng nhập
        </Text>
      </TouchableOpacity>
    </View>
  );
}
