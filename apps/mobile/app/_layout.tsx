import {useEffect} from 'react';
import {Stack, SplashScreen} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useColorScheme} from 'nativewind';
import {StyleSheet} from 'react-native-css-interop';
import {Text, TextInput, Platform, Alert} from 'react-native';
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
import {PermissionsProvider} from '../lib/auth/PermissionsContext';
import {initializePushNotifications, addNotificationResponseListener} from '../lib/notifications/push';
import {KeepAliveManager} from '../lib/sync/KeepAliveManager';
import {VersionCheckGuard} from '../components/VersionCheckGuard';
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

    // Xử lý khi user tap vào push notification
    const cleanup = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.path) {
        const isWebOnlyNotification = (type?: string, path?: string) => {
          const webOnlyTypes = ['purchase_approval', 'return_approval', 'debt_alert', 'low_stock'];
          if (type && webOnlyTypes.includes(type)) {
            return true;
          }
          if (path) {
            const webOnlyPathKeywords = ['/p2p/', '/debt', '/inventory', '/reports'];
            const pathLower = path.toLowerCase();
            if (webOnlyPathKeywords.some(keyword => pathLower.includes(keyword))) {
              return true;
            }
          }
          return false;
        };

        const mapPathToMobileRoute = (path?: string, metadata?: any) => {
          if (!path) return '/(tabs)';
          if (path.startsWith('/(tabs)/') || path === '/(tabs)') {
            return path;
          }
          if (path.includes('/orders')) {
            const orderId = metadata?.order_id || '';
            if (orderId) {
              return `/(tabs)/orders?id=${orderId}`;
            }
            const searchMatch = path.match(/[?&]search=([^&]+)/);
            if (searchMatch) {
              return `/(tabs)/orders?id=${searchMatch[1]}`;
            }
            return '/(tabs)/orders';
          }
          if (path.includes('/cashbook')) {
            return '/cashbook';
          }
          if (path.includes('/warehouse')) {
            return '/warehouse';
          }
          return path;
        };

        if (isWebOnlyNotification(data?.type, data?.path)) {
          Alert.alert(
            'Chi tiết thông báo',
            'Tính năng này hiện chỉ hỗ trợ trên phiên bản Web. Vui lòng truy cập Web để xử lý.'
          );
          return;
        }

        try {
          const { router } = require('expo-router');
          const targetRoute = mapPathToMobileRoute(data.path, data);
          router.push(targetRoute);
        } catch (err) {
          console.warn('Failed to route from push notification:', err);
          Alert.alert(
            'Không tìm thấy đường dẫn',
            'Đường dẫn liên kết với thông báo này không khả dụng trên ứng dụng.'
          );
        }
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
   <PermissionsProvider>
     <NotificationProvider>
       <VersionCheckGuard>
         <StatusBar style="dark" />
         <Stack screenOptions={{headerShown: false}}>
           <Stack.Screen name="index" options={{ gestureEnabled: false }} />
           <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
           <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
         </Stack>
       </VersionCheckGuard>
     </NotificationProvider>
   </PermissionsProvider>
  </SafeAreaProvider>
 );
}
