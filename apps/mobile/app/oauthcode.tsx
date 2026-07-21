/**
 * app/oauthcode.tsx
 *
 * Deep link handler cho Zalo OAuth callback.
 * Zalo SDK sau khi xác thực thành công sẽ redirect về:
 *   oni-pos://oauthcode?success=OAUTH_CODE&code_challenge=XXX
 *
 * Route này bắt deep link đó, gọi Edge Function zalo-auth để
 * trao đổi lấy Supabase session rồi điều hướng tiếp.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
      // Zalo trả về oauthCode qua param "success"
      const oauthCode = params.success;
      const codeVerifier = params.code_challenge ?? '';

      if (!oauthCode) {
        const errDetail = params.error ?? 'Không nhận được mã xác thực từ Zalo.';
        throw new Error(errDetail);
      }

      // Dùng helper dùng chung: exchange oauthCode → Supabase session
      await exchangeZaloCodeForSession(oauthCode, codeVerifier);

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
