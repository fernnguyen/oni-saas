import React, {useState, useCallback, useEffect} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, Modal, Platform, ActivityIndicator, RefreshControl} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useLocalSearchParams} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq, desc, or} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {formatCurrency, formatDateTime} from '../../lib/utils/format';

const PAYMENT_METHOD_VI: Record<string, string> = {
 cash: 'Tiền mặt',
 bank_transfer: 'Chuyển khoản',
 transfer: 'Chuyển khoản',
 card: 'Quẹt thẻ',
 debit: 'Quẹt thẻ',
 momo: 'Ví MoMo',
 vnpay: 'VNPay',
 zalopay: 'ZaloPay',
 debt: 'Ghi nợ',
 prepaid: 'Ví trả trước',
 wallet: 'Ví điện tử',
};

const translateMethod = (code: string): string => {
  if (!code) return 'Tiền mặt';
  const cleanCode = code.toLowerCase();
  
  if (cleanCode.startsWith('cash') || cleanCode === 'tiền mặt') return 'Tiền mặt';
  if (cleanCode.startsWith('bank_transfer') || cleanCode.startsWith('transfer') || cleanCode === 'chuyển khoản') return 'Chuyển khoản';
  if (cleanCode.startsWith('card') || cleanCode.startsWith('debit') || cleanCode === 'quẹt thẻ') return 'Quẹt thẻ';
  if (cleanCode.startsWith('momo')) return 'Ví MoMo';
  if (cleanCode.startsWith('vnpay')) return 'VNPay';
  if (cleanCode.startsWith('zalopay')) return 'ZaloPay';
  if (cleanCode.startsWith('debt') || cleanCode === 'ghi nợ') return 'Ghi nợ';
  if (cleanCode.startsWith('prepaid') || cleanCode === 'ví trả trước') return 'Ví trả trước';
  if (cleanCode.startsWith('wallet') || cleanCode === 'ví điện tử') return 'Ví điện tử';

  return PAYMENT_METHOD_VI[cleanCode] || code || 'Tiền mặt';
};

const getPaymentMethodDisplay = (pm: string) => {
 if (!pm) return 'Tiền mặt';
 if (pm.startsWith('[') || pm.startsWith('{')) {
  try {
   const parsed = JSON.parse(pm);
   if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map((p: any) => translateMethod(p.METHOD || p.method)).join(' + ');
   }
  } catch (e) {
   return 'Thanh toán hỗn hợp';
  }
 }
 return translateMethod(pm);
};

// Import hệ thống UI dùng chung cao cấp
import {Header} from '../../components/layout/Header';
import {Badge} from '../../components/ui/Badge';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Skeleton} from '../../components/ui/Skeleton';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {usePermissions} from '../../lib/auth/PermissionsContext';

const getOrderStatusBadgeProps = (status: string): { label: string; variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' } => {
  switch (status) {
    case 'completed':
      return { label: 'Hoàn thành', variant: 'success' };
    case 'cancelled':
      return { label: 'Đã hủy', variant: 'danger' };
    case 'draft':
      return { label: 'Nháp', variant: 'warning' };
    case 'confirmed':
      return { label: 'Đã xác nhận', variant: 'info' };
    case 'processing':
      return { label: 'Đang xử lý', variant: 'primary' };
    case 'in_progress':
      return { label: 'Đang sử dụng', variant: 'info' };
    case 'returning':
      return { label: 'Đang trả hàng', variant: 'warning' };
    case 'partially_refunded':
      return { label: 'Hoàn 1 phần', variant: 'warning' };
    case 'refunded':
      return { label: 'Hoàn tiền', variant: 'secondary' };
    default:
      return { label: status || 'Không rõ', variant: 'secondary' };
  }
};

export default function OrdersScreen() {
  const {hasPermission} = usePermissions();
  const params = useLocalSearchParams();
  const orderIdParam = params?.id as string | undefined;
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<any[]>([]);
  const [selectedOrderReturns, setSelectedOrderReturns] = useState<any[]>([]);
  const [selectedOrderCashbook, setSelectedOrderCashbook] = useState<any[]>([]);
  const [shopSettings, setShopSettings] = useState<any>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('Sai sót hệ thống');
  const [customCancelReason, setCustomCancelReason] = useState('');

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('other');
  const [returnRefundMethod, setReturnRefundMethod] = useState('cash');
  const [returnRefundAmount, setReturnRefundAmount] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [showConfirmReturn, setShowConfirmReturn] = useState(false);

  const paymentCbMap = React.useMemo(() => {
   const map = new Map<string, string>();
   const usedCb = new Set<string>();
   for (const p of selectedOrderPayments) {
    const pId = p.payment_id || p.id;
    const cbMatch = selectedOrderCashbook.find(cb => {
     const cbId = cb.id || cb.transaction_id;
     if (usedCb.has(cbId)) return false;
     return Math.abs(Number(cb.amount)) === Math.abs(Number(p.amount)) && 
            cb.method === p.method && 
            (Number(p.amount) < 0 ? cb.type === 'expense' : cb.type === 'receipt');
    });
    if (cbMatch) {
     const cbId = cbMatch.id || cbMatch.transaction_id;
     usedCb.add(cbId);
     map.set(pId, cbId);
    }
   }
   return map;
  }, [selectedOrderPayments, selectedOrderCashbook]);

  const alreadyReturnedQty = React.useMemo(() => {
   const qtyMap: Record<string, number> = {};
   selectedOrderReturns.forEach(ret => {
    if (ret.status === 'rejected' || ret.status === 'deleted') return;
    if (Array.isArray(ret.items)) {
     ret.items.forEach((item: any) => {
      const id = item.order_item_id || item.product_id;
      if (id) {
       qtyMap[id] = (qtyMap[id] || 0) + parseInt(item.qty_returned || '0', 10);
      }
     });
    }
   });
   return qtyMap;
  }, [selectedOrderReturns]);

  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([{id: 'all', label: 'Tất cả ca'}]);
  const [isLoading, setIsLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [hasMore, setHasMore] = useState(true);
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, synced, pending

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [shiftOrdersCount, setShiftOrdersCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const getActiveShiftStats = async (activeShopId: string, activeShiftId: string, forceRefresh = false) => {
    const cacheKey = `shift_revenue_${activeShopId}_${activeShiftId}`;
    
    // 1. Kiểm tra cache nếu không phải forceRefresh
    if (!forceRefresh) {
      try {
        const cached = await db.select()
          .from(schema.localCaches)
          .where(eq(schema.localCaches.cache_key, cacheKey))
          .limit(1);
        if (cached.length > 0) {
          const ageMs = Date.now() - cached[0].updated_at;
          if (ageMs < 600000) { // 10 phút
            const parsed = JSON.parse(cached[0].cache_value);
            return {
              revenue: parsed.revenue,
              count: parsed.count,
              source: 'cache'
            };
          }
        }
      } catch (e) {
        console.warn('Lỗi đọc cache shift revenue:', e);
      }
    }

    // Lấy thông tin khoảng thời gian của ca (opened_at -> closed_at) từ SQLite hoặc Server
    let openTime = 0;
    let closeTime = Infinity;

    if (Platform.OS !== 'web') {
      try {
        const shiftRows = await db.select().from(schema.shop_shifts).where(eq(schema.shop_shifts.id, activeShiftId)).limit(1);
        if (shiftRows.length > 0) {
          openTime = new Date(shiftRows[0].opened_at).getTime();
          closeTime = shiftRows[0].closed_at ? new Date(shiftRows[0].closed_at).getTime() : Infinity;
        }
      } catch (err) {
        console.warn('Lỗi truy vấn ca từ SQLite trong stats:', err);
      }
    }

    const currentUrl = getApiBaseUrl();
    const headers = await getApiHeaders();

    if (openTime === 0) {
      try {
        const shiftRes = await fetch(`${currentUrl}/api/shops/${activeShopId}/shifts?limit=50`, { headers });
        if (shiftRes.ok) {
          const shiftJson = await shiftRes.json();
          const serverShift = (shiftJson.data || []).find((s: any) => s.id === activeShiftId);
          if (serverShift) {
            openTime = new Date(serverShift.opened_at).getTime();
            closeTime = serverShift.closed_at ? new Date(serverShift.closed_at).getTime() : Infinity;
          }
        }
      } catch (e) {
        console.warn('Lỗi fetch thông tin ca từ server trong stats:', e);
      }
    }

    // 2. Fetch từ server API
    try {
      const ordersRes = await fetch(`${currentUrl}/api/shops/${activeShopId}/orders?limit=200`, { headers });
      if (ordersRes.ok) {
        const ordersJson = await ordersRes.json();
        const shiftOrders = (ordersJson.data || []).filter((o: any) => {
          if (o.shift_id === activeShiftId) return true;
          if (o.created_at && openTime > 0) {
            const orderTime = new Date(o.created_at).getTime();
            return orderTime >= openTime && orderTime <= closeTime;
          }
          return false;
        });

        const revenue = shiftOrders.reduce((sum: number, o: any) => sum + parseInt(o.total_amount || '0', 10), 0);
        const count = shiftOrders.length;
        
        const stats = { revenue, count };
        // Lưu vào cache
        await db.insert(schema.localCaches).values({
          cache_key: cacheKey,
          cache_value: JSON.stringify(stats),
          updated_at: Date.now()
        }).onConflictDoUpdate({
          target: schema.localCaches.cache_key,
          set: {
            cache_value: JSON.stringify(stats),
            updated_at: Date.now()
          }
        });

        return { revenue, count, source: 'server' };
      }
    } catch (e) {
      console.warn('Lỗi fetch shift revenue từ server:', e);
    }

    // 3. Fallback: Lấy cache hết hạn
    try {
      const cached = await db.select()
        .from(schema.localCaches)
        .where(eq(schema.localCaches.cache_key, cacheKey))
        .limit(1);
      if (cached.length > 0) {
        const parsed = JSON.parse(cached[0].cache_value);
        return {
          revenue: parsed.revenue,
          count: parsed.count,
          source: 'expired_cache'
        };
      }
    } catch (e) {}

    // 4. Fallback: Truy vấn SQLite
    try {
      const allLocalOrders = await db.select().from(schema.orders);
      const shiftOrders = allLocalOrders.filter((o: any) => {
        if (o.shift_id === activeShiftId) return true;
        if (o.created_at && openTime > 0) {
          const orderTime = new Date(o.created_at).getTime();
          return orderTime >= openTime && orderTime <= closeTime;
        }
        return false;
      });
      const revenue = shiftOrders.reduce((sum: number, o: any) => sum + o.total_amount, 0);
      const count = shiftOrders.length;
      return { revenue, count, source: 'sqlite' };
    } catch (e) {
      console.warn('Lỗi tính shift revenue từ SQLite:', e);
    }

    return { revenue: 0, count: 0, source: 'default' };
  };

 const [selectedOrder, setSelectedOrder] = useState<any>(null);
 const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]);
 const [selectedOrderCustomerPhone, setSelectedOrderCustomerPhone] = useState<string | null>(null);
 const [paymentFundsList, setPaymentFundsList] = useState<any[]>([]);
 const [isSyncingOrder, setIsSyncingOrder] = useState<string | null>(null);
 const [isReprinting, setIsReprinting] = useState(false);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);
 const [copiedId, setCopiedId] = useState(false);
 const [copiedCbId, setCopiedCbId] = useState<string | null>(null);

 const handleCopyOrderNo = async (text: string) => {
   await Clipboard.setStringAsync(text);
   setCopiedId(true);
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
   setTimeout(() => {
     setCopiedId(false);
   }, 1500);
 };

  const handleCopyCbNo = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedCbId(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => {
      setCopiedCbId(null);
    }, 1500);
  };

 // Dialog xác nhận in và sync thay Alert.alert
 const [isReprintSuccessVisible, setIsReprintSuccessVisible] = useState(false);
 const [isSyncSuccessVisible, setIsSyncSuccessVisible] = useState(false);
 const [isSyncErrorVisible, setIsSyncErrorVisible] = useState(false);

  // Tải dữ liệu SQLite hoặc Cloud
  const loadOrdersData = async (currentLimit = 10, isLoadMore = false, triggerRefresh = false) => {
  try {
   if (!isLoadMore && !triggerRefresh) {
     setIsLoading(true);
   } else if (isLoadMore) {
     setIsLazyLoading(true);
   }

   const activeShopId = await AsyncStorage.getItem('active_shop_id') || '';
   const activeShiftId = await AsyncStorage.getItem('active_shift_id') || '';
   setActiveShiftId(activeShiftId);
   const isShiftEnabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';

   let shiftsData: any[] = [];
   if (Platform.OS !== 'web') {
     const allShifts = await db.select().from(schema.shop_shifts);
     shiftsData = allShifts.filter((s: any) => {
       const isLocalShift = s.id && s.id.startsWith(`shift-${activeShopId}-`);
       const isActiveShift = activeShiftId && s.id === activeShiftId;
       return isLocalShift || isActiveShift;
     });
   }

   const localShiftIdMap = new Map();
   if (Platform.OS !== 'web') {
     const localOrders = await db.select().from(schema.orders);
     localOrders.forEach((o: any) => {
       if (o.id && o.shift_id) {
         localShiftIdMap.set(o.id, o.shift_id);
       }
     });
   }

   // A. HÀM ĐỒNG BỘ MỚI (Dùng chung cho cả sync chặn và sync nền)
   const runSync = async () => {
     try {
       const headers = await getApiHeaders();
       const url = getApiBaseUrl();

       // 1. Đồng bộ ca làm việc từ server trước
       try {
         const shiftsRes = await fetch(`${url}/api/shops/${activeShopId}/shifts?limit=50`, { headers });
         if (shiftsRes.ok) {
           const shiftsJson = await shiftsRes.json();
           const serverShifts = shiftsJson.data || [];
           for (const s of serverShifts) {
             await db.insert(schema.shop_shifts).values({
               id: s.id,
               opened_at: s.opened_at,
               closed_at: s.closed_at || null,
               status: s.status || 'open',
               opening_cash: parseInt(s.opening_cash || '0', 10),
               actual_closing_cash: parseInt(s.actual_closing_cash || '0', 10),
               employee_name: s.employee_name || s.user_id || 'Thu ngân',
               sync_status: 'synced',
             }).onConflictDoUpdate({
               target: schema.shop_shifts.id,
               set: {
                 opened_at: s.opened_at,
                 closed_at: s.closed_at || null,
                 status: s.status || 'open',
                 opening_cash: parseInt(s.opening_cash || '0', 10),
                 actual_closing_cash: parseInt(s.actual_closing_cash || '0', 10),
                 employee_name: s.employee_name || s.user_id || 'Thu ngân',
                 sync_status: 'synced',
               }
             });
           }
         }
       } catch (e) {
         console.warn('Lỗi đồng bộ ca ngầm:', e);
       }

       // 2. Tải 10 đơn hàng mới nhất từ server
       const res = await fetch(`${url}/api/shops/${activeShopId}/orders?limit=10&page=1`, { headers });
       if (res.ok) {
         const resJson = await res.json();
         const cloudOrders = resJson.data || [];

         const allShiftsAfter = await db.select().from(schema.shop_shifts);
         const shiftsDataAfter = allShiftsAfter.filter((s: any) => {
           const isLocalShift = s.id && s.id.startsWith(`shift-${activeShopId}-`);
           const isActiveShift = activeShiftId && s.id === activeShiftId;
           return isLocalShift || isActiveShift;
         });

         const cloudMapped = cloudOrders.map((o: any) => {
           const resolvedId = o.id || o.order_id;
           let resolvedShiftId = localShiftIdMap.get(resolvedId);

           if (!resolvedShiftId && o.created_at) {
             const orderTime = new Date(o.created_at).getTime();
             const matchedShift = shiftsDataAfter.find((s: any) => {
               const openTime = new Date(s.opened_at).getTime();
               const closeTime = s.closed_at ? new Date(s.closed_at).getTime() : Infinity;
               return orderTime >= openTime && orderTime <= closeTime;
             });
             if (matchedShift) {
               resolvedShiftId = matchedShift.id;
             }
           }

           return {
             id: resolvedId,
             order_no: o.order_no || 'HD',
             status: o.status || 'completed',
             customer_name: o.customer_name || 'Khách lẻ',
             total_amount: parseInt(o.total_amount || '0', 10),
             paid_amount: parseInt(o.paid_amount || '0', 10),
             payment_method: o.payment_method || 'Tiền mặt',
             created_at: o.created_at || new Date().toISOString(),
             updated_at: o.updated_at || o.created_at || new Date().toISOString(),
             shift_id: resolvedShiftId || 'default-shift',
             sync_status: 'synced',
             discount_amount: parseInt(o.discount_amount || '0', 10),
             note: o.note || '',
           };
         });

         for (const order of cloudMapped) {
           await db.insert(schema.orders).values({
             id: order.id,
             order_no: order.order_no,
             status: order.status,
             customer_name: order.customer_name,
             total_amount: order.total_amount,
             paid_amount: order.paid_amount,
             payment_method: order.payment_method,
             created_at: order.created_at,
             updated_at: order.updated_at,
             shift_id: order.shift_id,
             sync_status: 'synced',
             discount_amount: order.discount_amount,
             note: order.note,
           }).onConflictDoUpdate({
             target: schema.orders.id,
             set: {
               order_no: order.order_no,
               status: order.status,
               customer_name: order.customer_name,
               total_amount: order.total_amount,
               paid_amount: order.paid_amount,
               payment_method: order.payment_method,
               created_at: order.created_at,
               updated_at: order.updated_at,
               sync_status: 'synced',
               discount_amount: order.discount_amount,
               note: order.note,
             }
           });
         }
       }
     } catch (bgErr) {
       console.warn('Lỗi đồng bộ ngầm đơn hàng từ Cloud về SQLite:', bgErr);
     }
   };

   // B. XỬ LÝ KHÁC NHAU GIỮA TÌM KIẾM VÀ KHÔNG TÌM KIẾM
   let rawOrders: any[] = [];
   let fetchSearchSuccess = false;

   // 1. NẾU CÓ TÌM KIẾM -> Ưu tiên Online trước, sau đó fallback Offline
   if (searchQuery !== '') {
     let searchedOrders: any[] = [];
     try {
       const headers = await getApiHeaders();
       const url = getApiBaseUrl();
       const res = await fetch(`${url}/api/shops/${activeShopId}/orders?limit=${currentLimit}&page=1&search=${encodeURIComponent(searchQuery)}`, { headers });
       if (res.ok) {
         const resJson = await res.json();
         const cloudOrders = resJson.data || [];
         searchedOrders = cloudOrders.map((o: any) => {
           const resolvedId = o.id || o.order_id;
           let resolvedShiftId = localShiftIdMap.get(resolvedId);

           if (!resolvedShiftId && o.created_at) {
             const orderTime = new Date(o.created_at).getTime();
             const matchedShift = shiftsData.find((s: any) => {
               const openTime = new Date(s.opened_at).getTime();
               const closeTime = s.closed_at ? new Date(s.closed_at).getTime() : Infinity;
               return orderTime >= openTime && orderTime <= closeTime;
             });
             if (matchedShift) {
               resolvedShiftId = matchedShift.id;
             }
           }

           return {
             id: resolvedId,
             order_no: o.order_no || 'HD',
             status: o.status || 'completed',
             customer_name: o.customer_name || 'Khách lẻ',
             total_amount: parseInt(o.total_amount || '0', 10),
             paid_amount: parseInt(o.paid_amount || '0', 10),
             payment_method: o.payment_method || 'Tiền mặt',
             created_at: o.created_at || new Date().toISOString(),
             updated_at: o.updated_at || o.created_at || new Date().toISOString(),
             shift_id: resolvedShiftId || 'default-shift',
             sync_status: 'synced',
             discount_amount: parseInt(o.discount_amount || '0', 10),
             note: o.note || '',
           };
         });
         fetchSearchSuccess = true;

         // Cache kết quả tìm kiếm vào SQLite
         if (Platform.OS !== 'web') {
           for (const order of searchedOrders) {
             await db.insert(schema.orders).values({
               id: order.id,
               order_no: order.order_no,
               status: order.status,
               customer_name: order.customer_name,
               total_amount: order.total_amount,
               paid_amount: order.paid_amount,
               payment_method: order.payment_method,
               created_at: order.created_at,
               updated_at: order.updated_at,
               shift_id: order.shift_id,
               sync_status: 'synced',
               discount_amount: order.discount_amount,
               note: order.note,
             }).onConflictDoUpdate({
               target: schema.orders.id,
               set: {
                 order_no: order.order_no,
                 status: order.status,
                 customer_name: order.customer_name,
                 total_amount: order.total_amount,
                 paid_amount: order.paid_amount,
                 payment_method: order.payment_method,
                 created_at: order.created_at,
                 updated_at: order.updated_at,
                 sync_status: 'synced',
                 discount_amount: order.discount_amount,
                 note: order.note,
               }
             });
           }
         }
       }
     } catch (err) {
       console.warn('Lỗi tìm kiếm online, tự động chuyển về tìm kiếm offline SQLite:', err);
     }

     if (fetchSearchSuccess) {
       rawOrders = searchedOrders;
     } else {
       if (Platform.OS !== 'web') {
         rawOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.updated_at));
       }
     }
   } 
   // 2. KHÔNG TÌM KIẾM -> Offline First
   else {
     if (Platform.OS === 'web') {
       rawOrders = [
         {
           id: 'mock-1',
           order_no: 'HD-MOCK-1',
           status: 'completed',
           customer_name: 'Khách lẻ',
           total_amount: 125000,
           paid_amount: 125000,
           payment_method: 'Tiền mặt',
           created_at: new Date().toISOString(),
           shift_id: 'default-shift',
           sync_status: 'synced',
           discount_amount: 0,
           note: '',
         }
       ];
     } else {
       rawOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.updated_at));
     }
   }

   // Lọc thô danh sách của chi nhánh hiện tại (phục vụ cho tính toán KPI stats)
   let branchOrders = Platform.OS === 'web' ? rawOrders : rawOrders.filter((o: any) => {
     const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
     const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
     const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
     return isLocalShift || isActiveShift || isDefaultShift;
   });

   // C. PHÂN CHIA BLOCKING SYNC NẾU NATIVE SQLITE ĐANG TRỐNG
   if (!isLoadMore && Platform.OS !== 'web' && searchQuery === '' && branchOrders.length === 0) {
     // Chạy đồng bộ chặn để không bị flash "Không có dữ liệu"
     await runSync();
     // Quét lại dữ liệu sau đồng bộ chặn
     const updatedOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.updated_at));
     rawOrders = updatedOrders;
   }

   // Tái định nghĩa các danh sách sau khi đồng bộ chặn (nếu có)
   const finalBranchOrders = Platform.OS === 'web' ? rawOrders : rawOrders.filter((o: any) => {
     const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
     const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
     const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
     return isLocalShift || isActiveShift || isDefaultShift;
   });

   // D. TÍNH TOÁN CÁC CON SỐ THỐNG KÊ (KPI STATS) TRÊN DANH SÁCH KHÔNG BỊ CẮT LÁT
   // Lọc theo ca được chọn để tính synced/pending
   const statsOrders = selectedShift === 'all' ? finalBranchOrders : finalBranchOrders.filter((o: any) => o.shift_id === selectedShift);
   const synced = statsOrders.filter((o: any) => o.sync_status === 'synced').length;
   const pending = statsOrders.filter((o: any) => o.sync_status === 'pending').length;
   setSyncedCount(synced);
   setPendingCount(pending);

   // Tính toán doanh số ca & số đơn hàng ca chính xác
   const targetShiftId = selectedShift !== 'all' ? selectedShift : (activeShiftId || 'default-shift');
   if (targetShiftId === activeShiftId && activeShiftId) {
     const stats = await getActiveShiftStats(activeShopId, activeShiftId, triggerRefresh || isRefreshing);
     setTotalRevenue(stats.revenue);
     setShiftOrdersCount(stats.count);
   } else {
     const shiftOrders = finalBranchOrders.filter((o: any) => o.shift_id === targetShiftId);
     const revenue = shiftOrders.reduce((sum: number, o: any) => sum + o.total_amount, 0);
     const count = shiftOrders.length;
     setTotalRevenue(Platform.OS === 'web' ? 125000 : revenue);
     setShiftOrdersCount(Platform.OS === 'web' ? 1 : count);
   }

   // E. LỌC DANH SÁCH THEO CÁC TIÊU CHÍ HIỂN THỊ VÀ TIẾN HÀNH CẮT LÁT (LAZY LOAD)
   const localFiltered = finalBranchOrders.filter((o: any) => {
     const matchesSearch = searchQuery === '' || fetchSearchSuccess || (
       (o.id && o.id.toLowerCase().includes(searchQuery.toLowerCase())) || 
       (o.order_no && o.order_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
       (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
     );
     const matchesShift = selectedShift === 'all' || o.shift_id === selectedShift;
     const matchesStatus = selectedStatus === 'all' || o.sync_status === selectedStatus;
     return matchesSearch && matchesShift && matchesStatus;
   });

   const sliced = localFiltered.slice(0, currentLimit);
   setOrdersList(sliced);
   setHasMore(localFiltered.length > currentLimit);

   if (Platform.OS !== 'web') {
     const funds = await db.select().from(schema.paymentFunds);
     setPaymentFundsList(funds);
   }

   // F. CHẠY SYNC NỀN NẾU BAN ĐẦU ĐÃ CÓ SẴN DỮ LIỆU SQLITE (VỪA HIỂN THỊ NHANH VỪA TẢI MỚI TRONG NỀN)
   if (!isLoadMore && Platform.OS !== 'web' && searchQuery === '' && branchOrders.length > 0) {
     (async () => {
       await runSync();
       // Cập nhật lại UI sau khi sync nền hoàn thành
       const updatedOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.updated_at));
       const updatedBranchOrders = updatedOrders.filter((o: any) => {
         const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
         const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
         const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
         return isLocalShift || isActiveShift || isDefaultShift;
       });

       // Tính lại thống kê synced/pending
       const statsOrdersNew = selectedShift === 'all' ? updatedBranchOrders : updatedBranchOrders.filter((o: any) => o.shift_id === selectedShift);
       setSyncedCount(statsOrdersNew.filter((o: any) => o.sync_status === 'synced').length);
       setPendingCount(statsOrdersNew.filter((o: any) => o.sync_status === 'pending').length);

       // Tính lại doanh số ca
       if (targetShiftId === activeShiftId && activeShiftId) {
         const stats = await getActiveShiftStats(activeShopId, activeShiftId, false);
         setTotalRevenue(stats.revenue);
         setShiftOrdersCount(stats.count);
       } else {
         const shiftOrders = updatedBranchOrders.filter((o: any) => o.shift_id === targetShiftId);
         setTotalRevenue(shiftOrders.reduce((sum: number, o: any) => sum + o.total_amount, 0));
         setShiftOrdersCount(shiftOrders.length);
       }

               const localFilteredNew = updatedBranchOrders.filter((o: any) => {
          const matchesShift = selectedShift === 'all' || o.shift_id === selectedShift;
          const matchesStatus = selectedStatus === 'all' || o.sync_status === selectedStatus;
          return matchesShift && matchesStatus;
        });

       setOrdersList(localFilteredNew.slice(0, currentLimit));
       setHasMore(localFilteredNew.length > currentLimit);

       if (triggerRefresh) {
         setIsRefreshing(false);
       }
     })();
   } else if (triggerRefresh) {
     setIsRefreshing(false);
   }

   const mappedShifts = [
     { id: 'all', label: 'Tất cả ca' },
      ...shiftsData.map((s: any) => {
        let name = s.employee_name || 'Nhân viên';
        if (name === 'Thu ngân' || name === 'Thu ngân viên chính') {
          name = 'Nhân viên';
        }
        return {
          id: s.id,
          label: `Ca ${name} (${s.opened_at.substring(11, 16)} - ${s.closed_at ? s.closed_at.substring(11, 16) : 'Đang mở'})`
        };
      })
   ];
   setShiftsList(mappedShifts);
  } catch (err) {
   console.error('Lỗi khi tải lịch sử hóa đơn:', err);
  } finally {
   setIsLoading(false);
   setIsLazyLoading(false);
  }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setLimit(10);
    await loadOrdersData(10, false, true);
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      setLimit(10);
      loadOrdersData(10);
    }, [])
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (isLoading) return;
      setLimit(10);
      loadOrdersData(10, false);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    if (isLoading) return;
    setLimit(10);
    loadOrdersData(10, false);
  }, [selectedShift, selectedStatus]);

  // Xem chi tiết
  const handleViewOrderDetails = async (order: any, isRefresh = false) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    if (!isRefresh) {
      setSelectedOrder(order);
      // Reset details to avoid showing stale data
      setSelectedOrderItems([]);
      setSelectedOrderPayments([]);
      setSelectedOrderReturns([]);
      setSelectedOrderCashbook([]);
      setShopSettings({});
      setSelectedOrderCustomerPhone(null);
    }
    
    setIsDetailLoading(true);

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      
      let localItems: any[] = [];
      let localPayments: any[] = [];
      let customerPhone: string | null = null;

      // 1. Tải nhanh dữ liệu từ SQLite cục bộ trước
      if (Platform.OS !== 'web') {
        try {
          localItems = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, order.id));

          if (order.customer_id) {
            const customerRows = await db
              .select()
              .from(schema.customers)
              .where(eq(schema.customers.id, order.customer_id));
            if (customerRows.length > 0) customerPhone = customerRows[0].phone || null;
          }

          if (!customerPhone && order.metadata) {
            try {
              const meta = JSON.parse(order.metadata);
              customerPhone = meta.customer_phone || null;
            } catch {}
          }

          const pm = order.payment_method;
          if (pm && (pm.startsWith('[') || pm.startsWith('{'))) {
            try {
              const parsed = JSON.parse(pm);
              if (Array.isArray(parsed)) {
                localPayments = parsed.map((p: any, i: number) => ({
                  id: `local-pm-${i}`,
                  method: p.METHOD || p.method || 'cash',
                  amount: p.AMOUNT || p.amount || order.total_amount,
                  fund_id: p.FUND_ID || p.fund_id || null,
                  reference_no: p.REFERENCE_NO || p.reference_no || null,
                  note: p.NOTE || p.note || null
                }));
              }
            } catch {}
          }
          if (localPayments.length === 0) {
            localPayments = [{
              id: 'local-pm-0',
              method: pm || 'cash',
              amount: order.total_amount,
              fund_id: null
            }];
          }
        } catch (sqliteErr) {
          console.warn('Lỗi tải dữ liệu SQLite cục bộ:', sqliteErr);
        }
      } else {
        // Mock data cho Web
        localItems = [
          {id: 'it1', product_name: 'Cà phê Phin Sữa Đá', qty: 2, unit_price: 29000, line_total: 58000},
          {id: 'it2', product_name: 'Trà Đào Cam Sả', qty: 1, unit_price: 39000, line_total: 39000}
        ];
        localPayments = [{
          id: 'local-pm-0',
          method: order.payment_method || 'cash',
          amount: order.total_amount,
          fund_id: null
        }];
      }

      // Hiển thị ngay lập tức dữ liệu SQLite
      setSelectedOrderItems(localItems);
      setSelectedOrderPayments(localPayments);
      setSelectedOrderCustomerPhone(customerPhone);

      let fetchedOnline = false;

      // 2. Chỉ thực hiện fetch online ngầm nếu đã đồng bộ và có shopId
      if (shopId && order.sync_status !== 'pending') {
        try {
          const [itemsRes, paymentsRes, returnsRes, settingsRes, cashbookRes] = await Promise.all([
            fetch(`${url}/api/shops/${shopId}/order-items?order_id=${order.id}&limit=100`, { headers }),
            fetch(`${url}/api/shops/${shopId}/payments?order_id=${order.id}&limit=50`, { headers }),
            fetch(`${url}/api/shops/${shopId}/returns?order_id=${order.id}&limit=50`, { headers }),
            fetch(`${url}/api/shops/${shopId}/settings`, { headers }),
            fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${order.id}&limit=100`, { headers })
          ]);

          if (itemsRes.ok && paymentsRes.ok && returnsRes.ok && settingsRes.ok && cashbookRes.ok) {
            const itemsJson = await itemsRes.json();
            const paymentsJson = await paymentsRes.json();
            const returnsJson = await returnsRes.json();
            const settingsJson = await settingsRes.json();
            const cashbookJson = await cashbookRes.json();

            const rawReturns = returnsJson.data || [];
            const returnsWithItems = await Promise.all(
              rawReturns.map(async (ret: any) => {
                try {
                  const retItemsRes = await fetch(`${url}/api/shops/${shopId}/return-items?return_id=${ret.return_id}&limit=100`, { headers });
                  if (retItemsRes.ok) {
                    const retItemsJson = await retItemsRes.json();
                    return { ...ret, items: retItemsJson.data || [] };
                  }
                } catch (e) {
                  console.warn(`Lỗi tải chi tiết sản phẩm trả ${ret.return_id}:`, e);
                }
                return { ...ret, items: [] };
              })
            );

            setSelectedOrderItems(itemsJson.data || localItems);
            setSelectedOrderPayments(paymentsJson.data || localPayments);
            setSelectedOrderReturns(returnsWithItems);
            setShopSettings(settingsJson || {});

            const cbData = cashbookJson.data || [];
            // Tải thêm dòng tiền của các phiếu trả hàng liên quan
            for (const ret of returnsWithItems) {
              const retRef = ret.return_no || ret.return_id;
              if (retRef) {
                try {
                  const retCbRes = await fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${retRef}&limit=10`, { headers });
                  if (retCbRes.ok) {
                    const retCbJson = await retCbRes.json();
                    cbData.push(...(retCbJson.data || []));
                  }
                } catch (e) {
                  console.warn(`Lỗi tải dòng tiền của phiếu trả ${retRef}:`, e);
                }
              }
            }
            setSelectedOrderCashbook(cbData);
            fetchedOnline = true;
          }
        } catch (err) {
          console.warn('Lỗi tải dữ liệu trực tuyến, sử dụng dữ liệu cục bộ:', err);
        }
      }
    } catch (err) {
      console.error('Lỗi tải chi tiết dòng sản phẩm:', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Tự động mở chi tiết đơn hàng khi nhận được orderIdParam từ Deep Link / Push Notification
  useEffect(() => {
    if (!orderIdParam) return;

    const autoLoadOrder = async () => {
      try {
        // 1. Tìm trong DB cục bộ trước
        if (Platform.OS !== 'web') {
          const localOrders = await db
            .select()
            .from(schema.orders)
            .where(
              or(
                eq(schema.orders.id, orderIdParam),
                eq(schema.orders.order_no, orderIdParam),
                eq(schema.orders.reference_no, orderIdParam)
              )
            );
          
          if (localOrders && localOrders.length > 0) {
            handleViewOrderDetails(localOrders[0]);
            return;
          }
        }

        // 2. Nếu không có ở cục bộ, tiến hành fetch online từ API
        const url = getApiBaseUrl();
        const headers = await getApiHeaders();
        const shopId = await AsyncStorage.getItem('active_shop_id') || '';
        
        if (shopId) {
          const res = await fetch(`${url}/api/shops/${shopId}/orders/${orderIdParam}`, { headers });
          if (res.ok) {
            const orderData = await res.json();
            if (orderData && (orderData.id || orderData.order_id)) {
              const orderObj = {
                id: orderData.id || orderData.order_id,
                order_no: orderData.order_no || orderData.id,
                total_amount: Number(orderData.total_amount || 0),
                paid_amount: Number(orderData.paid_amount || 0),
                payment_method: orderData.payment_method || 'cash',
                created_at: orderData.created_at,
                status: orderData.status || 'completed',
                customer_id: orderData.customer_id,
                customer_name: orderData.customer_name,
                note: orderData.note,
                metadata: orderData.metadata,
                sync_status: 'synced'
              };
              handleViewOrderDetails(orderObj);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi khi tải đơn hàng tự động từ tham số đường dẫn:', err);
      }
    };

    autoLoadOrder();
  }, [orderIdParam]);

  // Hủy đơn hàng trực tuyến
  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    setIsCancelling(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const reason = cancelReason === 'other' ? customCancelReason : cancelReason;

      const res = await fetch(`${url}/api/shops/${shopId}/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason: reason || 'Không rõ' })
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Hủy đơn hàng thất bại');
      }

      if (Platform.OS !== 'web') {
        await db.update(schema.orders)
          .set({ status: 'cancelled' })
          .where(eq(schema.orders.id, selectedOrder.id));
      }

      await loadOrdersData();
      setSelectedOrder((prev: any) => prev ? { ...prev, status: 'cancelled' } : null);
      setShowCancelDialog(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.error('Lỗi khi hủy đơn hàng:', err);
      alert(err.message || 'Lỗi khi hủy đơn hàng. Vui lòng thử lại.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCreateReturn = async () => {
    if (!selectedOrder) return;
    
    const returningItems = selectedOrderItems
      .map(i => ({ ...i, retQty: returnItems[i.item_id || i.product_id] || 0 }))
      .filter(i => i.retQty > 0);

    if (returningItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm để trả');
      return;
    }

    setIsReturning(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();

      const totalRefund = returnRefundAmount !== '' 
        ? parseFloat(returnRefundAmount) 
        : returningItems.reduce((s, i) => {
            const effPrice = Number(i.unit_price) + Number(i.modifier_total || 0);
            return s + effPrice * i.retQty;
          }, 0);

      // 1. Create return header
      const retRes = await fetch(`${url}/api/shops/${shopId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          order_id:      selectedOrder.id,
          order_no:      selectedOrder.order_no || selectedOrder.id,
          customer_id:   selectedOrder.customer_id || '',
          customer_name: selectedOrder.customer_name || '',
          reason:        returnReason,
          refund_method: returnRefundMethod,
          total_refund:  String(totalRefund),
          status:        'pending',
          note:          returnNote,
        }),
      });

      if (!retRes.ok) {
        const errJson = await retRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Tạo phiếu trả hàng thất bại');
      }

      const ret = await retRes.json();

      // 2. Create return items
      await Promise.allSettled(
        returningItems.map((item) => {
          const effPrice = Number(item.unit_price) + Number(item.modifier_total || 0);
          const retLineTotal = effPrice * item.retQty;
          return fetch(`${url}/api/shops/${shopId}/return-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              return_id:    ret.return_id,
              return_no:    ret.return_no || ret.return_id,
              order_item_id: item.item_id || '',
              product_id:   item.product_id,
              product_name: item.product_name || '',
              sku:          item.sku || '',
              qty_returned: String(item.retQty),
              unit_price:   String(item.unit_price),
              line_total:   String(retLineTotal),
              variant_label: item.variant_label || '',
              modifiers: typeof item.modifiers === 'object' ? JSON.stringify(item.modifiers) : (item.modifiers || ''),
              modifier_total: String(item.modifier_total || '0'),
            }),
          });
        })
      );

      let processed = false;
      let processErrorStr = '';

      if (shopSettings?.skip_return_confirmation) {
        const processRes = await fetch(`${url}/api/shops/${shopId}/returns/${ret.return_id}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ processed_by: 'Hệ thống (Tự động)' })
        });
        if (processRes.ok) {
          processed = true;
        } else {
          const errData = await processRes.json().catch(() => ({}));
          processErrorStr = errData.message || errData.error || 'Thiếu quyền duyệt phiếu trả';
        }
      }

      // Fetch updated order status
      const orderRes = await fetch(`${url}/api/shops/${shopId}/orders/${selectedOrder.id}`, {
        headers
      });
      let updatedOrder = null;
      if (orderRes.ok) {
        updatedOrder = await orderRes.json();
      }

      if (updatedOrder && Platform.OS !== 'web') {
        await db.update(schema.orders)
          .set({ status: updatedOrder.status })
          .where(eq(schema.orders.id, selectedOrder.id));
      }

      await loadOrdersData();
      
      setShowReturnForm(false);
      setShowConfirmReturn(false);

      if (updatedOrder) {
        setSelectedOrder(updatedOrder);
        await handleViewOrderDetails(updatedOrder);
      } else {
        await handleViewOrderDetails(selectedOrder);
      }

      alert(processed ? 'Đã tạo và tự động duyệt phiếu trả hàng thành công' : 'Đã tạo phiếu trả hàng thành công (chờ duyệt)');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    } catch (err: any) {
      console.error('Lỗi khi tạo phiếu trả hàng:', err);
      alert(err.message || 'Lỗi khi tạo phiếu trả hàng. Vui lòng thử lại.');
    } finally {
      setIsReturning(false);
    }
  };

  const canCancel = selectedOrder && selectedOrder.sync_status === 'synced' && (
    (selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'in_progress' && hasPermission('orders.delete')) ||
    (selectedOrder.status === 'in_progress' && hasPermission('orders.delete') && (hasPermission('owner') || hasPermission('admin')))
  );

  const canReturn = selectedOrder && selectedOrder.sync_status === 'synced' && hasPermission('returns.create') && (
    selectedOrder.status === 'completed' || selectedOrder.status === 'partially_refunded'
  );

 // Đồng bộ
 const handleSyncSingleOrder = async (orderId: string) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 setIsSyncingOrder(orderId);
 try {
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const results = await SyncManager.pushOfflineOrders(shopId);
 
 await loadOrdersData();
 
 if (results.successCount > 0) {
 setIsSyncSuccessVisible(true);
} else {
 setIsSyncErrorVisible(true);
}
} catch (err: any) {
 console.error('Lỗi khi đồng bộ hóa đơn:', err);
 setIsSyncErrorVisible(true);
} finally {
 setIsSyncingOrder(null);
 setSelectedOrder(null);
}
};

 // In lại bill
 const handleReprint = () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 setIsReprinting(true);
 setTimeout(() => {
 setIsReprinting(false);
 setIsReprintSuccessVisible(true);
}, 1200);
};



 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
  <Header onPressMenu={() => setIsDrawerOpen(true)} />

 <View className="flex-1">
 
 {/* 2. THỐNG KÊ DOANH THU NHANH CA - Giảm góc bo về rounded-2xl */}
 <View className="p-4 flex-row justify-between">
 <View className="flex-1 mr-2 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-slate-400">Tổng doanh số ca</Text>
 {isLoading ? (
   <Skeleton width="60%" height={16} borderRadius={4} className="mt-1.5" />
 ) : (
   <Text className="text-orange-500 font-semibold text-xs mt-1.5">{formatCurrency(totalRevenue)}</Text>
 )}
 {isLoading ? (
   <Skeleton width="40%" height={10} borderRadius={3} className="mt-1" />
 ) : (
   <Text className="text-xxs text-slate-455 font-medium mt-0.5">{shiftOrdersCount} hóa đơn</Text>
 )}
 </View>

 <View className="flex-1 mx-1 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-emerald-600">Đã đồng bộ</Text>
 <Text className="text-emerald-700 font-semibold text-xs mt-1.5">{syncedCount}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">Đã lưu trữ</Text>
 </View>

 <View className="flex-1 ml-2 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-amber-600">Chờ đồng bộ</Text>
 <Text className="text-amber-700 font-semibold text-xs mt-1.5">{pendingCount}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">Chưa gửi lên</Text>
 </View>
 </View>

 {/* 3. TÌM KIẾM & BỘ LỌC */}
 <View className="px-4 pb-3">
  <View className="flex-row items-center mb-3">
  <View className="flex-1 flex-row items-center px-3 py-1.5 rounded-xl border bg-white border-slate-200 shadow-sm mr-2.5">
  <Ionicons name="search-outline" size={16} color="#94a3b8" />
  <TextInput
  placeholder="Tìm mã hóa đơn, tên khách hàng..."
  placeholderTextColor="#94a3b8"
  className="flex-1 ml-2 text-xs text-slate-800 py-1"
  value={searchQuery}
  onChangeText={setSearchQuery}
  style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
  }}
  />
  {searchQuery !== '' && (
  <TouchableOpacity onPress={() => setSearchQuery('')}>
  <Ionicons name="close-circle" size={16} color="#94a3b8" />
  </TouchableOpacity>
  )}
  </View>

  <TouchableOpacity 
    activeOpacity={0.7}
    onPress={onRefresh}
    disabled={isRefreshing}
    className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm justify-center items-center"
  >
    {isRefreshing ? (
      <ActivityIndicator size="small" color="#fa5908" style={{ width: 16, height: 16 }} />
    ) : (
      <Ionicons name="sync-outline" size={16} color="#fa5908" />
    )}
  </TouchableOpacity>
  </View>

 {/* Lọc theo Ca */}
  {shiftsList.length > 1 && (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
  {shiftsList.map(shift => (
  <TouchableOpacity
  key={shift.id}
  className="mr-2 px-3 py-1.5 rounded-xl border"
  style={selectedShift === shift.id ? {
    backgroundColor: '#fa5908',
    borderColor: '#fa5908'
  } : {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0'
  }}
  onPress={() => setSelectedShift(shift.id)}
  >
 <Text className={`text-xxs font-semibold ${
 selectedShift === shift.id ? 'text-white' : 'text-slate-500'
}`}>
 {shift.label}
 </Text>
 </TouchableOpacity>
 ))}
 </ScrollView>
 )}

 {/* Lọc theo Trạng thái Sync */}
 <View className="flex-row mb-1">
 <TouchableOpacity
 className="mr-2 px-3 py-1.5 rounded-xl border"
 style={selectedStatus === 'all' ? {
   backgroundColor: '#fa5908',
   borderColor: '#fa5908'
 } : {
   backgroundColor: '#ffffff',
   borderColor: '#e2e8f0'
 }}
 onPress={() => setSelectedStatus('all')}
 >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'all' ? 'text-white' : 'text-slate-500'
}`}>
 Tất cả
 </Text>
 </TouchableOpacity>

 <TouchableOpacity
 className="mr-2 px-3 py-1.5 rounded-xl border"
 style={selectedStatus === 'synced' ? {
   backgroundColor: '#059669',
   borderColor: '#059669'
 } : {
   backgroundColor: '#ecfdf5',
   borderColor: '#a7f3d0'
 }}
 onPress={() => setSelectedStatus('synced')}
 >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'synced' ? 'text-white' : 'text-emerald-700'
}`}>
 Đã đồng bộ ({syncedCount})
 </Text>
 </TouchableOpacity>

   <TouchableOpacity
  className="px-3 py-1.5 rounded-xl border"
  style={selectedStatus === 'pending' ? {
    backgroundColor: '#d97706',
    borderColor: '#d97706'
  } : {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a'
  }}
  onPress={() => setSelectedStatus('pending')}
  >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'pending' ? 'text-white' : 'text-amber-700'
}`}>
 Chờ đồng bộ ({pendingCount})
 </Text>
 </TouchableOpacity>
 </View>
 </View>

 {/* 4. DANH SÁCH LỚP PHÂN CẤP - Giảm bo card dòng xuống rounded-2xl */}
  <ScrollView 
    className="flex-1 px-4" 
    showsVerticalScrollIndicator={false}
    refreshControl={
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        colors={['#fa5908']}
        tintColor="#fa5908"
      />
    }
  >
  {isLoading ? (
    <View className="mt-2">
      {[1, 2, 3, 4, 5].map((key) => (
        <View key={key} className="mb-3 p-4 rounded-2xl border bg-white border-slate-100 flex-row justify-between items-center shadow-sm">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center mb-1">
              <View className="w-1.5 h-1.5 rounded-full mr-1.5 bg-slate-200" />
              <Skeleton width={100} height={12} borderRadius={4} />
              <View className="mx-1.5 w-1 h-1 bg-slate-200 rounded-full" />
              <Skeleton width={80} height={10} borderRadius={3} />
            </View>
            <Skeleton width={120} height={10} borderRadius={3} className="mt-2" />
            <View className="flex-row items-center mt-3">
              <Skeleton width={70} height={10} borderRadius={3} className="mr-2" />
              <Skeleton width={60} height={14} borderRadius={4} />
            </View>
          </View>
          <View className="items-end">
            <Skeleton width={70} height={14} borderRadius={4} />
            <Skeleton width={14} height={14} borderRadius={7} className="mt-3" />
          </View>
        </View>
      ))}
    </View>
  ) : ordersList.length === 0 ? (
 <View className="py-12 items-center justify-center bg-white rounded-2xl border border-slate-100 mt-2 shadow-sm">
 <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
 <Text className="text-xs text-slate-455 font-medium mt-3">Không tìm thấy hóa đơn nào phù hợp</Text>
 </View>
 ) : (
 ordersList.map(order => {
 const isPending = order.sync_status === 'pending';

 return (
 <TouchableOpacity
 key={order.id}
 activeOpacity={0.8}
 className="mb-3 p-4 rounded-2xl border bg-white border-slate-100 flex-row justify-between items-center"
 style={{shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}
 onPress={() => handleViewOrderDetails(order)}
 >
 <View className="flex-1 mr-3">
 <View className="flex-row items-center mb-1">
   <View className={"w-1.5 h-1.5 rounded-full mr-1.5 " + (isSyncingOrder === order.id ? "bg-amber-500" : (order.sync_status === 'synced' ? "bg-emerald-500" : order.sync_status === 'pending' ? "bg-amber-500" : "bg-rose-500"))} />
   <Text className="text-xs font-semibold text-slate-800">
   {order.id}
   </Text>
   <View className="mx-1.5 w-1 h-1 bg-slate-300 rounded-full" />
   <Text className="text-tiny text-slate-500 font-medium flex-1" numberOfLines={1}>
   {order.customer_name || 'Khách lẻ'}
   </Text>
 </View>

 <Text className="text-xxs text-slate-400 font-semibold mt-1">
 ⏱️ {order.created_at ? formatDateTime(order.created_at) : 'Ngoại tuyến'}
 </Text>

 <View className="flex-row items-center mt-3">
   <Text className="text-xxs text-slate-500 font-medium mr-2">
     💳 {getPaymentMethodDisplay(order.payment_method)}
   </Text>
   <Text className="text-xxs text-slate-300 font-medium mr-2">|</Text>
   {(() => {
     const { label, variant } = getOrderStatusBadgeProps(order.status);
     return (
       <Badge variant={variant} label={label} size="sm" />
     );
   })()}
 </View>
 </View>

 <View className="items-end">
 <Text className="text-orange-500 font-semibold text-xs">
 {formatCurrency(order.total_amount)}
 </Text>
 
 {isPending ? (
 <TouchableOpacity
 activeOpacity={0.7}
 className="bg-amber-500 px-3 py-1 rounded-xl mt-2 flex-row items-center shadow-sm"
 onPress={(e) => {
 e.stopPropagation();
 handleSyncSingleOrder(order.id);
}}
 disabled={isSyncingOrder === order.id}
 >
 <Ionicons 
 name={isSyncingOrder === order.id ? 'sync' : 'cloud-upload-outline'} 
 size={11} 
 color="white" 
 />
 <Text className="text-white text-xxs font-semibold ml-1.5">
 {isSyncingOrder === order.id ? 'Đang gửi...' : 'Đồng bộ'}
 </Text>
 </TouchableOpacity>
 ) : (
 <Ionicons name="chevron-forward-outline" size={14} color="#cbd5e1" className="mt-3" />
 )}
 </View>
 </TouchableOpacity>
 );
})
 )}
  {ordersList.length > 0 && hasMore && (
    <View className="py-4 items-center">
      {isLazyLoading ? (
        <ActivityIndicator size="small" color="#fa5908" />
      ) : (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            const nextLimit = limit + 10;
            setLimit(nextLimit);
            loadOrdersData(nextLimit, true);
          }}
          className="px-6 py-2.5 rounded-xl border bg-white shadow-sm flex-row items-center"
          style={{ borderColor: '#e2e8f0' }}
        >
          <Text className="text-xxs font-bold text-slate-600">Xem thêm đơn hàng</Text>
          <Ionicons name="chevron-down-outline" size={12} color="#475569" className="ml-1.5" />
        </TouchableOpacity>
      )}
    </View>
  )}
 <View className="h-20" />
 </ScrollView>

 {/* 5. MODAL CHI TIẾT HÓA ĐƠN */}
  <Modal
    visible={!!selectedOrder}
    animationType="slide"
    transparent={true}
    onRequestClose={() => {
      if (showConfirmReturn) {
        setShowConfirmReturn(false);
      } else if (showReturnForm) {
        setShowReturnForm(false);
      } else if (showCancelDialog) {
        setShowCancelDialog(false);
      } else {
        setSelectedOrder(null);
      }
    }}
  >
    <View className="flex-1 bg-black/60 justify-end">
      {/* Vùng backdrop phía trên — bấm để đóng */}
      <TouchableWithoutFeedback onPress={() => {
        if (!showCancelDialog && !showReturnForm && !showConfirmReturn) {
          setSelectedOrder(null);
        }
      }}>
        <View className="flex-1" />
      </TouchableWithoutFeedback>

      {/* Panel nội dung phía dưới */}
      {selectedOrder && (
        <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl">
  
          {/* Header Modal */}
          <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
            <View className="flex-1 mr-2">
              <View className="flex-row items-center flex-wrap gap-1">
                <Text className="text-xs font-semibold text-slate-800" numberOfLines={1}>
                  {selectedOrder.id}
                </Text>
                <TouchableOpacity
                  onPress={() => handleCopyOrderNo(selectedOrder.id)}
                  className="p-1 bg-slate-100 active:bg-slate-200 rounded"
                >
                  <Ionicons name={copiedId ? "checkmark" : "copy-outline"} size={11} color={copiedId ? "#10b981" : "#64748b"} />
                </TouchableOpacity>
                <Badge 
                  variant={selectedOrder.sync_status === 'pending' ? 'warning' : 'success'} 
                  label={selectedOrder.sync_status === 'pending' ? 'Chờ đồng bộ' : 'Đã đồng bộ'} 
                  size="sm"
                />
                {selectedOrder.sync_status === 'pending' && (
                  <TouchableOpacity
                    onPress={() => handleSyncSingleOrder(selectedOrder.id)}
                    disabled={isSyncingOrder === selectedOrder.id}
                    className="p-1 bg-amber-50 active:bg-amber-100 border border-amber-200 rounded items-center justify-center"
                  >
                    {isSyncingOrder === selectedOrder.id ? (
                      <ActivityIndicator size="small" color="#d97706" style={{ transform: [{ scale: 0.6 }] }} />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={11} color="#d97706" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <Text className="text-[10px] text-slate-400 mt-1 font-semibold">
                Khách hàng: {selectedOrder.customer_name || 'Khách lẻ'}
              </Text>
            </View>
           
            <View className="flex-row items-center">
              <TouchableOpacity 
                onPress={() => handleViewOrderDetails(selectedOrder, true)} 
                disabled={isDetailLoading}
                className="p-1.5 mr-2 bg-slate-50 active:bg-slate-150 rounded-full border border-slate-100"
              >
                {isDetailLoading ? (
                  <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.75 }] }} />
                ) : (
                  <Ionicons name="sync-outline" size={16} color="#64748b" />
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setSelectedOrder(null)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body Modal */}
          <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
            <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Thông tin chi tiết</Text>
            <View className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 mb-4">
              <View className="flex-row justify-between py-1">
                <Text className="text-tiny text-slate-500 font-medium">Mốc thời gian:</Text>
                <Text className="text-tiny font-semibold text-slate-800">
                  {selectedOrder.created_at ? formatDateTime(selectedOrder.created_at) : 'Ngoại tuyến'}
                </Text>
              </View>
              <View className="flex-row justify-between py-1 items-center">
                <Text className="text-tiny text-slate-500 font-medium">Mã hóa đơn:</Text>
                <TouchableOpacity
                  onPress={() => handleCopyOrderNo(selectedOrder.id)}
                  className="flex-row items-center active:opacity-75"
                >
                  <Text className="text-tiny font-semibold text-slate-700 mr-1">{selectedOrder.id}</Text>
                  <Ionicons name={copiedId ? "checkmark" : "copy-outline"} size={11} color={copiedId ? "#10b981" : "#64748b"} />
                </TouchableOpacity>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-tiny text-slate-500 font-medium">Khách hàng:</Text>
                <View className="items-end">
                  <Text className="text-tiny font-semibold text-slate-800">{selectedOrder.customer_name || 'Khách lẻ'}</Text>
                  {selectedOrderCustomerPhone && (
                    <Text className="text-tiny text-slate-500 mt-0.5">📞 {selectedOrderCustomerPhone}</Text>
                  )}
                </View>
              </View>
              {selectedOrder.note && (
                <View className="border-t border-slate-200 mt-2 pt-2">
                  <Text className="text-tiny text-slate-455 font-medium">Ghi chú đơn:</Text>
                  <Text className="text-xs text-slate-700 mt-1 font-semibold">{selectedOrder.note}</Text>
                </View>
              )}
            </View>

            {/* Thanh toán chi tiết theo từng phương thức + quỹ */}
            <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Thanh toán</Text>
            <View className="mb-4">
              {selectedOrderPayments.map((p, i) => {
                const method = p.method || 'cash';
                const amount = p.amount;
                const fund = paymentFundsList.find(f => f.id === p.fund_id);
                const methodLabel = translateMethod(method);
                const isDebt = method === 'debt';
                const isPrepaid = method === 'prepaid';
                return (
                  <View key={i} className="flex-row justify-between items-start py-2.5 border-b border-slate-100">
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Ionicons 
                          name={
                            method === 'cash' ? 'cash-outline' :
                            method === 'debt' ? 'warning-outline' :
                            method === 'prepaid' ? 'wallet-outline' : 'card-outline'
                          } 
                          size={14} 
                          color={
                            method === 'cash' ? '#10b981' :
                            method === 'debt' ? '#ef4444' :
                            method === 'prepaid' ? '#047857' : '#4f46e5'
                          } 
                        />
                        <Text className={"text-xs font-semibold ml-1.5 " + (isDebt ? "text-rose-600" : isPrepaid ? "text-emerald-700" : "text-slate-800")}>
                          {methodLabel}
                        </Text>
                        {p.reference_no ? (
                          <Text className="text-[10px] text-slate-400 ml-2">#{p.reference_no}</Text>
                        ) : null}
                      </View>
                      {fund && (
                        <View className="flex-row items-center mt-1">
                          <Ionicons name="business-outline" size={11} color="#f97316" />
                          <Text className="text-tiny font-medium text-orange-600 ml-1">
                            {fund.name}{fund.bank_name ? " (" + fund.bank_name + ")" : ''}
                          </Text>
                        </View>
                      )}
                      {p.note ? (
                        <Text className="text-[10px] text-slate-400 mt-0.5 italic">— {p.note}</Text>
                      ) : null}
                    </View>
                    {amount != null && (
                      <Text className={"text-xs font-bold ml-3 " + (isDebt ? "text-rose-600" : isPrepaid ? "text-emerald-700" : "text-slate-800")}>
                        {formatCurrency(Number(amount))}
                      </Text>
                    )}
                  </View>
                );
              })}
              
              {/* Hiển thị các giao dịch Sổ quỹ khác (ví dụ: Phiếu chi hoàn tiền) */}
              {isDetailLoading && selectedOrderCashbook.length === 0 ? (
                <View className="flex-row items-center py-2.5 px-2 gap-2 mt-1">
                  <Text className="text-[10px] text-slate-400 font-semibold">Đang cập nhật dòng tiền...</Text>
                  <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.7 }] }} />
                </View>
              ) : (
                selectedOrderCashbook
                  .filter(cb => !Array.from(paymentCbMap.values()).includes(cb.id || cb.transaction_id))
                  .map((cb, idx) => {
                    const cbId = cb.id || cb.transaction_id;
                    const isRefund = cb.category === 'refund';
                    return (
                      <View key={"cb-" + idx} className="flex-row justify-between items-start py-2.5 border-b border-slate-100 bg-slate-50/50 px-2 rounded-lg mt-1">
                        <View className="flex-1">
                          <View className="flex-row items-center">
                            <Ionicons 
                              name={cb.type === 'payment' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} 
                              size={14} 
                              color={cb.type === 'payment' ? '#ef4444' : '#10b981'} 
                            />
                            <Text className="text-xs font-semibold text-slate-800 ml-1.5">
                              {translateMethod(cb.method)}
                            </Text>
                            {isRefund && (
                              <View className="ml-2 border border-red-200 bg-red-50 px-1 py-0.2 rounded">
                                <Text className="text-[8px] text-red-600 font-bold uppercase tracking-wider">Hoàn tiền</Text>
                              </View>
                            )}
                          </View>
                          {(() => {
                            const displayCbId = cbId.startsWith('CB') ? cbId : (cbId.length > 15 && cbId.includes('-') ? cbId.substring(0, 8) : cbId);
                            return (
                              <TouchableOpacity
                                onPress={() => handleCopyCbNo(cbId)}
                                className="flex-row items-center active:opacity-75 mt-0.5"
                              >
                                <Text className="text-[10px] text-slate-400 font-mono mr-1.5">#{displayCbId}</Text>
                                <Ionicons 
                                  name={copiedCbId === cbId ? "checkmark" : "copy-outline"} 
                                  size={10} 
                                  color={copiedCbId === cbId ? "#10b981" : "#94a3b8"} 
                                />
                              </TouchableOpacity>
                            );
                          })()}
                          {cb.note ? (
                            <Text className="text-[10px] text-slate-400 mt-0.5 italic">— {cb.note}</Text>
                          ) : null}
                        </View>
                        <Text className={"text-xs font-bold ml-3 " + (cb.type === 'payment' ? "text-rose-600" : "text-emerald-700")}>
                          {cb.type === 'payment' ? '-' : '+'}{formatCurrency(cb.amount)}
                        </Text>
                      </View>
                    );
                  })
              )}
            </View>

            {/* Lịch sử trả hàng */}
            {isDetailLoading && selectedOrderReturns.length === 0 ? (
              <View className="mb-4 px-1 flex-row items-center gap-2">
                <Text className="text-xxs font-semibold text-slate-400">Đang tải lịch sử trả hàng...</Text>
                <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.7 }] }} />
              </View>
            ) : selectedOrderReturns.length > 0 ? (
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Lịch sử trả hàng</Text>
                {selectedOrderReturns.map((ret, rIdx) => {
                  const isApproved = ret.status === 'processed' || ret.status === 'completed';
                  return (
                    <View key={rIdx} className="p-3 mb-2.5 rounded-xl border border-orange-100 bg-orange-50/20">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-xs font-semibold text-slate-800">{ret.return_no || ret.return_id}</Text>
                        <Text className="text-xs font-bold text-orange-700">-{formatCurrency(ret.total_refund)}</Text>
                      </View>
                      <View className="flex-row items-center gap-1.5 mb-2">
                        <Badge
                          variant={isApproved ? 'success' : 'warning'}
                          label={isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                          size="sm"
                        />
                        <Text className="text-[10px] text-slate-400 font-semibold">
                          {ret.created_at ? formatDateTime(ret.created_at) : ''}
                        </Text>
                      </View>
                      {ret.note ? (
                        <Text className="text-[10px] text-slate-500 mb-2 italic">Ghi chú: {ret.note}</Text>
                      ) : null}
                      {Array.isArray(ret.items) && ret.items.map((it: any, iIdx: number) => (
                        <View key={iIdx} className="flex-row justify-between py-1 border-t border-slate-100/60 items-center">
                          <Text className="text-xxs text-slate-600">{it.product_name}</Text>
                          <Text className="text-xxs font-semibold text-slate-800">SL: {it.qty_returned}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Mặt hàng đã mua</Text>
            {selectedOrderItems.map((item, idx) => {
              const parsedModifiers = typeof item.modifiers === 'string' && item.modifiers.startsWith('[') 
                ? (() => { try { return JSON.parse(item.modifiers); } catch { return []; } })() 
                : (item.modifiers || []);
              const effPrice = Number(item.unit_price) + Number(item.modifier_total || 0);
              const itemReturned = alreadyReturnedQty[item.item_id || item.product_id] || 0;

              return (
                <View key={idx} className="py-3 border-b border-slate-100">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 mr-3">
                      <Text className="text-xs font-medium text-slate-800">{item.product_name}</Text>
                      {item.variant_label && parsedModifiers.length === 0 ? (
                        <Text className="text-[10px] text-violet-600 font-medium mt-0.5">{item.variant_label}</Text>
                      ) : null}
                      {parsedModifiers.length > 0 ? (
                        <Text className="text-[10px] text-amber-600 mt-0.5">
                          {parsedModifiers.map((m: any) => m.option).join(' · ')}
                          {Number(item.modifier_total || 0) > 0 ? (
                            <Text className="text-emerald-600 font-medium ml-1">+{formatCurrency(Number(item.modifier_total))}</Text>
                          ) : null}
                        </Text>
                      ) : null}
                      <Text className="text-tiny text-slate-500 font-medium mt-1">
                        SL: {item.qty} x {formatCurrency(effPrice)}
                        {item.tax_rate && parseFloat(item.tax_rate) > 0 ? ` · VAT ${item.tax_rate}%` : ''}
                      </Text>
                      {(() => {
                        const originalPrice = (item as any).original_price;
                        const hasOriginalPrice = originalPrice !== null && originalPrice !== undefined && originalPrice !== '';
                        const basePrice = hasOriginalPrice ? Number(originalPrice) : Number(item.unit_price);
                        const discountAmt = Number((item as any).line_discount || (item as any).discount_amount || 0);
                        const isPriceEdited = (hasOriginalPrice && Number(item.unit_price) !== Number(originalPrice)) || discountAmt > 0;
                        return isPriceEdited ? (
                          <View className="self-start mt-0.5 px-1 py-0.5 rounded bg-orange-50">
                            <Text className="text-[10px] text-orange-600">Đã điều chỉnh</Text>
                          </View>
                        ) : null;
                      })()}
                      {itemReturned > 0 ? (
                        <Text className="text-xxs text-orange-600 font-semibold mt-0.5">
                          (Đã trả {itemReturned})
                        </Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-semibold text-slate-800">
                        {formatCurrency(item.line_total)}
                      </Text>
                      {(() => {
                        const originalPrice = (item as any).original_price;
                        const hasOriginalPrice = originalPrice !== null && originalPrice !== undefined && originalPrice !== '';
                        const basePrice = hasOriginalPrice ? Number(originalPrice) : Number(item.unit_price);
                        const priceDiff = basePrice - Number(item.unit_price);
                        const discountAmt = Number((item as any).line_discount || (item as any).discount_amount || 0);
                        const totalReduction = Math.max(priceDiff, discountAmt);
                        if (totalReduction > 0) {
                          return (
                            <Text className="text-[11px] text-orange-500 italic mt-0.5">
                              Giảm: -{formatCurrency(totalReduction * Number(item.qty || 1))}
                            </Text>
                          );
                        }
                        return null;
                      })()}
                      {item.tax_amount && Number(item.tax_amount) > 0 ? (
                        <Text className="text-[10px] text-slate-400 mt-0.5">
                          + VAT: {formatCurrency(Number(item.tax_amount))}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
            
            {(() => {
              const discountAmount = Number(selectedOrder.discount_amount || 0);
              const taxAmount = Number(selectedOrder.tax_amount || 0);
              const hasBreakdown = discountAmount > 0 || taxAmount > 0;
              
              if (hasBreakdown) {
                return (
                  <View className="border-t border-slate-200 mt-4 pt-2">
                    <View className="flex-row justify-between py-2 items-center">
                      <Text className="text-xs text-slate-500 font-medium">Tạm tính</Text>
                      <Text className="text-xs font-semibold text-slate-800">
                        {formatCurrency(selectedOrder.total_amount - taxAmount + discountAmount)}
                      </Text>
                    </View>
                    {discountAmount > 0 && (
                      <View className="flex-row justify-between py-2 items-center">
                        <Text className="text-xs text-slate-500 font-medium">Giảm giá</Text>
                        <Text className="text-xs font-semibold text-rose-600">
                          -{formatCurrency(discountAmount)}
                        </Text>
                      </View>
                    )}
                    {taxAmount > 0 && (
                      <View className="flex-row justify-between py-2 items-center">
                        <Text className="text-xs text-slate-500 font-medium">Thuế (VAT)</Text>
                        <Text className="text-xs font-semibold text-slate-800">
                          {formatCurrency(taxAmount)}
                        </Text>
                      </View>
                    )}
                    <View className="flex-row justify-between py-4 border-t border-slate-200 mt-2 items-center">
                      <Text className="text-xs font-semibold text-slate-800">Tổng thanh toán</Text>
                      <Text className="text-orange-500 text-base font-semibold">
                        {formatCurrency(selectedOrder.total_amount)}
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <View className="flex-row justify-between py-4 border-t border-slate-200 mt-4 items-center">
                  <Text className="text-xs font-semibold text-slate-800">Tổng thanh toán</Text>
                  <Text className="text-orange-500 text-base font-semibold">
                    {formatCurrency(selectedOrder.total_amount)}
                  </Text>
                </View>
              );
            })()}
          </ScrollView>

          {/* Actions Footer */}
          <View className="border-t border-slate-100 pt-3 gap-2">
            {selectedOrder.status === 'cancelled' && (
              <View className="bg-rose-50 py-2 rounded-lg items-center flex-row justify-center border border-rose-100">
                <Ionicons name="close-circle-outline" size={12} color="#ef4444" />
                <Text className="font-semibold text-[10px] ml-1 text-rose-700">ĐƠN HÀNG ĐÃ HỦY</Text>
              </View>
            )}
            {selectedOrder.status === 'refunded' && (
              <View className="bg-slate-50 py-2 rounded-lg items-center flex-row justify-center border border-slate-200">
                <Ionicons name="arrow-undo-outline" size={12} color="#64748b" />
                <Text className="font-semibold text-[10px] ml-1 text-slate-700">ĐƠN HÀNG ĐÃ HOÀN TIỀN</Text>
              </View>
            )}

            {/* Hàng 3 nút: In, Đổi trả, Hủy */}
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                title="In"
                icon={<Ionicons name="print-outline" size={14} color="#475569" />}
                onPress={handleReprint}
                loading={isReprinting}
                className="flex-1 py-2.5 rounded-xl border-slate-200"
                textClassName="text-slate-700 text-xxs font-bold"
              />

              <Button
                variant="outline"
                title="Đổi trả"
                icon={<Ionicons name="refresh-outline" size={14} color={canReturn ? '#7c3aed' : '#cbd5e1'} />}
                onPress={() => {
                  if (!canReturn) return;
                  setReturnItems({});
                  setReturnReason('wrong_item');
                  setReturnRefundMethod('cash');
                  setReturnRefundAmount('');
                  setReturnNote('');
                  setShowReturnForm(true);
                }}
                disabled={!canReturn}
                className={"flex-1 py-2.5 rounded-xl " + (canReturn ? "border-violet-500 bg-white" : "border-slate-100 bg-slate-50")}
                textClassName={"text-xxs font-bold " + (canReturn ? "text-violet-600" : "text-slate-300")}
                style={canReturn ? { borderColor: '#7c3aed' } : { borderColor: '#e2e8f0' }}
              />

              <Button
                variant={canCancel ? 'danger' : 'outline'}
                title={selectedOrder.status === 'in_progress' ? 'Gỡ kẹt' : 'Hủy'}
                icon={<Ionicons name="ban-outline" size={14} color={canCancel ? 'white' : '#cbd5e1'} />}
                onPress={() => {
                  if (!canCancel) return;
                  setCancelReason('Sai sót hệ thống');
                  setCustomCancelReason('');
                  setShowCancelDialog(true);
                }}
                disabled={!canCancel}
                className={"flex-1 py-2.5 rounded-xl " + (canCancel ? "" : "border-slate-100 bg-slate-50")}
                textClassName={"text-xxs font-bold " + (canCancel ? "text-white" : "text-slate-300")}
                style={canCancel ? undefined : { borderColor: '#e2e8f0' }}
              />
            </View>
          </View>
        </View>
      )}

      {/* CÁC DIALOG / MODAL ĐƯỢC CHUYỂN THÀNH ABSOLUTE VIEWS ĐỂ TRÁNH LỖI ĐƠ UI TRÊN IOS */}

      {/* 1. DIALOG HỦY ĐƠN HÀNG */}
      {showCancelDialog && (
        <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-50">
          <TouchableWithoutFeedback onPress={() => setShowCancelDialog(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
            <View className="bg-red-50 p-4 rounded-full mb-4 items-center justify-center border border-red-100">
              <Ionicons name="warning-outline" size={32} color="#ef4444" />
            </View>
            <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
              Xác nhận hủy đơn hàng
            </Text>
            
            <View className="w-full gap-2 mb-4">
              <Text className="text-xxs font-semibold text-slate-400 mb-1">Chọn lý do hủy:</Text>
              {[
                'Sai sót hệ thống',
                'Nhập nhầm đơn',
                'Khách không nhận hàng',
                'Khách hủy trước khi giao',
                'other'
              ].map((reason) => {
                const isSelected = cancelReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    activeOpacity={0.7}
                    className={"p-3 rounded-xl border flex-row justify-between items-center " + (
                      isSelected ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200/60'
                    )}
                    onPress={() => setCancelReason(reason)}
                  >
                    <Text className={"text-xs font-semibold " + (isSelected ? 'text-rose-700' : 'text-slate-700')}>
                      {reason === 'other' ? 'Lý do khác...' : reason}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-done" size={16} color="#ef4444" />
                    )}
                  </TouchableOpacity>
                );
              })}

              {cancelReason === 'other' && (
                <TextInput
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 mt-1"
                  placeholder="Nhập lý do hủy chi tiết..."
                  value={customCancelReason}
                  onChangeText={setCustomCancelReason}
                  multiline
                  numberOfLines={3}
                />
              )}
            </View>

            <View className="flex-row justify-between w-full mt-2 gap-3">
              <Button
                variant="outline"
                title="Quay lại"
                onPress={() => setShowCancelDialog(false)}
                className="rounded-2xl flex-1"
              />
              <Button
                variant="danger"
                title="Hủy đơn"
                loading={isCancelling}
                onPress={handleCancelOrder}
                className="rounded-2xl flex-[1.3]"
              />
            </View>
          </View>
        </View>
      )}

      {/* 2. FORM TẠO PHIẾU TRẢ HÀNG */}
      {showReturnForm && (
        <View className="absolute inset-0 bg-black/60 justify-end z-40">
          <TouchableWithoutFeedback onPress={() => {
            if (!showConfirmReturn) setShowReturnForm(false);
          }}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="h-[80%] bg-white rounded-t-2xl p-6 justify-between">
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View>
                <Text className="text-sm font-semibold text-slate-800">Tạo phiếu trả hàng</Text>
                <Text className="text-xxs text-slate-455 mt-1 font-semibold">Hóa đơn: {selectedOrder?.id}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReturnForm(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Body */}
            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
              <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">Sản phẩm trả lại</Text>
              
              {selectedOrderItems.map((item) => {
                const itemId = item.item_id || item.product_id;
                const maxReturnable = Number(item.qty) - (alreadyReturnedQty[itemId] || 0);
                const currentRetQty = returnItems[itemId] || 0;
                const parsedModifiers = typeof item.modifiers === 'string' && item.modifiers.startsWith('[')
                  ? (() => { try { return JSON.parse(item.modifiers); } catch { return []; } })()
                  : (item.modifiers || []);
                const effPrice = Number(item.unit_price) + Number(item.modifier_total || 0);

                if (maxReturnable <= 0) return null;

                return (
                  <View key={itemId} className="py-3 border-b border-slate-100">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 mr-3">
                        <Text className="text-xs font-semibold text-slate-800">{item.product_name}</Text>
                        {item.variant_label ? (
                          <Text className="text-[10px] text-violet-600 font-semibold mt-0.5">{item.variant_label}</Text>
                        ) : null}
                        {parsedModifiers.length > 0 ? (
                          <Text className="text-[10px] text-amber-600 mt-0.5">
                            {parsedModifiers.map((m: any) => m.option).join(' · ')}
                          </Text>
                        ) : null}
                        <Text className="text-xxs text-slate-455 font-semibold mt-1">
                          Giá: {formatCurrency(effPrice)} | Đã mua: {item.qty} (Đã trả: {alreadyReturnedQty[itemId] || 0})
                        </Text>
                      </View>
                      
                      {/* Quantity adjustment buttons */}
                      <View className="flex-row items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                        <TouchableOpacity
                          onPress={() => {
                            if (currentRetQty > 0) {
                              setReturnItems(prev => ({ ...prev, [itemId]: currentRetQty - 1 }));
                            }
                          }}
                          className="px-3 py-1.5 active:bg-slate-200"
                        >
                          <Ionicons name="remove" size={14} color="#64748b" />
                        </TouchableOpacity>
                        <Text className="px-3 text-xs font-bold text-slate-800">{currentRetQty}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            if (currentRetQty < maxReturnable) {
                              setReturnItems(prev => ({ ...prev, [itemId]: currentRetQty + 1 }));
                            }
                          }}
                          className="px-3 py-1.5 active:bg-slate-200"
                        >
                          <Ionicons name="add" size={14} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Refund details form */}
              <View className="mt-4 gap-4">
                {/* Lý do trả hàng */}
                <View>
                  <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">Lý do trả hàng</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[
                      { value: 'wrong_item', label: 'Sai sản phẩm' },
                      { value: 'changed_mind', label: 'Đổi ý' },
                      { value: 'defective', label: 'Lỗi sản phẩm' },
                      { value: 'damaged', label: 'Hư hỏng' },
                      { value: 'other', label: 'Khác' }
                    ].map((item) => {
                      const isSelected = returnReason === item.value;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          activeOpacity={0.7}
                          className={"px-3 py-2 rounded-xl border " + (
                            isSelected ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200/60'
                          )}
                          onPress={() => setReturnReason(item.value)}
                        >
                          <Text className={"text-xxs font-bold " + (isSelected ? 'text-orange-600' : 'text-slate-600')}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Phương thức hoàn tiền */}
                <View>
                  <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">Phương thức hoàn tiền</Text>
                  <View className="flex-row gap-2">
                    {[
                      { value: 'cash', label: 'Tiền mặt', icon: 'cash-outline' },
                      { value: 'bank_transfer', label: 'Chuyển khoản', icon: 'card-outline' },
                      { value: 'none', label: 'Không hoàn tiền', icon: 'close-circle-outline' }
                    ].map((item) => {
                      const isSelected = returnRefundMethod === item.value;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          activeOpacity={0.7}
                          className={"flex-1 p-2.5 rounded-xl border items-center flex-row justify-center gap-1.5 " + (
                            isSelected ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200/60'
                          )}
                          onPress={() => setReturnRefundMethod(item.value)}
                        >
                          <Ionicons name={item.icon as any} size={13} color={isSelected ? '#f97316' : '#64748b'} />
                          <Text className={"text-[10px] font-bold " + (isSelected ? 'text-orange-600' : 'text-slate-600')}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Số tiền hoàn lại */}
                {returnRefundMethod !== 'none' && (
                  <View>
                    <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">
                      Số tiền hoàn (để trống = tự động tính: {
                        (() => {
                          const total = selectedOrderItems
                            .map(i => ({ ...i, retQty: returnItems[i.item_id || i.product_id] || 0 }))
                            .filter(i => i.retQty > 0)
                            .reduce((s, i) => s + (Number(i.unit_price) + Number(i.modifier_total || 0)) * i.retQty, 0);
                          return formatCurrency(total);
                        })()
                      })
                    </Text>
                    <TextInput
                      className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-700"
                      keyboardType="numeric"
                      placeholder="Nhập số tiền hoàn..."
                      value={returnRefundAmount}
                      onChangeText={setReturnRefundAmount}
                    />
                  </View>
                )}

                {/* Ghi chú */}
                <View>
                  <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">Ghi chú phiếu trả</Text>
                  <TextInput
                    className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-700"
                    placeholder="Nhập ghi chú chi tiết..."
                    value={returnNote}
                    onChangeText={setReturnNote}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Action Button */}
            <View className="border-t border-slate-100 pt-4 flex-row gap-3">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={() => setShowReturnForm(false)}
                className="flex-1 py-3 rounded-xl"
              />
              <Button
                variant="primary"
                title="Xác nhận trả hàng"
                onPress={() => setShowConfirmReturn(true)}
                className="flex-1 py-3 rounded-xl"
                disabled={
                  Object.values(returnItems).reduce((sum, q) => sum + q, 0) === 0
                }
              />
            </View>
          </View>
        </View>
      )}

      {/* 3. DIALOG XÁC NHẬN TẠO PHIẾU TRẢ HÀNG */}
      {showConfirmReturn && (
        <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-50">
          <TouchableWithoutFeedback onPress={() => setShowConfirmReturn(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
            <View className="bg-orange-50 p-4 rounded-full mb-4 items-center justify-center border border-orange-100">
              <Ionicons name="information-circle-outline" size={32} color="#fa5908" />
            </View>
            <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
              Xác nhận tạo phiếu trả
            </Text>
            <Text className="text-xs text-slate-455 mt-1 text-center font-semibold leading-relaxed mb-4">
              {"Bạn có chắc chắn muốn tạo phiếu trả hàng cho các sản phẩm đã chọn với số tiền hoàn lại là " + (
                returnRefundAmount !== '' 
                  ? formatCurrency(Number(returnRefundAmount)) 
                  : formatCurrency(selectedOrderItems.map(i => ({ ...i, retQty: returnItems[i.item_id || i.product_id] || 0 })).filter(i => i.retQty > 0).reduce((s, i) => s + (Number(i.unit_price) + Number(i.modifier_total || 0)) * i.retQty, 0))
              ) + "?"}
            </Text>
            <View className="flex-row justify-between w-full mt-2 gap-3">
              <Button
                variant="outline"
                title="Quay lại"
                onPress={() => setShowConfirmReturn(false)}
                className="rounded-2xl flex-1"
              />
              <Button
                variant="primary"
                title="Đồng ý"
                loading={isReturning}
                onPress={handleCreateReturn}
                className="rounded-2xl flex-[1.3]"
                style={{ backgroundColor: '#f97316' }}
              />
            </View>
          </View>
        </View>
      )}

      {/* 4. DIALOG BÁO IN THÀNH CÔNG */}
      {isReprintSuccessVisible && (
        <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-50">
          <TouchableWithoutFeedback onPress={() => setIsReprintSuccessVisible(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
            <View className="bg-emerald-50 p-4 rounded-full mb-4 items-center justify-center border border-emerald-100">
              <Ionicons name="checkmark-circle-outline" size={32} color="#10b981" />
            </View>
            <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
              Đã gửi lệnh in
            </Text>
            <Text className="text-xs text-slate-450 mt-1 text-center font-semibold leading-relaxed mb-4">
              Lệnh in lại đã được gửi đến máy in K80 Bluetooth thành công!
            </Text>
            <Button
              variant="primary"
              title="Hoàn tất"
              onPress={() => setIsReprintSuccessVisible(false)}
              className="rounded-2xl w-full"
            />
          </View>
        </View>
      )}

      {/* 5. DIALOG BÁO ĐỒNG BỘ THÀNH CÔNG */}
      {isSyncSuccessVisible && (
        <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-50">
          <TouchableWithoutFeedback onPress={() => setIsSyncSuccessVisible(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
            <View className="bg-emerald-50 p-4 rounded-full mb-4 items-center justify-center border border-emerald-100">
              <Ionicons name="checkmark-circle-outline" size={32} color="#10b981" />
            </View>
            <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
              Đồng bộ thành công
            </Text>
            <Text className="text-xs text-slate-455 mt-1 text-center font-semibold leading-relaxed mb-4">
              Đơn hàng ngoại tuyến đã được đồng bộ lên hệ thống thành công!
            </Text>
            <Button
              variant="primary"
              title="Đóng"
              onPress={() => setIsSyncSuccessVisible(false)}
              className="rounded-2xl w-full"
            />
          </View>
        </View>
      )}

      {/* 6. DIALOG BÁO ĐỒNG BỘ THẤT BẠI */}
      {isSyncErrorVisible && (
        <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-50">
          <TouchableWithoutFeedback onPress={() => setIsSyncErrorVisible(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>
          <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
            <View className="bg-red-50 p-4 rounded-full mb-4 items-center justify-center border border-red-100">
              <Ionicons name="warning-outline" size={32} color="#ef4444" />
            </View>
            <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
              Đồng bộ thất bại
            </Text>
            <Text className="text-xs text-slate-455 mt-1 text-center font-semibold leading-relaxed mb-4">
              Không thể kết nối đến máy chủ. Vui lòng thử lại sau khi có mạng ổn định.
            </Text>
            <Button
              variant="danger"
              title="Xác nhận"
              onPress={() => setIsSyncErrorVisible(false)}
              className="rounded-2xl w-full"
            />
          </View>
        </View>
      )}
    </View>
  </Modal>

  {/* CÁC DIALOG BÁO CÁO KHI MODAL CHI TIẾT ĐANG ĐÓNG (TRÁNH CLASH NATIVE MODALS) */}
  {!selectedOrder && (
    <>
      <Dialog
        visible={isReprintSuccessVisible}
        onClose={() => setIsReprintSuccessVisible(false)}
        onConfirm={() => setIsReprintSuccessVisible(false)}
        title="Đã gửi lệnh in"
        description="Lệnh in lại đã được gửi đến máy in K80 Bluetooth thành công!"
        confirmLabel="Hoàn tất"
        variant="success"
      />

      <Dialog
        visible={isSyncSuccessVisible}
        onClose={() => setIsSyncSuccessVisible(false)}
        onConfirm={() => setIsSyncSuccessVisible(false)}
        title="Đồng bộ thành công"
        description="Đơn hàng ngoại tuyến đã được đồng bộ lên hệ thống thành công!"
        confirmLabel="Đóng"
        variant="success"
      />

      <Dialog
        visible={isSyncErrorVisible}
        onClose={() => setIsSyncErrorVisible(false)}
        onConfirm={() => setIsSyncErrorVisible(false)}
        title="Đồng bộ thất bại"
        description="Không thể kết nối đến máy chủ. Vui lòng thử lại sau khi có mạng ổn định."
        confirmLabel="Xác nhận"
        variant="danger"
      />
    </>
  )}
{/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName="Chi nhánh chính"
 />

 </View>
 </SafeAreaView>
 );
}
