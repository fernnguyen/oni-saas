import {useEffect} from 'react';
import {Stack, SplashScreen} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useColorScheme} from 'nativewind';
import {StyleSheet} from 'react-native-css-interop';
import {Text, TextInput} from 'react-native';
import {initializeLocalDatabase} from '../lib/db/client';
import {
 useFonts, 
 Inter_400Regular, 
 Inter_500Medium, 
 Inter_600SemiBold, 
 Inter_700Bold, 
 Inter_800ExtraBold, 
 Inter_900Black 
} from '@expo-google-fonts/inter';
import {NotificationProvider} from '../lib/notifications/NotificationContext';
import {initializePushNotifications, addNotificationResponseListener} from '../lib/notifications/push';
import {KeepAliveManager} from '../lib/sync/KeepAliveManager';
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

// Thiết lập default font family Inter-Regular cho mọi phần tử Text và TextInput trong React Native
try {
 if (!(Text as any).defaultProps) {
 (Text as any).defaultProps = {};
}
 if (!(Text as any).defaultProps.style) {
 (Text as any).defaultProps.style = {};
}
 const existingTextStyle = (Text as any).defaultProps.style;
 (Text as any).defaultProps.style = {
 ...existingTextStyle,
 fontFamily: 'Inter-Regular',
};

 if (!(TextInput as any).defaultProps) {
 (TextInput as any).defaultProps = {};
}
 if (!(TextInput as any).defaultProps.style) {
 (TextInput as any).defaultProps.style = {};
}
 const existingTextInputStyle = (TextInput as any).defaultProps.style;
 (TextInput as any).defaultProps.style = {
 ...existingTextInputStyle,
 fontFamily: 'Inter-Regular',
};
} catch (e) {
 console.warn('Không thể thiết lập default font family:', e);
}

export default function RootLayout() {
 const {setColorScheme} = useColorScheme();
 
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
    
    // Khởi động trình đồng bộ nền keep-alive
    KeepAliveManager.initialize();

    // Ép buộc NativeWind luôn sử dụng chế độ Sáng (Light Theme)
    setColorScheme('light');

    // Khởi tạo Push Notifications (Tầng 2)
    // initializePushNotifications tự kiểm tra expo-notifications có sẵn không
    initializePushNotifications().catch((err) => {
      console.warn('[RootLayout] Push notification init skipped:', err);
    });

    // Xử lý khi user tap vào push notification
    const cleanup = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.path) {
        // Navigate đến path cụ thể nếu notification có metadata.path
        // VD: data.path = '/(tabs)/pos'
        const { router } = require('expo-router');
        router.push(data.path);
      }
    });

    return () => {
      KeepAliveManager.destroy();
      if (typeof cleanup === 'function') cleanup();
    };
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
 <Stack screenOptions={{headerShown: false}}>
 <Stack.Screen name="index" />
 <Stack.Screen name="(auth)" />
 <Stack.Screen name="(tabs)" />
 </Stack>
 </SafeAreaProvider>
 );
}

