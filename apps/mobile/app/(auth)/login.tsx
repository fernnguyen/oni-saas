import React, { useState, useEffect } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const router = useRouter();
  const [tenantCode, setTenantCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Tự động tải mã gian hàng (Tenant ID) đã lưu ở phiên làm việc trước
  useEffect(() => {
    const loadSavedTenantCode = async () => {
      try {
        const savedCode = await AsyncStorage.getItem('saved_tenant_code');
        if (savedCode) {
          setTenantCode(savedCode);
        }
      } catch (error) {
        console.error('Không thể tải mã gian hàng đã lưu:', error);
      }
    };
    loadSavedTenantCode();
  }, []);

  // 2. Xử lý Đăng nhập & Lưu trữ Mã gian hàng cục bộ
  const handleLogin = async () => {
    if (!tenantCode || !email || !password) {
      alert('Vui lòng nhập đầy đủ thông tin đăng nhập!');
      return;
    }
    
    setIsLoading(true);
    try {
      // Lưu lại mã gian hàng để tự động điền ở phiên sau
      await AsyncStorage.setItem('saved_tenant_code', tenantCode);
    } catch (error) {
      console.error('Không thể lưu mã gian hàng:', error);
    }

    setTimeout(() => {
      setIsLoading(false);
      // Chuyển hướng sang màn hình chọn Chi nhánh (Branch Selection)
      router.push('/(auth)/select-branch');
    }, 1200);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 justify-center px-6">
      
      {/* 1. LOGO THƯƠNG HIỆU LỚN & ĐẲNG CẤP */}
      <View className="items-center mb-8 animate-fade-in">
        <View className="bg-orange-500 w-20 h-20 rounded-[28px] items-center justify-center shadow-lg shadow-orange-500/25">
          <Text className="text-white text-4xl font-bold italic">O</Text>
        </View>
        <Text className="text-4xl font-bold text-slate-800 mt-4 tracking-wider">ONI CLOUD</Text>
        <Text className="text-sm text-slate-400 mt-1.5 font-semibold text-center leading-relaxed">
          Hệ thống quản trị gian hàng đa nền tảng di động
        </Text>
      </View>

      {/* 2. FORM ĐĂNG NHẬP (Cỡ chữ lớn hơn, nhập liệu thoáng hơn) */}
      <View className="bg-white p-6 rounded-[36px] border border-slate-200 shadow-xl shadow-slate-100">
        <Text className="text-lg font-bold text-slate-800 mb-5">Đăng nhập tài khoản</Text>

        {/* Mã Cửa hàng (Tenant Code - Có tự động điền) */}
        <Text className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2.5">
          Mã gian hàng (Tenant ID)
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4 py-3.5 rounded-2xl border border-slate-200/80 mb-4.5">
          <Ionicons name="storefront-outline" size={18} color="#94a3b8" />
          <TextInput
            placeholder="Ten-cua-hang"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-2.5 text-sm font-semibold text-slate-800 p-0"
            value={tenantCode}
            onChangeText={setTenantCode}
            autoCapitalize="none"
          />
          <Text className="text-sm text-slate-400 font-bold ml-1.5">.oni.vn</Text>
        </View>

        {/* Tên Đăng nhập / Email */}
        <Text className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2.5 mt-2">
          Tên đăng nhập / Email
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4 py-3.5 rounded-2xl border border-slate-200/80 mb-4.5">
          <Ionicons name="mail-outline" size={18} color="#94a3b8" />
          <TextInput
            placeholder="admin@oni.vn"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-2.5 text-sm font-semibold text-slate-800 p-0"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Mật khẩu */}
        <Text className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2.5 mt-2">
          Mật khẩu
        </Text>
        <View className="flex-row items-center bg-slate-50 px-4 py-3.5 rounded-2xl border border-slate-200/80 mb-6">
          <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" />
          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-2.5 text-sm font-semibold text-slate-800 p-0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* BỐ CỤC NÚT ĐĂNG NHẬP & PHÍM TẮT SINH TRẮC HỌC CỰC KỲ PREMIUM */}
        <View className="flex-row items-center">
          <TouchableOpacity 
            className="flex-1 bg-orange-500 active:bg-orange-600 h-14 rounded-2xl items-center justify-center shadow-md flex-row mr-3"
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Text className="text-white font-bold text-base mr-1.5">Đăng nhập</Text>
                <Ionicons name="arrow-forward" size={18} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* Phím tắt Đăng nhập Sinh trắc học (Face ID / Vân tay) */}
          <TouchableOpacity 
            className="bg-orange-50 border border-orange-200 w-14 h-14 rounded-2xl items-center justify-center active:bg-orange-100 shadow-sm"
            onPress={() => alert('Đăng nhập sinh trắc học (Face ID / Vân tay) thành công! Mời chọn chi nhánh.')}
          >
            <Ionicons name="finger-print" size={26} color="#fa5908" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. PHẦN CHÂN TRANG (Chỉ giữ Quên mật khẩu, Bỏ Đăng ký) */}
      <View className="mt-8 items-center">
        <TouchableOpacity>
          <Text className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Quên mật khẩu?
          </Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}
