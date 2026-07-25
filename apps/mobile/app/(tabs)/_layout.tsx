import React, {useState, useEffect} from 'react';
import {Tabs, usePathname} from 'expo-router';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {Platform, TouchableOpacity, View, Text, DeviceEventEmitter, BackHandler} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NotificationProvider} from '../../lib/notifications/NotificationContext';
import {usePermissions} from '../../lib/auth/PermissionsContext';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export default function TabLayout() {
  return (
    <NotificationProvider>
      <TabLayoutContent />
    </NotificationProvider>
  );
}

function TabLayoutContent() {
  const {hasPermission} = usePermissions();
  const [posLabel, setPosLabel] = useState('Bán hàng');
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  useEffect(() => {
    const onBackPress = () => {
      // Nếu người dùng đang ở tab đầu tiên (Trang chủ), nhấn back sẽ thoát app thay vì quay về select-branch
      if (pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/(tabs)/index') {
        BackHandler.exitApp();
        return true; // Đã xử lý, chặn bubbling lên root Stack
      }
      return false; // Cho phép React Navigation tự xử lý (quay lại tab mặc định hoặc đóng popup/modal)
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      subscription.remove();
    };
  }, [pathname]);

  useEffect(() => {
    const loadIndustry = async () => {
      try {
        const industry = await AsyncStorage.getItem('active_shop_industry');
        if (industry) {
          const ind = industry.toLowerCase();
          // Lodging, F&B, Billiards, Sports court, hourly service -> "Lễ tân"
          if (['lodging', 'fnb', 'billiards', 'sports_court', 'service_hourly'].includes(ind)) {
            setPosLabel('Lễ tân');
          } else {
            setPosLabel('Bán hàng');
          }
        }
      } catch (err) {
        console.warn('Lỗi khi nạp industry trong TabLayout:', err);
      }
    };
    loadIndustry();

    const subscription = DeviceEventEmitter.addListener('branch-changed', () => {
      loadIndustry();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fa5908', // Màu cam thương hiệu ONI
        tabBarInactiveTintColor: '#94a3b8', // Slate-400
        tabBarLabelPosition: 'below-icon', // Force vertical stacked layout on tablets
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
          height: Platform.OS === 'ios' 
            ? (48 + Math.max(insets.bottom, 20)) 
            : (48 + Math.max(insets.bottom, 8)),
          paddingBottom: Platform.OS === 'ios' 
            ? Math.max(insets.bottom, 20) 
            : Math.max(insets.bottom, 8),
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#000000',
          shadowOffset: {width: 0, height: -3},
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      {/* 1. TRANG CHỦ */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 2. ĐƠN HÀNG */}
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Đơn hàng',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="manual-order"
        options={{
          href: null,
          title: 'Ghi đơn',
        }}
      />

      {/* 3. BÁN HÀNG POS / QUÉT MÃ (Ẩn nếu thiếu quyền pos.use) */}
      <Tabs.Screen
        name="pos"
        listeners={{
          tabPress: (e) => {
            const isPosScreen = pathname === '/pos' || pathname === '/(tabs)/pos' || pathname === '/(tabs)/pos/';
            if (isPosScreen) {
              DeviceEventEmitter.emit('open-barcode-scanner');
            }
          },
        }}
        options={{
          href: hasPermission('pos.use') ? undefined : null,
          title: (pathname === '/pos' || pathname === '/(tabs)/pos' || pathname === '/(tabs)/pos/') ? 'Quét mã' : posLabel,
          tabBarIcon: () => {
            const isPosScreen = pathname === '/pos' || pathname === '/(tabs)/pos' || pathname === '/(tabs)/pos/';
            return (
              <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ height: 22, width: 22 }} />
                <View
                  style={{
                    position: 'absolute',
                    top: -26,
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: '#fa5908',
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#fa5908',
                    shadowOffset: {width: 0, height: 4},
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                    elevation: 6,
                    borderWidth: 2.5,
                    borderColor: '#ffffff',
                  }}
                >
                  {isPosScreen ? (
                    <Ionicons name="scan" size={24} color="white" />
                  ) : (
                    <MaterialCommunityIcons name="cash-register" size={22} color="white" />
                  )}
                </View>
              </View>
            );
          },
        }}
      />

      {/* 4. CÔNG NỢ */}
      <Tabs.Screen
        name="debt"
        options={{
          href: (hasPermission('debt.view') || hasPermission('customers.view')) ? undefined : null,
          title: 'Công nợ',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 5. CÀI ĐẶT */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
