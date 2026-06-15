import React, { useState } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../lib/notifications/NotificationContext';
import * as Haptics from 'expo-haptics';

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

export default function NotificationCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'all' | 'qr' | 'other'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useNotifications();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await refreshNotifications();
    } catch (err) {
      console.warn('Failed to refresh notifications:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleNotificationPress = (n: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    markAsRead(n.id);

    const nType = n.type as string;
    if (nType === 'qr_order' || nType === 'qr_session' || nType === 'QR_ORDER_CREATED' || nType === 'QR_SESSION_CREATED' || (n.metadata?.path && n.metadata.path.includes('/channels/pos'))) {
      router.push('/qr-orders');
      return;
    }

    // Redirect to path if configured in metadata
    if (n.metadata?.path) {
      if (isWebOnlyNotification(n.type, n.metadata.path)) {
        Alert.alert(
          'Chi tiết thông báo',
          'Tính năng này hiện chỉ hỗ trợ trên phiên bản Web. Vui lòng truy cập Web để xử lý.'
        );
        return;
      }
      try {
        const targetRoute = mapPathToMobileRoute(n.metadata.path, n.metadata);
        router.push(targetRoute);
      } catch (err) {
        console.warn('Failed to route:', err);
        Alert.alert(
          'Không tìm thấy đường dẫn',
          'Đường dẫn liên kết với thông báo này không khả dụng trên ứng dụng.'
        );
      }
    }
  };

  const handleMarkAllAsRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    markAllAsRead();
  };

  // Filter list based on tabs
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'qr') return n.type === 'qr_order' || n.type === 'qr_session';
    if (activeTab === 'other') return n.type !== 'qr_order' && n.type !== 'qr_session';
    return true;
  });

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.back();
            }}
            className="p-2 bg-slate-50 border border-slate-100 rounded-xl mr-3"
          >
            <Ionicons name="chevron-back" size={20} color="#fa5908" />
          </TouchableOpacity>
          <View>
            <Text className="text-base font-bold text-slate-800 font-sans">Thông báo</Text>
            {unreadCount > 0 && (
              <Text className="text-xxs text-orange-500 font-semibold mt-0.5">
                Bạn có {unreadCount} tin chưa đọc
              </Text>
            )}
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleMarkAllAsRead}
            className="px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-xl active:bg-orange-100"
          >
            <Text className="text-xxs text-orange-600 font-bold">ĐỌC TẤT CẢ</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View className="flex-row bg-white p-1 border-b border-slate-100 gap-1.5 px-4">
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'qr', label: 'Yêu cầu QR' },
          { key: 'other', label: 'Cảnh báo' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setActiveTab(tab.key as any);
              }}
              className="flex-1 py-2 items-center justify-center rounded-xl border"
              style={
                isActive
                  ? {
                      backgroundColor: '#fef3c7',
                      borderColor: '#fde68a',
                    }
                  : {
                      backgroundColor: '#f8fafc',
                      borderColor: '#e2e8f0',
                    }
              }
            >
              <Text
                className={`text-xs font-bold ${
                  isActive ? 'text-amber-700' : 'text-slate-500'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'qr' && (
        <View className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex-row justify-between items-center shadow-sm">
          <View className="flex-1 mr-2">
            <Text className="text-xxs font-bold text-amber-800 uppercase tracking-wider">Quản lý gọi món QR</Text>
            <Text className="text-[10px] text-amber-700 font-medium mt-0.5">Xác nhận nhanh các yêu cầu gọi món & mở bàn của khách hàng.</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push('/qr-orders');
            }}
            className="px-3 py-1.5 bg-amber-500 rounded-lg active:bg-amber-600"
          >
            <Text className="text-white text-xxs font-bold">Mở trang</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications List */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isLoading}
            onRefresh={handleRefresh}
            colors={['#fa5908']}
            tintColor="#fa5908"
          />
        }
      >
        {filteredNotifications.map((n) => {
          const isUnread = n.status === 'unread';
          const nType = n.type as string;

          // Map colors & icons based on type
          let iconName = 'notifications-outline';
          let iconBg = 'bg-blue-50';
          let iconColor = '#3b82f6';

          if (nType === 'qr_order' || nType === 'QR_ORDER_CREATED') {
            iconName = 'restaurant-outline';
            iconBg = 'bg-orange-50';
            iconColor = '#fa5908';
          } else if (nType === 'qr_session' || nType === 'QR_SESSION_CREATED') {
            iconName = 'enter-outline';
            iconBg = 'bg-emerald-50';
            iconColor = '#10b981';
          } else if (nType === 'low_stock') {
            iconName = 'warning-outline';
            iconBg = 'bg-amber-50';
            iconColor = '#f59e0b';
          } else if (nType === 'system' || nType === 'system_broadcast' || nType === 'CUSTOMER_CREATED') {
            iconName = 'cube-outline';
            iconBg = 'bg-indigo-50';
            iconColor = '#6366f1';
          } else if (nType === 'payment' || nType === 'PAYMENT_RECEIVED' || nType === 'ORDER_CREATED') {
            iconName = 'card-outline';
            iconBg = 'bg-green-50';
            iconColor = '#22c55e';
          } else if (nType === 'order_expiring' || nType === 'ORDER_CANCELLED' || nType === 'ORDER_RETURNED') {
            iconName = 'time-outline';
            iconBg = 'bg-red-50';
            iconColor = '#ef4444';
          } else if (nType === 'debt_alert') {
            iconName = 'alert-circle-outline';
            iconBg = 'bg-rose-50';
            iconColor = '#f43f5e';
          } else if (nType === 'return_approval' || nType === 'purchase_approval') {
            iconName = 'checkmark-circle-outline';
            iconBg = 'bg-violet-50';
            iconColor = '#8b5cf6';
          } else if (nType === 'booking') {
            iconName = 'calendar-outline';
            iconBg = 'bg-cyan-50';
            iconColor = '#06b6d4';
          }

          return (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.8}
              onPress={() => handleNotificationPress(n)}
              className={`p-4 mb-2.5 bg-white rounded-2xl flex-row items-start border ${
                isUnread ? 'border-orange-200' : 'border-slate-100'
              }`}
              style={
                isUnread
                  ? {
                      shadowColor: '#fa5908',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.04,
                      shadowRadius: 3,
                      elevation: 1,
                    }
                  : {
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.02,
                      shadowRadius: 2,
                      elevation: 0,
                    }
              }
            >
              <View className="flex-row items-center mr-3 mt-1">
                {isUnread && (
                  <View className="w-2 h-2 bg-orange-500 rounded-full mr-2" />
                )}
                <View className={`${iconBg} w-9 h-9 rounded-xl items-center justify-center`}>
                  <Ionicons name={iconName as any} size={15} color={iconColor} />
                </View>
              </View>

              <View className="flex-1">
                <View className="flex-row justify-between items-center">
                  <Text
                    className={`text-sm font-bold ${
                      isUnread ? 'text-slate-800' : 'text-slate-500'
                    }`}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    {n.title}
                  </Text>
                  <Text className="text-xxs text-slate-400 font-semibold">
                    {new Date(n.createdAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  className={`text-xs mt-1.5 font-medium leading-relaxed ${
                    isUnread ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {n.description}
                </Text>
                <Text className="text-[9px] text-slate-400 font-bold mt-2.5 uppercase tracking-wider">
                  {new Date(n.createdAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {filteredNotifications.length === 0 && (
          <View className="py-24 items-center justify-center bg-white rounded-2xl border border-slate-100">
            <Ionicons name="notifications-off-outline" size={42} color="#cbd5e1" />
            <Text className="text-sm text-slate-400 font-bold mt-3 font-sans">
              Hộp thư thông báo trống
            </Text>
            <Text className="text-xs text-slate-400 mt-1 font-medium font-sans">
              Chúng tôi sẽ thông báo khi có hoạt động mới
            </Text>
            {activeTab === 'qr' && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push('/qr-orders');
                }}
                className="mt-5 px-5 py-2.5 bg-amber-500 rounded-xl active:bg-amber-600"
              >
                <Text className="text-white text-xs font-bold">Mở quản lý đơn QR</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
