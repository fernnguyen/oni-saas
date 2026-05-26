import React, { useState, useEffect } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [tenantCode, setTenantCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  // 1. Tự động tải mã gian hàng (Tenant ID) đã lưu ở phiên làm việc trước
  useEffect(() => {
    const loadSavedTenantCode = async () => {
      try {
        const savedCode = await AsyncStorage.getItem('saved_tenant_code');
        if (savedCode) {
          setTenantCode(savedCode);
        }
        
        // Kiểm tra xem đã có email đã lưu hay chưa để hỗ trợ Biometrics placeholder
        const savedEmail = await AsyncStorage.getItem('saved_email');
        if (savedEmail) {
          setEmail(savedEmail);
          setIsBiometricAvailable(true);
        }
      } catch (error) {
        console.error('Không thể tải dữ liệu đăng nhập đã lưu:', error);
      }
    };
    loadSavedTenantCode();
  }, []);

  // 2. Xử lý Đăng nhập với Supabase Auth thực tế
  const handleLogin = async () => {
    if (!tenantCode || !email || !password) {
      Alert.alert('Thông báo', 'Vui lòng nhập đầy đủ thông tin đăng nhập!');
      return;
    }
    
    setIsLoading(true);
    try {
      const trimmedTenant = tenantCode.trim().toLowerCase();
      const trimmedEmail = email.trim();

      // Lưu lại mã gian hàng và email đăng nhập thành công
      await AsyncStorage.setItem('saved_tenant_code', trimmedTenant);
      await AsyncStorage.setItem('saved_email', trimmedEmail);
      await AsyncStorage.setItem('active_tenant_code', trimmedTenant);

      // Gọi Supabase Auth thực tế
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: password,
      });

      if (error) {
        Alert.alert('Đăng nhập thất bại', error.message);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      // Chuyển hướng sang màn hình chọn Chi nhánh (Branch Selection)
      router.push('/(auth)/select-branch');
    } catch (error: any) {
      console.error('Lỗi khi đăng nhập:', error);
      Alert.alert('Lỗi kết nối', error.message || 'Không thể kết nối đến máy chủ xác thực.');
      setIsLoading(false);
    }
  };

  // 3. Giả lập Đăng nhập dùng Sinh trắc học (Face ID / Vân tay)
  const handleBiometricLogin = async () => {
    if (!tenantCode) {
      Alert.alert('Thông báo', 'Vui lòng điền mã gian hàng trước khi sử dụng sinh trắc học.');
      return;
    }

    setIsLoading(true);
    // Giả lập quét vân tay / khuôn mặt trong 1 giây
    setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Nếu phiên cũ vẫn hợp lệ, cho phép vào thẳng
          await AsyncStorage.setItem('saved_tenant_code', tenantCode.trim().toLowerCase());
          await AsyncStorage.setItem('active_tenant_code', tenantCode.trim().toLowerCase());
          setIsLoading(false);
          router.push('/(auth)/select-branch');
        } else {
          setIsLoading(false);
          Alert.alert(
            'Xác thực sinh trắc học',
            'Đã quét Vân tay / Face ID thành công!\n\n(Placeholder: Vui lòng nhập mật khẩu lần đầu để liên kết sinh trắc học thiết bị này)'
          );
        }
      } catch (err) {
        setIsLoading(false);
        Alert.alert('Lỗi', 'Xác thực sinh trắc học thất bại.');
      }
    }, 1000);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 justify-center px-6">
      
      {/* 1. LOGO THƯƠNG HIỆU LỚN & ĐẲNG CẤP */}
      <View className="items-center mb-10">
        <View className="bg-orange-500 w-24 h-24 rounded-[32px] items-center justify-center shadow-lg shadow-orange-500/25">
          <Text className="text-white text-5xl font-black italic">O</Text>
        </View>
        {/* Tăng kích cỡ chữ tiêu đề thương hiệu cực kỳ hoành tráng */}
        <Text className="text-5xl font-black text-slate-800 mt-5 tracking-wider">ONI CLOUD</Text>
        <Text className="text-base text-slate-500 mt-2 font-bold text-center leading-relaxed px-4">
          Hệ thống quản trị doanh nghiệp đa nền tảng
        </Text>
      </View>

      {/* 2. FORM ĐĂNG NHẬP (Cỡ chữ lớn hơn rất nhiều, thoáng rộng, dễ bấm) */}
      <View className="bg-white p-7 rounded-[40px] border border-slate-200 shadow-xl shadow-slate-100">
        <Text className="text-2xl font-black text-slate-800 mb-6">Đăng nhập</Text>

        {/* Mã Cửa hàng (Tenant Code - Có tự động điền) */}
        <Text className="text-sm text-slate-500 font-extrabold uppercase tracking-wider mb-2">
          Mã gian hàng (Tenant ID)
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4.5 py-4 rounded-2xl border border-slate-200/90 mb-5">
          <Ionicons name="storefront" size={20} color="#94a3b8" />
          <TextInput
            placeholder="ten-cua-hang"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-3 text-base font-bold text-slate-800 p-0"
            value={tenantCode}
            onChangeText={setTenantCode}
            autoCapitalize="none"
            style={{ outlineStyle: 'none' } as any}
          />
          <Text className="text-base text-slate-400 font-extrabold ml-2">.oni.vn</Text>
        </View>

        {/* Tên Đăng nhập / Email */}
        <Text className="text-sm text-slate-500 font-extrabold uppercase tracking-wider mb-2">
          Tên đăng nhập / Email
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4.5 py-4 rounded-2xl border border-slate-200/90 mb-5">
          <Ionicons name="mail" size={20} color="#94a3b8" />
          <TextInput
            placeholder="admin@oni.vn"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-3 text-base font-bold text-slate-800 p-0"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{ outlineStyle: 'none' } as any}
          />
        </View>

        {/* Mật khẩu */}
        <Text className="text-sm text-slate-500 font-extrabold uppercase tracking-wider mb-2">
          Mật khẩu
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4.5 py-4 rounded-2xl border border-slate-200/90 mb-7">
          <Ionicons name="lock-closed" size={20} color="#94a3b8" />
          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-3 text-base font-bold text-slate-800 p-0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={{ outlineStyle: 'none' } as any}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="px-1">
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* BỐ CỤC NÚT ĐĂNG NHẬP & PHÍM TẮT SINH TRẮC HỌC PREMIUM */}
        <View className="flex-row items-center">
          <TouchableOpacity 
            className="flex-1 bg-orange-500 active:bg-orange-600 h-15 rounded-2xl items-center justify-center shadow-md flex-row mr-3.5"
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Text className="text-white font-extrabold text-lg mr-2">Đăng nhập</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* Phím tắt Đăng nhập Sinh trắc học (Face ID / Vân tay) */}
          <TouchableOpacity 
            className="bg-orange-50 border border-orange-200 w-15 h-15 rounded-2xl items-center justify-center active:bg-orange-100 shadow-sm"
            onPress={handleBiometricLogin}
            disabled={isLoading}
          >
            <Ionicons name="finger-print" size={32} color="#fa5908" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. PHẦN CHÂN TRANG (Chỉ giữ Quên mật khẩu, Bỏ Đăng ký hoàn toàn) */}
      <View className="mt-10 items-center">
        <TouchableOpacity>
          <Text className="text-sm text-slate-450 font-bold uppercase tracking-widest">
            Quên mật khẩu?
          </Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}
