import React, {useState, useCallback, useEffect} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, Modal, Platform, ActivityIndicator, RefreshControl} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq, desc} from 'drizzle-orm';
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

export default function OrdersScreen() {
  const {hasPermission} = usePermissions();
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<any[]>([]);
  const [selectedOrderReturns, setSelectedOrderReturns] = useState<any[]>([]);
  const [selectedOrderCashbook, setSelectedOrderCashbook] = useState<any[]>([]);
  const [shopSettings, setShopSettings] = useState<any>({});

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
 
 const [selectedOrder, setSelectedOrder] = useState<any>(null);
 const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]);
 const [selectedOrderCustomerPhone, setSelectedOrderCustomerPhone] = useState<string | null>(null);
 const [paymentFundsList, setPaymentFundsList] = useState<any[]>([]);
 const [isSyncingOrder, setIsSyncingOrder] = useState<string | null>(null);
 const [isReprinting, setIsReprinting] = useState(false);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);
 const [copiedId, setCopiedId] = useState(false);

 const handleCopyOrderNo = async (text: string) => {
   await Clipboard.setStringAsync(text);
   setCopiedId(true);
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
   setTimeout(() => {
     setCopiedId(false);
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

   // 1. NẾU CÓ TÌM KIẾM -> Ưu tiên Online trước, sau đó fallback Offline
   if (searchQuery !== '') {
     let fetchSearchSuccess = false;
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
       setOrdersList(searchedOrders);
       setHasMore(searchedOrders.length >= currentLimit);
     } else {
       if (Platform.OS === 'web') {
         setOrdersList([]);
         setHasMore(false);
       } else {
         const allOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.created_at));
         const filtered = allOrders.filter((o: any) => {
           const matchesSearch = 
             (o.id && o.id.toLowerCase().includes(searchQuery.toLowerCase())) || 
             (o.order_no && o.order_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
             (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
           const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
           const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
           const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
           return matchesSearch && (isLocalShift || isActiveShift || isDefaultShift);
         });
         const sliced = filtered.slice(0, currentLimit);
         setOrdersList(sliced);
         setHasMore(filtered.length > currentLimit);
       }
     }
   } 
   // 2. KHÔNG TÌM KIẾM -> Offline First (Hiển thị ngay từ SQLite, đồng bộ ngầm sau)
   else {
     let localOrdersData: any[] = [];
     if (Platform.OS === 'web') {
       localOrdersData = [
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
       const allOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.created_at));
       localOrdersData = allOrders.filter((o: any) => {
         const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
         const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
         const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
         return isLocalShift || isActiveShift || isDefaultShift;
       });
     }

     const slicedLocal = localOrdersData.slice(0, currentLimit);
     setOrdersList(slicedLocal);
     setHasMore(localOrdersData.length > currentLimit);

     if (Platform.OS !== 'web') {
       const funds = await db.select().from(schema.paymentFunds);
       setPaymentFundsList(funds);
     }

     // Chạy đồng bộ ngầm tải 10 đơn hàng mới nhất (Background Sync) khi không lazy load
     if (!isLoadMore && Platform.OS !== 'web') {
       (async () => {
         try {
           const headers = await getApiHeaders();
           const url = getApiBaseUrl();

           // A. Đồng bộ ca từ server trước
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

           // B. Tải 10 đơn hàng mới nhất từ server
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
                   sync_status: 'synced',
                   discount_amount: order.discount_amount,
                   note: order.note,
                 }
               });
             }

             // Cập nhật lại UI sau khi đồng bộ ngầm thành công
             const updatedOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.created_at));
             const filteredUpdated = updatedOrders.filter((o: any) => {
               const isLocalShift = o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`);
               const isActiveShift = activeShiftId && o.shift_id === activeShiftId;
               const isDefaultShift = !isShiftEnabled && o.shift_id === 'default-shift';
               return isLocalShift || isActiveShift || isDefaultShift;
             });
             const slicedUpdated = filteredUpdated.slice(0, currentLimit);
             setOrdersList(slicedUpdated);
             setHasMore(filteredUpdated.length > currentLimit);
           }
         } catch (bgErr) {
           console.warn('Lỗi đồng bộ ngầm đơn hàng từ Cloud về SQLite:', bgErr);
         } finally {
           if (triggerRefresh) {
             setIsRefreshing(false);
           }
         }
       })();
     } else if (triggerRefresh) {
       setIsRefreshing(false);
     }
   }

   const mappedShifts = [
     { id: 'all', label: 'Tất cả ca' },
     ...shiftsData.map((s: any) => ({
       id: s.id,
       label: `Ca ${s.employee_name || 'Thu ngân'} (${s.opened_at.substring(11, 16)} - ${s.closed_at ? s.closed_at.substring(11, 16) : 'Đang mở'})`
     }))
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

  // Xem chi tiết
  const handleViewOrderDetails = async (order: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    // Reset details to avoid showing stale data
    setSelectedOrderItems([]);
    setSelectedOrderPayments([]);
    setSelectedOrderReturns([]);
    setSelectedOrderCashbook([]);
    setShopSettings({});
    setSelectedOrderCustomerPhone(null);

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      
      let fetchedOnline = false;

      // Only attempt online fetch if synced and shopId exists
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

            setSelectedOrderItems(itemsJson.data || []);
            setSelectedOrderPayments(paymentsJson.data || []);
            setSelectedOrderReturns(returnsWithItems);
            setShopSettings(settingsJson || {});

            const cbData = cashbookJson.data || [];
            // Load transactions for returned items as well
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
          console.warn('Lỗi tải dữ liệu trực tuyến, tự động chuyển về ngoại tuyến:', err);
        }
      }

      // SQLite fallback if offline or failed online fetch
      if (!fetchedOnline) {
        let items = [];
        if (Platform.OS === 'web') {
          items = [
            {id: 'it1', product_name: 'Cà phê Phin Sữa Đá', qty: 2, unit_price: 29000, line_total: 58000},
            {id: 'it2', product_name: 'Trà Đào Cam Sả', qty: 1, unit_price: 39000, line_total: 39000}
          ];
        } else {
          items = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, order.id));
        }
        setSelectedOrderItems(items);

        let localPayments: any[] = [];
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
        setSelectedOrderPayments(localPayments);
      }

      // Retrieve customer phone
      let customerPhone: string | null = null;
      if (Platform.OS !== 'web') {
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
      }
      setSelectedOrderCustomerPhone(customerPhone);
      setSelectedOrder(order);
    } catch (err) {
      console.error('Lỗi tải chi tiết dòng sản phẩm:', err);
    }
  };

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

 const filteredOrders = ordersList.filter(order => {
 const matchesSearch = 
 (order.id && order.id.toLowerCase().includes(searchQuery.toLowerCase())) || 
 (order.order_no && order.order_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
 (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
 
 const matchesShift = selectedShift === 'all' || order.shift_id === selectedShift;
 const matchesStatus = selectedStatus === 'all' || order.sync_status === selectedStatus;
 
 return matchesSearch && matchesShift && matchesStatus;
});

   const targetShiftId = selectedShift !== 'all' ? selectedShift : (activeShiftId || 'default-shift');
   const totalRevenue = filteredOrders
     .filter(order => order.shift_id === targetShiftId)
     .reduce((sum, order) => sum + order.total_amount, 0);
   const shiftOrdersCount = filteredOrders.filter(order => order.shift_id === targetShiftId).length;
   const syncedCount = filteredOrders.filter(o => o.sync_status === 'synced').length;
   const pendingCount = filteredOrders.filter(o => o.sync_status === 'pending').length;

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus={pendingCount > 0 ? 'pending' : 'synced'} />

 {isLoading ? (
 <View className="flex-1 px-4 pt-4">
 <View className="flex-row justify-between mb-6">
 <Skeleton width="30%" height={70} borderRadius={12} />
 <Skeleton width="30%" height={70} borderRadius={12} />
 <Skeleton width="30%" height={70} borderRadius={12} />
 </View>
 <Skeleton.Text lines={5} gap={16} height={20} />
 </View>
 ) : (
 <View className="flex-1">
 
 {/* 2. THỐNG KÊ DOANH THU NHANH CA - Giảm góc bo về rounded-2xl */}
 <View className="p-4 flex-row justify-between">
 <View className="flex-1 mr-2 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-slate-400">Tổng doanh số ca</Text>
 <Text className="text-orange-500 font-semibold text-xs mt-1.5">{formatCurrency(totalRevenue)}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">{shiftOrdersCount} hóa đơn</Text>
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
 {filteredOrders.length === 0 ? (
 <View className="py-12 items-center justify-center bg-white rounded-2xl border border-slate-100 mt-2 shadow-sm">
 <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
 <Text className="text-xs text-slate-455 font-medium mt-3">Không tìm thấy hóa đơn nào phù hợp</Text>
 </View>
 ) : (
 filteredOrders.map(order => {
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
 <View className="flex-row items-center">
  <Text className="text-xs font-semibold text-slate-800">
  {order.id}
  </Text>
 <View className="mx-1.5 w-1 h-1 bg-slate-300 rounded-full" />
 <Text className="text-tiny text-slate-500 font-medium" numberOfLines={1}>
 {order.customer_name || 'Khách mua lẻ'}
 </Text>
 </View>

 <Text className="text-xxs text-slate-400 font-semibold mt-1">
 ⏱️ {order.created_at ? formatDateTime(order.created_at) : 'Ngoại tuyến'}
 </Text>

 <View className="flex-row items-center mt-3">
 <Badge 
 variant={isPending ? 'warning' : 'success'} 
 label={isPending ? 'Chờ đồng bộ' : 'Đã đồng bộ'} 
 size="sm" 
 />

 <Text className="text-xxs text-slate-500 font-medium ml-3.5">
 💳 {getPaymentMethodDisplay(order.payment_method)}
 </Text>
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
  {filteredOrders.length > 0 && hasMore && (
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
 onRequestClose={() => setSelectedOrder(null)}
 >
 <View className="flex-1 bg-black/60">
  {/* Vùng backdrop phía trên — bấm để đóng */}
  <TouchableWithoutFeedback onPress={() => setSelectedOrder(null)}>
   <View className="flex-1" />
  </TouchableWithoutFeedback>

  {/* Panel nội dung phía dưới */}
  {selectedOrder && (
  <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl">
 
 {/* Header Modal */}
 <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
 <View>
 <View className="flex-row items-center">
  <Text className="text-sm font-semibold text-slate-800">
  {selectedOrder.id}
  </Text>
  <TouchableOpacity
    onPress={() => handleCopyOrderNo(selectedOrder.id)}
    className="ml-1.5 p-1 bg-slate-100 active:bg-slate-200 rounded"
  >
    <Ionicons name={copiedId ? "checkmark" : "copy-outline"} size={12} color={copiedId ? "#10b981" : "#64748b"} />
  </TouchableOpacity>
  <Badge 
  variant={selectedOrder.sync_status === 'pending' ? 'warning' : 'success'} 
  label={selectedOrder.sync_status === 'pending' ? 'Chờ đồng bộ' : 'Đã đồng bộ'} 
  size="sm"
  className="ml-2"
  />
 </View>
 <Text className="text-tiny text-slate-450 mt-1 font-medium">
 Khách hàng: {selectedOrder.customer_name || 'Khách lẻ'}
 </Text>
 </View>

 <TouchableOpacity onPress={() => setSelectedOrder(null)} className="p-1">
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
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
                <Text className={`text-xs font-semibold ml-1.5 ${isDebt ? 'text-rose-600' : isPrepaid ? 'text-emerald-700' : 'text-slate-800'}`}>
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
                    {fund.name}{fund.bank_name ? ` (${fund.bank_name})` : ''}
                  </Text>
                </View>
              )}
              {p.note ? (
                <Text className="text-[10px] text-slate-400 mt-0.5 italic">— {p.note}</Text>
              ) : null}
            </View>
            {amount != null && (
              <Text className={`text-xs font-bold ml-3 ${isDebt ? 'text-rose-600' : isPrepaid ? 'text-emerald-700' : 'text-slate-800'}`}>
                {formatCurrency(Number(amount))}
              </Text>
            )}
          </View>
        );
      })}
      
      {/* Hiển thị các giao dịch Sổ quỹ khác (ví dụ: Phiếu chi hoàn tiền) */}
      {selectedOrderCashbook
        .filter(cb => !Array.from(paymentCbMap.values()).includes(cb.id || cb.transaction_id))
        .map((cb, idx) => {
          const cbId = cb.id || cb.transaction_id;
          const isRefund = cb.category === 'refund';
          return (
            <View key={`cb-${idx}`} className="flex-row justify-between items-start py-2.5 border-b border-slate-100 bg-slate-50/50 px-2 rounded-lg mt-1">
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
                <Text className="text-[10px] text-slate-400 mt-0.5 font-mono">#{cbId.split('-')[0]}</Text>
                {cb.note ? (
                  <Text className="text-[10px] text-slate-400 mt-0.5 italic">— {cb.note}</Text>
                ) : null}
              </View>
              <Text className={`text-xs font-bold ml-3 ${cb.type === 'payment' ? 'text-rose-600' : 'text-emerald-700'}`}>
                {cb.type === 'payment' ? '-' : '+'}{formatCurrency(cb.amount)}
              </Text>
            </View>
          );
        })
      }
    </View>

    {/* Lịch sử trả hàng */}
    {selectedOrderReturns.length > 0 && (
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
    )}

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
              </Text>
              {itemReturned > 0 ? (
                <Text className="text-xxs text-orange-600 font-semibold mt-0.5">
                  (Đã trả {itemReturned})
                </Text>
              ) : null}
            </View>
            <Text className="text-xs font-semibold text-slate-800">
              {formatCurrency(item.line_total)}
            </Text>
          </View>
        </View>
      );
    })}
    
    {(() => {
      const discountAmount = Number(selectedOrder.discount_amount || 0);
      if (discountAmount > 0) {
        return (
          <View className="border-t border-slate-200 mt-4 pt-2">
            <View className="flex-row justify-between py-2 items-center">
              <Text className="text-xs text-slate-500 font-medium">Tạm tính</Text>
              <Text className="text-xs font-semibold text-slate-800">
                {formatCurrency(selectedOrder.total_amount + discountAmount)}
              </Text>
            </View>
            <View className="flex-row justify-between py-2 items-center">
              <Text className="text-xs text-slate-500 font-medium">Giảm giá</Text>
              <Text className="text-xs font-semibold text-rose-600">
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
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
  <View className="border-t border-slate-100 pt-4 gap-3">
    <View className="flex-row justify-between gap-3">
      {selectedOrder.sync_status === 'pending' ? (
        <Button
          variant="primary"
          title="Đồng bộ ngay"
          icon={<Ionicons name="cloud-upload" size={14} color="white" />}
          onPress={() => handleSyncSingleOrder(selectedOrder.id)}
          loading={isSyncingOrder === selectedOrder.id}
          className="flex-1 py-3 rounded-xl"
        />
      ) : (
        <View className="flex-1 bg-emerald-50 py-3 rounded-xl items-center flex-row justify-center border border-emerald-200 opacity-80">
          <Ionicons name="checkmark-done-circle-outline" size={14} color="#10b981" />
          <Text className="font-semibold text-xxs ml-1 text-emerald-700">ĐÃ ĐỒNG BỘ</Text>
        </View>
      )}

      <Button
        variant={selectedOrder.sync_status === 'pending' ? 'outline' : 'primary'}
        title="In hóa đơn"
        icon={<Ionicons name="print-outline" size={14} color={selectedOrder.sync_status === 'pending' ? '#475569' : 'white'} />}
        onPress={handleReprint}
        loading={isReprinting}
        className="flex-1 py-3 rounded-xl"
      />
    </View>

    {(canCancel || canReturn) && (
      <View className="flex-row justify-between gap-3">
        {canCancel && (
          <Button
            variant="danger"
            title={selectedOrder.status === 'in_progress' ? 'Gỡ kẹt đơn' : 'Hủy đơn hàng'}
            icon={<Ionicons name="ban-outline" size={14} color="white" />}
            onPress={() => {
              setCancelReason('Sai sót hệ thống');
              setCustomCancelReason('');
              setShowCancelDialog(true);
            }}
            className="flex-1 py-3 rounded-xl"
          />
        )}
        {canReturn && (
          <Button
            variant="outline"
            title="Tạo phiếu trả"
            icon={<Ionicons name="refresh-outline" size={14} color="#fa5908" />}
            onPress={() => {
              setReturnItems({});
              setReturnReason('other');
              setReturnRefundMethod('cash');
              setReturnRefundAmount('');
              setReturnNote('');
              setShowReturnForm(true);
            }}
            className="flex-1 py-3 rounded-xl"
            style={{ borderColor: '#f97316' }}
          />
        )}
      </View>
    )}
    
    {selectedOrder.status === 'cancelled' && (
      <View className="bg-rose-50 py-3 rounded-xl items-center flex-row justify-center border border-rose-200">
        <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
        <Text className="font-semibold text-xxs ml-1 text-rose-700">ĐƠN HÀNG ĐÃ HỦY</Text>
      </View>
    )}
    {selectedOrder.status === 'refunded' && (
      <View className="bg-slate-50 py-3 rounded-xl items-center flex-row justify-center border border-slate-200">
        <Ionicons name="arrow-undo-outline" size={14} color="#64748b" />
        <Text className="font-semibold text-xxs ml-1 text-slate-700">ĐƠN HÀNG ĐÃ HOÀN TIỀN</Text>
      </View>
    )}
  </View>

  </View>
  )}
  </View>
  </Modal>

  {/* DIALOG HỦY ĐƠN HÀNG */}
  <Dialog
    visible={showCancelDialog}
    onClose={() => setShowCancelDialog(false)}
    onConfirm={handleCancelOrder}
    title="Xác nhận hủy đơn hàng"
    confirmLabel="Hủy đơn"
    cancelLabel="Quay lại"
    variant="danger"
    loading={isCancelling}
  >
    <View className="gap-2">
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
            className={`p-3 rounded-xl border flex-row justify-between items-center ${
              isSelected ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200/60'
            }`}
            onPress={() => setCancelReason(reason)}
          >
            <Text className={`text-xs font-semibold ${isSelected ? 'text-rose-700' : 'text-slate-700'}`}>
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
  </Dialog>

  {/* MODAL TẠO PHIẾU TRẢ HÀNG */}
  <Modal
    visible={showReturnForm}
    animationType="slide"
    transparent={true}
    onRequestClose={() => setShowReturnForm(false)}
  >
    <View className="flex-1 bg-black/60 justify-end">
      <TouchableWithoutFeedback onPress={() => setShowReturnForm(false)}>
        <View className="flex-1" />
      </TouchableWithoutFeedback>
      <View className="h-[80%] bg-white rounded-t-2xl p-6">
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
                      className={`px-3 py-2 rounded-xl border ${
                        isSelected ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200/60'
                      }`}
                      onPress={() => setReturnReason(item.value)}
                    >
                      <Text className={`text-xxs font-bold ${isSelected ? 'text-orange-600' : 'text-slate-600'}`}>
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
                  { value: 'cash', label: 'Tiền mặt', icon: 'cash-outline' as const },
                  { value: 'bank_transfer', label: 'Chuyển khoản', icon: 'card-outline' as const },
                  { value: 'none', label: 'Không hoàn tiền', icon: 'close-circle-outline' as const }
                ].map((item) => {
                  const isSelected = returnRefundMethod === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      activeOpacity={0.7}
                      className={`flex-1 p-2.5 rounded-xl border items-center flex-row justify-center gap-1.5 ${
                        isSelected ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200/60'
                      }`}
                      onPress={() => setReturnRefundMethod(item.value)}
                    >
                      <Ionicons name={item.icon} size={13} color={isSelected ? '#f97316' : '#64748b'} />
                      <Text className={`text-[10px] font-bold ${isSelected ? 'text-orange-600' : 'text-slate-600'}`}>
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
            style={{ backgroundColor: '#f97316' }}
            disabled={
              Object.values(returnItems).reduce((sum, q) => sum + q, 0) === 0
            }
          />
        </View>
      </View>
    </View>
  </Modal>

  {/* DIALOG XÁC NHẬN TẠO PHIẾU TRẢ HÀNG */}
  <Dialog
    visible={showConfirmReturn}
    onClose={() => setShowConfirmReturn(false)}
    onConfirm={handleCreateReturn}
    title="Xác nhận tạo phiếu trả"
    description={`Bạn có chắc chắn muốn tạo phiếu trả hàng cho các sản phẩm đã chọn với số tiền hoàn lại là ${
      (() => {
        if (returnRefundAmount !== '') return formatCurrency(Number(returnRefundAmount));
        const total = selectedOrderItems
          .map(i => ({ ...i, retQty: returnItems[i.item_id || i.product_id] || 0 }))
          .filter(i => i.retQty > 0)
          .reduce((s, i) => s + (Number(i.unit_price) + Number(i.modifier_total || 0)) * i.retQty, 0);
        return formatCurrency(total);
      })()
    }?`}
    confirmLabel="Đồng ý"
    cancelLabel="Quay lại"
    variant="default"
    loading={isReturning}
  />
 </View>
 )}

 {/* CÁC DIALOG THÔNG BÁO XÁC NHẬN SANG TRỌNG */}
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

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName="Chi nhánh chính"
 />

 </SafeAreaView>
 );
}
