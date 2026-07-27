import React, { useState } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { isValidVNPhone } from '../../lib/utils/phone';
import { loadApiBaseUrl } from '../../lib/api/config';

type Step = 'form' | 'sent';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  const isEmail = identifier.includes('@');
  const isPhone = !isEmail && isValidVNPhone(identifier);
  const isValid = identifier.trim().length > 0 && (isEmail || isPhone);

  async function handleSubmit() {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    setLoading(true);
    setError(null);

    try {
      const baseUrl = await loadApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      // Always show success regardless of result (anti-enumeration)
      setStep('sent');
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'sent') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32 }}>
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#64748b" />
            <Text style={{ fontSize: 14, color: '#64748b', marginLeft: 6 }}>Quay lại</Text>
          </TouchableOpacity>

          {/* Success icon */}
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <Ionicons name="mail-outline" size={32} color="#22c55e" />
          </View>

          <Text style={{ fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>
            Kiểm tra email
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', lineHeight: 22, marginBottom: 24 }}>
            Nếu tài khoản tồn tại với thông tin này, hệ thống sẽ gửi cho bạn hướng dẫn đặt lại mật khẩu. Kiểm tra hộp thư đến và thư mục Spam.
          </Text>

          <View style={{
            backgroundColor: '#f8fafc', borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24,
          }}>
            <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }}>
              💡 <Text style={{ fontWeight: '600' }}>Lưu ý:</Text> Bạn sẽ nhận được Email hướng dẫn đặt lại mật khẩu và đường link xác nhận, hãy kiểm tra hộp thư đến và thư mục Spam (nếu có).
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => { setStep('form'); setIdentifier(''); }}
            style={{ marginBottom: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, color: '#fa5908', fontWeight: '600' }}>
              Thử lại với thông tin khác
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, color: '#64748b' }}>Quay lại đăng nhập</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#64748b" />
            <Text style={{ fontSize: 14, color: '#64748b', marginLeft: 6 }}>Quay lại</Text>
          </TouchableOpacity>

          {/* Header */}
          <Text style={{ fontSize: 26, fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>
            Quên mật khẩu?
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', lineHeight: 22, marginBottom: 32 }}>
            Nhập email hoặc số điện thoại để nhận hướng dẫn đặt lại mật khẩu.
          </Text>

          {/* Input */}
          <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600', marginBottom: 8 }}>
            Email hoặc số điện thoại
          </Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: identifier && !isValid ? '#f87171' : '#cbd5e1',
            borderRadius: 12,
            backgroundColor: '#ffffff',
            paddingHorizontal: 14,
            height: 52,
            marginBottom: 8,
          }}>
            <Ionicons
              name={isEmail ? 'mail-outline' : isPhone ? 'call-outline' : 'person-outline'}
              size={18}
              color="#94a3b8"
              style={{ marginRight: 10 }}
            />
            <TextInput
              placeholder="linh@gmail.com hoặc 0901234567"
              placeholderTextColor="#cbd5e1"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 15, color: '#0f172a' }}
            />
          </View>
          {identifier && !isValid && (
            <Text style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
              Vui lòng nhập email hợp lệ hoặc số điện thoại Việt Nam
            </Text>
          )}

          {/* Error */}
          {error && (
            <View style={{
              backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
              borderWidth: 1, borderColor: '#fecaca', marginBottom: 16,
            }}>
              <Text style={{ fontSize: 13, color: '#dc2626' }}>{error}</Text>
            </View>
          )}

          {/* Note about web browser */}
          <View style={{
            backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
            borderWidth: 1, borderColor: '#fde68a', marginBottom: 24,
          }}>
            <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 18 }}>
              Bạn sẽ nhận được email hướng dẫn đặt lại mật khẩu, hãy kiểm tra hộp thư đến và thư mục Spam (nếu có).
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !isValid}
            activeOpacity={0.85}
            style={{
              backgroundColor: isValid ? '#fa5908' : '#e2e8f0',
              height: 52,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              shadowColor: isValid ? '#fa5908' : 'transparent',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: isValid ? 3 : 0,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={{
                  color: isValid ? '#ffffff' : '#94a3b8',
                  fontWeight: '600',
                  fontSize: 15,
                }}>
                  Xác nhận
                </Text>
                {isValid && <Ionicons name="arrow-forward" size={16} color="#fff" />}
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
