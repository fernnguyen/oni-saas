import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { StyleSheet } from 'react-native-css-interop';
import { initializeLocalDatabase } from '../lib/db/client';
import '../global.css';

try {
  (StyleSheet as any).setFlag?.('darkMode', 'class');
} catch (e) {
  console.warn('Không thể setFlag darkMode class ở top-level:', e);
}

export default function RootLayout() {
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    // Khởi tạo cơ sở dữ liệu SQLite nội địa đầu phiên
    initializeLocalDatabase();
    
    // Ép buộc NativeWind luôn sử dụng chế độ Sáng (Light Theme)
    setColorScheme('light');
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
