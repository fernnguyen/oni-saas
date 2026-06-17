import {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useRouter} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../lib/supabase';

export default function IndexPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const {data: {session}} = await supabase.auth.getSession();
        if (session) {
          // Kiểm tra xem đã có chi nhánh active được chọn trước đó chưa
          const activeShopId = await AsyncStorage.getItem('active_shop_id');
          if (activeShopId) {
            // Đã chọn chi nhánh -> Vào thẳng Dashboard chính
            router.replace('/(tabs)');
          } else {
            // Đã đăng nhập nhưng chưa chọn chi nhánh -> Vào màn chọn chi nhánh
            router.replace('/(auth)/select-branch');
          }
        } else {
          // Chưa đăng nhập -> Vào màn hình Login
          router.replace('/(auth)/login');
        }
      } catch (err) {
        console.error('Lỗi kiểm tra session:', err);
        router.replace('/(auth)/login');
      } finally {
        setIsChecking(false);
      }
    };
    checkSession();
  }, []);

  if (isChecking) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc'}}>
        <ActivityIndicator size="large" color="#fa5908" />
      </View>
    );
  }

  return null;
}

