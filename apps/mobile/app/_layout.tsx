import { useEffect } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { StyleSheet } from 'react-native-css-interop';
import { initializeLocalDatabase } from '../lib/db/client';
import { 
  useFonts, 
  Inter_400Regular, 
  Inter_500Medium, 
  Inter_600SemiBold, 
  Inter_700Bold, 
  Inter_800ExtraBold, 
  Inter_900Black 
} from '@expo-google-fonts/inter';
import '../global.css';

// Ngăn Splash Screen tự động ẩn để đợi load font
try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch (e) {}

try {
  (StyleSheet as any).setFlag?.('darkMode', 'class');
} catch (e) {
  console.warn('Không thể setFlag darkMode class ở top-level:', e);
}

export default function RootLayout() {
  const { setColorScheme } = useColorScheme();
  
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Inter-ExtraBold': Inter_800ExtraBold,
    'Inter-Black': Inter_900Black,
  });

  useEffect(() => {
    // Khởi tạo cơ sở dữ liệu SQLite nội địa đầu phiên
    initializeLocalDatabase();
    
    // Ép buộc NativeWind luôn sử dụng chế độ Sáng (Light Theme)
    setColorScheme('light');
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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
