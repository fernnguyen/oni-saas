import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import '../global.css';

export default function RootLayout() {
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
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
