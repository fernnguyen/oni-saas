import React, {useState, useCallback, useEffect, useRef} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, Modal, Platform, ActivityIndicator, RefreshControl, FlatList, Animated} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useLocalSearchParams, useRouter} from 'expo-router';
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

type OrderSyncVisual = {
  state: 'synced' | 'pending' | 'failed';
  color: string;
  label: string;
  badgeVariant: 'success' | 'warning' | 'danger';
};

const isOrderUnsynced = (syncStatus?: string) =>
  ['pending', 'syncing', 'offline', 'failed', 'error', 'review']
    .includes(String(syncStatus || '').trim().toLowerCase());

const getOrderSyncVisual = (syncStatus?: string, isSyncing = false): OrderSyncVisual => {
  if (isSyncing) {
    return {
      state: 'pending',
      color: '#f59e0b',
      label: 'Đang đồng bộ',
      badgeVariant: 'warning',
    };
  }

  const normalizedStatus = String(syncStatus || 'synced').trim().toLowerCase();
  if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'review') {
    return {
      state: 'failed',
      color: '#ef4444',
      label: 'Đồng bộ thất bại',
      badgeVariant: 'danger',
    };
  }

  if (normalizedStatus === 'pending' || normalizedStatus === 'syncing' || normalizedStatus === 'offline') {
    return {
      state: 'pending',
      color: '#f59e0b',
      label: 'Chờ đồng bộ',
      badgeVariant: 'warning',
    };
  }

  return {
    state: 'synced',
    color: '#22c55e',
    label: 'Đã đồng bộ',
    badgeVariant: 'success',
  };
};

type OrderResourceInfo = {
  id: string;
  name: string;
  type: string;
};

const getOrderResourceInfo = (order: any): OrderResourceInfo | null => {
  if (!order) return null;

  let metadata: Record<string, any> = {};
  try {
    const parsed = typeof order.metadata === 'string'
      ? JSON.parse(order.metadata || '{}')
      : order.metadata;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed;
    }
  } catch {}

  const id = String(order.resource_id || metadata.resource_id || '').trim();
  const name = String(metadata.resource_name || '').trim();
  const type = String(metadata.resource_type || '').trim().toLowerCase();
  if (!id && !name) return null;
  if (id.toLowerCase().startsWith('takeaway')) return null;
  if (type && type !== 'room' && type !== 'table') return null;

  return {
    id,
    name: name || id,
    type,
  };
};

// Import hệ thống UI dùng chung cao cấp
import {Header} from '../../components/layout/Header';
import {Badge} from '../../components/ui/Badge';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Skeleton} from '../../components/ui/Skeleton';
import {DebtCollectionModal} from '../../components/ui/DebtCollectionModal';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {usePermissions} from '../../lib/auth/PermissionsContext';
import {usePosToast} from '../../hooks/pos/usePosToast';

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
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderIdParam = params?.id as string | undefined;
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<any[]>([]);
  const [selectedOrderReturns, setSelectedOrderReturns] = useState<any[]>([]);
  const [selectedOrderCashbook, setSelectedOrderCashbook] = useState<any[]>([]);
  const [shopSettings, setShopSettings] = useState<any>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // This is only a UI convenience; the manual-order API is the authority and
  // enforces both the shop switch and the Owner/Admin role again.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const shopId = await AsyncStorage.getItem('active_shop_id');
      if (!shopId) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/settings`, { headers: await getApiHeaders(), signal: controller.signal });
        if (mounted && res.ok) {
          const settings = await res.json();
          setShopSettings((current: any) => ({ ...current, ...settings }));
        }
      } catch (error: any) { if (error?.name !== 'AbortError') console.warn('manual order settings error', error); }
      finally { clearTimeout(timeoutId); }
    })();
    return () => { mounted = false; };
  }, []);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('Sai sót hệ thống');
  const [customCancelReason, setCustomCancelReason] = useState('');

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('other');
  const [returnFundId, setReturnFundId] = useState('');
  const [returnRefundAmount, setReturnRefundAmount] = useState('');
  const [isLoadingReturnFunds, setIsLoadingReturnFunds] = useState(false);
  const [showReturnFundSelector, setShowReturnFundSelector] = useState(false);
  const [returnNote, setReturnNote] = useState('');
  const [showConfirmReturn, setShowConfirmReturn] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtCustomerData, setDebtCustomerData] = useState<any>(null);

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
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [timeFilter, setTimeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>(null);
  const { toastMsg, toastOpacity, showToast } = usePosToast();
  const PosToast = ({toastMsg, toastOpacity}: any) => { if (!toastMsg) return null; return <Animated.View style={{opacity: toastOpacity}} className={`absolute top-10 left-4 right-4 z-50 p-4 rounded-xl flex-row items-center shadow-lg ${toastMsg.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}><Text className="text-white ml-2 font-medium">{toastMsg.message}</Text></Animated.View>; };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const ordersRequestRef = useRef<AbortController | null>(null);
  const statsRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);
  const financialRequestRef = useRef<AbortController | null>(null);
  const returnFundsRequestRef = useRef<AbortController | null>(null);
  const refreshOrdersRef = useRef<(includeStats?: boolean) => Promise<void>>(async () => {});
  const hasMountedFiltersRef = useRef(false);
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
 const [syncErrorMessage, setSyncErrorMessage] = useState('Không thể đồng bộ đơn hàng. Vui lòng thử lại.');

  // Tải dữ liệu SQLite hoặc Cloud

  const fetchStats = useCallback(async (activeShopId: string) => {
    statsRequestRef.current?.abort();
    const controller = new AbortController();
    statsRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${activeShopId}/orders/stats`, {
        headers,
        signal: controller.signal,
      });
      if (res.ok) setStats(await res.json());
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('fetchStats error', e);
    } finally {
      clearTimeout(timeoutId);
      if (statsRequestRef.current === controller) statsRequestRef.current = null;
    }
  }, []);

  const fetchOrdersOnline = useCallback(async (activeShopId: string, pageNum: number, filter: string, isRefresh: boolean = false) => {
    ordersRequestRef.current?.abort();
    const controller = new AbortController();
    ordersRequestRef.current = controller;
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 8000);

    try {
      if (pageNum === 1) setIsLoading(true);
      else setIsLoadingMore(true);

      const headers = await getApiHeaders();
      let url = `${getApiBaseUrl()}/api/shops/${activeShopId}/orders?limit=20&page=${pageNum}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (filter !== 'all') url += `&time=${filter}`;

      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`Orders API ${res.status}`);

      const json = await res.json();
      const cloudOrders = (json.data || []).map((order: any) => ({
        ...order,
        sync_status: order.sync_status || 'synced',
      }));
      const meta = json.meta || {};
      let displayOrders = cloudOrders;

      // Server vẫn là nguồn chính, nhưng mutation checkout đang pending phải được
      // overlay tạm thời để refresh không làm đơn completed quay lại in_progress.
      if (pageNum === 1 && Platform.OS !== 'web') {
        try {
          const pendingLocalOrders = await db
            .select()
            .from(schema.orders)
            .where(or(
              eq(schema.orders.sync_status, 'pending'),
              eq(schema.orders.sync_status, 'failed'),
              eq(schema.orders.sync_status, 'error'),
              eq(schema.orders.sync_status, 'review')
            ))
            .orderBy(desc(schema.orders.updated_at))
            .limit(20);
          const normalizedSearch = searchQuery.trim().toLowerCase();
          const visiblePendingOrders = normalizedSearch
            ? pendingLocalOrders.filter((order: any) =>
                [order.id, order.order_no, order.reference_no, order.customer_name]
                  .some(value => String(value || '').toLowerCase().includes(normalizedSearch))
              )
            : pendingLocalOrders;
          const pendingKeys = new Set(
            visiblePendingOrders.flatMap((order: any) => [order.id, order.reference_no].filter(Boolean))
          );
          displayOrders = [
            ...visiblePendingOrders,
            ...cloudOrders.filter((order: any) =>
              ![order.id, order.order_id, order.reference_no].some(key => key && pendingKeys.has(key))
            ),
          ];
        } catch (pendingError) {
          console.warn('Không thể đọc các đơn pending từ SQLite:', pendingError);
        }
      }

      setHasMore(cloudOrders.length > 0 && pageNum < (meta.totalPages || Infinity));
      if (isRefresh || pageNum === 1) {
        setOrdersList(displayOrders);
      } else {
        setOrdersList(prev => {
          const existingIds = new Set(prev.map(o => o.id));
          return [...prev, ...cloudOrders.filter((o: any) => !existingIds.has(o.id))];
        });
      }
    } catch (e: any) {
      const wasSuperseded = e?.name === 'AbortError' && !didTimeout;
      if (wasSuperseded) return;

      console.warn('fetchOrdersOnline error, fallback to local', e);
      if (pageNum === 1 && Platform.OS !== 'web') {
        try {
          const local = await db.select().from(schema.orders).orderBy(desc(schema.orders.created_at)).limit(20);
          if (ordersRequestRef.current === controller) {
            setOrdersList(local);
            setHasMore(false);
          }
        } catch (localError) {
          console.warn('Không thể đọc orders fallback từ SQLite:', localError);
        }
      }
    } finally {
      clearTimeout(timeoutId);
      if (ordersRequestRef.current === controller) {
        ordersRequestRef.current = null;
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      }
    }
  }, [searchQuery]);

  const refreshOrders = useCallback(async (includeStats = true) => {
    const shopId = await AsyncStorage.getItem('active_shop_id');
    if (!shopId) return;

    setPage(1);
    const requests: Promise<void>[] = [fetchOrdersOnline(shopId, 1, timeFilter, true)];
    if (includeStats) requests.push(fetchStats(shopId));
    await Promise.all(requests);
  }, [fetchOrdersOnline, fetchStats, timeFilter]);
  refreshOrdersRef.current = refreshOrders;

  useFocusEffect(
    useCallback(() => {
      void refreshOrdersRef.current();

      return () => {
        ordersRequestRef.current?.abort();
        statsRequestRef.current?.abort();
        detailRequestRef.current?.abort();
        financialRequestRef.current?.abort();
        returnFundsRequestRef.current?.abort();
      };
    }, [])
  );

  useEffect(() => {
    if (!hasMountedFiltersRef.current) {
      hasMountedFiltersRef.current = true;
      return;
    }

    const delayMs = searchQuery ? 400 : 0;
    const timeoutId = setTimeout(() => {
      void refreshOrders(false);
    }, delayMs);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, timeFilter, refreshOrders]);

  const refreshSelectedOrderFinancials = useCallback(async (order: any) => {
    const shopId = await AsyncStorage.getItem('active_shop_id');
    if (!shopId || isOrderUnsynced(order.sync_status)) return;

    financialRequestRef.current?.abort();
    const controller = new AbortController();
    financialRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const [orderRes, paymentsRes] = await Promise.all([
        fetch(`${url}/api/shops/${shopId}/orders/${order.id}`, { headers, signal: controller.signal }),
        fetch(`${url}/api/shops/${shopId}/payments?order_id=${order.id}&limit=50`, { headers, signal: controller.signal }),
      ]);

      if (orderRes.ok) {
        const orderData = await orderRes.json();
        const orderPatch = {
          paid_amount: orderData.paid_amount,
          debt_amount: orderData.debt_amount,
          status: orderData.status,
          total_amount: orderData.total_amount,
          payment_method: orderData.payment_method,
          sync_status: 'synced',
        };
        setSelectedOrder((prev: any) => prev?.id === order.id ? {
          ...prev,
          ...orderPatch,
          payment_method: orderPatch.payment_method ?? prev.payment_method,
        } : prev);
        setOrdersList(prev => prev.map(item => item.id === order.id ? {
          ...item,
          ...orderPatch,
          payment_method: orderPatch.payment_method ?? item.payment_method,
        } : item));
      }

      if (paymentsRes.ok) {
        const paymentsJson = await paymentsRes.json();
        setSelectedOrderPayments(paymentsJson.data || []);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.warn('Không thể refresh tài chính đơn hàng:', err);
    } finally {
      clearTimeout(timeoutId);
      if (financialRequestRef.current === controller) financialRequestRef.current = null;
    }
  }, []);

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
    
    detailRequestRef.current?.abort();
    const detailController = new AbortController();
    detailRequestRef.current = detailController;
    const detailTimeoutId = setTimeout(() => detailController.abort(), 8000);
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

      // 2. Chỉ thực hiện fetch online ngầm nếu đã đồng bộ và có shopId
      if (shopId && !isOrderUnsynced(order.sync_status)) {
        try {
          const [itemsRes, paymentsRes, returnsRes, settingsRes, cashbookRes, orderRes] = await Promise.all([
            fetch(`${url}/api/shops/${shopId}/order-items?order_id=${order.id}&limit=100`, { headers, signal: detailController.signal }),
            fetch(`${url}/api/shops/${shopId}/payments?order_id=${order.id}&limit=50`, { headers, signal: detailController.signal }),
            fetch(`${url}/api/shops/${shopId}/returns?order_id=${order.id}&limit=50`, { headers, signal: detailController.signal }),
            fetch(`${url}/api/shops/${shopId}/settings`, { headers, signal: detailController.signal }),
            fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${order.id}&limit=100`, { headers, signal: detailController.signal }),
            fetch(`${url}/api/shops/${shopId}/orders/${order.id}`, { headers, signal: detailController.signal })
          ]);

          // Tổng tiền của đơn là dữ liệu cốt lõi: cập nhật độc lập với các API phụ
          // để nút reload vẫn làm mới Đã thanh toán/Còn nợ khi items/payments/... lỗi.
          if (orderRes.ok) {
            const orderData = await orderRes.json();
            const orderPatch = {
              paid_amount: orderData.paid_amount,
              debt_amount: orderData.debt_amount,
              status: orderData.status,
              total_amount: orderData.total_amount,
              payment_method: orderData.payment_method,
              sync_status: 'synced',
            };
            setSelectedOrder((prev: any) => prev?.id === order.id ? {
              ...prev,
              ...orderPatch,
              payment_method: orderPatch.payment_method ?? prev.payment_method,
            } : prev);
            setOrdersList(prev => prev.map(item => item.id === order.id ? {
              ...item,
              ...orderPatch,
              payment_method: orderPatch.payment_method ?? item.payment_method,
            } : item));
          }

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
                  const retItemsRes = await fetch(`${url}/api/shops/${shopId}/return-items?return_id=${ret.return_id}&limit=100`, { headers, signal: detailController.signal });
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
                  const retCbRes = await fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${retRef}&limit=10`, { headers, signal: detailController.signal });
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
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.warn('Lỗi tải dữ liệu trực tuyến, sử dụng dữ liệu cục bộ:', err);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Lỗi tải chi tiết dòng sản phẩm:', err);
    } finally {
      clearTimeout(detailTimeoutId);
      if (detailRequestRef.current === detailController) {
        detailRequestRef.current = null;
        setIsDetailLoading(false);
      }
    }
  };

  const loadReturnFunds = useCallback(async () => {
    returnFundsRequestRef.current?.abort();
    const controller = new AbortController();
    returnFundsRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    setIsLoadingReturnFunds(true);

    let funds: any[] = [];
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      if (!shopId) throw new Error('Không tìm thấy chi nhánh đang hoạt động');

      const headers = await getApiHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/payment-funds?active=TRUE`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Không thể tải danh sách quỹ');
      }

      const payload = await response.json();
      funds = Array.isArray(payload) ? payload : (payload.data || []);
    } catch (error: any) {
      if (controller.signal.aborted && returnFundsRequestRef.current !== controller) return;

      if (Platform.OS !== 'web') {
        try {
          funds = await db.select().from(schema.paymentFunds);
        } catch (localError) {
          console.warn('Không thể tải quỹ dự phòng từ local:', localError);
        }
      }

      if (error?.name !== 'AbortError') {
        console.warn('Không thể tải quỹ từ server, sử dụng local fallback:', error);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (returnFundsRequestRef.current !== controller) return;

    setPaymentFundsList(funds);
    setReturnFundId(currentFundId => {
      if (funds.some(fund => fund.id === currentFundId)) return currentFundId;

      const defaultFunds = funds.filter(fund =>
        fund.is_default === true || fund.is_default === 1 || fund.is_default === '1' || fund.is_default === 'TRUE'
      );
      const defaultCashFund = defaultFunds.find(fund => fund.type === 'cash');
      return (defaultCashFund || defaultFunds[0] || funds[0])?.id || '';
    });
    returnFundsRequestRef.current = null;
    setIsLoadingReturnFunds(false);
  }, []);

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
                resource_id: orderData.resource_id || '',
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
    const cancelController = new AbortController();
    const cancelTimeoutId = setTimeout(() => cancelController.abort(), 10000);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const reason = cancelReason === 'other' ? customCancelReason : cancelReason;

      const res = await fetch(`${url}/api/shops/${shopId}/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        signal: cancelController.signal,
        body: JSON.stringify({ reason: reason || 'Không rõ' })
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Hủy đơn hàng thất bại');
      }

      setOrdersList(prev => prev.map(item => item.id === selectedOrder.id ? { ...item, status: 'cancelled' } : item));
      setSelectedOrder((prev: any) => prev ? { ...prev, status: 'cancelled' } : null);
      void fetchStats(shopId);
      setShowCancelDialog(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.error('Lỗi khi hủy đơn hàng:', err);
      alert(err?.name === 'AbortError' ? 'Yêu cầu hủy quá thời gian 10 giây. Hãy tải lại đơn để kiểm tra trạng thái trước khi thử lại.' : (err.message || 'Lỗi khi hủy đơn hàng. Vui lòng thử lại.'));
    } finally {
      clearTimeout(cancelTimeoutId);
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

    const selectedReturnFund = paymentFundsList.find(fund => fund.id === returnFundId);
    if (!selectedReturnFund) {
      alert('Vui lòng chọn quỹ xuất tiền hoàn');
      return;
    }

    const refundMethod = selectedReturnFund.type === 'cash' ? 'cash' : 'bank_transfer';

    setIsReturning(true);
    const returnController = new AbortController();
    const returnTimeoutId = setTimeout(() => returnController.abort(), 15000);
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
        signal: returnController.signal,
        body: JSON.stringify({
          order_id:      selectedOrder.id,
          order_no:      selectedOrder.order_no || selectedOrder.id,
          customer_id:   selectedOrder.customer_id || '',
          customer_name: selectedOrder.customer_name || '',
          reason:        returnReason,
          refund_method: refundMethod,
          total_refund:  String(totalRefund),
          status:        'pending',
          note:          returnNote,
          fund_id:       selectedReturnFund.id,
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
            signal: returnController.signal,
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
          signal: returnController.signal,
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
        headers,
        signal: returnController.signal,
      });
      let updatedOrder = null;
      if (orderRes.ok) {
        updatedOrder = await orderRes.json();
      }

      if (updatedOrder) {
        setOrdersList(prev => prev.map(item => item.id === selectedOrder.id ? {
          ...item,
          ...updatedOrder,
          sync_status: 'synced',
        } : item));
      }
      void fetchStats(shopId);

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
      alert(err?.name === 'AbortError' ? 'Yêu cầu đổi trả quá thời gian 15 giây. Hãy tải lại đơn để kiểm tra trạng thái trước khi thử lại.' : (err.message || 'Lỗi khi tạo phiếu trả hàng. Vui lòng thử lại.'));
    } finally {
      clearTimeout(returnTimeoutId);
      setIsReturning(false);
    }
  };

  const canCancel = selectedOrder && !isOrderUnsynced(selectedOrder.sync_status) && (
    (selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'in_progress' && hasPermission('orders.delete')) ||
    (selectedOrder.status === 'in_progress' && hasPermission('orders.delete') && (hasPermission('owner') || hasPermission('admin')))
  );

  const canReturn = selectedOrder && !isOrderUnsynced(selectedOrder.sync_status) && hasPermission('returns.create') && (
    selectedOrder.status === 'completed' || selectedOrder.status === 'partially_refunded'
  );

 // Đồng bộ
 const handleSyncSingleOrder = async (orderId: string) => {
   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
   setIsSyncingOrder(orderId);
   try {
     // Tự sửa dữ liệu checkout phòng/bàn được tạo bởi phiên bản cũ: phiên bản đó
     // lưu cả system time charge lẫn TIME_CHARGE ảo và làm tổng tiền bị nhân đôi.
     if (Platform.OS !== 'web') {
       const [localOrder] = await db
         .select()
         .from(schema.orders)
         .where(eq(schema.orders.id, orderId))
         .limit(1);
       const localItems = await db
         .select()
         .from(schema.order_items)
         .where(eq(schema.order_items.order_id, orderId));
       const virtualTimeItems = localItems.filter((item: any) => item.product_id === 'TIME_CHARGE');
       const hasCanonicalTimeItem = localItems.some((item: any) =>
         item.product_id !== 'TIME_CHARGE' && /^(Tiền phòng|Tiền giờ)\s*-/.test(item.product_name || '')
       );

       if (localOrder && isOrderUnsynced(localOrder.sync_status) && hasCanonicalTimeItem && virtualTimeItems.length > 0) {
         const duplicateTotal = virtualTimeItems.reduce((sum: number, item: any) => sum + Number(item.line_total || 0), 0);
         const duplicateTax = virtualTimeItems.reduce((sum: number, item: any) => sum + Number(item.tax_amount || 0), 0);
         for (const item of virtualTimeItems) {
           await db.delete(schema.order_items).where(eq(schema.order_items.id, item.id));
         }
         const correctedTotal = Math.max(0, Number(localOrder.total_amount || 0) - duplicateTotal);
         await db.update(schema.orders)
           .set({
             total_amount: correctedTotal,
             paid_amount: Math.min(correctedTotal, Number(localOrder.paid_amount || 0)),
             tax_amount: Math.max(0, Number(localOrder.tax_amount || 0) - duplicateTax),
             updated_at: new Date().toISOString(),
           })
           .where(eq(schema.orders.id, orderId));
       }
     }

     const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
     const results = await SyncManager.pushOfflineOrders(shopId, orderId);

     await refreshOrders();

     if (results.successCount > 0) {
       setSyncErrorMessage('Không thể đồng bộ đơn hàng. Vui lòng thử lại.');
       setIsSyncSuccessVisible(true);
     } else {
       const targetError = results.errors.find((error) => error.orderId === orderId) || results.errors[0];
       setSyncErrorMessage(targetError?.message || 'Không tìm thấy đơn chờ đồng bộ hoặc máy chủ không chấp nhận dữ liệu.');
       setIsSyncErrorVisible(true);
     }
   } catch (err: any) {
     console.error('Lỗi khi đồng bộ hóa đơn:', err);
     setSyncErrorMessage(err?.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
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



  const renderHeader = () => (
    <View className="bg-slate-50 pt-3 pb-2">
      <View className="flex-row justify-between mb-3">
        <View className="flex-1 mr-1 p-2 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
          <View className="flex-row justify-between items-center">
            <Text className="text-xxs font-semibold text-slate-400">Hôm nay</Text>
            {stats && <Text className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{stats.today?.count || 0} đơn</Text>}
          </View>
          {stats ? (
            <View>
              <Text className="text-orange-500 font-semibold text-xs mt-1">{formatCurrency(stats.today?.revenue || 0)}</Text>
              {stats.today?.debt > 0 && <Text className="text-xxs text-rose-600 font-medium mt-0.5">Nợ: {formatCurrency(stats.today?.debt || 0)}</Text>}
            </View>
          ) : (
            <Skeleton width="60%" height={16} borderRadius={4} className="mt-1.5" />
          )}
        </View>

        <View className="flex-1 mx-1 p-2 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
          <View className="flex-row justify-between items-center">
            <Text className="text-xxs font-semibold text-emerald-600">Hôm qua</Text>
            {stats && <Text className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">{stats.yesterday?.count || 0} đơn</Text>}
          </View>
          {stats ? (
            <View>
              <Text className="text-emerald-700 font-semibold text-xs mt-1">{formatCurrency(stats.yesterday?.revenue || 0)}</Text>
              {stats.yesterday?.debt > 0 && <Text className="text-xxs text-slate-400 font-medium mt-0.5">Nợ: {formatCurrency(stats.yesterday?.debt || 0)}</Text>}
            </View>
          ) : (
            <Skeleton width="60%" height={16} borderRadius={4} className="mt-1.5" />
          )}
        </View>

        <View className="flex-1 ml-1 p-2 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
          <View className="flex-row justify-between items-center">
            <Text className="text-xxs font-semibold text-blue-600">Tháng này</Text>
            {stats && <Text className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">{stats.month?.count || 0} đơn</Text>}
          </View>
          {stats ? (
            <View>
              <Text className="text-blue-700 font-semibold text-xs mt-1">{formatCurrency(stats.month?.revenue || 0)}</Text>
              {stats.month?.debt > 0 && <Text className="text-xxs text-slate-400 font-medium mt-0.5">Nợ: {formatCurrency(stats.month?.debt || 0)}</Text>}
            </View>
          ) : (
            <Skeleton width="60%" height={16} borderRadius={4} className="mt-1.5" />
          )}
        </View>
      </View>

      <View>
        <View className="flex-row items-center mb-3">
          <View className="flex-1 flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 shadow-sm h-10">
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              placeholder="Tìm #HĐ, Khách..."
              placeholderTextColor="#94a3b8"
              className="flex-1 ml-2 text-xs text-slate-700 font-medium h-full pb-0.5"
              value={searchQuery}
              onChangeText={(txt) => { setSearchQuery(txt); setPage(1); }}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setPage(1); }} className="p-1">
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            ) : null}
          </View>
          {hasPermission('orders.delete') && shopSettings?.enable_manual_orders !== false ? (
            <TouchableOpacity onPress={() => router.push('/manual-order')} className="ml-2 h-10 flex-row items-center rounded-2xl bg-orange-500 px-3 shadow-sm">
              <Ionicons name="add" size={17} color="#fff" />
              <Text className="ml-0.5 text-xxs font-bold text-white">Ghi đơn</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'today', label: 'Hôm nay' },
            { id: 'yesterday', label: 'Hôm qua' },
            { id: 'last7days', label: '7 ngày qua' },
            { id: 'lastmonth', label: 'Tháng này' }
          ].map(filter => (
            <TouchableOpacity
              key={filter.id}
              className="mr-2 px-2.5 py-1 rounded-xl border"
              style={timeFilter === filter.id ? { backgroundColor: '#fa5908', borderColor: '#fa5908' } : { backgroundColor: '#fff', borderColor: '#e2e8f0' }}
              onPress={() => {
                setTimeFilter(filter.id);
                setPage(1);
              }}
            >
              <Text className={`text-xxs font-semibold ${timeFilter === filter.id ? 'text-white' : 'text-slate-500'}`}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <PosToast toastMsg={toastMsg} toastOpacity={toastOpacity} />
      <Header onPressMenu={() => setIsDrawerOpen(true)} />
      <View className="flex-1">
        <FlatList
          data={ordersList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={async () => {
                setIsRefreshing(true);
                await refreshOrders();
              }}
              colors={['#fa5908']}
              tintColor="#fa5908"
            />
          }
          onEndReached={() => {
            if (hasMore && !isLoadingMore && !isLoading) {
               const p = page + 1;
               setPage(p);
               AsyncStorage.getItem('active_shop_id').then(shopId => {
                 if (shopId) fetchOrdersOnline(shopId, p, timeFilter);
               });
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#fa5908" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="mt-2">
                {[1, 2, 3, 4, 5].map((key) => (
                  <View key={key} className="mb-3 p-4 rounded-2xl border bg-white border-slate-100 flex-row justify-between items-center shadow-sm">
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center mb-1">
                        <View className="w-1.5 h-1.5 rounded-full mr-1.5 bg-slate-200" />
                        <Skeleton width={100} height={12} borderRadius={4} />
                      </View>
                      <Skeleton width={120} height={10} borderRadius={3} className="mt-2" />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="py-20 items-center justify-center">
                <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
                <Text className="text-slate-400 text-xs font-medium mt-3">Không tìm thấy đơn hàng</Text>
              </View>
            )
          }
          renderItem={({ item: order }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setSelectedOrder(order);
                handleViewOrderDetails(order);
              }}
              className="mb-3 p-4 rounded-2xl border bg-white shadow-sm"
              style={selectedOrder?.id === order.id ? { borderColor: '#fb923c', borderWidth: 2 } : { borderColor: '#f1f5f9' }}
            >
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-row items-center flex-wrap">
                  <Text className="text-slate-900 font-bold text-sm">
                    {order.order_no && order.order_no !== 'HD' ? '#' + String(order.order_no).split('-').pop() : '#' + String(order.id).split('-').pop()}
                  </Text>
                  {(() => {
                    const syncVisual = getOrderSyncVisual(order.sync_status, isSyncingOrder === order.id);
                    return (
                      <View
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={syncVisual.label}
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 999,
                          backgroundColor: syncVisual.color,
                          marginLeft: 6,
                          marginTop: 1,
                          borderWidth: 1,
                          borderColor: '#ffffff',
                        }}
                      />
                    );
                  })()}
                  <Text className="text-slate-500 font-medium text-[10px] ml-1.5 mt-0.5">
                    {formatDateTime(order.created_at)}
                  </Text>
                </View>
                <Badge variant={getOrderStatusBadgeProps(order.status).variant} label={getOrderStatusBadgeProps(order.status).label} size="sm" />
              </View>

              {(() => {
                const resource = getOrderResourceInfo(order);
                if (!resource) return null;

                return (
                  <View className="self-start flex-row items-center rounded-lg border border-violet-100 bg-violet-50 px-2 py-1">
                    <Ionicons
                      name={resource.type === 'room' ? 'bed-outline' : 'grid-outline'}
                      size={12}
                      color="#7c3aed"
                    />
                    <Text className="ml-1.5 text-[10px] font-semibold text-violet-700" numberOfLines={1}>
                      {resource.name}
                    </Text>
                  </View>
                );
              })()}

              <View className="flex-row items-center mt-2 justify-between">
                <View className="flex-row items-center">
                  <Ionicons name="person-outline" size={14} color="#64748b" />
                  <Text className="text-slate-600 text-xs font-medium ml-1.5" numberOfLines={1}>
                    {order.customer_name || 'Khách lẻ'}
                  </Text>
                </View>

                <View className="items-end">
                  <Text className="text-slate-800 font-semibold text-xs">
                    {formatCurrency(order.total_amount)}
                  </Text>
                  {Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0)) > 0 && (
                    <Text className="text-rose-600 font-semibold text-[10px] mt-1">
                      Còn nợ: {formatCurrency(Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0)))}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />


 {/* 5. MODAL CHI TIẾT HÓA ĐƠN */}
  <Modal
    visible={!!selectedOrder}
    animationType="slide"
    transparent={true}
    onRequestClose={() => {
      if (showReturnFundSelector) {
        setShowReturnFundSelector(false);
      } else if (showConfirmReturn) {
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
                {(() => {
                  const syncVisual = getOrderSyncVisual(
                    selectedOrder.sync_status,
                    isSyncingOrder === selectedOrder.id
                  );
                  return (
                    <Badge
                      variant={syncVisual.badgeVariant}
                      label={syncVisual.label}
                      size="sm"
                    />
                  );
                })()}
                {isOrderUnsynced(selectedOrder.sync_status) && (
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
            {(() => {
              const realPaidAmount = Number(selectedOrder.paid_amount || 0);
              const calculatedDebt = Math.max(0, Number(selectedOrder.total_amount || 0) - realPaidAmount);
              
              return (
                <>
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

                    {(() => {
                      const resource = getOrderResourceInfo(selectedOrder);
                      if (!resource) return null;

                      const resourceLabel = resource.type === 'room'
                        ? 'Phòng'
                        : resource.type === 'table'
                          ? 'Bàn'
                          : 'Phòng/Bàn';

                      return (
                        <View className="flex-row justify-between py-1">
                          <Text className="text-tiny text-slate-500 font-medium">{resourceLabel}:</Text>
                          <Text className="text-tiny font-semibold text-violet-700">{resource.name}</Text>
                        </View>
                      );
                    })()}

                    {selectedOrder.note && (
                      <View className="border-t border-slate-200 mt-2 pt-2">
                        <Text className="text-tiny text-slate-455 font-medium">Ghi chú đơn:</Text>
                        <Text className="text-xs text-slate-700 mt-1 font-semibold">{selectedOrder.note}</Text>
                      </View>
                    )}
                  </View>

                  {/* Mặt hàng đã mua */}
                  <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Mặt hàng đã mua</Text>
                  {isDetailLoading && selectedOrderItems.length === 0 ? (
                    <View className="mb-4">
                      <Skeleton.Text lines={3} gap={12} height={20} />
                    </View>
                  ) : (
                    <View className="mb-4">
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
                    </View>
                  )}

                  {/* Tạm tính / Tổng thanh toán */}
                  {(() => {
                    const discountAmount = Number(selectedOrder.discount_amount || 0);
                    const taxAmount = Number(selectedOrder.tax_amount || 0);
                    const hasBreakdown = discountAmount > 0 || taxAmount > 0;
                    
                    return (
                      <View className="border-t border-slate-200 mt-2 pt-2">
                        {hasBreakdown && (
                          <>
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
                          </>
                        )}
                        <View className={`flex-row justify-between py-3 ${hasBreakdown ? 'border-t border-slate-200 mt-2' : ''} items-center`}>
                          <Text className="text-xs font-semibold text-slate-800">Tổng thanh toán</Text>
                          <Text className="text-slate-800 text-xs font-bold">
                            {formatCurrency(selectedOrder.total_amount)}
                          </Text>
                        </View>
                        {calculatedDebt > 0 && (
                          <>
                            <View className="w-full h-[1px] bg-slate-200 border-dashed border-t" />
                            <View className="flex-row justify-between py-3 items-center">
                              <Text className="text-xs font-semibold text-emerald-700">Đã thanh toán</Text>
                              <Text className="text-emerald-700 text-xs font-bold">
                                {formatCurrency(realPaidAmount)}
                              </Text>
                            </View>
                            <View className="flex-row justify-between pb-4 items-center">
                              <View className="flex-row items-center">
                                <Text className="text-xs font-semibold text-rose-600">Còn nợ</Text>
                                {selectedOrder.customer_id && !selectedOrder.customer_id.startsWith('virtual:') && (
                                  <TouchableOpacity 
                                    onPress={() => {
                                      setDebtCustomerData({
                                        id: selectedOrder.customer_id || 'retail',
                                        name: selectedOrder.customer_name || 'Khách lẻ',
                                        debt_amount: calculatedDebt
                                      });
                                      setShowDebtModal(true);
                                    }}
                                    className="bg-orange-500 px-2 py-1 rounded active:bg-orange-600 ml-2"
                                  >
                                    <Text className="text-[10px] font-bold text-white">Thu nợ</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                              <Text className="text-rose-600 text-xs font-bold">
                                {formatCurrency(calculatedDebt)}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })()}

                  {/* Lịch sử trả hàng */}
                  {isDetailLoading && selectedOrderReturns.length === 0 ? (
                    <View className="mb-4">
                      <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Lịch sử trả hàng</Text>
                      <Skeleton.Text lines={2} gap={8} height={40} />
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

                  {/* Thanh toán - Đưa xuống cuối cùng */}
                  <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1 mt-2">Thanh toán</Text>
                  {isDetailLoading && selectedOrderPayments.length === 0 && selectedOrderCashbook.length === 0 ? (
                    <View className="mb-4">
                      <Skeleton.Text lines={2} gap={10} height={50} />
                    </View>
                  ) : (
                    <View className="mb-4">
                      {selectedOrderPayments.map((p, i) => {
                        const method = p.method || 'cash';
                        const amount = p.amount;
                        const fund = paymentFundsList.find(f => f.id === p.fund_id);
                        const methodLabel = translateMethod(method);
                        const isDebt = method === 'debt' || method?.includes('debt') || method === 'store_credit';
                        const isPrepaid = method === 'prepaid';
                        return (
                          <View key={i} className="flex-row justify-between items-start py-2.5 border-b border-slate-100">
                            <View className="flex-1 pr-2">
                              <View className="flex-row items-center flex-wrap gap-1">
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
                                <Text className={"text-xs font-semibold " + (isDebt ? "text-rose-600" : isPrepaid ? "text-emerald-700" : "text-slate-800")}>
                                  {methodLabel}
                                </Text>
                                {p.reference_no ? (
                                  <Text className="text-[10px] text-slate-400">#{p.reference_no}</Text>
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
                              {(p.note || p.paid_at || p.created_at) ? (
                                <Text className="text-[10px] text-slate-400 mt-1">
                                  {(p.paid_at || p.created_at) ? formatDateTime(p.paid_at || p.created_at).replace(',', '') + (p.note ? ' - ' : '') : ''}{p.note || ''}
                                </Text>
                              ) : null}
                            </View>
                            {amount != null && (
                              <Text className={"text-xs font-bold " + (isDebt || Number(amount) < 0 ? "text-rose-600" : "text-emerald-700")}>
                                {formatCurrency(Number(amount))}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                      
                      {/* Hiển thị các giao dịch Sổ quỹ khác (ví dụ: Phiếu chi hoàn tiền, trả nợ) */}
                      {selectedOrderCashbook
                        .filter(cb => !Array.from(paymentCbMap.values()).includes(cb.id || cb.transaction_id))
                        .map((cb, idx) => {
                          const cbId = cb.id || cb.transaction_id;
                          const isRefund = cb.category === 'refund';
                          const isReceipt = cb.type === 'receipt';
                          const cbIsDebt = cb.method === 'debt' || cb.method?.includes('debt') || cb.method === 'store_credit';
                          return (
                            <View key={"cb-" + idx} className="flex-row justify-between items-start py-2.5 border-b border-slate-100 bg-slate-50/50 px-2 rounded-lg mt-1">
                              <View className="flex-1 pr-2">
                                <View className="flex-row items-center flex-wrap gap-1">
                                  <Ionicons 
                                    name={!isReceipt ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} 
                                    size={14} 
                                    color={!isReceipt ? '#ef4444' : '#10b981'} 
                                  />
                                  <Text className={"text-xs font-semibold " + (cbIsDebt || !isReceipt ? "text-rose-600" : "text-slate-800")}>
                                    {translateMethod(cb.method)}
                                  </Text>
                                  {isRefund && (
                                    <View className="border border-red-200 bg-red-50 px-1 rounded">
                                      <Text className="text-[8px] text-red-600 font-bold uppercase tracking-wider">Hoàn tiền</Text>
                                    </View>
                                  )}
                                  {(() => {
                                    const displayCbId = cbId.startsWith('CB') ? cbId : (cbId.length > 15 && cbId.includes('-') ? cbId.substring(0, 8) : cbId);
                                    return (
                                      <TouchableOpacity
                                        onPress={() => handleCopyCbNo(cbId)}
                                        className="flex-row items-center active:opacity-75"
                                      >
                                        <Text className="text-[10px] text-slate-400 font-mono ml-1">#{displayCbId}</Text>
                                        <Ionicons 
                                          name={copiedCbId === cbId ? "checkmark" : "copy-outline"} 
                                          size={10} 
                                          color={copiedCbId === cbId ? "#10b981" : "#94a3b8"} 
                                          style={{marginLeft: 2}}
                                        />
                                      </TouchableOpacity>
                                    );
                                  })()}
                                </View>
                                {(cb.note || cb.paid_at || cb.created_at) ? (
                                  <Text className="text-[10px] text-slate-400 mt-1">
                                    {(cb.paid_at || cb.created_at) ? formatDateTime(cb.paid_at || cb.created_at).replace(',', '') + (cb.note ? ' - ' : '') : ''}{cb.note || ''}
                                  </Text>
                                ) : null}
                              </View>
                              <Text className={"text-xs font-bold " + (cbIsDebt || !isReceipt ? "text-rose-600" : "text-emerald-700")}>
                                {(!isReceipt || cbIsDebt) ? '-' : '+'}{formatCurrency(cb.amount)}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  )}
                </>
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
            <View className="flex-row justify-around gap-2 pb-1">
              <TouchableOpacity
                onPress={handleReprint}
                disabled={isReprinting}
                className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg bg-slate-50 active:bg-slate-100"
              >
                {isReprinting ? (
                  <ActivityIndicator size="small" color="#475569" style={{ transform: [{ scale: 0.7 }] }} />
                ) : (
                  <Ionicons name="print-outline" size={16} color="#475569" />
                )}
                <Text className="text-slate-700 text-xs font-semibold ml-1.5">In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (!canReturn) return;
                  setReturnItems({});
                  setReturnReason('wrong_item');
                  setReturnFundId('');
                  setReturnRefundAmount('');
                  setReturnNote('');
                  setShowReturnFundSelector(false);
                  setShowReturnForm(true);
                  void loadReturnFunds();
                }}
                disabled={!canReturn}
                className={"flex-1 flex-row items-center justify-center py-2.5 rounded-lg " + (canReturn ? "bg-slate-50 active:bg-slate-100" : "bg-slate-50 opacity-50")}
              >
                <Ionicons name="refresh-outline" size={16} color={canReturn ? '#7c3aed' : '#cbd5e1'} />
                <Text className={"text-xs font-semibold ml-1.5 " + (canReturn ? "text-violet-600" : "text-slate-400")}>Đổi trả</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (!canCancel) return;
                  setCancelReason('Sai sót hệ thống');
                  setCustomCancelReason('');
                  setShowCancelDialog(true);
                }}
                disabled={!canCancel}
                className={"flex-1 flex-row items-center justify-center py-2.5 rounded-lg " + (canCancel ? "bg-slate-50 active:bg-slate-100" : "bg-slate-50 opacity-50")}
              >
                <Ionicons name="ban-outline" size={16} color={canCancel ? '#ef4444' : '#cbd5e1'} />
                <Text className={"text-xs font-semibold ml-1.5 " + (canCancel ? "text-rose-600" : "text-slate-400")}>
                  {selectedOrder.status === 'in_progress' ? 'Gỡ kẹt' : 'Hủy'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* CÁC DIALOG / MODAL ĐƯỢC CHUYỂN THÀNH ABSOLUTE VIEWS ĐỂ TRÁNH LỖI ĐƠ UI TRÊN IOS */}

      
      {/* 4. MODAL THU NỢ TOÀN CỤC */}
      <DebtCollectionModal
        visible={showDebtModal}
        onClose={() => setShowDebtModal(false)}
        customer={debtCustomerData}
        onSuccess={async () => {
          setShowDebtModal(false);
          showToast('Thu nợ thành công', 'success');

          if (selectedOrder) {
            // Thu nợ không thay đổi doanh thu/tổng số đơn: chỉ reload đúng đơn đang mở.
            await refreshSelectedOrderFinancials(selectedOrder);
          } else {
            await refreshOrders();
          }
        }}
      />

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

                {/* Quỹ xuất tiền hoàn */}
                <View>
                  <Text className="text-xxs font-semibold text-slate-400 mb-2 px-1">Quỹ xuất tiền hoàn *</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowReturnFundSelector(true)}
                    disabled={isLoadingReturnFunds || paymentFundsList.length === 0}
                    className={`p-3 rounded-xl border flex-row items-center justify-between ${
                      returnFundId ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200/60'
                    }`}
                  >
                    <View className="flex-row items-center flex-1 mr-3">
                      {isLoadingReturnFunds ? (
                        <ActivityIndicator size="small" color="#f97316" />
                      ) : (
                        <Ionicons name="wallet-outline" size={18} color={returnFundId ? '#f97316' : '#64748b'} />
                      )}
                      <View className="ml-2 flex-1">
                        <Text className={`text-xs font-bold ${returnFundId ? 'text-orange-600' : 'text-slate-500'}`}>
                          {isLoadingReturnFunds
                            ? 'Đang tải danh sách quỹ...'
                            : paymentFundsList.find(fund => fund.id === returnFundId)?.name || 'Chọn quỹ xuất tiền'}
                        </Text>
                        {!isLoadingReturnFunds && returnFundId ? (
                          <Text className="text-[10px] text-slate-500 mt-0.5">
                            {paymentFundsList.find(fund => fund.id === returnFundId)?.type === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-down" size={18} color="#64748b" />
                  </TouchableOpacity>
                  {!isLoadingReturnFunds && paymentFundsList.length === 0 ? (
                    <View className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex-row items-center">
                      <Ionicons name="warning-outline" size={14} color="#d97706" />
                      <Text className="text-[10px] text-amber-700 font-semibold ml-1.5 flex-1">
                        Không có quỹ khả dụng. Hãy kiểm tra cấu hình quỹ hoặc kết nối mạng.
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Số tiền hoàn lại */}
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
                  Object.values(returnItems).reduce((sum, q) => sum + q, 0) === 0 ||
                  !returnFundId ||
                  isLoadingReturnFunds
                }
              />
            </View>

            {/* Bộ chọn quỹ xuất tiền hoàn */}
            {showReturnFundSelector && (
              <View className="absolute inset-0 bg-black/50 z-50 justify-end">
                <TouchableWithoutFeedback onPress={() => setShowReturnFundSelector(false)}>
                  <View className="absolute inset-0" />
                </TouchableWithoutFeedback>
                <View className="bg-white rounded-t-3xl p-6 max-h-[70%]">
                  <View className="flex-row justify-between items-center mb-4">
                    <View>
                      <Text className="text-lg font-bold text-slate-800">Chọn quỹ xuất tiền hoàn</Text>
                      <Text className="text-[10px] text-slate-500 mt-1">Tiền hoàn sẽ được ghi chi từ quỹ này</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowReturnFundSelector(false)} className="p-1">
                      <Ionicons name="close" size={24} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {paymentFundsList.map(fund => {
                      const isSelected = returnFundId === fund.id;
                      const fundTypeLabel = fund.type === 'cash' ? 'Tiền mặt' : fund.type === 'wallet' ? 'Ví điện tử' : 'Ngân hàng';
                      return (
                        <TouchableOpacity
                          key={fund.id}
                          activeOpacity={0.7}
                          onPress={() => {
                            setReturnFundId(fund.id);
                            setShowReturnFundSelector(false);
                          }}
                          className="py-4 border-b border-slate-100 flex-row justify-between items-center"
                        >
                          <View className="flex-row items-center flex-1 mr-3">
                            <View className={`w-9 h-9 rounded-full items-center justify-center ${isSelected ? 'bg-orange-100' : 'bg-slate-100'}`}>
                              <Ionicons
                                name={fund.type === 'cash' ? 'cash-outline' : 'card-outline'}
                                size={18}
                                color={isSelected ? '#f97316' : '#64748b'}
                              />
                            </View>
                            <View className="ml-3 flex-1">
                              <Text className={`text-sm ${isSelected ? 'font-bold text-orange-600' : 'text-slate-700 font-semibold'}`}>
                                {fund.name}
                              </Text>
                              <Text className="text-[10px] text-slate-500 mt-0.5">
                                {fundTypeLabel}
                                {fund.current_balance !== undefined && fund.current_balance !== null
                                  ? ` · Số dư ${formatCurrency(Number(fund.current_balance || 0))}`
                                  : ''}
                              </Text>
                            </View>
                          </View>
                          {isSelected ? <Ionicons name="checkmark-circle" size={22} color="#f97316" /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
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
            <View className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 mb-4 flex-row items-center">
              <Ionicons name="wallet-outline" size={15} color="#64748b" />
              <Text className="text-[10px] text-slate-600 font-semibold ml-2 flex-1">
                Quỹ xuất tiền: {paymentFundsList.find(fund => fund.id === returnFundId)?.name || 'Chưa chọn'}
              </Text>
            </View>
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
              {syncErrorMessage}
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
        description={syncErrorMessage}
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
