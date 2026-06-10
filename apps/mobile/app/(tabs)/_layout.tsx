import React, {useState, useEffect} from 'react';
import {Tabs} from 'expo-router';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {Platform, TouchableOpacity, View, Text, DeviceEventEmitter} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NotificationProvider} from '../../lib/notifications/NotificationContext';
import {PermissionsProvider, usePermissions} from '../../lib/auth/PermissionsContext';

export default function TabLayout() {
  return (
    <PermissionsProvider>
      <NotificationProvider>
        <TabLayoutContent />
      </NotificationProvider>
    </PermissionsProvider>
  );
}

function TabLayoutContent() {
  const {hasPermission} = usePermissions();
  const [posLabel, setPosLabel] = useState('Bán hàng');

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
          height: Platform.OS === 'ios' ? 68 : 56, // Chiều cao chuẩn gọn gàng
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
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
      {/* 1. TỔNG QUAN */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tổng quan',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'analytics' : 'analytics-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 2. HÓA ĐƠN */}
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Hóa đơn',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 3. BÁN HÀNG POS (Ẩn nếu thiếu quyền pos.use) */}
      <Tabs.Screen
        name="pos"
        options={{
          href: hasPermission('pos.use') ? undefined : null,
          title: posLabel,
          tabBarIcon: () => (
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
                <MaterialCommunityIcons name="cash-register" size={22} color="white" />
              </View>
            </View>
          ),
        }}
      />

      {/* 4. KHÁCH HÀNG */}
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Khách hàng',
          tabBarIcon: ({color, focused}) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
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
