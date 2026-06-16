import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { getApiBaseUrl, getApiHeaders } from '../lib/api/config';
import { SyncManager } from '../lib/sync/SyncManager';
import { formatCurrency, formatDateTime } from '../lib/utils/format';
import { usePermissions } from '../lib/auth/PermissionsContext';

interface OrderRequestItem {
  product_id: string;
  product_name: string;
  qty: number | string;
  unit_price: number | string;
  line_total: number | string;
  variant_label?: string;
  modifiers?: any;
  modifier_total?: number | string;
}

interface QROrderRequest {
  id: string;
  tenant_id: string;
  branch_id: string;
  session_id: string;
  resource_id: string;
  items: OrderRequestItem[];
  status: 'pending' | 'accepted' | 'rejected';
  reject_reason?: string;
  created_at: string;
  updated_at: string;
}

interface QROrderingSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  resource_id: string;
  session_token: string;
  status: 'pending' | 'active' | 'completed';
  active: 'TRUE' | 'FALSE';
  created_at: string;
  updated_at: string;
}

export default function QROrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasPermission } = usePermissions();

  const [activeTab, setActiveTab] = useState<'sessions' | 'orders'>('sessions');
  const [shopId, setShopId] = useState('');
  const [tenantId, setTenantId] = useState('');
  
  const [requests, setRequests] = useState<QROrderRequest[]>([]);
  const [sessionRequests, setSessionRequests] = useState<QROrderingSession[]>([]);
  const [tablesMap, setTablesMap] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null); // Lưu ID của đơn đang xử lý
  const [excludedItemIds, setExcludedItemIds] = useState<Record<string, number[]>>({});

  // Toast Notification state
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ message, type });
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
      type === 'error' ? Haptics.NotificationFeedbackType.Error :
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
    ]).start(() => setToastMsg(null));
  };

  const loadIds = async () => {
    try {
      const sId = await AsyncStorage.getItem('active_shop_id') || '';
      const tId = await AsyncStorage.getItem('active_tenant_id') || '';
      setShopId(sId);
      setTenantId(tId);
      return { sId, tId };
    } catch (e) {
      console.warn('Lỗi load IDs từ AsyncStorage:', e);
      return { sId: '', tId: '' };
    }
  };

  const fetchTablesMap = async (sId: string) => {
    if (!sId) return;
    try {
      // 1. Ưu tiên tải từ SQLite offline trước
      if (Platform.OS !== 'web') {
        const localTables = await db.select().from(schema.location_resources);
        const tMap: Record<string, string> = {};
        localTables.forEach((r: any) => {
          if (r.id) tMap[r.id] = r.name;
        });
        setTablesMap(tMap);
      }

      // 2. Tải thêm từ server để đồng bộ mới nhất
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const tabRes = await fetch(`${url}/api/shops/${sId}/location-resources?limit=500`, { headers });
      if (tabRes.ok) {
        const result = await tabRes.json();
        const tMap: Record<string, string> = {};
        const rows = Array.isArray(result.data) ? result.data : [];
        rows.forEach((r: any) => {
          const id = r.resource_id || r.id || '';
          if (id) {
            tMap[id] = r.name;
          }
        });
        setTablesMap(prev => ({ ...prev, ...tMap }));
      }
    } catch (err) {
      console.warn('Lỗi khi tải sơ đồ bàn:', err);
    }
  };

  const fetchData = async (sId: string, silent = false) => {
    if (!sId) return;
    if (!silent) setIsLoading(true);

    try {
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();

      // Tải danh sách đơn hàng QR đang chờ duyệt
      const reqRes = await fetch(`${url}/api/shops/${sId}/qr-orders?status=pending`, { headers });
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data || []);
      }

      // Tải danh sách phiên gọi món QR đang chờ duyệt
      const sessRes = await fetch(`${url}/api/shops/${sId}/qr-sessions?status=pending`, { headers });
      if (sessRes.ok) {
        const data = await sessRes.json();
        setSessionRequests(data || []);
      }
    } catch (err) {
      console.error('Lỗi khi tải yêu cầu QR từ server:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const { sId } = await loadIds();
    if (sId) {
      await Promise.all([
        fetchTablesMap(sId),
        fetchData(sId, true)
      ]);
    }
    setIsRefreshing(false);
  };

  // Nạp dữ liệu lần đầu khi vào màn hình
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadIds().then(({ sId }) => {
        if (sId && active) {
          fetchTablesMap(sId);
          fetchData(sId);
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  // Lắng nghe Realtime từ Supabase (postgres_changes)
  useEffect(() => {
    if (!shopId) return;

    const channelName = `qr-orders-mobile-${shopId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_order_requests',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            const newReq = newRecord as QROrderRequest;
            if (newReq && newReq.status === 'pending') {
              setRequests((prev) => {
                if (prev.some((r) => r.id === newReq.id)) return prev;
                return [newReq, ...prev];
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              showToast('Có yêu cầu gọi món mới!', 'info');
            }
          } else if (eventType === 'UPDATE') {
            const req = newRecord as QROrderRequest;
            if (req) {
              if (req.status === 'pending') {
                setRequests((prev) => {
                  if (prev.some((r) => r.id === req.id)) return prev;
                  return [req, ...prev];
                });
              } else {
                setRequests((prev) => prev.filter((r) => r.id !== req.id));
              }
            }
          } else if (eventType === 'DELETE') {
            const req = oldRecord as QROrderRequest;
            if (req) {
              setRequests((prev) => prev.filter((r) => r.id !== req.id));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_ordering_sessions',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            const sess = newRecord as QROrderingSession;
            if (sess && sess.status === 'pending' && sess.active === 'TRUE') {
              setSessionRequests((prev) => {
                if (prev.some((s) => s.id === sess.id)) return prev;
                return [sess, ...prev];
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              showToast('Yêu cầu mở bàn ăn mới!', 'info');
            }
          } else if (eventType === 'UPDATE') {
            const sess = newRecord as QROrderingSession;
            if (sess) {
              if (sess.status === 'pending' && sess.active === 'TRUE') {
                setSessionRequests((prev) => {
                  if (prev.some((s) => s.id === sess.id)) return prev;
                  return [sess, ...prev];
                });
              } else {
                setSessionRequests((prev) => prev.filter((s) => s.id !== sess.id));
              }
            }
          } else if (eventType === 'DELETE') {
            const sess = oldRecord as QROrderingSession;
            if (sess) {
              setSessionRequests((prev) => prev.filter((s) => s.id !== sess.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shopId]);

  // Đồng bộ ngầm trạng thái phòng bàn SQLite để đảm bảo đồng nhất tức thì
  const syncTableLayoutSilent = async () => {
    if (Platform.OS !== 'web' && shopId) {
      try {
        await SyncManager.pullTableLayoutAndActiveOrders(shopId);
      } catch (err) {
        console.warn('Lỗi pull ngầm sau khi duyệt đơn QR:', err);
      }
    }
  };

  // Duyệt mở bàn
  const handleApproveSession = async (sessionId: string) => {
    if (isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const sess = sessionRequests.find((s) => s.id === sessionId);
    if (!sess) return;
    const tableName = getTableName(sess.resource_id);

    Alert.alert(
      'Xác nhận mở bàn',
      `Bạn có chắc chắn muốn cho phép mở bàn ăn cho ${tableName}?`,
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Mở bàn',
          onPress: async () => {
            setIsProcessing(sessionId);
            try {
              const headers = await getApiHeaders();
              const url = getApiBaseUrl();
              const res = await fetch(`${url}/api/shops/${shopId}/qr-sessions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                  session_id: sessionId,
                  action: 'approve',
                }),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Duyệt mở bàn thất bại');
              }

              showToast('Đã cho phép mở bàn ăn thành công!', 'success');
              setSessionRequests((prev) => prev.filter((s) => s.id !== sessionId));
              await syncTableLayoutSilent();
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Lỗi hệ thống khi duyệt mở bàn.');
            } finally {
              setIsProcessing(null);
            }
          }
        }
      ]
    );
  };

  // Từ chối mở bàn
  const handleRejectSession = async (sessionId: string) => {
    if (isProcessing) return;
    setIsProcessing(sessionId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const res = await fetch(`${url}/api/shops/${shopId}/qr-sessions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'reject',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Từ chối mở bàn thất bại');
      }

      showToast('Đã từ chối yêu cầu mở bàn.', 'success');
      setSessionRequests((prev) => prev.filter((s) => s.id !== sessionId));
      await syncTableLayoutSilent();
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Lỗi hệ thống khi từ chối mở bàn.');
    } finally {
      setIsProcessing(null);
    }
  };

  // Loại trừ / Nhận một món ăn trong yêu cầu gọi món
  const toggleItemExclusion = (reqId: string, idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setExcludedItemIds((prev) => {
      const current = prev[reqId] || [];
      const updated = current.includes(idx)
        ? current.filter((i) => i !== idx)
        : [...current, idx];
      return { ...prev, [reqId]: updated };
    });
  };

  // Chấp nhận yêu cầu gọi món
  const handleAcceptOrder = async (reqId: string) => {
    if (isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const req = requests.find((r) => r.id === reqId);
      if (!req) return;

      const tableName = getTableName(req.resource_id);
      const excluded = excludedItemIds[reqId] || [];
      const acceptedItems = req.items.filter((_, idx) => !excluded.includes(idx));

      if (acceptedItems.length === 0) {
        Alert.alert('Lỗi', 'Vui lòng chọn ít nhất 1 món để chấp nhận, hoặc nhấn "Từ chối" toàn bộ.');
        return;
      }

      Alert.alert(
        'Xác nhận nhận món',
        `Bạn có chắc chắn muốn nhận ${acceptedItems.length} món ăn/đồ uống này cho ${tableName}?`,
        [
          {
            text: 'Hủy',
            style: 'cancel',
          },
          {
            text: 'Nhận món',
            onPress: async () => {
              setIsProcessing(reqId);
              try {
                let rejectReasonForExcluded = '';
                if (excluded.length > 0) {
                  const rejectedItemNames = req.items
                    .filter((_, idx) => excluded.includes(idx))
                    .map((item) => `${item.qty}x ${item.product_name}`)
                    .join(', ');
                  rejectReasonForExcluded = `Từ chối các món hết hàng: ${rejectedItemNames}`;
                }

                const headers = await getApiHeaders();
                const url = getApiBaseUrl();
                const res = await fetch(`${url}/api/shops/${shopId}/qr-orders`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({
                    request_id: reqId,
                    action: 'accept',
                    items: acceptedItems,
                    reject_reason: rejectReasonForExcluded || undefined,
                  }),
                });

                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || 'Duyệt đơn thất bại');
                }

                showToast(
                  excluded.length > 0
                    ? 'Đã duyệt các món được chọn và hủy các món hết hàng!'
                    : 'Đã nhận đơn hàng và thêm vào bàn thành công!',
                  'success'
                );
                setRequests((prev) => prev.filter((r) => r.id !== reqId));
                await syncTableLayoutSilent();
              } catch (err: any) {
                Alert.alert('Lỗi', err.message || 'Lỗi hệ thống khi duyệt đơn.');
              } finally {
                setIsProcessing(null);
              }
            }
          }
        ]
      );
    } catch (err) {
      console.warn('Lỗi xử lý xác nhận nhận món:', err);
    }
  };

  // Từ chối đơn hàng gọi món
  const handleRejectOrder = (reqId: string) => {
    Alert.prompt(
      'Từ chối đơn hàng',
      'Vui lòng nhập lý do từ chối (ví dụ: Hết hàng, quán đóng cửa...):',
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Từ chối',
          style: 'destructive',
          onPress: async (reason?: string) => {
            if (isProcessing) return;
            setIsProcessing(reqId);
            try {
              const headers = await getApiHeaders();
              const url = getApiBaseUrl();
              const res = await fetch(`${url}/api/shops/${shopId}/qr-orders`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                  request_id: reqId,
                  action: 'reject',
                  reject_reason: reason || 'Chủ quán từ chối nhận đơn',
                }),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Từ chối đơn thất bại');
              }

              showToast('Đã từ chối đơn hàng thành công.', 'success');
              setRequests((prev) => prev.filter((r) => r.id !== reqId));
              await syncTableLayoutSilent();
            } catch (err: any) {
              Alert.alert('Lỗi', err.message || 'Lỗi hệ thống khi từ chối đơn.');
            } finally {
              setIsProcessing(null);
            }
          },
        },
      ],
      'plain-text',
      'Hết nguyên liệu chế biến'
    );
  };

  const getTableName = (resourceId: string) => {
    return tablesMap[resourceId] || `Bàn (${resourceId.substring(0, 5)})`;
  };

  const renderToast = () => {
    if (!toastMsg) return null;
    return (
      <Animated.View
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? insets.top + 10 : 20,
          left: 20,
          right: 20,
          zIndex: 999999,
          opacity: toastOpacity,
          transform: [
            {
              translateY: toastOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })
            }
          ],
        }}
        className={`p-3.5 rounded-2xl flex-row items-center border ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200' :
          toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200' :
          'bg-amber-50 border-amber-200'
        }`}
      >
        <Ionicons
          name={
            toastMsg.type === 'success' ? 'checkmark-circle-outline' :
            toastMsg.type === 'error' ? 'close-circle-outline' :
            'information-circle-outline'
          }
          size={18}
          color={
            toastMsg.type === 'success' ? '#10b981' :
            toastMsg.type === 'error' ? '#f43f5e' :
            '#fa5908'
          }
        />
        <Text
          className={`text-xxs font-semibold ml-2 flex-1 ${
            toastMsg.type === 'success' ? 'text-emerald-800' :
            toastMsg.type === 'error' ? 'text-rose-800' :
            'text-amber-800'
          }`}
        >
          {toastMsg.message}
        </Text>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-slate-100 flex-row items-center">
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
        <View className="flex-1">
          <Text className="text-base font-bold text-slate-800 font-sans">Yêu cầu từ QR</Text>
          <Text className="text-xxs text-slate-400 font-semibold mt-0.5">
            Duyệt đơn hàng và phiên mở bàn của khách hàng
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-white p-1 border-b border-slate-100 gap-1.5 px-4">
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setActiveTab('sessions');
          }}
          className="flex-1 py-2 items-center justify-center rounded-xl border relative"
          style={
            activeTab === 'sessions'
              ? { backgroundColor: '#fef3c7', borderColor: '#fde68a' }
              : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
          }
        >
          <Text className={`text-xs font-bold ${activeTab === 'sessions' ? 'text-amber-700' : 'text-slate-500'}`}>
            Mở bàn ({sessionRequests.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setActiveTab('orders');
          }}
          className="flex-1 py-2 items-center justify-center rounded-xl border relative"
          style={
            activeTab === 'orders'
              ? { backgroundColor: '#fef3c7', borderColor: '#fde68a' }
              : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
          }
        >
          <Text className={`text-xs font-bold ${activeTab === 'orders' ? 'text-amber-700' : 'text-slate-500'}`}>
            Gọi món ({requests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xxs text-slate-400 font-semibold mt-3">Đang đồng bộ dữ liệu QR...</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-3"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={['#fa5908']}
              tintColor="#fa5908"
            />
          }
        >
          {activeTab === 'sessions' ? (
            /* TAB 1: SESSIONS */
            sessionRequests.length === 0 ? (
              <View className="py-24 items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Ionicons name="cafe-outline" size={42} color="#cbd5e1" />
                <Text className="text-sm text-slate-400 font-bold mt-3 font-sans">
                  Không có yêu cầu mở bàn nào
                </Text>
                <Text className="text-xs text-slate-400 mt-1 font-medium font-sans text-center px-6 leading-relaxed">
                  Khách hàng quét mã QR để bắt đầu phiên gọi món sẽ được hiển thị tại đây
                </Text>
              </View>
            ) : (
              sessionRequests.map((sess) => {
                const processing = isProcessing === sess.id;
                return (
                  <View
                    key={sess.id}
                    className="p-4 mb-3 bg-white rounded-2xl border border-slate-150 shadow-sm"
                  >
                    <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
                      <View className="flex-row items-center">
                        <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2" />
                        <Text className="text-xs font-bold text-slate-800">
                          {getTableName(sess.resource_id)}
                        </Text>
                      </View>
                      <Text className="text-xxs text-slate-400 font-semibold">
                        {formatDateTime(sess.created_at).split(' ')[1]}
                      </Text>
                    </View>

                    <Text className="text-xs text-slate-500 leading-relaxed font-semibold mt-3">
                      Khách hàng đang yêu cầu cấp quyền mở bàn để tự phục vụ gọi món qua QR.
                    </Text>

                    <View className="flex-row mt-4 gap-3">
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleRejectSession(sess.id)}
                        disabled={!!isProcessing}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
                      >
                        <Text className="text-slate-500 font-bold text-xs">Từ chối</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleApproveSession(sess.id)}
                        disabled={!!isProcessing}
                        className="flex-[1.5] py-2.5 rounded-xl bg-orange-500 items-center justify-center flex-row"
                        style={{ backgroundColor: '#fa5908' }}
                      >
                        {processing ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={14} color="white" />
                            <Text className="text-white font-bold text-xs ml-1.5">Mở bàn ngay</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            /* TAB 2: ORDERS */
            requests.length === 0 ? (
              <View className="py-24 items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Ionicons name="restaurant-outline" size={42} color="#cbd5e1" />
                <Text className="text-sm text-slate-400 font-bold mt-3 font-sans">
                  Không có yêu cầu gọi món nào
                </Text>
                <Text className="text-xs text-slate-400 mt-1 font-medium font-sans text-center px-6 leading-relaxed">
                  Các đơn hàng gọi thêm món của khách tại bàn sẽ hiển thị tại đây chờ bạn xác nhận
                </Text>
              </View>
            ) : (
              requests.map((req) => {
                const processing = isProcessing === req.id;
                const excluded = excludedItemIds[req.id] || [];
                
                // Tính tổng tiền các món được chọn
                const acceptedItems = req.items.filter((_, idx) => !excluded.includes(idx));
                const totalAmount = acceptedItems.reduce((sum, item) => {
                  const itemPrice = Number(item.unit_price || 0) + Number(item.modifier_total || 0);
                  return sum + itemPrice * Number(item.qty || 1);
                }, 0);

                return (
                  <View
                    key={req.id}
                    className="p-4 mb-3 bg-white rounded-2xl border border-slate-150 shadow-sm"
                  >
                    {/* Header đơn */}
                    <View className="flex-row justify-between items-center pb-3 border-b border-slate-100 mb-3">
                      <View className="flex-row items-center">
                        <View className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2" />
                        <Text className="text-xs font-bold text-slate-800">
                          {getTableName(req.resource_id)}
                        </Text>
                      </View>
                      <Text className="text-xxs text-slate-455 font-semibold">
                        ⏱  {formatDateTime(req.created_at).split(' ')[1]}
                      </Text>
                    </View>

                    {/* Danh sách items */}
                    <View className="gap-2">
                      {req.items.map((item, idx) => {
                        const isExcluded = excluded.includes(idx);
                        const itemPrice = Number(item.unit_price) + Number(item.modifier_total || 0);
                        
                        return (
                          <TouchableOpacity
                            key={idx}
                            activeOpacity={0.8}
                            onPress={() => toggleItemExclusion(req.id, idx)}
                            className={`flex-row justify-between items-center p-2.5 rounded-xl border ${
                              isExcluded ? 'bg-slate-50 border-slate-200/50 opacity-40' : 'bg-orange-50/10 border-slate-200'
                            }`}
                          >
                            <View className="flex-row items-center flex-1 mr-3">
                              <Ionicons
                                name={isExcluded ? "square-outline" : "checkbox"}
                                size={18}
                                color={isExcluded ? "#cbd5e1" : "#fa5908"}
                              />
                              <View className="ml-2.5 flex-1">
                                <Text className={`text-xs font-bold ${isExcluded ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {item.product_name}
                                </Text>
                                {item.variant_label ? (
                                  <Text className="text-xxs text-slate-500 font-medium mt-0.5">
                                    Loại: {item.variant_label}
                                  </Text>
                                ) : null}
                                {item.modifiers && (
                                  <Text className="text-micro text-slate-400 font-semibold mt-0.5">
                                    + {typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers)}
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View className="items-end">
                              <Text className={`text-xs font-bold ${isExcluded ? 'text-slate-400' : 'text-slate-800'}`}>
                                x{item.qty}
                              </Text>
                              <Text className={`text-xxs font-bold mt-0.5 ${isExcluded ? 'text-slate-400' : 'text-orange-500'}`}>
                                {formatCurrency(itemPrice * Number(item.qty))}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Footer tính tiền nhanh */}
                    <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-100">
                      <Text className="text-xxs font-bold text-slate-450">TỔNG DUYỆT ({acceptedItems.length} MÓN)</Text>
                      <Text className="text-xs font-extrabold text-orange-500">{formatCurrency(totalAmount)}</Text>
                    </View>

                    {/* Nút bấm hành động */}
                    <View className="flex-row mt-4 gap-3">
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleRejectOrder(req.id)}
                        disabled={!!isProcessing}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
                      >
                        <Text className="text-slate-500 font-bold text-xs">Từ chối</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleAcceptOrder(req.id)}
                        disabled={!!isProcessing}
                        className="flex-[1.5] py-2.5 rounded-xl bg-orange-500 items-center justify-center flex-row"
                        style={{ backgroundColor: '#fa5908' }}
                      >
                        {processing ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Ionicons name="restaurant-outline" size={14} color="white" />
                            <Text className="text-white font-bold text-xs ml-1.5">Nhận đơn</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          )}
        </ScrollView>
      )}

      {renderToast()}
    </SafeAreaView>
  );
}
