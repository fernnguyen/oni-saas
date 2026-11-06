import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform, Animated, ActivityIndicator, Alert, Pressable, KeyboardAvoidingView, DeviceEventEmitter } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { getSystemTaxGroups } from '../../lib/utils/tax';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { formatCurrency, maskCurrencyInput, parseCurrencyToNumber } from '../../lib/utils/format';
import { formatResourceStartTime, getResourceBillingPresentationForResource } from '../../lib/utils/resource-billing-presentation';
import { allowsProductNegativeStock, buildQuickCreateMetadata, calculateHourlyBilling, isKitchenEligibleIndustry, isTimeChargeProduct, isSystemTimeChargeProduct } from '@oni/core';

// Import hệ thống component dùng chung
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { SingleLineInput } from '../../components/ui/single-line-input';
import { Switch } from '../../components/ui/Switch';
import { DrawerMenu } from '../../components/erp/DrawerMenu';
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal';
import { ProductPreviewModal } from '../../components/pos/ProductPreviewModal';
import CartCheckoutModal from '../../components/pos/CartCheckoutModal';
import { PosItemEditModal } from '../../components/pos/PosItemEditModal';
import QRTransferModal from '../../components/pos/QRTransferModal';
import { ConflictResolutionModal } from '../../components/pos/ConflictResolutionModal';

import { LodgingGuest, LodgingGuestsForm } from '../../components/pos/LodgingGuestsForm';
import { PosDatePicker } from '../../components/pos/PosDatePicker';
import { PosDateTimePicker } from '../../components/pos/PosDateTimePicker';
import { PosToast } from '../../components/pos/PosToast';
import { TableOrderTicketSheet } from '../../components/pos/TableOrderTicketSheet';
import { PosDialogHost, PosDialogProvider, usePosDialogController } from '../../components/pos/PosDialog';
import { getResourceDisplayName, getResourceNouns } from '../../lib/pos/resourceLabels';
import { useCart } from '../../hooks/pos/useCart';
import { usePosData } from '../../hooks/pos/usePosData';
import { useTableManager } from '../../hooks/pos/useTableManager';
import { useTableSyncV2 } from '../../hooks/pos/useTableSyncV2';
import TableSyncInboxModal from '../../components/pos/TableSyncInboxModal';
import { usePosToast } from '../../hooks/pos/usePosToast';
import { usePermissions } from '../../lib/auth/PermissionsContext';
import { useTableKitchen, sentQtyOf, soldOutQtyOf, kitchenBadge, fetchSoldOutProducts, setProductBackInStock } from '../../hooks/pos/useTableKitchen';
import { withoutKitchenNotes } from '../../lib/pos/tableCartV2';
import { useRealtimeSync } from '../../hooks/pos/useRealtimeSync';
export type SelectedModifier = { option: string; price_adj: number };
export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variant_label?: string;
  modifiers?: SelectedModifier[];
  modifier_total?: number;
};


export default function PosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restore_barcode_scanner?: string }>();
  const {
    productsList, setProductsList,
    categoriesList, setCategoriesList,
    customersList, setCustomersList,
    paymentFundsList, setPaymentFundsList,
    paymentMethodsList, setPaymentMethodsList,
    selectedCategoryId, setSelectedCategoryId,
    tables, setTables,
    isLoading, setIsLoading,
    isNavReady, setIsNavReady,
    currentUserEmail, setCurrentUserEmail,
    activeShopId, setActiveShopId,
    isOnline, setIsOnline,
    apiAuthHeaders, setApiAuthHeaders,
    activeVertical, setActiveVertical,
    shopVertical, setShopVertical,
    isShiftEnabled, setIsShiftEnabled,
    loadPosData
  } = usePosData();

  // Bàn đang được "Gọi món" (khác cartOwnerTable — cái đó dùng cho thanh toán bàn)
  const [orderingTable, setOrderingTable] = useState<any | null>(null);

  // Hộp thoại dùng chung (thay Alert.alert trong luồng bàn / gọi món / thanh toán).
  // Hiển thị qua các <PosDialogHost/> đặt ở gốc màn hình và bên trong từng Modal (xem PosDialog.tsx).
  const posDialog = usePosDialogController();
  const dialog = posDialog.api;
  // Danh từ theo phân hệ: bàn / phòng / sân
  const resNouns = getResourceNouns(shopVertical);

  const {
    cart, setCart,
    isPreviewModalOpen, setIsPreviewModalOpen,
    previewProduct, setPreviewProduct,
    previewQuantity, setPreviewQuantity,
    selectedVariant, setSelectedVariant,
    selectedModifiers, setSelectedModifiers,
    selectedCustomer, setSelectedCustomer,
    discountAmount, setDiscountAmount,
    orderNote, setOrderNote,
    addToCart, handleConfirmAddToCart, removeFromCart, updateCartItemQuantity, getCartTotal, getCartCount
  } = useCart(isNavReady, isLoading, !!orderingTable);

  const [editingCartItem, setEditingCartItem] = useState<{ tableId?: string, cartItemId: string, item: any, fromCartModal?: boolean } | null>(null);

  // Premium Toast Notification state
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', opts?: { silent?: boolean }) => {
    setToastMsg({ message, type });
    if (!opts?.silent) Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
        type === 'error' ? Haptics.NotificationFeedbackType.Error :
          Haptics.NotificationFeedbackType.Warning
    ).catch(() => { });

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
      // A newer toast stops this sequence (finished = false): don't wipe the newer message
    ]).start(({ finished }) => { if (finished) setToastMsg(null); });
  };

  const renderToast = (isForModal: boolean = false) => {
    if (!toastMsg) return null;

    const isAnyModalVisible = isTableOpenDialogVisible || !!activeTable || isCartModalOpen || isQrModalOpen;
    if (!isForModal && isAnyModalVisible) return null;

    return (
      <Animated.View
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 60 : 30,
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
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 999
        }}
        className={`flex-row items-center px-4 py-3.5 rounded-2xl border ${toastMsg.type === 'success' ? 'bg-emerald-500 border-emerald-600' :
            toastMsg.type === 'error' ? 'bg-rose-500 border-rose-600' :
              'bg-blue-600 border-blue-700'
          }`}
      >
        <Ionicons
          name={
            toastMsg.type === 'success' ? 'checkmark-circle' :
              toastMsg.type === 'error' ? 'alert-circle' :
                'information-circle'
          }
          size={18}
          color="white"
        />
        <Text className="flex-1 ml-2.5 text-white font-medium text-xs">
          {toastMsg.message}
        </Text>
      </Animated.View>
    );
  };


  // State quản lý POS

  useEffect(() => {
    AsyncStorage.getItem('saved_email').then(email => {
      if (email) setCurrentUserEmail(email);
    }).catch(() => { });
    AsyncStorage.getItem('active_shop_id').then(id => {
      if (id) setActiveShopId(id);
    }).catch(() => { });
    // Load API headers (có auth token)
    getApiHeaders().then(h => setApiAuthHeaders(h as Record<string, string>)).catch(() => { });
    // Kiểm tra online trạng thái
    const checkOnline = () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
      } else {
        // Trên native: thử fetch ping nhẹ
        fetch(getApiBaseUrl() + '/api/ping', { method: 'HEAD' })
          .then(() => setIsOnline(true))
          .catch(() => setIsOnline(false));
      }
    };
    checkOnline();
    const interval = setInterval(checkOnline, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNavReady(true);
    }, 150); // Delay 150ms để React Navigation & NativeWind CSS Interop khởi tạo context đầy đủ
    return () => clearTimeout(timer);
  }, []);

  const checkIsQrPayment = (methodId: string) => {
    const m = paymentMethodsList.find(pm => pm.id === methodId || pm.code === methodId);
    return m?.type === 'bank' && m?.code !== 'card';
  };
  const getFirstTabLabel = () => {
    switch (shopVertical) {
      case 'fnb':
        return 'Thực đơn & Gọi món';
      case 'lodging':
        return 'Dịch vụ & Tiện ích';
      case 'sports_court':
      case 'billiards':
        return 'Dịch vụ & Đồ uống';
      default:
        return 'Hàng hóa & Sản phẩm';
    }
  };

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuickCreateBarcodeScan, setIsQuickCreateBarcodeScan] = useState(false);

  useEffect(() => {
    if (params.restore_barcode_scanner === 'true') {
      router.setParams({ restore_barcode_scanner: undefined } as any);
      setIsScannerOpen(true);
    }
  }, [params.restore_barcode_scanner]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('open-barcode-scanner', () => {
      setIsScannerOpen(true);
    });
    return () => sub.remove();
  }, []);

  const [isSavingCart, setIsSavingCart] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);



  // Tìm kiếm Nhanh & Phân trang Lazy Load
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  const [quickCreateRequest, setQuickCreateRequest] = useState<{ name: string; barcode: string } | null>(null);
  const [quickProductName, setQuickProductName] = useState('');
  const [quickProductBarcode, setQuickProductBarcode] = useState('');
  const [quickProductPrice, setQuickProductPrice] = useState('');
  const [quickProductCostPrice, setQuickProductCostPrice] = useState('');
  const [quickProductMinPrice, setQuickProductMinPrice] = useState('');
  const [quickProductCategoryId, setQuickProductCategoryId] = useState('');
  const [quickProductUnit, setQuickProductUnit] = useState('Cái');
  const [quickProductImageUrl, setQuickProductImageUrl] = useState('');
  const [quickProductLocalImageUri, setQuickProductLocalImageUri] = useState<string | null>(null);
  // Start restrictive until the subscription lookup finishes: Tiên phong may use an image URL,
  // but cannot upload files from the device or camera.
  const [isPioneerPlan, setIsPioneerPlan] = useState(true);
  const [showQuickProductUrlInput, setShowQuickProductUrlInput] = useState(false);
  const [isQuickCreateSaving, setIsQuickCreateSaving] = useState(false);
  const [quickCreateProgress, setQuickCreateProgress] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadImageEntitlement = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: member } = await supabase.from('user_tenants').select('tenant_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!member?.tenant_id) return;
        const { data: subscription } = await supabase.from('subscriptions').select('plans (code)').eq('tenant_id', member.tenant_id).maybeSingle();
        const planCode = (subscription?.plans as { code?: string } | null)?.code;
        if (!cancelled) setIsPioneerPlan(!planCode || planCode === 'plan_mini');
      } catch (error) {
        console.warn('[POS] Cannot load image upload entitlement', error);
      }
    };
    void loadImageEntitlement();
    return () => { cancelled = true; };
  }, [activeShopId]);
  const [showQuickCreateMore, setShowQuickCreateMore] = useState(false);

  // Trạng thái bộ lọc sơ đồ phòng/bàn
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'available' | 'occupied' | 'dirty'>('all');
  const [tableSortMode, setTableSortMode] = useState<'last_checkout' | 'name_asc' | 'name_desc' | 'latest_checkout'>('last_checkout');
  const [tableViewMode, setTableViewMode] = useState<'card' | 'list'>('card');

  // Trạng thái Giỏ hàng & Thanh toán Chi tiết
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);

  // Các tính năng nâng cao: Chọn khách hàng, Giảm giá, Ghi chú, Chia hóa đơn (Split payment) & QR Code
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [paymentRows, setPaymentRows] = useState<{ id: string; method: string; fund_id: string; amount: number }[]>([]);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrPayload, setQrPayload] = useState<{ amount: number; orderNo: string; fund_id: string } | null>(null);
  const [openDropdownRowId, setOpenDropdownRowId] = useState<string | null>(null);

  // Hộp thoại xác nhận thay Alert.alert

  const [isTablePayDialogVisible, setIsTablePayDialogVisible] = useState(false);
  const [selectedTableForPay, setSelectedTableForPay] = useState<any>(null);
  const [tablePayMethod, setTablePayMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Tiền mặt');
  const [isPayingCartLoading, setIsPayingCartLoading] = useState(false);

  // Time Picker states for table check-in / check-out
  const [isTableTimePickerOpen, setIsTableTimePickerOpen] = useState(false);
  const [tableTimePickerType, setTableTimePickerType] = useState<'checkin' | 'checkout'>('checkin');
  // States quản lý ca làm việc (Shift Management)
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [isShiftLoading, setIsShiftLoading] = useState(false);
  const [pendingCheckoutAction, setPendingCheckoutAction] = useState<(() => void) | null>(null);

  const handleCheckoutPress = async (action: () => void) => {
    const enabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
    const activeShiftId = await AsyncStorage.getItem('active_shift_id');
    if (enabled && !activeShiftId) {
      setPendingCheckoutAction(() => action);
      setOpeningCashInput('0');
      setIsShiftModalOpen(true);
    } else {
      action();
    }
  };

  const handleShiftOpenConfirm = async () => {
    setIsShiftLoading(true);
    try {
      const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = await getApiBaseUrl();
      const headers = await getApiHeaders();
      const loggedUserName = await AsyncStorage.getItem('user_name');
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const employeeName = loggedUserName || userEmail.split('@')[0];
      const cash = parseInt(openingCashInput.replace(/\D/g, ''), 10) || 0;
      const nowStr = new Date().toISOString();

      let shiftId = `shift-${activeShopId}-${Date.now()}`;
      let syncStatus = 'pending';

      try {
        const res = await fetch(`${currentUrl}/api/shops/${activeShopId}/shifts`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: activeShopId,
            opening_cash: cash,
          }),
        });
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.id) {
            shiftId = resJson.id;
            syncStatus = 'synced';
          }
        }
      } catch (err) {
        console.warn('Không thể gửi ca mở lên server:', err);
      }

      await db.insert(schema.shop_shifts).values({
        id: shiftId,
        opened_at: nowStr,
        status: 'open',
        opening_cash: cash,
        actual_closing_cash: 0,
        employee_name: employeeName,
        sync_status: syncStatus,
      }).onConflictDoNothing();

      await AsyncStorage.setItem('active_shift_id', shiftId);
      setIsShiftModalOpen(false);

      if (pendingCheckoutAction) {
        pendingCheckoutAction();
        setPendingCheckoutAction(null);
      }
    } catch (err: any) {
      console.error('Lỗi khi mở ca làm việc:', err);
      Alert.alert('Lỗi', `Không thể mở ca làm việc: ${err.message || err}`);
    } finally {
      setIsShiftLoading(false);
    }
  };

  // Custom Date Picker Modal States
  const [isScanSuccessDialogVisible, setIsScanSuccessDialogVisible] = useState(false);
  const [scannedProductInfo, setScannedProductInfo] = useState<any>(null);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [syncTriggerTick, setSyncTriggerTick] = useState(0);
  const syncTableSilentRef = React.useRef<(id: string) => void>(null);

  // States cho nghiệp vụ phòng/bàn/sân nâng cao & CRM

  const { broadcastSync, isEnabled: isRealtimeEnabled } = useRealtimeSync(activeShopId, isOnline, (payload) => {
    showToast('Đã cập nhật dữ liệu mới từ thiết bị khác', 'info');
    // Kích hoạt đồng bộ chi tiết bàn + làm mới sơ đồ phòng bàn
    if (payload?.tableId && syncTableSilentRef.current) {
      syncTableSilentRef.current(payload.tableId);
    }
    setSyncTriggerTick(prev => prev + 1);
  });

  // Table sync v2 (table/room/court flows only; retail never enables it)
  const tableSync = useTableSyncV2(activeShopId, shopVertical !== 'retail', isOnline);

  // Bar/Bếp K3: when the branch has prep stations, saving a table draft also sends it to the
  // kitchen ("Lưu & báo bếp"). Probed once per shop; any error → off (plain "Lưu vào bàn").
  const [kitchenEnabled, setKitchenEnabled] = useState(false);
  useEffect(() => {
    if (!activeShopId || !isKitchenEligibleIndustry(shopVertical || 'retail') || !isOnline) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/shops/${activeShopId}/prep-stations`, { headers: await getApiHeaders() });
        const json = res.ok ? await res.json() : null;
        if (alive) setKitchenEnabled(Array.isArray(json?.data) && json.data.length > 0);
      } catch {
        /* offline / unsupported: keep the last known value */
      }
    })();
    return () => { alive = false; };
  }, [activeShopId, shopVertical, isOnline]);
  const [isTableSyncInboxOpen, setIsTableSyncInboxOpen] = useState(false);

  const {
    activeTable, setActiveTable,
    tableCarts, setTableCarts,
    tableCustomers, setTableCustomers,
    roomGuestCount, setRoomGuestCount,
    lodgingGuests, setLodgingGuests,
    isTableOpenDialogVisible, setIsTableOpenDialogVisible,
    selectedTableForOpen, setSelectedTableForOpen,
    checkInTab, setCheckInTab,
    activeTableTab, setActiveTableTab,
    cartOwnerTable, setCartOwnerTable,
    isOpeningTable, setIsOpeningTable,
    openTableError, setOpenTableError,
    tableOpenHandoff,
    completeOpenTableHandoff,
    onActiveTableModalShown,
    isPreparingTablePay,
    isSyncingTableSession, setIsSyncingTableSession,
    timeTicker,
    calculateBilling,

    handleTablePress,
    triggerPayTable,
    handlePayTableConfirmUnified,
    handleTransferTable,
    handleMergeTable,
    handleIncreaseTableItemQty,
    handleDecreaseTableItemQty,
    handleRemoveTableItem,
    handleUpdateTableCustomer,
    groupedZones,
    syncOrderItemsOnline,
    syncCustomerUpdate,
    handleUpdateActiveRoomGuests,
    handleDatePickerOpen,
    isDatePickerOpen,
    setIsDatePickerOpen,
    pickerTargetField,
    pickerTargetIndex,
    isPayingTableLoading,
    isUpdatingGuestsLoading,
    roomRentalType,
    setRoomRentalType,
    handleConfirmOpenTable,
    syncActiveTableSession,
    syncTableSilent,
    isCleanConfirmModalOpen, setIsCleanConfirmModalOpen,
    tableToClean, setTableToClean,
    cleanConfirmSaving,
    handleCleanTable,
    handleUpdateTableTime,
    tableConflict, setTableConflict,
    resolveTableConflict,
    dismissTableConflict,
    openPendingConflict,
    pendingConflictTableIds,
    isV2Table,
    getV2Session,
    beginTableOrdering,
    takeOrderingBaseCart,
    verifyV2SessionOpen,
    cancelV2Table,
    tableNameOfSession,
    itemNameOfSession,
    lockedTimeCharge,
  } = useTableManager({
    tables, setTables, shopVertical, activeShopId,
    showToast, setCart, setDiscountAmount, setOrderNote, setSelectedCustomer, setIsPreviewModalOpen,
    isNavReady, isLoading, isOnline, checkIsQrPayment, currentUserEmail, productsList, paymentFundsList,
    customersList, selectedCustomer, setPaymentRows, handleCheckoutPress, setIsCartModalOpen, setQrPayload, setIsQrModalOpen,
    broadcastSync,
    tableSync,
    refreshTables: () => setSyncTriggerTick(prev => prev + 1),
    dialog,
  });

  // ── "Gọi món" cho phòng/bàn: nháp riêng theo bàn ───────────────────────────────────
  // Khi đang gọi món, state `cart` tạm thời chứa NHÁP món mới của bàn (không phải giỏ bán lẻ).
  // Giỏ bán lẻ được cất vào orderingStashRef lúc vào và trả lại khi thoát (lưu / huỷ / chuyển tab).
  // useCart(..., persistSuspended = !!orderingTable) nên nháp không bao giờ bị ghi vào 'temp_cart';
  // nháp được lưu riêng ở AsyncStorage `table_order_draft:<tableId>`.
  const tableOrderDraftKey = (tableId: string) => `table_order_draft:${tableId}`;
  const orderingStashRef = React.useRef<{ cart: Record<string, any>; owner: any } | null>(null);
  const orderingSavingRef = React.useRef(false);
  const [isSavingTableDraft, setIsSavingTableDraft] = useState(false);
  const [isTableTicketOpen, setIsTableTicketOpen] = useState(false);
  // Thứ tự các dòng nháp được thêm/tăng gần nhất (cuối mảng = mới nhất) → nút "−" trên ô sản phẩm
  const draftTouchOrderRef = React.useRef<string[]>([]);
  const prevDraftRef = React.useRef<Record<string, any> | null>(null);
  const addToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAddedProductIdsRef = React.useRef<string[]>([]);
  const latestCartRef = React.useRef(cart);
  latestCartRef.current = cart;

  const tableMapVertical = !['retail', 'fashion'].includes(shopVertical) ? shopVertical : 'billiards';
  const sumQty = (c: Record<string, any> | undefined) =>
    Object.values(c || {}).reduce((s: number, l: any) => s + (Number(l?.quantity) || 0), 0);
  const draftProductQty = (productId: string) =>
    Object.values(cart).reduce((s: number, l: any) => s + (l?.productId === productId ? Number(l.quantity) || 0 : 0), 0);

  /** Cộng dồn nháp vào giỏ đã có của bàn (cùng khoá dòng → cộng số lượng, giữ thông tin dòng gốc) */
  const mergeDraftIntoTableCart = (base: Record<string, any>, draft: Record<string, any>) => {
    const next: Record<string, any> = { ...(base || {}) };
    for (const [key, line] of Object.entries(draft || {})) {
      const qty = Number((line as any)?.quantity) || 0;
      if (qty <= 0) continue;
      const existing = next[key];
      const note = (line as any)?.kitchen_note;
      next[key] = existing
        ? { ...existing, quantity: (Number(existing.quantity) || 0) + qty, ...(note ? { kitchen_note: note } : {}) }
        : { ...(line as any) };
    }
    return next;
  };

  const clearAddToastTimer = () => {
    if (addToastTimerRef.current) clearTimeout(addToastTimerRef.current);
    addToastTimerRef.current = null;
    pendingAddedProductIdsRef.current = [];
  };

  const enterTableOrdering = async (table: any) => {
    if (!table) return;
    if (orderingTable) {
      // Đang gọi món cho chính bàn này → chỉ quay lại màn chọn món
      if (orderingTable.id === table.id) {
        setActiveTable(null);
        setActiveVertical('retail');
        return;
      }
      return;
    }
    const retailStash = { cart, owner: cartOwnerTable };
    beginTableOrdering(table);
    setActiveTable(null);
    let draft: Record<string, any> = {};
    try {
      const raw = await AsyncStorage.getItem(tableOrderDraftKey(table.id));
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) draft = parsed;
    } catch (err) {
      console.warn('[Gọi món] Không đọc được nháp của bàn:', err);
    }
    orderingStashRef.current = retailStash;
    draftTouchOrderRef.current = Object.keys(draft);
    prevDraftRef.current = draft;
    clearAddToastTimer();
    // Cùng một lượt render: cart = nháp + orderingTable = bàn → không bao giờ ghi nháp vào temp_cart
    setCart(draft);
    setCartOwnerTable(null);
    setOrderingTable(table);
    setActiveVertical('retail');
    const restored = sumQty(draft);
    if (restored > 0) showToast(`Đã khôi phục ${restored} món nháp của ${table.name}`, 'info', { silent: true });
  };

  /** Thoát chế độ gọi món: trả giỏ bán lẻ. mode 'keep' giữ nháp cho lần sau, 'discard'/'saved' xoá nháp. */
  const exitTableOrdering = (mode: 'keep' | 'discard' | 'saved') => {
    const table = orderingTable;
    if (!table) return;
    const draft = cart;
    const key = tableOrderDraftKey(table.id);
    if (mode === 'keep' && Object.keys(draft).length > 0) {
      AsyncStorage.setItem(key, JSON.stringify(draft)).catch(() => {});
    } else {
      AsyncStorage.removeItem(key).catch(() => {});
    }
    takeOrderingBaseCart(table.id);
    clearAddToastTimer();
    draftTouchOrderRef.current = [];
    prevDraftRef.current = null;
    const stash = orderingStashRef.current;
    orderingStashRef.current = null;
    setIsTableTicketOpen(false);
    setCart(stash?.cart || {});
    setCartOwnerTable(stash?.owner || null);
    setOrderingTable(null);
    setActiveVertical(tableMapVertical);
  };

  // "Lưu & báo bếp" only where the save really reaches the kitchen (v2 table + stations).
  const tableSaveLabel = (table: { id: string; name: string }) => {
    const live = tables.find(t => t.id === table.id) || table;
    return kitchenEnabled && isV2Table(live as any) ? 'Lưu & báo bếp' : `Lưu vào ${table.name}`;
  };

  const saveTableOrderDraft = async () => {
    const target = orderingTable;
    if (!target || orderingSavingRef.current) return;
    const draft = cart;
    const count = sumQty(draft);
    if (count <= 0) return;
    orderingSavingRef.current = true;
    setIsSavingTableDraft(true);
    try {
      const liveTable = tables.find(t => t.id === target.id) || target;
      const latestOrderId = liveTable.current_order_id || target.current_order_id || '';
      const base = tableCarts[target.id] || {};
      const next = mergeDraftIntoTableCart(base, draft);

      if (isV2Table(liveTable)) {
        // Phiên phải còn mở và đúng đơn hiện tại của bàn, nếu không món sẽ bị server từ chối (xung đột)
        const sessionState = await verifyV2SessionOpen(liveTable);
        if (sessionState === 'closed') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
          void dialog.confirm({
            title: `${target.name} đã đóng trên thiết bị khác`,
            message: `${target.name} đã được thanh toán hoặc đóng ở thiết bị khác nên chưa thể thêm món. Các món mới vẫn được giữ trong nháp; vui lòng mở lại ${resNouns.noun} rồi lưu.`,
            tone: 'warning',
            icon: 'lock',
            actions: [{ key: 'ok', label: 'Đã hiểu', style: 'primary' }],
          });
          setSyncTriggerTick(prev => prev + 1);
          return;
        }
        // v2: base = món đã có trên bàn → chỉ gửi add_item / change_qty cho phần nháp
        const ok = await syncOrderItemsOnline(latestOrderId, next, target.id, base, { kitchenFire: kitchenEnabled });
        if (!ok) {
          // Hộp thoại (không phải toast): toast bị phiếu gọi món (Modal) che mất
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
          void dialog.alert('Chưa lưu được món', `Không ghi được món vào ${target.name}. Các món mới vẫn được giữ trong nháp, vui lòng thử lại.`, 'danger');
          return;
        }
        setTableCarts(prev => ({ ...prev, [target.id]: withoutKitchenNotes(next) }));
        setIsTableTicketOpen(false);
        exitTableOrdering('saved');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        showToast(
          sessionState === 'offline'
            ? `Đã lưu ${count} món trên máy cho ${target.name}, sẽ gửi${kitchenEnabled ? ' và báo bếp' : ''} khi có mạng`
            : kitchenEnabled
              ? `Đã lưu ${count} món vào ${target.name} và báo bếp`
              : `Đã lưu ${count} món vào ${target.name}`,
          'success',
          { silent: true }
        );
        return;
      }

      // Luồng cũ (offline-first): lưu cục bộ ngay, đồng bộ nền với giỏ tuyệt đối đã cộng dồn
      setTableCarts(prev => ({ ...prev, [target.id]: next }));
      setIsTableTicketOpen(false);
      exitTableOrdering('saved');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      showToast(`Đã lưu ${count} món vào ${target.name}`, 'success', { silent: true });
      (async () => {
        try {
          const success = await syncOrderItemsOnline(latestOrderId, next, target.id, base);
          if (!success) {
            showToast(`Lỗi đồng bộ trực tuyến, món đã được lưu cục bộ tại ${target.name}.`, 'error');
          }
        } catch (err) {
          console.error('Lỗi khi đồng bộ nền món phòng bàn:', err);
          showToast(`Mất kết nối, món đã được lưu cục bộ tại ${target.name}.`, 'error');
        }
      })();
    } catch (err) {
      console.error('[Gọi món] Lỗi khi lưu món vào bàn:', err);
      void dialog.alert('Chưa lưu được món', `Không lưu được món vào ${target.name}. Các món mới vẫn được giữ trong nháp.`, 'danger');
    } finally {
      orderingSavingRef.current = false;
      setIsSavingTableDraft(false);
    }
  };

  /** "Thoát" / chuyển sang sơ đồ bàn khi còn nháp → hỏi lưu / giữ / bỏ */
  const requestExitTableOrdering = async () => {
    if (!orderingTable || orderingSavingRef.current) return;
    const count = sumQty(cart);
    if (count <= 0) {
      exitTableOrdering('discard');
      return;
    }
    const choice = await dialog.confirm({
      title: `Còn ${count} món chưa lưu`,
      message: `Các món mới cho ${orderingTable.name} chưa được lưu.`,
      tone: 'warning',
      icon: 'file-text',
      // Chạm ra ngoài / nút Back = ở lại màn gọi món
      cancelKey: 'stay',
      actions: [
        // Nút lưu hiện spinner tới khi lưu xong (lỗi → hộp thoại lỗi hiện tiếp sau)
        { key: 'save', label: tableSaveLabel(orderingTable), style: 'primary', loadingLabel: 'Đang lưu…', onPress: () => saveTableOrderDraft() },
        { key: 'keep', label: 'Giữ nháp, thoát', style: 'secondary' },
        { key: 'discard', label: 'Bỏ món mới', style: 'destructive' },
      ],
    });
    if (choice === 'keep') exitTableOrdering('keep');
    else if (choice === 'discard') exitTableOrdering('discard');
  };

  /** "−" trên ô sản phẩm: giảm dòng nháp được thêm gần nhất của sản phẩm đó */
  const decreaseDraftProduct = (productId: string) => {
    const keys = Object.keys(cart).filter(k => cart[k]?.productId === productId);
    if (keys.length === 0) return;
    const order = draftTouchOrderRef.current;
    const key = [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)).pop()!;
    decreaseDraftLine(key);
  };

  const decreaseDraftLine = (cartItemId: string) => {
    const line = cart[cartItemId];
    if (!line) return;
    if ((Number(line.quantity) || 0) <= 1) removeFromCart(cartItemId);
    else updateCartItemQuantity(cartItemId, Number(line.quantity) - 1);
  };

  const increaseDraftLine = (cartItemId: string) => {
    const line = cart[cartItemId];
    if (!line) return;
    updateCartItemQuantity(cartItemId, (Number(line.quantity) || 0) + 1);
  };

  const confirmClearTableDraft = async () => {
    const choice = await dialog.confirm({
      title: 'Xoá hết món mới?',
      message: 'Các món mới chưa lưu sẽ bị xoá khỏi phiếu.',
      tone: 'danger',
      icon: 'trash-2',
      actions: [
        { key: 'cancel', label: 'Huỷ', style: 'secondary' },
        { key: 'clear', label: 'Xoá hết', style: 'destructive' },
      ],
    });
    if (choice !== 'clear') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart({});
  };

  // Nháp thay đổi: lưu theo bàn, cập nhật thứ tự dòng mới nhất, gộp toast "Đã thêm …"
  useEffect(() => {
    if (!orderingTable) return;
    const key = tableOrderDraftKey(orderingTable.id);
    if (Object.keys(cart).length > 0) AsyncStorage.setItem(key, JSON.stringify(cart)).catch(() => {});
    else AsyncStorage.removeItem(key).catch(() => {});

    const prev = prevDraftRef.current || {};
    prevDraftRef.current = cart;
    let order = draftTouchOrderRef.current.filter(k => !!cart[k]);
    const added: string[] = [];
    for (const [k, line] of Object.entries(cart)) {
      const before = Number(prev[k]?.quantity) || 0;
      const after = Number((line as any)?.quantity) || 0;
      if (after > before) {
        order = order.filter(x => x !== k).concat(k);
        if ((line as any)?.productId) added.push(String((line as any).productId));
      } else if (!order.includes(k)) {
        order.push(k);
      }
    }
    draftTouchOrderRef.current = order;
    // Trong phiếu gọi món đã thấy ngay số lượng → không cần toast (toast cũng bị Modal che)
    if (added.length === 0 || isTableTicketOpen) return;

    pendingAddedProductIdsRef.current = Array.from(new Set([...pendingAddedProductIdsRef.current, ...added]));
    if (addToastTimerRef.current) clearTimeout(addToastTimerRef.current);
    addToastTimerRef.current = setTimeout(() => {
      const ids = pendingAddedProductIdsRef.current;
      pendingAddedProductIdsRef.current = [];
      addToastTimerRef.current = null;
      const latest = latestCartRef.current;
      if (ids.length === 1) {
        const lines = Object.values(latest).filter((l: any) => l?.productId === ids[0]) as any[];
        if (lines.length === 0) return;
        const qty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        showToast(`Đã thêm ${lines[0].name} (x${qty})`, 'success', { silent: true });
      } else if (ids.length > 1) {
        showToast(`Đã thêm ${ids.length} sản phẩm · ${sumQty(latest)} món mới`, 'success', { silent: true });
      }
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, orderingTable]);

  useEffect(() => () => { if (addToastTimerRef.current) clearTimeout(addToastTimerRef.current); }, []);

  // loadPosData (focus / đồng bộ từ thiết bị khác) đặt lại activeVertical = phân hệ của shop.
  // Đang gọi món thì giữ nguyên màn chọn món (layout effect → không nháy sơ đồ bàn).
  // Rời chế độ gọi món chỉ qua exitTableOrdering (Thoát / tab Sơ đồ bàn / lưu xong).
  React.useLayoutEffect(() => {
    if (orderingTable && activeVertical !== 'retail') setActiveVertical('retail');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVertical, orderingTable]);

  // Đổi cửa hàng/phân hệ khi đang gọi món: giữ nháp của bàn và trả giỏ bán lẻ
  const orderingShopVerticalRef = React.useRef(shopVertical);
  useEffect(() => {
    if (orderingTable && orderingShopVerticalRef.current !== shopVertical) exitTableOrdering('keep');
    orderingShopVerticalRef.current = shopVertical;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopVertical]);

  // State thêm nhanh khách hàng cho sơ đồ phòng bàn
  const { hasPermission } = usePermissions();
  const canModifyOrders = hasPermission(['orders.edit', 'orders.update', 'owner', 'admin']);

  // ── Bar/Bếp on the table detail: per-dish state, "Gửi bếp" fallback, guarded cancels ──
  const activeV2SessionId = kitchenEnabled && activeTable ? (getV2Session(activeTable)?.sessionId || '') : '';
  const tableKitchen = useTableKitchen(activeShopId, activeV2SessionId, Boolean(activeV2SessionId), tableSync);
  const canVoidSentDish = hasPermission(['orders.delete', 'owner', 'admin']);

  /** Before cutting a table line: dishes already sent need permission + a reason (cancel ticket). */
  const guardKitchenReduce = async (item: any, newQty: number): Promise<{ ok: boolean; reason?: string }> => {
    const sent = sentQtyOf(tableKitchen.status, item?._serverItemId);
    const voidQty = sent - Math.max(0, newQty);
    if (sent <= 0 || voidQty <= 0) return { ok: true };
    // The kitchen itself reported it sold out: removing that part is not the floor's fault.
    if (voidQty <= soldOutQtyOf(tableKitchen.status, item?._serverItemId)) return { ok: true, reason: 'Hết món' };
    if (!canVoidSentDish) {
      await dialog.alert('Món đã báo bếp', `"${item?.name || 'Món'}" đã gửi xuống bếp. Cần quyền huỷ đơn để bớt hoặc huỷ món này.`, 'warning');
      return { ok: false };
    }
    const choice = await dialog.confirm({
      title: 'Huỷ món đã báo bếp',
      message: `${item?.name || 'Món'}: huỷ ${voidQty} phần đã gửi xuống bếp. Bếp sẽ nhận phiếu huỷ kèm lý do.`,
      tone: 'warning',
      icon: 'x-circle',
      cancelKey: 'keep',
      actions: [
        { key: 'Khách đổi ý', label: 'Khách đổi ý', style: 'destructive' },
        { key: 'Nhập nhầm', label: 'Nhập nhầm', style: 'destructive' },
        { key: 'keep', label: 'Giữ món', style: 'secondary' },
      ],
    });
    return choice && choice !== 'keep' ? { ok: true, reason: choice } : { ok: false };
  };

  // "Tạm hết" list while ordering for a table (refreshed every 30 s)
  const [soldOutIds, setSoldOutIds] = useState<string[]>([]);
  useEffect(() => {
    if (!orderingTable || !kitchenEnabled || !activeShopId) return;
    let alive = true;
    const load = async () => {
      const ids = await fetchSoldOutProducts(activeShopId);
      if (alive && ids) setSoldOutIds(ids);
    };
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [orderingTable, kitchenEnabled, activeShopId]);

  /** Add a product to the cart; while ordering for a table, sold-out products ask first. */
  const orderProduct = async (p: any) => {
    if (orderingTable && soldOutIds.includes(String(p?.id))) {
      const choice = await dialog.confirm({
        title: 'Món đang tạm hết',
        message: `${p?.name || 'Món'} được báo tạm hết hôm nay. Nếu đã có hàng lại, bấm "Đã có hàng" để gọi tiếp.`,
        tone: 'warning',
        icon: 'alert-triangle',
        cancelKey: 'skip',
        actions: [
          {
            key: 'back', label: 'Đã có hàng – gọi tiếp', style: 'primary', loadingLabel: 'Đang cập nhật…',
            onPress: async () => {
              if (!(await setProductBackInStock(activeShopId, String(p.id), String(p.name || '')))) {
                throw new Error('back_in_stock_failed');
              }
              setSoldOutIds((ids) => ids.filter((id) => id !== String(p.id)));
            },
          },
          { key: 'skip', label: 'Không gọi', style: 'secondary' },
        ],
      });
      if (choice !== 'back') return;
    }
    addToCart(p);
  };

  const sendTableToKitchen = async () => {
    const n = await tableKitchen.send();
    if (n === null) showToast('Chưa gửi được xuống bếp (mất mạng?). Thử lại khi có mạng.', 'error');
    else showToast(n > 0 ? `Đã gửi ${n} phiếu xuống bar/bếp` : 'Không có món mới để gửi', n > 0 ? 'success' : 'info', { silent: true });
  };

  const [isTransferModalVisible, setIsTransferModalVisible] = useState(false);
  const [isMergeModalVisible, setIsMergeModalVisible] = useState(false);
  const [transferSearchQuery, setTransferSearchQuery] = useState('');
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');

  const [confirmTransferMerge, setConfirmTransferMerge] = useState<{
    visible: boolean;
    type: 'transfer' | 'merge';
    sourceTable: any;
    targetTable: any;
    includeStayCost: boolean;
    loading: boolean;
  }>({
    visible: false,
    type: 'transfer',
    sourceTable: null,
    targetTable: null,
    includeStayCost: true,
    loading: false,
  });

  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickCustType, setQuickCustType] = useState('Thành viên');
  const [quickCustEmail, setQuickCustEmail] = useState('');
  const [quickCustAddress, setQuickCustAddress] = useState('');
  const [quickCustNote, setQuickCustNote] = useState('');
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [quickCustomerSource, setQuickCustomerSource] = useState<'open_table' | 'active_table' | null>(null);

  const handleOpenQuickAddCustomer = (source: 'open_table' | 'active_table') => {
    setQuickCustomerSource(source);
    const query = customerSearchQuery.trim();
    const isPhone = /^\d+$/.test(query);
    if (isPhone) {
      setQuickCustPhone(query);
      setQuickCustName('');
    } else {
      setQuickCustName(query);
      setQuickCustPhone('');
    }
    setQuickCustType('Thành viên');
    setQuickCustEmail('');
    setQuickCustAddress('');
    setQuickCustNote('');
    setIsQuickCustomerModalOpen(true);
  };

  const handleSaveQuickCustomer = async () => {
    if (!quickCustName.trim()) {
      showToast('Vui lòng nhập Tên khách hàng!', 'error');
      return;
    }
    if (!quickCustPhone.trim()) {
      showToast('Vui lòng nhập Số điện thoại!', 'error');
      return;
    }

    setIsQuickSaving(true);
    try {
      const custId = `C-TEMP-${Date.now()}`;
      const shopId = activeShopId || 'default-shop';
      
      // 1. Lưu SQLite cục bộ
      if (Platform.OS !== 'web') {
        await db.insert(schema.customers).values({
          id: custId,
          name: quickCustName,
          phone: quickCustPhone,
          customer_type: quickCustType,
          total_spent: 0,
          orders_count: 0,
          sync_status: 'pending',
          credit_limit: 0,
          email: quickCustEmail || null,
          address: quickCustAddress || null,
          note: quickCustNote || null,
        });
      }

      const newCustomerObj = {
        id: custId,
        customer_id: custId,
        name: quickCustName,
        phone: quickCustPhone,
        customer_type: quickCustType,
        total_spent: 0,
        orders_count: 0,
        sync_status: 'pending',
        credit_limit: 0,
        email: quickCustEmail || null,
        address: quickCustAddress || null,
        note: quickCustNote || null,
      };

      // Cập nhật state list khách hàng cục bộ lập tức
      setCustomersList(prev => [newCustomerObj, ...prev]);

      // Liên kết khách hàng vào đúng context nguồn gọi
      if (quickCustomerSource === 'open_table') {
        setSelectedCustomer(newCustomerObj);
      } else if (quickCustomerSource === 'active_table' && activeTable) {
        await handleUpdateTableCustomer(activeTable.id, newCustomerObj);
      }

      setIsQuickCustomerModalOpen(false);
      setCustomerSearchQuery('');
      showToast('Đã thêm khách hàng mới thành công.', 'success');

      // 2. Gửi API đồng bộ cloud ở chế độ nền
      (async () => {
        try {
          const headers = apiAuthHeaders;
          const baseUrl = getApiBaseUrl();
          const response = await fetch(`${baseUrl}/api/shops/${shopId}/customers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: quickCustName,
              phone: quickCustPhone,
              customer_type: quickCustType,
              email: quickCustEmail || `${quickCustPhone}@oni-pos.vn`,
              address: quickCustAddress || 'Tạo nhanh từ POS',
              note: quickCustNote || '',
            }),
          });

          if (response.ok) {
            const resJson = await response.json().catch(() => ({}));
            const serverCustId = resJson.customer_id || resJson.id;

            if (Platform.OS !== 'web' && serverCustId && serverCustId !== custId) {
              // Cập nhật SQLite ID tạm -> ID chuẩn
              await db.update(schema.orders)
                .set({ customer_id: serverCustId })
                .where(eq(schema.orders.customer_id, custId));

              await db.delete(schema.customers).where(eq(schema.customers.id, custId));
              await db.insert(schema.customers).values({
                ...newCustomerObj,
                id: serverCustId,
                sync_status: 'synced',
              }).onConflictDoNothing();

              // Cập nhật lại list khách hàng
              setCustomersList(prev => prev.map(c => c.id === custId ? { ...c, id: serverCustId, sync_status: 'synced' } : c));
              
              // Cập nhật lại table customer hoặc selected customer đang chọn
              if (quickCustomerSource === 'open_table') {
                setSelectedCustomer((prev: any) => prev && prev.id === custId ? { ...prev, id: serverCustId } : prev);
              } else if (quickCustomerSource === 'active_table' && activeTable) {
                setTableCustomers(prev => {
                  if (prev[activeTable.id] && prev[activeTable.id].id === custId) {
                    return {
                      ...prev,
                      [activeTable.id]: { ...prev[activeTable.id], id: serverCustId }
                    };
                  }
                  return prev;
                });
              }
              console.log(`[POS] Đã đồng bộ khách hàng mới #${serverCustId} lên Cloud!`);
            }
          }
        } catch (apiErr) {
          console.warn('[POS] Gặp lỗi đồng bộ cloud khách hàng mới:', apiErr);
        }
      })();
    } catch (err) {
      console.error('[POS] Lỗi tạo nhanh khách hàng:', err);
      showToast('Không thể tạo khách hàng mới!', 'error');
    } finally {
      setIsQuickSaving(false);
    }
  };

  const renderQuickCustomerModal = (source: 'open_table' | 'active_table') => {
    if (!isQuickCustomerModalOpen || quickCustomerSource !== source) return null;

    return (
      <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-[99999]">
        <View className="w-full bg-white rounded-3xl p-6 shadow-2xl max-w-sm">
          <View className="flex-row justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <Text className="text-base font-bold text-slate-800">Thêm khách hàng mới</Text>
            <TouchableOpacity onPress={() => setIsQuickCustomerModalOpen(false)} className="p-1">
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
            <Text className="text-xxs text-slate-500 font-semibold mb-1.5">Tên khách hàng <Text className="text-red-500">*</Text></Text>
            <TextInput
              placeholder="Ví dụ: Anh Hoàng"
              placeholderTextColor="#cbd5e1"
              className="bg-slate-55 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mb-3"
              value={quickCustName}
              onChangeText={setQuickCustName}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />

            <Text className="text-xxs text-slate-500 font-semibold mb-1.5">Số điện thoại <Text className="text-red-500">*</Text></Text>
            <TextInput
              placeholder="Ví dụ: 0987654321"
              placeholderTextColor="#cbd5e1"
              keyboardType="phone-pad"
              className="bg-slate-55 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mb-3"
              value={quickCustPhone}
              onChangeText={setQuickCustPhone}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />

            <Text className="text-xxs text-slate-500 font-semibold mb-1.5">Phân loại (CRM)</Text>
            <View className="flex-row gap-2 mb-3">
              {['Thành viên', 'Thân thiết', 'VIP'].map(type => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setQuickCustType(type)}
                  className="flex-1 py-2 rounded-xl border items-center justify-center"
                  style={quickCustType === type ? {
                    backgroundColor: '#fff7ed',
                    borderColor: '#fa5908',
                  } : {
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                  }}
                >
                  <Text className={`text-[10px] font-bold ${quickCustType === type ? 'text-orange-500' : 'text-slate-500'}`}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xxs text-slate-500 font-semibold mb-1.5">Địa chỉ</Text>
            <TextInput
              placeholder="Nhập địa chỉ (tùy chọn)..."
              placeholderTextColor="#cbd5e1"
              className="bg-slate-55 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mb-3"
              value={quickCustAddress}
              onChangeText={setQuickCustAddress}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />

            <Text className="text-xxs text-slate-500 font-semibold mb-1.5">Ghi chú</Text>
            <TextInput
              placeholder="Ghi chú thêm..."
              placeholderTextColor="#cbd5e1"
              multiline={true}
              numberOfLines={2}
              className="bg-slate-55 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 min-h-[50px] mb-4"
              value={quickCustNote}
              onChangeText={setQuickCustNote}
              style={{
                paddingVertical: 4,
                textAlignVertical: 'top',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
          </ScrollView>

          <View className="flex-row justify-end gap-3 border-t border-slate-100 pt-3">
            <TouchableOpacity
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50"
              onPress={() => setIsQuickCustomerModalOpen(false)}
              disabled={isQuickSaving}
            >
              <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="px-4 py-2.5 rounded-xl bg-orange-500 flex-row justify-center items-center"
              style={{ backgroundColor: '#fa5908' }}
              onPress={handleSaveQuickCustomer}
              disabled={isQuickSaving}
            >
              {isQuickSaving && <ActivityIndicator size="small" color="white" className="mr-1.5" style={{ transform: [{ scale: 0.8 }] }} />}
              <Text className="text-white font-semibold text-xs">
                {isQuickSaving ? 'Đang lưu...' : 'Lưu khách hàng'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Đồng bộ hook callback
  useEffect(() => {
    syncTableSilentRef.current = syncTableSilent;
  }, [syncTableSilent]);

  // Tự động đồng bộ dữ liệu khi có tín hiệu từ thiết bị khác
  useEffect(() => {
    if (syncTriggerTick > 0) {
      if (Platform.OS !== 'web' && isOnline) {
        (async () => {
          try {
            const shopId = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            await SyncManager.pullTableLayoutAndActiveOrders(shopId);
          } catch (err) {
            console.warn('Lỗi đồng bộ sơ đồ phòng bàn tự động:', err);
          } finally {
            loadPosData(true);
            if (activeTable) {
              syncActiveTableSession(activeTable);
            }
          }
        })();
      } else {
        loadPosData(true);
        if (activeTable) {
          syncActiveTableSession(activeTable);
        }
      }
    }
  }, [syncTriggerTick]);

  // Tự động đồng bộ số tiền thanh toán mặc định khi giỏ hàng hoặc giảm giá thay đổi
  useEffect(() => {
    if (!isNavReady) return;
    let totalTaxAmount = 0;
    Object.values(cart).forEach((item: any) => {
      const itemTotal = (item.price + (item.modifier_total || 0)) * item.quantity;
      const taxRateVal = parseFloat(item.tax_rate || '0');
      const taxAmountVal = Math.round(itemTotal * (taxRateVal / 100));
      totalTaxAmount += taxAmountVal;
    });
    const finalTotal = Math.max(0, getCartTotal() - discountAmount + totalTaxAmount);
    setPaymentRows([
      { id: '1', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: finalTotal }
    ]);
  }, [cart, discountAmount, isNavReady, paymentFundsList]);

  // Trạng thái đơn QR và phiên chờ duyệt
  const [pendingQrCount, setPendingQrCount] = useState(0);

  const fetchPendingQrCount = useCallback(async () => {
    if (!isOnline) {
      setPendingQrCount(0);
      return;
    }
    try {
      const shopId = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      if (!shopId) return;
      const headers = await getApiHeaders();
      const baseUrl = getApiBaseUrl();

      // Tải danh sách đơn hàng QR đang chờ duyệt
      const ordersRes = await fetch(`${baseUrl}/api/shops/${shopId}/qr-orders?status=pending`, { headers });
      let ordersCount = 0;
      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        ordersCount = Array.isArray(orders) ? orders.length : 0;
      }

      // Tải danh sách phiên gọi món QR đang chờ duyệt
      const sessionsRes = await fetch(`${baseUrl}/api/shops/${shopId}/qr-sessions?status=pending`, { headers });
      let sessionsCount = 0;
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        sessionsCount = Array.isArray(sessions) ? sessions.length : 0;
      }

      setPendingQrCount(ordersCount + sessionsCount);
    } catch (err) {
      console.warn('Lỗi khi tải số lượng QR order/session chờ duyệt:', err);
    }
  }, [isOnline, activeShopId]);

  // Tải dữ liệu thực tế & trạng thái tạm khi màn hình POS nhận focus & Quản lý Realtime QR
  useFocusEffect(
    useCallback(() => {
      if (!isNavReady) return;
      let isMounted = true;
      loadPosData(isMounted);
      fetchPendingQrCount();

      if (Platform.OS !== 'web' && isOnline) {
        (async () => {
          try {
            const industry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
            if (industry !== 'retail') {
              const shopId = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
              await SyncManager.pullTableLayoutAndActiveOrders(shopId);
              if (isMounted) {
                await loadPosData(isMounted);
              }
            }
          } catch (err) {
            console.warn('Lỗi đồng bộ nền sơ đồ phòng bàn khi mở POS:', err);
          }
        })();
      }

      let channel: any = null;
      if (isOnline && activeShopId) {
        const channelName = `pos-qr-badge-${activeShopId}-${Math.random().toString(36).slice(2, 9)}`;
        channel = supabase.channel(channelName);

        const handlePayload = () => {
          if (isMounted) {
            fetchPendingQrCount();
          }
        };

        channel
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'qr_order_requests', filter: `branch_id=eq.${activeShopId}` },
            handlePayload
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'qr_ordering_sessions', filter: `branch_id=eq.${activeShopId}` },
            handlePayload
          )
          .subscribe();
      }

      return () => {
        isMounted = false;
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    }, [isNavReady, isOnline, activeShopId, fetchPendingQrCount])
  );

  // Kéo đồng bộ lại sơ đồ phòng bàn từ Cloud
  const handleRefresh = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    setIsLoading(true);
    if (Platform.OS !== 'web') {
      try {
        const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        await SyncManager.pullTableLayoutAndActiveOrders(activeShopId);
      } catch (syncErr) {
        console.warn('Lỗi đồng bộ SQLite sơ đồ phòng bàn khi làm mới:', syncErr);
      }
    }
    await Promise.all([
      loadPosData(true),
      fetchPendingQrCount()
    ]);
  };
  const handlePayCart = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: string; fund_id: string; amount: number }[],
    debtRepayOpts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string; customCheckoutTime?: Date; rentalType?: 'hourly' | 'overnight' | 'daily'; chargeByMinute?: boolean }
  ) => {
    const originalTotal = getCartTotal();
    let finalTotal = Math.max(0, originalTotal - discount);



    if (cartOwnerTable) {
      // Pass cart directly as overrideCartItems since triggerPayTable copies tableCarts→cart
      // and all edits in CartCheckoutModal go to cart (activeTable is null at this point)
      await handlePayTableConfirmUnified(customer, discount, note, payments, debtRepayOpts?.customCheckoutTime, debtRepayOpts?.rentalType, cart, debtRepayOpts?.chargeByMinute);
      return;
    }
    setIsPayingCartLoading(true);
    try {
      const { isTaxPeriodLocked } = await import('../../lib/utils/tax');
      const isLocked = await isTaxPeriodLocked(debtRepayOpts?.customCheckoutTime || new Date());
      if (isLocked) {
        setIsPayingCartLoading(false);
        void dialog.alert(
          'Kỳ thuế đã khóa',
          'Thời điểm thanh toán nằm trong kỳ thuế đã bị khóa sổ. Không thể tạo hóa đơn mới!',
          'danger'
        );
        return;
      }

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const debtShopId = shopId;
      const currentUrl = isOnline ? getApiBaseUrl() : null;
      const orderId = `ORD-R-${Date.now()}`;
      const orderNo = `HD-BL-${Date.now().toString().substring(9)}`; // BL = Bán Lẻ
      const nowStr = new Date().toISOString();

      // Calculate offline tax
      const systemTaxGroups = await getSystemTaxGroups();
      let totalTaxAmount = 0;
      const calculatedItems = Object.entries(cart).map(([cartItemId, item]: [string, any]) => {
        const itemTotal = (item.price + (item.modifier_total || 0)) * item.quantity;
        const taxRateVal = parseFloat(item.tax_rate || '0');
        const taxAmountVal = Math.round(itemTotal * (taxRateVal / 100));
        totalTaxAmount += taxAmountVal;

        let taxVatRate = '0';
        let taxPitRate = '0';
        let normalizedGroup = item.tax_group || '';

        if (normalizedGroup) {
          const matchedGroup = systemTaxGroups.find(
            (g) =>
              g.code === normalizedGroup ||
              g.name === normalizedGroup ||
              (normalizedGroup === 'Phân phối, cung cấp hàng hóa' && g.code === 'phan_phoi') ||
              (normalizedGroup === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu' && g.code === 'dich_vu') ||
              (normalizedGroup === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu' && g.code === 'san_xuat') ||
              (normalizedGroup === 'Hoạt động kinh doanh khác' && g.code === 'khac')
          );
          if (matchedGroup) {
            normalizedGroup = matchedGroup.code;
            taxVatRate = String(matchedGroup.vat_rate);
            taxPitRate = String(matchedGroup.pit_rate);
          }
        }

        const origProd = productsList.find(p => p.id === item.productId);
        const catalogPrice = origProd ? (Number(origProd.sell_price) || 0) : 0;
        const resolvedOrigPrice = item.original_price ?? (catalogPrice > 0 ? catalogPrice : item.price);

        return {
          id: `ORDI-${orderId}-${cartItemId}`,
          order_id: orderId,
          product_id: item.productId,
          product_name: item.name,
          qty: item.quantity,
          unit_price: (item.price + (item.modifier_total || 0)),
          original_price: resolvedOrigPrice,
          discount_amount: item.discount_amount || Math.max(0, resolvedOrigPrice - (item.price + (item.modifier_total || 0))),
          line_total: itemTotal,
          tax_rate: item.tax_rate || '0',
          tax_amount: taxAmountVal,
          tax_group: normalizedGroup,
          tax_vat_rate: taxVatRate,
          tax_pit_rate: taxPitRate,
        };
      });

      // Recalculate finalTotal to include tax
      finalTotal = Math.max(0, originalTotal - discount + totalTaxAmount);

      const debtRepay = debtRepayOpts?.debtRepayAmount || 0;
      const realPaidSum = payments.filter(p => p.method !== 'debt' && !p.method?.startsWith('debt-')).reduce((sum, p) => sum + p.amount, 0);
      const orderPaidAmt = Math.min(finalTotal, Math.max(0, realPaidSum - debtRepay));
      const orderDebtAmt = Math.max(0, finalTotal - orderPaidAmt);

      // Deduct old debt repayment from order payments to avoid duplicate cashbook entries
      let debtToDeduct = debtRepay;
      const orderPayments: typeof payments = [];
      for (const p of payments) {
        const isDebtOrPrepaid = p.method === 'debt' || p.method?.startsWith('debt-') || p.method === 'prepaid' || p.method?.startsWith('prepaid-');
        let amt = p.amount;
        if (debtToDeduct > 0 && !isDebtOrPrepaid && amt > 0) {
          const deduct = Math.min(amt, debtToDeduct);
          amt -= deduct;
          debtToDeduct -= deduct;
        }
        if (amt > 0 || amt < 0 || isDebtOrPrepaid) {
          orderPayments.push({ ...p, amount: amt });
        }
      }

      const processedPayments = [...orderPayments];
      const paidSum = processedPayments.reduce((sum, p) => sum + p.amount, 0);
      const cashChange = Math.max(0, paidSum - finalTotal);
      if (cashChange > 0) {
        const defaultCashFund = paymentFundsList.find(f => f.type === 'cash' && f.is_default === 'TRUE') || paymentFundsList.find(f => f.type === 'cash') || paymentFundsList[0];
        processedPayments.push({
          id: 'change-' + Date.now(),
          method: 'cash',
          fund_id: defaultCashFund?.id || '',
          amount: -cashChange
        });
      }

      const paymentMethodString = JSON.stringify(processedPayments.map(p => {
        const fund = paymentFundsList.find(f => f.id === p.fund_id);
        return {
          method: p.method,
          amount: p.amount,
          meta: {
            fund_id: p.fund_id,
            fund_name: fund ? fund.name : ''
          }
        };
      }));

      if (Platform.OS !== 'web') {
        await db.insert(schema.orders).values({
          id: orderId,
          order_no: orderNo,
          status: 'completed',
          customer_id: customer ? customer.id : 'C-DEFAULT-RETAIL',
          customer_name: customer ? customer.name : 'Khách lẻ',
          total_amount: finalTotal,
          paid_amount: orderPaidAmt,
          payment_method: paymentMethodString,
          created_at: nowStr,
          updated_at: nowStr,
          shift_id: shiftId,
          tax_amount: totalTaxAmount,
          sync_status: 'pending',
          note: note,
          discount_amount: discount,
        });

        for (const it of calculatedItems) {
          await db.insert(schema.order_items).values(it);

          const originalProd = productsList.find(p => p.id === it.product_id);
          if (originalProd) {
            const newStock = allowsProductNegativeStock(originalProd as any)
              ? originalProd.stock_qty - it.qty
              : Math.max(0, originalProd.stock_qty - it.qty);
            await db
              .update(schema.products)
              .set({ stock_qty: newStock })
              .where(eq(schema.products.id, it.product_id));
          }
        }

        const updatedProds = await db.select().from(schema.products);
        setProductsList(updatedProds);
      }

      // A. Ghi nhận Sổ quỹ (cashbook) ngoại tuyến trước nếu có thu nợ
      const cashbookId = `CASH-R-${Date.now()}`;
      if (Platform.OS !== 'web' && debtRepay > 0 && customer && customer.id) {
        try {
          await db.insert(schema.cashbook).values({
            id: cashbookId,
            branch_id: debtShopId || shopId,
            type: 'receipt',
            amount: debtRepay,
            method: debtRepayOpts?.debtMethod || 'cash',
            category: 'debt_collection',
            reference_id: customer.id,
            reference_name: customer.name || '',
            employee_id: currentUserEmail,
            note: `Thu nợ cũ kèm đơn ${orderNo}`,
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            fund_id: debtRepayOpts?.debtFundId || '',
            sync_status: 'pending',
          });
        } catch (cbDbErr) {
          console.error('[POS] Không ghi nhận được cashbook offline:', cbDbErr);
        }
      }

      // Giải phóng giao diện và loader ngay lập tức
      setCart({});
      setDiscountAmount(0);
      setOrderNote('');
      setSelectedCustomer(null);
      setIsCartModalOpen(false);
      setIsPayingCartLoading(false); // UI unblocked!

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

      // Hiển thị QR thanh toán hoặc Toast báo thành công bằng local orderNo ngay lập tức
      const hasTransfer = processedPayments.some(p => checkIsQrPayment(p.method) && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = processedPayments.filter(p => checkIsQrPayment(p.method)).reduce((sum, p) => sum + p.amount, 0);
        const transferP = processedPayments.find(p => checkIsQrPayment(p.method) && p.amount > 0);
        const transferFund = transferP ? paymentFundsList.find(f => f.id === transferP.fund_id) : null;
        // Silent skip nếu quỹ không tồn tại hoặc chưa cài đặt số tài khoản
        const hasValidBankSetup = transferP && transferFund && transferFund.account_number && transferFund.bank_name;
        if (hasValidBankSetup && transferP) {
          setQrPayload({ amount: transferAmount, orderNo: orderNo, fund_id: transferP.fund_id });
          setTimeout(() => {
            setIsQrModalOpen(true);
          }, 400);
        } else {
          showToast(`Đã thanh toán Hóa đơn ${orderNo} thành công!`, 'success');
        }
      } else {
        showToast(`Đã thanh toán Hóa đơn ${orderNo} thành công! Hệ thống đang đồng bộ trong nền.`, 'success');
      }

      // B. Thực hiện đồng bộ hóa trong nền không làm nghẽn giao diện chính
      (async () => {
        if (!currentUrl || !debtShopId) {
          // Nếu mất kết nối hoàn toàn, để SyncManager xếp hàng gửi sau
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(debtShopId || shopId).catch(() => {});
              if (debtRepay > 0) {
                SyncManager.pushOfflineCashbook(debtShopId || shopId).catch(() => {});
              }
            }, 800);
          }
          return;
        }

        try {
          const syncHeaders = await getApiHeaders();
          const directSyncRes = await fetch(`${currentUrl}/api/shops/${debtShopId}/orders/sync-batch`, {
            method: 'POST',
            headers: { ...(syncHeaders || {}), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              local_order_id: orderId,
              order: {
                status: 'completed',
                channel: 'pos-mobile',
                customer_id: customer ? customer.id : 'C-DEFAULT-RETAIL',
                customer_name: customer ? customer.name : 'Khách lẻ',
                branch_id: debtShopId,
                employee_id: currentUserEmail,
                subtotal: finalTotal + discount,
                discount_amount: discount,
                tax_amount: totalTaxAmount,
                total_amount: finalTotal,
                paid_amount: orderPaidAmt,
                debt_amount: orderDebtAmt,
                note: note || '',
                shift_id: shiftId,
              },
              items: calculatedItems.map(it => ({
                product_id: it.product_id,
                product_name: it.product_name,
                qty: it.qty,
                unit_price: it.unit_price,
                original_price: it.original_price,
                discount_amount: it.discount_amount,
                line_total: it.line_total,
                tax_rate: it.tax_rate,
                tax_amount: it.tax_amount,
                tax_group: it.tax_group,
                tax_vat_rate: it.tax_vat_rate,
                tax_pit_rate: it.tax_pit_rate,
              })),
              payments: processedPayments.map(p => {
                const fund = paymentFundsList.find((f: any) => f.id === p.fund_id);
                return { method: p.method, amount: p.amount, fund_id: p.fund_id, meta: { fund_id: p.fund_id, fund_name: fund ? fund.name : '' } };
              }),
              stock_movements: Object.entries(cart)
                .filter(([, item]: [string, any]) => !isTimeChargeProduct(item.productId, item.name))
                .map(([, item]: [string, any]) => ({
                  type: 'sale_out',
                  product_id: item.productId,
                  qty: -item.quantity,
                  branch_id: debtShopId,
                })),
            }),
          });

          if (directSyncRes.ok) {
            const syncData = await directSyncRes.json().catch(() => ({}));
            let serverOrderNo = orderNo;
            if (syncData.order_no) serverOrderNo = syncData.order_no;

            // Đánh dấu đã đồng bộ (synced) trong SQLite bảng orders/order_items
            if (Platform.OS !== 'web' && syncData.order_id) {
              const serverId = syncData.order_id;
              if (serverId !== orderId) {
                await db.update(schema.order_items)
                  .set({ order_id: serverId })
                  .where(eq(schema.order_items.order_id, orderId));
              }
              await db.update(schema.orders)
                .set({ id: serverId, order_no: serverOrderNo, sync_status: 'synced', reference_no: orderId, updated_at: new Date().toISOString() })
                .where(eq(schema.orders.id, orderId));
            }

            // Ghi nhận cashbook khi đã có mã serverOrderNo
            if (debtRepay > 0 && customer && customer.id) {
              try {
                const cbHeaders = await getApiHeaders();
                const cbRes = await fetch(`${currentUrl}/api/shops/${debtShopId}/cashbook`, {
                  method: 'POST',
                  headers: { ...(cbHeaders || {}), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'receipt',
                    category: 'debt_collection',
                    amount: debtRepay,
                    method: debtRepayOpts?.debtMethod || 'cash',
                    fund_id: debtRepayOpts?.debtFundId || '',
                    reference_id: customer.id,
                    reference_name: customer.name || '',
                    note: `Thu nợ cũ kèm đơn ${serverOrderNo}`,
                    branch_id: debtShopId,
                    date: new Date().toISOString().split('T')[0],
                    employee_id: currentUserEmail,
                  })
                });

                if (cbRes.ok) {
                  const cbJson = await cbRes.json().catch(() => ({}));
                  const serverCbId = cbJson.transaction_id || cbJson.id;
                  if (Platform.OS !== 'web' && serverCbId) {
                    await db.delete(schema.cashbook).where(eq(schema.cashbook.id, cashbookId));
                    await db.insert(schema.cashbook).values({
                      id: serverCbId,
                      branch_id: debtShopId,
                      type: 'receipt',
                      amount: debtRepay,
                      method: debtRepayOpts?.debtMethod || 'cash',
                      category: 'debt_collection',
                      reference_id: customer.id,
                      reference_name: customer.name || '',
                      employee_id: currentUserEmail,
                      note: `Thu nợ cũ kèm đơn ${serverOrderNo}`,
                      date: new Date().toISOString().split('T')[0],
                      fund_id: debtRepayOpts?.debtFundId || '',
                      sync_status: 'synced',
                    }).onConflictDoNothing();
                  }
                } else {
                  console.warn('[POS] Gửi cashbook nợ lỗi, lưu trữ SQLite để SyncManager xử lý lại:', cbRes.status);
                }
              } catch (cbErr) {
                console.warn('[POS] Lỗi gửi cashbook nợ lên cloud:', cbErr);
              }
            }
          } else {
            console.warn('[POS] Sync batch lỗi từ server, sẽ thử lại bằng hàng đợi:', directSyncRes.status);
            if (Platform.OS !== 'web') {
              setTimeout(() => {
                SyncManager.pushOfflineOrders(debtShopId).catch(() => {});
                if (debtRepay > 0) {
                  SyncManager.pushOfflineCashbook(debtShopId).catch(() => {});
                }
              }, 800);
            }
          }
        } catch (syncErr) {
          console.warn('[POS] Sync trực tiếp thất bại, sẽ gửi qua hàng đợi sau:', syncErr);
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(debtShopId).catch(() => {});
              if (debtRepay > 0) {
                SyncManager.pushOfflineCashbook(debtShopId).catch(() => {});
              }
            }, 800);
          }
        }
      })();
    } catch (err) {
      console.error('Lỗi khi thanh toán đơn lẻ SQLite:', err);
      showToast("Lỗi khi xử lý thanh toán!", "error");
      setIsPayingCartLoading(false);
    }
  };

  // Quét mã giả lập
  const handleSimulateScan = () => {
    if (productsList.length === 0) {
      alert('Không có sản phẩm nào trong SQLite để quét.');
      setIsScannerOpen(false);
      return;
    }
    const randomProduct = productsList[Math.floor(Math.random() * productsList.length)];
    setScannedProductInfo(randomProduct);
    setIsScannerOpen(false);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    setIsScanSuccessDialogVisible(true);
  };

  // Quét mã vạch thực tế từ component BarcodeScannerModal
  const handleBarcodeScannedReal = (barcodeData: string) => {
    if (isQuickCreateBarcodeScan) {
      setQuickProductBarcode(barcodeData.trim());
      setIsQuickCreateBarcodeScan(false);
      setIsScannerOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    if (productsList.length === 0) {
      setIsScannerOpen(false);
      openQuickCreateProduct('', barcodeData.trim());
      return;
    }

    const query = barcodeData.trim().toLowerCase();
    // Tra cứu mã vạch chính xác, SKU, hoặc khớp tên
    const foundProduct = productsList.find(p =>
      (p.barcode && p.barcode.toLowerCase() === query) ||
      (p.sku && p.sku.toLowerCase() === query) ||
      (p.name && p.name.toLowerCase() === query)
    );

    if (foundProduct) {
      setScannedProductInfo(foundProduct);
      setIsScannerOpen(false);
      setProductSearchQuery(''); // Xóa bộ lọc tìm kiếm để quay về danh sách sản phẩm chung
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      setIsScanSuccessDialogVisible(true);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
      setIsScannerOpen(false);
      setQuickCreateRequest({ name: '', barcode: barcodeData.trim() });
      setQuickProductName('');
      setQuickProductBarcode(barcodeData.trim());
      setQuickProductPrice('');
      setQuickProductCostPrice('');
      setQuickProductMinPrice('');
      setQuickProductCategoryId('');
      setQuickProductUnit('Cái');
      setQuickProductImageUrl('');
      setQuickProductLocalImageUri(null);
      setShowQuickProductUrlInput(false);
      setShowQuickCreateMore(false);
    }
  };

  const saveQuickProductToCart = async () => {
    const name = quickProductName.trim();
    const price = parseCurrencyToNumber(quickProductPrice);
    if (!name) return showToast('Vui lòng nhập tên sản phẩm.', 'error');
    if (!Number.isFinite(price) || price < 0) return showToast('Vui lòng nhập giá bán hợp lệ.', 'error');
    if (!activeShopId || !isOnline) return showToast('Tạo nhanh cần kết nối mạng để dùng mã sản phẩm chính thức.', 'error');
    if (isPioneerPlan && quickProductLocalImageUri) return showToast('Gói Tiên phong chỉ hỗ trợ ảnh từ URL.', 'info');
    setIsQuickCreateSaving(true);
    setQuickCreateProgress('Đang tạo sản phẩm...');
    try {
      const headers = await getApiHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/shops/${activeShopId}/products/quick-create`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, barcode: quickProductBarcode.trim(), sell_price: price, cost_price: parseCurrencyToNumber(quickProductCostPrice), min_price: parseCurrencyToNumber(quickProductMinPrice), category_id: quickProductCategoryId, unit: quickProductUnit.trim() || 'Cái', image_url: quickProductLocalImageUri ? '' : quickProductImageUrl.trim(), source: 'pos_quick_mobile' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error === 'BARCODE_EXISTS' ? 'Barcode đã tồn tại. Hãy đồng bộ và chọn sản phẩm có sẵn.' : (payload.error || 'Không thể tạo sản phẩm'));
      const created = payload.product;
      let finalImageUrl = created.image_url || quickProductImageUrl || null;
      if (quickProductLocalImageUri) {
        setQuickCreateProgress('Đã tạo sản phẩm. Đang tải ảnh lên...');
        const productId = created.product_id || created.id;
        const uploadUrlResponse = await fetch(`${getApiBaseUrl()}/api/shops/${activeShopId}/products/${productId}/upload-url`, { headers });
        if (!uploadUrlResponse.ok) throw new Error('Đã tạo sản phẩm nhưng không lấy được link tải ảnh.');
        const { uploadUrl, publicUrl } = await uploadUrlResponse.json();
        const imageResponse = await fetch(quickProductLocalImageUri);
        const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: await imageResponse.blob(), headers: { 'Content-Type': 'image/jpeg' } });
        if (!uploadResponse.ok) throw new Error('Đã tạo sản phẩm nhưng tải ảnh lên thất bại.');
        const updateResponse = await fetch(`${getApiBaseUrl()}/api/shops/${activeShopId}/products/${productId}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: publicUrl }) });
        if (!updateResponse.ok) throw new Error('Đã tải ảnh nhưng không thể cập nhật sản phẩm.');
        finalImageUrl = publicUrl;
      }
      setQuickCreateProgress('Đang hoàn tất và thêm vào đơn...');
      const product = { id: created.product_id || created.id, name: created.name || name, sku: created.sku || '', barcode: created.barcode || quickProductBarcode.trim(), category_id: created.category_id || quickProductCategoryId || null, unit: created.unit || quickProductUnit || 'Cái', sell_price: Number(created.sell_price || price), cost_price: Number(created.cost_price || parseCurrencyToNumber(quickProductCostPrice)), stock_qty: Number(created.stock_qty || 0), image_url: finalImageUrl, description: created.description || null, product_type: 'simple', parent_id: null, variant_options: null, modifier_groups: null, tax_rate: created.tax_rate || '0', input_tax_rate: created.input_tax_rate || '0', tax_group: created.tax_group || '', metadata: typeof created.metadata === 'string' ? created.metadata : JSON.stringify(created.metadata || buildQuickCreateMetadata('pos_quick_mobile')), active: created.active || 'TRUE', item_class: created.item_class || 'commercial', sync_status: 'synced' };
      if (Platform.OS !== 'web') await db.insert(schema.products).values(product as any).onConflictDoUpdate({ target: schema.products.id, set: product as any });
      setProductsList(previous => [product, ...previous.filter(p => p.id !== product.id)]);
      setCart(previous => ({ ...previous, [String(product.id)]: previous[String(product.id)] ? { ...previous[String(product.id)], quantity: previous[String(product.id)].quantity + 1 } : { productId: product.id, name: product.name, price: product.sell_price, original_price: product.sell_price, quantity: 1, tax_rate: product.tax_rate, input_tax_rate: product.input_tax_rate, tax_group: product.tax_group, modifier_total: 0 } }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setQuickCreateRequest(null);
      setProductSearchQuery(''); // Xóa ô tìm kiếm để đưa về danh sách sản phẩm chung
      showToast(`Đã thêm "${product.name}" vào giỏ hàng.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo sản phẩm.', 'error');
    } finally { setIsQuickCreateSaving(false); setQuickCreateProgress(''); }
  };

  const pickQuickProductImage = async () => {
    if (isPioneerPlan) return showToast('Gói Tiên phong chỉ hỗ trợ ảnh từ URL.', 'info');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') return showToast('Cần quyền truy cập thư viện ảnh để chọn ảnh sản phẩm.', 'error');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) {
        setQuickProductLocalImageUri(result.assets[0].uri);
        setQuickProductImageUrl('');
      }
    } catch {
      showToast('Không thể chọn ảnh từ thiết bị.', 'error');
    }
  };

  const takeQuickProductPhoto = async () => {
    if (isPioneerPlan) return showToast('Gói Tiên phong chỉ hỗ trợ ảnh từ URL.', 'info');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') return showToast('Cần quyền camera để chụp ảnh sản phẩm.', 'error');
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) {
        setQuickProductLocalImageUri(result.assets[0].uri);
        setQuickProductImageUrl('');
      }
    } catch {
      showToast('Không thể mở camera.', 'error');
    }
  };

  const handleConfirmAddScanned = () => {
    if (scannedProductInfo) {
      addToCart(scannedProductInfo);
      showToast(`Đã thêm "${scannedProductInfo.name}" vào giỏ hàng`, 'success');
    }
    setProductSearchQuery(''); // Xóa ô tìm kiếm để đưa về danh sách sản phẩm chung
    setIsScanSuccessDialogVisible(false);
    setScannedProductInfo(null);
  };

  const openQuickCreateProduct = (name = '', barcode = '') => {
    setQuickCreateRequest({ name, barcode });
    setQuickProductName(name);
    setQuickProductBarcode(barcode);
    setQuickProductPrice('');
    setQuickProductCostPrice('');
    setQuickProductMinPrice('');
    setQuickProductCategoryId('');
    setQuickProductUnit('Cái');
    setQuickProductImageUrl('');
    setQuickProductLocalImageUri(null);
    setShowQuickProductUrlInput(false);
    setShowQuickCreateMore(false);
  };

  // Lọc sp
  const filteredProducts = productsList.filter(p => {
    // Ẩn các sản phẩm tiền giờ hệ thống khỏi danh sách lựa chọn POS
    if (isTimeChargeProduct(p.id, p.name) || isSystemTimeChargeProduct(p.id, p.sku, p.name) || p.id === 'TIME_CHARGE') {
      return false;
    }

    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const matchesSearch = !productSearchQuery.trim() ||
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const displayedProducts = filteredProducts.slice(0, displayLimit);
  // Match the proven product-form pattern. Do not force a fixed input height:
  // NativeWind's custom text line-height otherwise sits at the bottom on Android.
  const singleLineInputStyle = {
    paddingVertical: 0,
    textAlignVertical: 'center' as const,
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };
  if (!isNavReady) {
    return <View style={{ flex: 1, backgroundColor: '#f8fafc' }} />;
  }

  return (
    <PosDialogProvider value={posDialog}>
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">

      {/* Product Preview Modal (NEW) */}
      {previewProduct && (
        <ProductPreviewModal
          visible={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          product={previewProduct}
          setPreviewProduct={setPreviewProduct}
          quantity={previewQuantity}
          setQuantity={setPreviewQuantity}
          selectedVariant={selectedVariant}
          setSelectedVariant={setSelectedVariant}
          selectedModifiers={selectedModifiers}
          setSelectedModifiers={setSelectedModifiers}
          onConfirm={handleConfirmAddToCart}
        />
      )}

      {/* 1. SHARED HEADER - Thống nhất 100% */}
      <Header onPressMenu={() => setIsDrawerOpen(true)} />

      {/* 2. CHỌN NGÀNH HÀNG/TAB DỌC - Giảm bo góc về rounded-xl, thay thế Emoji bằng Ionicons */}
      {['fnb', 'lodging', 'sports_court', 'billiards'].includes(shopVertical) && (
        <View className="py-2.5 px-4 bg-slate-50 border-b border-slate-100">
          <View className="flex-row">
            <TouchableOpacity
              activeOpacity={0.8}
              className={`flex-1 mr-2 px-2.5 py-2 rounded-xl flex-row items-center border ${activeVertical === 'retail' ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-200'}`}
              style={activeVertical === 'retail' ? {
                shadowColor: '#fa5908',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 3,
                elevation: 2,
              } : undefined}
              onPress={() => setActiveVertical('retail')}
            >
              <Ionicons name="cart-outline" size={14} color={activeVertical === 'retail' ? 'white' : '#fa5908'} className="mr-1.5" />
              <Text className={`flex-1 font-semibold text-tiny ${activeVertical === 'retail' ? 'text-white' : 'text-slate-600'}`} numberOfLines={1}>
                {getFirstTabLabel()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              className={`flex-1 px-2.5 py-2 rounded-xl flex-row items-center border ${activeVertical !== 'retail' ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-200'}`}
              style={activeVertical !== 'retail' ? {
                shadowColor: '#fa5908',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 3,
                elevation: 2,
              } : undefined}
              onPress={() => {
                if (orderingTable) {
                  requestExitTableOrdering();
                  return;
                }
                setActiveVertical(!['retail', 'fashion'].includes(shopVertical) ? shopVertical : 'billiards');
              }}
            >
              <Ionicons
                name={
                  shopVertical === 'fnb' ? 'cafe-outline' :
                    shopVertical === 'sports_court' ? 'football-outline' :
                      shopVertical === 'lodging' ? 'bed-outline' :
                        'play-circle-outline'
                }
                size={14}
                color={activeVertical !== 'retail' ? 'white' : '#fa5908'}
                className="mr-1.5"
              />
              <Text className={`flex-1 font-semibold text-tiny ${activeVertical !== 'retail' ? 'text-white' : 'text-slate-600'}`} numberOfLines={1}>
                {
                  shopVertical === 'fnb' ? 'Sơ đồ Bàn' :
                    shopVertical === 'sports_court' ? 'Sơ đồ Sân' :
                      shopVertical === 'lodging' ? 'Sơ đồ Phòng' :
                        'Bàn Bi-a (Giờ)'
                }
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/resource-management');
              }}
              className="ml-2 px-2.5 py-2 rounded-xl flex-row items-center border border-slate-200 bg-white"
              accessibilityLabel={`Quản lý ${resNouns.noun}`}
            >
              <Ionicons name="settings-outline" size={14} color="#475569" />
              <Text className="ml-1.5 font-semibold text-tiny text-slate-600" numberOfLines={1}>
                Quản lý
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 3. CHI TIẾT NỘI DUNG */}
      {activeVertical === 'retail' ? (
        // 🛒 GIAO DIỆN BÁN LẺ
        <View className="flex-1 px-4 pt-2">

          {/* BANNER GỌI MÓN PHÒNG BAN: tên bàn + Thoát (lưu bằng nút chính ở thanh dưới) */}
          {orderingTable && (
            <View className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex-row justify-between items-center mb-3">
              <View className="flex-row items-center flex-1 mr-3">
                <Feather name="clipboard" size={15} color="#fa5908" />
                <Text className="text-xs font-semibold text-slate-800 ml-2 flex-1" numberOfLines={1}>
                  Đang gọi món cho: <Text className="text-orange-600 font-semibold">{orderingTable.name}</Text>
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={isSavingTableDraft}
                className="flex-row items-center bg-white border border-slate-300 px-2.5 py-1.5 rounded-lg active:bg-slate-100"
                onPress={requestExitTableOrdering}
                accessibilityLabel="Thoát gọi món"
              >
                <Feather name="log-out" size={12} color="#475569" />
                <Text className="text-xs font-semibold text-slate-600 ml-1">Thoát</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tìm kiếm nhanh */}
          <View className="mb-3 flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
            <Ionicons name="search-outline" size={14} color="#94a3b8" />
            <TextInput
              className="flex-1 ml-2 text-xs text-slate-800 py-1"
              placeholder="Tìm theo tên, SKU hoặc mã vạch..."
              placeholderTextColor="#94a3b8"
              value={productSearchQuery}
              onChangeText={(text) => {
                setProductSearchQuery(text);
                setDisplayLimit(20);
              }}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
            {productSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setProductSearchQuery(''); setDisplayLimit(20); }} className="mr-2">
                <Ionicons name="close-circle" size={15} color="#cbd5e1" />
              </TouchableOpacity>
            )}
            <View className="w-[1px] h-4 bg-slate-200 mx-2" />
            <TouchableOpacity onPress={() => openQuickCreateProduct()} className="p-1 mr-1" accessibilityLabel="Tạo nhanh sản phẩm">
              <Ionicons name="add-circle-outline" size={18} color="#fa5908" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsScannerOpen(true)} className="p-1">
              <Ionicons name="scan-outline" size={16} color="#fa5908" />
            </TouchableOpacity>
          </View>

          {/* Lọc danh mục sản phẩm */}
          <View className="mb-3 flex-row items-center">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row flex-1">
              <TouchableOpacity
                activeOpacity={0.8}
                className={`mr-2 px-3 py-1.5 rounded-xl border ${selectedCategoryId === 'all'
                    ? 'bg-orange-50 border-orange-400'
                    : 'bg-white border-slate-200'
                  }`}
                onPress={() => {
                  setSelectedCategoryId('all');
                  setDisplayLimit(20);
                }}
              >
                <Text className={`text-xxs font-semibold ${selectedCategoryId === 'all' ? 'text-orange-500' : 'text-slate-500'}`}>
                  Tất cả ({productsList.filter(p => !isTimeChargeProduct(p.id, p.name) && !isSystemTimeChargeProduct(p.id, p.sku, p.name) && p.id !== 'TIME_CHARGE').length})
                </Text>
              </TouchableOpacity>

              {categoriesList.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  className={`mr-2 px-3 py-1.5 rounded-xl border ${selectedCategoryId === cat.id
                      ? 'bg-orange-50 border-orange-400'
                      : 'bg-white border-slate-200'
                    }`}
                  onPress={() => {
                    setSelectedCategoryId(cat.id);
                    setDisplayLimit(20);
                  }}
                >
                  <Text className={`text-xxs font-semibold ${selectedCategoryId === cat.id ? 'text-orange-500' : 'text-slate-500'}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Nút đồng bộ tải dữ liệu từ Next.js Cloud trực tiếp trên tab bán lẻ */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleRefresh}
              disabled={isLoading}
              className="bg-white border border-slate-200 p-2 rounded-xl active:bg-slate-100 ml-2"
              style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, width: 34, height: 34, justifyContent: 'center', alignItems: 'center' }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fa5908" />
              ) : (
                <Ionicons name="sync-outline" size={14} color="#fa5908" />
              )}
            </TouchableOpacity>
          </View>

          {/* Grid sản phẩm */}
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
              if (isCloseToBottom && displayLimit < filteredProducts.length) {
                setDisplayLimit(prev => prev + 20);
              }
            }}
            scrollEventThrottle={400}
          >
            {isLoading ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginTop: 8 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View
                    key={i}
                    style={{ width: '48%', height: 160, borderRadius: 12, backgroundColor: '#f1f5f9', marginBottom: 16 }}
                  />
                ))}
              </View>
            ) : filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl mt-2">
                <Ionicons name="basket-outline" size={32} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy sản phẩm nào.</Text>
                <Text className="mt-1 text-xxs text-slate-400">{productsList.length === 0 ? 'Hãy tạo sản phẩm để bắt đầu bán hàng.' : 'Bạn có thể tạo mới để bán ngay.'}</Text>
                {(productSearchQuery.trim().length > 0 || productsList.length === 0) && (
                  <TouchableOpacity
                    onPress={() => {
                      openQuickCreateProduct(productSearchQuery.trim());
                    }}
                    className="mt-4 rounded-xl bg-orange-500 px-4 py-2"
                  >
                    <Text className="text-xs font-bold text-white">{productSearchQuery.trim() ? `Tạo mới sản phẩm “${productSearchQuery.trim()}”` : 'Tạo mới sản phẩm'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between pb-28">
                {displayedProducts.map(p => {
                  // Chế độ gọi món: số lượng món mới (nháp) của sản phẩm này
                  const draftQty = orderingTable ? draftProductQty(p.id) : 0;
                  return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.85}
                    className={`w-[48%] mb-4 p-3 rounded-2xl border bg-white justify-between active:scale-[0.98] ${draftQty > 0 ? 'border-orange-300' : 'border-slate-100'}`} style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
                    disabled={!!orderingTable && isSavingTableDraft}
                    onPress={() => { void orderProduct(p); }}
                  >
                    {!!orderingTable && soldOutIds.includes(String(p.id)) && (
                      <View className="absolute top-1.5 left-1.5 z-10 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5">
                        <Text className="text-[10px] font-semibold text-rose-700">Tạm hết</Text>
                      </View>
                    )}
                    {draftQty > 0 && (
                      <View
                        className="absolute top-1.5 right-1.5 z-10 min-w-[24px] h-6 px-1.5 rounded-full items-center justify-center border-2 border-white"
                        style={{ backgroundColor: '#fa5908', elevation: 3 }}
                      >
                        <Text className="text-[11px] font-bold text-white" style={{ fontVariant: ['tabular-nums'] }}>{draftQty}</Text>
                      </View>
                    )}
                    {/* Hình ảnh - Thay thế Emoji bằng Ionicons */}
                    <View className="w-full h-24 bg-slate-50 border border-slate-100 rounded-xl mb-2.5 overflow-hidden justify-center items-center">
                      {p.image_url ? (
                        <Image
                          source={{ uri: p.image_url }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="bg-slate-50 w-full h-full justify-center items-center">
                          <Ionicons name="image-outline" size={24} color="#fa5908" />
                        </View>
                      )}
                    </View>

                    <Text className="font-semibold text-xs text-slate-800" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-xxs text-slate-400 font-medium mt-0.5">
                      Kho: {p.stock_qty} | {p.unit || 'cái'}
                    </Text>

                    <View className="flex-row justify-between items-center mt-2.5">
                      <Text className="text-orange-500 font-semibold text-xs">
                        {formatCurrency(p.sell_price)}
                      </Text>

                      {draftQty > 0 ? (
                        <View className="flex-row items-center bg-orange-50 border border-orange-200 rounded-lg">
                          <TouchableOpacity
                            onPress={() => decreaseDraftProduct(p.id)}
                            disabled={isSavingTableDraft}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}
                            className="w-7 h-7 items-center justify-center active:bg-orange-100 rounded-l-lg"
                            accessibilityLabel={`Bớt ${p.name}`}
                          >
                            <Feather name="minus" size={13} color="#fa5908" />
                          </TouchableOpacity>
                          <Text className="min-w-[18px] text-center text-xs font-bold text-orange-600" style={{ fontVariant: ['tabular-nums'] }}>{draftQty}</Text>
                          <TouchableOpacity
                            onPress={() => { void orderProduct(p); }}
                            disabled={isSavingTableDraft}
                            hitSlop={{ top: 8, bottom: 8, left: 2, right: 6 }}
                            className="w-7 h-7 items-center justify-center active:bg-orange-100 rounded-r-lg"
                            accessibilityLabel={`Thêm ${p.name}`}
                          >
                            <Feather name="plus" size={13} color="#fa5908" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100">
                          <Ionicons name="add" size={11} color="#fa5908" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // 🎱 PHÂN HỆ ĐẶC THÙ PHÒNG BÀN (BI-A / CAFE / SÂN / PHÒNG NGHỈ)
        <ScrollView className="flex-1 px-4 pt-3" showsVerticalScrollIndicator={false}>
          {/* Báo mất kết nối máy chủ (luồng bàn) – đơn vẫn lưu trên máy và tự đồng bộ lại */}
          {!isOnline && (
            <View className="mb-3 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <Feather name="wifi-off" size={16} color="#b45309" />
              <Text className="ml-2 flex-1 text-xs text-amber-800">
                Mất kết nối máy chủ. Món và đơn vẫn được lưu trên máy này và tự đồng bộ khi có mạng lại.
              </Text>
            </View>
          )}

          {/* Header Filter cho sơ đồ phòng bàn */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-3 px-1">
              <Text className="text-sm font-bold text-slate-800">
                {
                  shopVertical === 'fnb' ? 'Sơ đồ bàn' :
                    shopVertical === 'sports_court' ? 'Sơ đồ sân' :
                      shopVertical === 'lodging' ? 'Sơ đồ phòng' :
                        'Sơ đồ bàn'
                }
              </Text>
              <View className="flex-row items-center space-x-2">
                {/* Xung đột đồng bộ đang chờ xử lý (sau khi chọn "Để sau") */}
                {(pendingConflictTableIds.length + tableSync.inbox.length) > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      if (tableSync.inbox.length > 0) {
                        setIsTableSyncInboxOpen(true);
                        return;
                      }
                      void openPendingConflict();
                    }}
                    className="flex-row items-center px-2.5 py-1.5 rounded-lg border mr-2 bg-amber-50 border-amber-300 active:bg-amber-100"
                  >
                    <Feather name="alert-triangle" size={14} color="#b45309" />
                    <Text className="text-xs font-medium ml-1 text-amber-800">
                      {pendingConflictTableIds.length + tableSync.inbox.length} xung đột
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Nút QR Order với Badge số lượng chờ duyệt */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    if (!isOnline) {
                      Alert.alert(
                        'Chế độ ngoại tuyến',
                        'Chức năng nhận đơn hàng QR yêu cầu kết nối mạng. Vui lòng kiểm tra lại kết nối Internet.',
                        [{ text: 'Đóng', style: 'cancel' }]
                      );
                      return;
                    }
                    router.push('/qr-orders');
                  }}
                  className={`relative flex-row items-center px-2.5 py-1.5 rounded-lg border mr-2 ${
                    isOnline 
                      ? 'bg-slate-100 border-slate-200 active:bg-slate-200' 
                      : 'bg-slate-50 border-slate-100 opacity-60'
                  }`}
                >
                  <Ionicons 
                    name="qr-code-outline" 
                    size={14} 
                    color={isOnline ? '#fa5908' : '#94a3b8'} 
                  />
                  <Text className={`text-xs font-medium ml-1 ${isOnline ? 'text-slate-600' : 'text-slate-400'}`}>
                    Đơn QR
                  </Text>
                  {isOnline && pendingQrCount > 0 && (
                    <View className="absolute -top-1.5 -right-1.5 bg-orange-500 min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1 border border-white">
                      <Text className="text-[9px] font-bold text-white leading-none">
                        {pendingQrCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Nút Làm mới */}
                <TouchableOpacity
                  onPress={() => {
                    if (isLoading) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleRefresh();
                  }}
                  disabled={isLoading}
                  className="flex-row items-center bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200"
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fa5908" style={{ width: 14, height: 14 }} />
                  ) : (
                    <Ionicons name="sync-outline" size={14} color="#fa5908" />
                  )}
                  <Text className="text-xs font-medium text-slate-600 ml-1">
                    {isLoading ? 'Đang tải...' : 'Làm mới'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row items-center space-x-2">
              <SingleLineInput
                value={tableSearchQuery}
                onChangeText={setTableSearchQuery}
                placeholder="Tìm kiếm..."
                placeholderTextColor="#94a3b8"
                containerClassName="flex-1 rounded-xl border border-slate-200 bg-white px-3 mr-2"
                inputClassName="ml-2 text-xs font-medium text-slate-700"
                leading={
                  <Ionicons name="search-outline" size={16} color="#94a3b8" />
                }
                trailing={
                  tableSearchQuery.length > 0 ? (
                    <TouchableOpacity onPress={() => setTableSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                    </TouchableOpacity>
                  ) : null
                }
              />

              <View className="flex-row bg-slate-100 p-1 rounded-xl border border-slate-200">
                <Pressable
                  onPress={() => setTableViewMode('card')}
                  className="p-1.5 rounded-lg"
                  style={tableViewMode === 'card' ? {
                    backgroundColor: '#ffffff',
                    ...Platform.select({
                      ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                      },
                      android: {
                        elevation: 1,
                      },
                    }),
                  } : undefined}
                >
                  <Ionicons name="grid-outline" size={16} color={tableViewMode === 'card' ? '#0f172a' : '#94a3b8'} />
                </Pressable>
                <Pressable
                  onPress={() => setTableViewMode('list')}
                  className="p-1.5 rounded-lg"
                  style={tableViewMode === 'list' ? {
                    backgroundColor: '#ffffff',
                    ...Platform.select({
                      ios: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                      },
                      android: {
                        elevation: 1,
                      },
                    }),
                  } : undefined}
                >
                  <Ionicons name="list-outline" size={16} color={tableViewMode === 'list' ? '#0f172a' : '#94a3b8'} />
                </Pressable>
              </View>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
              <TouchableOpacity
                onPress={() => setTableStatusFilter('all')}
                className={`px-3 py-1.5 rounded-full border mr-2 ${tableStatusFilter === 'all' ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-xs font-medium ${tableStatusFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>Tất cả</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableStatusFilter('available')}
                className={`px-3 py-1.5 rounded-full border mr-2 flex-row items-center ${tableStatusFilter === 'available' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}
              >
                <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                <Text className={`text-xs font-medium ${tableStatusFilter === 'available' ? 'text-emerald-700' : 'text-slate-600'}`}>Trống</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableStatusFilter('occupied')}
                className={`px-3 py-1.5 rounded-full border mr-2 flex-row items-center ${tableStatusFilter === 'occupied' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}
              >
                <View className="w-2 h-2 rounded-full bg-rose-500 mr-1.5" />
                <Text className={`text-xs font-medium ${tableStatusFilter === 'occupied' ? 'text-rose-700' : 'text-slate-600'}`}>Đang sử dụng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableStatusFilter('dirty')}
                className={`px-3 py-1.5 rounded-full border flex-row items-center ${tableStatusFilter === 'dirty' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
              >
                <View className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                <Text className={`text-xs font-medium ${tableStatusFilter === 'dirty' ? 'text-amber-700' : 'text-slate-600'}`}>Chưa dọn</Text>
              </TouchableOpacity>
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
              <View className="flex-row items-center mr-2">
                <Ionicons name="swap-vertical-outline" size={14} color="#64748b" />
                <Text className="text-xs text-slate-500 ml-1 font-medium">Sắp xếp:</Text>
              </View>

              <TouchableOpacity
                onPress={() => setTableSortMode('last_checkout')}
                className={`px-3 py-1 rounded-full border mr-2 ${tableSortMode === 'last_checkout' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-[11px] font-medium ${tableSortMode === 'last_checkout' ? 'text-indigo-700' : 'text-slate-500'}`}>Xoay vòng {resNouns.noun}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableSortMode('latest_checkout')}
                className={`px-3 py-1 rounded-full border mr-2 ${tableSortMode === 'latest_checkout' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-[11px] font-medium ${tableSortMode === 'latest_checkout' ? 'text-indigo-700' : 'text-slate-500'}`}>Gần đây nhất</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableSortMode('name_asc')}
                className={`px-3 py-1 rounded-full border mr-2 ${tableSortMode === 'name_asc' ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-[11px] font-medium ${tableSortMode === 'name_asc' ? 'text-slate-800' : 'text-slate-500'}`}>Tên A-Z</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTableSortMode('name_desc')}
                className={`px-3 py-1 rounded-full border ${tableSortMode === 'name_desc' ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-[11px] font-medium ${tableSortMode === 'name_desc' ? 'text-slate-800' : 'text-slate-500'}`}>Tên Z-A</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {isLoading ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginTop: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View
                  key={i}
                  style={{ width: '48%', height: 100, borderRadius: 12, backgroundColor: '#f1f5f9', marginBottom: 16 }}
                />
              ))}
            </View>
          ) : tables.length === 0 ? (
            <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl">
              <Ionicons name="football-outline" size={36} color="#cbd5e1" />
              <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy bàn nào.</Text>
            </View>
          ) : (
            <View className="pb-28">
              {/* Cảnh báo đồng bộ trên màn hình chính */}
              {hasPendingSync && (
                <TouchableOpacity 
                  style={{ marginHorizontal: 4, marginBottom: 16, backgroundColor: '#FEF3C7', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  onPress={() => {
                    setHasPendingSync(false);
                    loadPosData(true);
                    if (activeTable) {
                      syncActiveTableSession(activeTable);
                    }
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: 'bold', color: '#B45309' }}>Có thay đổi mới từ thu ngân</Text>
                    <Text style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>Chạm vào đây để tải lại đồng bộ mới nhất.</Text>
                  </View>
                  <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Tải lại</Text>
                  </View>
                </TouchableOpacity>
              )}

              {(() => {
                const filteredZones = Object.entries(groupedZones)
                  .sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true, sensitivity: 'base' }))
                  .map(([zoneName, zoneTables]) => {
                  const filteredTables = zoneTables.filter(t => {
                    const isActive = t.status === 'playing' || t.status === 'occupied';
                    const isDirty = t.status === 'dirty' || t.status === 'cleaning';
                    const matchesSearch = !tableSearchQuery.trim() || (t.name && t.name.toLowerCase().includes(tableSearchQuery.toLowerCase()));
                    const matchesStatus = tableStatusFilter === 'all' || 
                      (tableStatusFilter === 'available' && !isActive && !isDirty) || 
                      (tableStatusFilter === 'occupied' && isActive) ||
                      (tableStatusFilter === 'dirty' && isDirty);
                    return matchesSearch && matchesStatus;
                  }).sort((a, b) => {
                    const getMeta = (item: any) => {
                      try { return typeof item.metadata === 'string' ? JSON.parse(item.metadata) : (item.metadata || {}); } catch(e) { return {}; }
                    };
                    if (tableSortMode === 'last_checkout') {
                        const tA = getMeta(a).last_checkout_time;
                        const tB = getMeta(b).last_checkout_time;
                        if (!tA && !tB) return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
                        if (!tA) return 1;
                        if (!tB) return -1;
                        return new Date(tA).getTime() - new Date(tB).getTime();
                    } else if (tableSortMode === 'latest_checkout') {
                        const tA = getMeta(a).last_checkout_time;
                        const tB = getMeta(b).last_checkout_time;
                        if (!tA && !tB) return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
                        if (!tA) return 1;
                        if (!tB) return -1;
                        return new Date(tB).getTime() - new Date(tA).getTime();
                    } else if (tableSortMode === 'name_asc') {
                        return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
                    } else if (tableSortMode === 'name_desc') {
                        return (b.name || '').localeCompare(a.name || '', 'vi', { numeric: true, sensitivity: 'base' });
                    }
                    return (a.sort_order || 0) - (b.sort_order || 0) || (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
                  });
                  return [zoneName, filteredTables] as const;
                }).filter(([_, tables]) => tables.length > 0);

                if (filteredZones.length === 0) {
                   return (
                     <View className="items-center justify-center py-10 bg-white border border-slate-100 rounded-2xl mb-6">
                       <Ionicons name="search-outline" size={32} color="#cbd5e1" />
                       <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy kết quả phù hợp</Text>
                     </View>
                   );
                }

                return filteredZones.map(([zoneName, zoneTables]) => (
                  <View key={zoneName} className="mb-6">
                    {/* Tiêu đề Khu vực/Tầng */}
                    <View className="flex-row items-center justify-between mb-3 px-1">
                      <Text className="text-xs font-semibold text-slate-700">
                        🏢 {zoneName}
                      </Text>
                      <Text className="text-tiny text-slate-400 font-medium">
                        {zoneTables.length} {shopVertical === 'fnb' ? 'vị trí' : shopVertical === 'sports_court' ? 'sân' : shopVertical === 'lodging' ? 'phòng' : 'bàn'}
                      </Text>
                    </View>

                    {/* Grid/List phòng bàn trong Khu vực */}
                    <View className={tableViewMode === 'card' ? "flex-row flex-wrap justify-between" : "flex-col"}>
                      {zoneTables.map(t => {
                        const isActive = t.status === 'playing' || t.status === 'occupied';
                        const isDirty = t.status === 'dirty' || t.status === 'cleaning';
                        const billing = calculateBilling(t);
                        const tableBillingPresentation = getResourceBillingPresentationForResource(shopVertical, t);
                        const tableRateLabel = tableBillingPresentation.rateBadgeLabel ||
                          (tableBillingPresentation.rate > 0 && tableBillingPresentation.rateUnit
                            ? `${formatCurrency(tableBillingPresentation.rate)}/${tableBillingPresentation.rateUnit}`
                            : 'Chưa cấu hình đơn giá');
                        const cartItemsCount = tableCarts[t.id]
                          ? Object.entries(tableCarts[t.id]).reduce(
                              (sum, [cartItemId, item]: [string, any]) =>
                                isTimeChargeProduct(item.productId || cartItemId, item.name)
                                  ? sum
                                  : sum + (Number(item.quantity) || 0),
                              0
                            )
                          : 0;
                        const cartItemsTotal = tableCarts[t.id]
                          ? Object.entries(tableCarts[t.id]).reduce(
                              (sum, [cartItemId, item]: [string, any]) =>
                                isTimeChargeProduct(item.productId || cartItemId, item.name)
                                  ? sum
                                  : sum + ((Number(item.price) || 0) + (Number(item.modifier_total) || 0)) * (Number(item.quantity) || 0),
                              0
                            )
                          : 0;
                        const timeCost = tableBillingPresentation.showCost ? (Number(billing.cost) || 0) : 0;
                        const totalEstimatedCost = timeCost + cartItemsTotal;
                        const guestName = tableCustomers[t.id]?.name || t.customerName || 'Khách lẻ';

                        if (tableViewMode === 'list') {
                          return (
                            <Pressable
                              key={`list-${t.id}`}
                              className={`mb-3 p-3 rounded-xl border flex-row items-center justify-between ${isActive ? 'bg-rose-50 border-rose-200' : isDirty ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
                              onPress={() => handleTablePress(t)}
                            >
                              <View className="flex-row items-center flex-1">
                                <View className={`w-1.5 h-10 rounded-full mr-3 ${isActive ? 'bg-rose-500' : isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <View className="flex-1">
                                  <Text className="font-semibold text-sm text-slate-800">{t.name}</Text>
                                  <View className="flex-row items-center mt-1 flex-wrap">
                                    <Ionicons name="person-outline" size={12} color="#94a3b8" />
                                    <Text className="text-xs text-slate-500 ml-1 mr-3">{isActive ? guestName : `${t.capacity || '4'} người`}</Text>
                                    {isActive && (
                                      <View className="flex-row items-center mr-3">
                                        <Ionicons name="time-outline" size={12} color="#94a3b8" />
                                        <Text className="text-xs text-slate-500 ml-1">{billing.label}</Text>
                                      </View>
                                    )}
                                    {isActive && cartItemsCount > 0 && (
                                      <Text className="text-xxs text-slate-600 font-semibold">
                                        🍴 {cartItemsCount} món ({formatCurrency(cartItemsTotal)})
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              </View>
                              <View className="items-end">
                                <View className={`px-2 py-1 rounded border ${isActive ? 'bg-rose-100 border-rose-200' : isDirty ? 'bg-amber-100 border-amber-200' : 'bg-emerald-100 border-emerald-200'}`}>
                                  <Text className={`text-xxs font-medium ${isActive ? 'text-rose-700' : isDirty ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {isActive ? 'Đang sử dụng' : isDirty ? 'Chưa dọn' : 'Trống'}
                                  </Text>
                                </View>
                                {isActive && (tableBillingPresentation.showCost || cartItemsTotal > 0) && (
                                  <Text className="text-rose-600 font-bold text-sm mt-1.5">{formatCurrency(totalEstimatedCost)}</Text>
                                )}
                              </View>
                            </Pressable>
                          );
                        }

                        return (
                          <TouchableOpacity
                          key={`card-${t.id}`}
                          activeOpacity={0.85}
                          className={`w-[48%] mb-4 rounded-2xl border ${isActive
                              ? ''
                              : isDirty ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                            } justify-between overflow-hidden`}
                          style={[
                            {
                              shadowColor: '#000000',
                              shadowOffset: { width: 0, height: 1.5 },
                              shadowOpacity: 0.06,
                              shadowRadius: 2.5,
                              elevation: 2,
                            },
                            isActive ? {
                              borderColor: '#fda4af', // border-rose-300 mờ sang trọng
                              backgroundColor: '#fff1f2', // bg-rose-50 mờ cực dịu mắt
                            } : isDirty ? {
                              borderColor: '#fde68a', // amber-200
                              backgroundColor: '#fffbeb', // amber-50
                            } : {}
                          ]}
                          onPress={() => handleTablePress(t)}
                        >
                          {/* Stripe màu trên cùng */}
                          <View className={`h-1 w-full ${isActive ? 'bg-rose-500' : isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />

                          <View className="p-3.5 flex-1 justify-between">
                            {/* Tiêu đề vị trí */}
                            <Text className="font-medium text-xs text-slate-800 mb-1.5">
                              {t.name}
                            </Text>

                            {/* Chi tiết chỉ số */}
                            <View className="mb-2">
                              <View className="flex-row items-center mb-0.5">
                                <Ionicons name="person-outline" size={10} color="#94a3b8" />
                                <Text className="text-xxs text-slate-455 font-medium ml-1">
                                  {t.capacity || '4'} người
                                </Text>
                              </View>

                              <View className="flex-row items-center mb-0.5">
                                <Ionicons name="time-outline" size={10} color="#94a3b8" />
                                <Text className="text-xxs text-slate-455 font-medium ml-1">
                                  {tableRateLabel}
                                </Text>
                              </View>
                            </View>

                            {/* Tiện ích tags */}
                            <View className="flex-row flex-wrap gap-1 mb-2.5">
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-medium text-slate-400">Điều hòa</Text>
                              </View>
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-medium text-slate-400">WiFi</Text>
                              </View>
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-semibold text-slate-400">+4</Text>
                              </View>
                            </View>

                            {/* Chi tiết tạm tính nếu đang hoạt động */}
                            {isActive && (
                              <View
                                className="border p-2 rounded-lg mb-2"
                                style={{
                                  backgroundColor: '#fee8eb', // bg-rose-50 mờ nhạt (solid)
                                  borderColor: '#fecdd3', // border-rose-200 mờ nhạt (solid)
                                }}
                              >
                                <Text className="text-[8.5px] text-rose-700 font-semibold">
                                  ⏱️ Đã dùng: {billing.label}
                                </Text>
                                {tableBillingPresentation.showCost && (
                                  <Text className="text-xxs text-rose-700 font-semibold mt-0.5">
                                    💵 Tiền giờ: {formatCurrency(billing.cost)}
                                  </Text>
                                )}
                                {cartItemsCount > 0 && (
                                  <Text className="text-xxs text-slate-600 font-semibold mt-0.5">
                                    🍴 Tiền món ({cartItemsCount}): {formatCurrency(cartItemsTotal)}
                                  </Text>
                                )}
                                {(tableBillingPresentation.showCost || cartItemsTotal > 0) && (
                                  <Text
                                    className="text-xxs text-rose-800 font-bold mt-1 pt-1 border-t"
                                    style={{ borderTopColor: 'rgba(244, 63, 94, 0.2)' }}
                                  >
                                    💰 Tổng: {formatCurrency(totalEstimatedCost)}
                                  </Text>
                                )}
                              </View>
                            )}
                            
                            {!isActive && (() => {
                              const getMeta = (item: any) => {
                                try { return typeof item.metadata === 'string' ? JSON.parse(item.metadata) : (item.metadata || {}); } catch(e) { return {}; }
                              };
                              const lastCheckout = getMeta(t).last_checkout_time;
                              let timeAgo = '';
                              if (lastCheckout) {
                                const diff = new Date().getTime() - new Date(lastCheckout).getTime();
                                const diffHrs = Math.floor(diff / (1000 * 60 * 60));
                                if (diffHrs >= 24) timeAgo = `${Math.floor(diffHrs/24)} ngày trước`;
                                else if (diffHrs > 0) timeAgo = `${diffHrs} giờ trước`;
                                else {
                                  const diffMins = Math.floor(diff / (1000 * 60));
                                  timeAgo = `${diffMins > 0 ? diffMins : 1} phút trước`;
                                }
                              }

                              if (!timeAgo && !isDirty) return null;

                              return (
                                <View className={`border p-2 rounded-lg mb-2 ${isDirty ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                  {isDirty && (
                                    <Text className="text-[8.5px] text-amber-700 font-semibold mb-0.5">
                                      🧹 Chờ dọn dẹp
                                    </Text>
                                  )}
                                  {!!timeAgo && (
                                    <View className="flex-row items-center mt-0.5">
                                      <MaterialIcons name="history" size={13} color="#2563eb" />
                                      <Text className="text-[11px] ml-1 font-semibold text-blue-600">
                                        {timeAgo}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })()}

                            {/* Nút Trạng thái ở đáy card */}
                            <View className={`w-full py-2 rounded-lg items-center justify-center border flex-row ${isActive ? 'bg-[#ffeef0] border-rose-200' : isDirty ? 'bg-amber-100 border-amber-200' : 'bg-slate-50 border-slate-200'
                              }`}>
                              {isDirty && <Ionicons name="checkmark-circle-outline" size={14} color="#b45309" className="mr-1" />}
                              <Text className={`text-tiny font-semibold ${isActive ? 'text-rose-600' : isDirty ? 'text-amber-700' : 'text-emerald-600'
                                }`} numberOfLines={1}>
                                {isActive ? guestName : isDirty ? 'Đã dọn' : 'Trống'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                ));
              })()}

              {/* Nút refresh thủ công để kéo dữ liệu SQLite */}
              <View className="items-center justify-center mt-4 mb-20 px-2">
                <TouchableOpacity
                  activeOpacity={0.8}
                  className="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-xl flex-row items-center justify-center w-full"
                  onPress={handleRefresh}
                >
                  <Ionicons name="sync-outline" size={16} color="#fa5908" />
                  <Text className="text-xs font-semibold text-slate-700 ml-2">Đồng bộ lại sơ đồ {shopVertical === 'lodging' ? 'phòng nghỉ' : shopVertical === 'sports_court' ? 'sân chơi' : shopVertical === 'fnb' ? 'bàn cafe' : 'bàn bi-a'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* 4. THANH GIỎ HÀNG BÁN LẺ DƯỚI CÙNG - Giảm góc bo về rounded-t-2xl */}
      {!orderingTable && getCartCount() > 0 && activeVertical === 'retail' && (
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-100 flex-row justify-between items-center pb-6 rounded-t-2xl" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
          <View className="flex-row items-center">
            <View className="relative mr-3 h-14 w-14" style={{ overflow: 'visible' }}>
              <View className="absolute bottom-0 left-0 h-12 w-12 items-center justify-center rounded-xl border border-orange-100 bg-orange-50">
                <Ionicons name="cart" size={18} color="#fa5908" />
              </View>
              <View className="absolute top-0 right-0 min-w-[22px] h-[20px] px-1.5 items-center justify-center border border-white rounded-full" style={{ backgroundColor: '#fa5908' }}>
                <Text className="text-[10px] text-white font-bold text-center leading-none" style={{ fontVariant: ['tabular-nums'] }}>{getCartCount()}</Text>
              </View>
            </View>
            <View>
              <Text className="text-xxs font-semibold text-slate-455">Tổng cộng</Text>
              <Text className="text-orange-500 font-semibold text-base">{formatCurrency(getCartTotal())}</Text>
            </View>
          </View>

          <Button
            variant="primary"
            size="md"
            onPress={() => {
              handleCheckoutPress(() => {
                setIsCartModalOpen(true);
              });
            }}
            icon={<Ionicons name="arrow-forward" size={12} color="white" />}
            iconPosition="right"
            title="Thanh toán"
            className="rounded-xl px-4"
          />
        </View>
      )}

      {/* 4b. THANH GỌI MÓN CHO PHÒNG/BÀN: món mới (mở phiếu) + một nút lưu duy nhất */}
      {orderingTable && activeVertical === 'retail' && (() => {
        const draftCount = getCartCount();
        const canSave = draftCount > 0 && !isSavingTableDraft;
        return (
          <View className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-6 border-t bg-white border-slate-100 flex-row items-center rounded-t-2xl" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setIsTableTicketOpen(true);
              }}
              className="flex-1 flex-row items-center mr-3 py-1"
              accessibilityLabel="Xem phiếu gọi món"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 mr-2.5">
                <Feather name="file-text" size={17} color="#fa5908" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-xs font-semibold text-slate-700" numberOfLines={1}>Món mới: {draftCount} món</Text>
                  <Feather name="chevron-up" size={14} color="#94a3b8" style={{ marginLeft: 2 }} />
                </View>
                <Text className="text-orange-500 font-semibold text-sm" numberOfLines={1}>{formatCurrency(getCartTotal())}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canSave}
              onPress={() => { void saveTableOrderDraft(); }}
              className={`h-11 px-4 rounded-xl flex-row items-center justify-center ${canSave ? 'bg-orange-500 active:bg-orange-600' : 'bg-slate-300'}`}
              style={{ maxWidth: '58%' }}
              accessibilityLabel={tableSaveLabel(orderingTable)}
            >
              {isSavingTableDraft ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Feather name="save" size={14} color="white" />
              )}
              <Text className="text-xs font-semibold text-white ml-1.5" numberOfLines={1}>
                {tableSaveLabel(orderingTable)}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {orderingTable && (
        <TableOrderTicketSheet
          visible={isTableTicketOpen}
          tableName={orderingTable.name}
          draft={cart}
          previousItems={tableCarts[orderingTable.id] || {}}
          saving={isSavingTableDraft}
          saveLabel={tableSaveLabel(orderingTable)}
          onSetNote={kitchenEnabled ? (cartItemId: string, note: string) => {
            setCart((prev: any) => prev?.[cartItemId]
              ? { ...prev, [cartItemId]: { ...prev[cartItemId], kitchen_note: note.trim() || undefined } }
              : prev);
          } : undefined}
          onClose={() => setIsTableTicketOpen(false)}
          onIncrease={increaseDraftLine}
          onDecrease={decreaseDraftLine}
          onRemove={(cartItemId) => removeFromCart(cartItemId)}
          onClearAll={confirmClearTableDraft}
          onSave={() => { void saveTableOrderDraft(); }}
        />
      )}

      {/* CÁC DIALOG XÁC NHẬN SANG TRỌNG - RÚT GỌN CARD BO TRÒN rounded-2xl */}
      {/* 5.5. MODAL MỞ BÀN / CHECK-IN PHÒNG KHÁCH SẠN */}
      <Modal
        visible={isTableOpenDialogVisible}
        // Mở bàn thành công → mờ dần (lớp tối ở gốc giữ nguyên) rồi trượt lên màn chi tiết bàn
        animationType={tableOpenHandoff ? 'fade' : 'slide'}
        transparent={true}
        onRequestClose={() => {
          if (posDialog.handleBack()) return;
          if (!isOpeningTable) setIsTableOpenDialogVisible(false);
        }}
        // iOS: chỉ trình bày được 1 Modal mỗi lúc → mở màn chi tiết bàn sau khi hộp thoại đã đóng hẳn
        onDismiss={completeOpenTableHandoff}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => { if (!isOpeningTable) setIsTableOpenDialogVisible(false); }}
          />
          <View className="h-[75%] rounded-t-2xl p-6 bg-white justify-between relative" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
            <PosToast toastMsg={toastMsg} toastOpacity={toastOpacity} isForModal={true} />
              {hasPendingSync && (
                <TouchableOpacity 
                  style={{ marginHorizontal: 4, marginBottom: 16, marginTop: 8, backgroundColor: "#FEF3C7", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#F59E0B", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  onPress={() => {
                    setHasPendingSync(false);
                    loadPosData(true);
                    if (activeTable) {
                      syncActiveTableSession(activeTable);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: "#92400E", fontSize: 13 }}>Cập nhật mới từ thiết bị khác!</Text>
                    <Text style={{ color: "#B45309", fontSize: 12, marginTop: 2 }}>Dữ liệu đã thay đổi, vui lòng tải lại để đồng bộ.</Text>
                  </View>
                  <View style={{ backgroundColor: "#F59E0B", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ color: "white", fontWeight: "bold", fontSize: 13 }}>Tải lại</Text>
                  </View>
                </TouchableOpacity>
              )}
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="enter-outline" size={20} color="#fa5908" />
                <Text className="text-sm font-semibold text-slate-800 ml-2">
                  {selectedTableForOpen
                    ? `Nhận ${resNouns.Noun} - ${selectedTableForOpen.name}`
                    : 'Nhận vị trí mới'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsTableOpenDialogVisible(false)} disabled={isOpeningTable} className="p-1">
                <Ionicons name="close" size={24} color={isOpeningTable ? '#cbd5e1' : '#64748b'} />
              </TouchableOpacity>
            </View>

            {/* TAB SELECTOR (Crash-Proof Style without shadow-sm/border-opacity) */}
            {shopVertical === 'lodging' && (
              <View className="flex-row bg-slate-100 p-1 rounded-xl my-4">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCheckInTab('info')}
                  className={`flex-1 py-2 items-center justify-center rounded-lg ${checkInTab === 'info' ? 'bg-white border border-slate-200' : 'bg-transparent'
                    }`}
                >
                  <Text className={`text-xs font-semibold ${checkInTab === 'info' ? 'text-slate-800' : 'text-slate-500'}`}>
                    Thông tin nhận
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCheckInTab('guests')}
                  className={`flex-1 py-2 items-center justify-center rounded-lg ${checkInTab === 'guests' ? 'bg-white border border-slate-200' : 'bg-transparent'
                    }`}
                >
                  <Text className={`text-xs font-semibold ${checkInTab === 'guests' ? 'text-slate-800' : 'text-slate-500'}`}>
                    {`Khách lưu trú (${lodgingGuests.filter(g => g.name || g.id_number || g.idCard).length})`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView className="flex-1 my-2" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {checkInTab === 'info' || shopVertical !== 'lodging' ? (
                <View>
                  {/* Bảng giá giờ */}
                  {selectedTableForOpen && (() => {
                    let openMeta: any = {};
                    try {
                      openMeta = selectedTableForOpen.metadata 
                        ? (typeof selectedTableForOpen.metadata === 'string' ? JSON.parse(selectedTableForOpen.metadata) : selectedTableForOpen.metadata)
                        : {};
                    } catch (e) {}

                    const hourlyRate = Number(selectedTableForOpen.hourly_rate) || 0;
                    const overnightRate = Number(openMeta.overnight_rate) || (hourlyRate * 3) || 200000;
                    const advPricing = openMeta.advanced_pricing;
                    const isLodging = shopVertical === 'lodging';

                    // Determine what to display based on lodging + selected rental type
                    const showDaily = isLodging && roomRentalType === 'daily';

                    return (
                      <View className="bg-orange-50 border border-orange-100 p-4 rounded-2xl mb-4">
                        <Text className="text-tiny text-orange-700 font-medium">Hình thức hoạt động:</Text>
                        <Text className="text-orange-950 font-semibold text-sm mt-1">
                          {showDaily ? 'Thuê theo ngày (ở qua đêm)' : 'Tính phí theo thời gian sử dụng'}
                        </Text>
                        
                        {showDaily ? (
                          <View className="mt-2.5">
                            <Text className="text-xs font-semibold text-slate-800">
                              💵 Đơn giá: <Text className="text-orange-600 font-bold">{formatCurrency(overnightRate)}</Text>/ngày
                            </Text>
                          </View>
                        ) : (
                          <View className="mt-2.5">
                            {advPricing?.enabled ? (
                              <View className="space-y-1.5 border-t border-orange-200/40 pt-2">
                                <View className="flex-row justify-between items-center py-0.5">
                                  <Text className="text-xs text-slate-600 font-medium">Block đầu ({advPricing.base_hours}h):</Text>
                                  <Text className="text-xs text-orange-700 font-bold">{formatCurrency(advPricing.base_price)}</Text>
                                </View>
                                {advPricing.next_hourly_rate ? (
                                  <View className="flex-row justify-between items-center py-0.5">
                                    <Text className="text-xs text-slate-600 font-medium">Giờ tiếp theo mặc định:</Text>
                                    <Text className="text-xs text-orange-700 font-bold">{formatCurrency(advPricing.next_hourly_rate)}/h</Text>
                                  </View>
                                ) : null}
                                {Number(advPricing.grace_minutes) > 0 ? (
                                  <View className="flex-row justify-between items-center py-0.5">
                                    <Text className="text-xs text-slate-500 italic">Thời gian quá giờ cho phép (Grace):</Text>
                                    <Text className="text-xs text-slate-500 italic">{advPricing.grace_minutes} phút</Text>
                                  </View>
                                ) : null}

                                {advPricing.progressive_rates && Object.keys(advPricing.progressive_rates).length > 0 && (
                                  <View className="mt-2 border-t border-orange-200/30 pt-2">
                                    <Text className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                      Bảng giá lũy tiến các giờ tiếp theo:
                                    </Text>
                                    <View className="flex-row flex-wrap gap-1.5 pt-0.5">
                                      {Object.entries(advPricing.progressive_rates)
                                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                                        .map(([hour, rate]) => (
                                          <View
                                            key={hour}
                                            className="bg-orange-100/60 border border-orange-200/40 rounded-lg px-2.5 py-1 flex-row items-center gap-1"
                                          >
                                            <Text className="text-[10px] text-orange-800 font-medium">Giờ thứ {hour}:</Text>
                                            <Text className="text-[10px] text-orange-900 font-bold">{formatCurrency(Number(rate))}</Text>
                                          </View>
                                        ))}
                                    </View>
                                  </View>
                                )}
                              </View>
                            ) : (
                              <Text className="text-xs font-semibold text-slate-800">
                                💵 Đơn giá: <Text className="text-orange-600 font-bold">{formatCurrency(hourlyRate)}</Text>/giờ
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* CHỌN KHÁCH HÀNG CRM (Premium component replicated) */}
                  <Text className="text-tiny text-slate-400 font-medium mb-2">Thông tin Khách hàng (CRM):</Text>
                  <View className="mb-4">
                    {selectedCustomer ? (
                      <View className="flex-row justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        <View className="flex-1 mr-4">
                          <Text className="text-xs font-semibold text-slate-800">{selectedCustomer.name}</Text>
                          <Text className="text-tiny text-slate-500 font-medium mt-0.5">📞 {selectedCustomer.phone}</Text>
                          {selectedCustomer.address ? (
                            <Text className="text-[9.5px] text-slate-400 font-semibold mt-1">📍 {selectedCustomer.address}</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          className="bg-rose-50 p-2 rounded-xl border border-rose-200 items-center justify-center active:scale-95"
                          onPress={() => {
                            setSelectedCustomer(null);
                            setCustomerSearchQuery('');
                          }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <Ionicons name="search-outline" size={14} color="#94a3b8" />
                        <TextInput
                          className="flex-1 ml-2 text-xs text-slate-850 py-0.5"
                          placeholder="Tìm khách hàng theo tên hoặc SĐT..."
                          placeholderTextColor="#cbd5e1"
                          value={customerSearchQuery}
                          onChangeText={setCustomerSearchQuery}
                          style={{
                            height: 28,
                            paddingVertical: 0,
                            textAlignVertical: 'center',
                            lineHeight: 16,
                            includeFontPadding: false,
                            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                          }}
                        />
                        {customerSearchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setCustomerSearchQuery('')} className="mr-1">
                            <Ionicons name="close" size={14} color="#cbd5e1" />
                          </TouchableOpacity>
                        )}
                        <View className="w-px h-4 bg-slate-200 mx-1.5" />
                        <TouchableOpacity 
                          onPress={() => handleOpenQuickAddCustomer('open_table')}
                          className="p-1"
                        >
                          <Ionicons name="person-add-outline" size={15} color="#fa5908" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Danh sách gợi ý */}
                    {customerSearchQuery.trim().length > 0 && (() => {
                      const filtered = customersList.filter(c => {
                        const nameStr = (c.name || '').toLowerCase();
                        const phoneStr = (c.phone || '');
                        const queryStr = customerSearchQuery.toLowerCase();
                        return nameStr.includes(queryStr) || phoneStr.includes(queryStr);
                      });

                      if (filtered.length > 0) {
                        return (
                          <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                            <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                              {filtered.map(cust => (
                                <TouchableOpacity
                                  key={cust.id}
                                  className="p-3 border-b border-slate-100 flex-row justify-between items-center active:bg-slate-50"
                                  onPress={() => {
                                    setSelectedCustomer(cust);
                                    setCustomerSearchQuery('');
                                  }}
                                >
                                  <View>
                                    <Text className="text-xs font-medium text-slate-800">{cust.name}</Text>
                                    <Text className="text-tiny text-slate-400 mt-0.5">{cust.phone}</Text>
                                  </View>
                                  <Badge variant="primary" label={cust.customer_type || 'Thành viên'} size="sm" />
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        );
                      } else {
                        return (
                          <View className="bg-white border border-slate-200 rounded-xl mt-2 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                            <TouchableOpacity
                              className="p-4 flex-row items-center active:bg-slate-50"
                              onPress={() => handleOpenQuickAddCustomer('open_table')}
                            >
                              <Ionicons name="person-add-outline" size={16} color="#fa5908" />
                              <Text className="text-xs font-medium text-slate-800 ml-2.5">
                                Không tìm thấy dữ liệu. Tạo mới khách hàng <Text className="font-bold text-orange-500">"{customerSearchQuery}"</Text>
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }
                    })()}
                  </View>

                  {/* THÔNG TIN LOẠI THUÊ (Dành riêng cho khách sạn) */}
                  {shopVertical === 'lodging' && (
                    <View className="mt-2">
                      <Text className="text-tiny text-slate-400 font-medium mb-1.5">Hình thức thuê:</Text>
                      <View className="flex-row bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <TouchableOpacity
                          onPress={() => setRoomRentalType('hourly')}
                          className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'hourly' ? 'bg-white' : ''}`}
                        >
                          <Text className="text-tiny font-semibold text-slate-700">Theo giờ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setRoomRentalType('daily')}
                          className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'daily' ? 'bg-white' : ''}`}
                        >
                          <Text className="text-tiny font-semibold text-slate-700">Theo ngày</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <LodgingGuestsForm
                  guests={lodgingGuests}
                  onChangeGuests={setLodgingGuests}
                  guestCount={roomGuestCount}
                  onChangeGuestCount={setRoomGuestCount}
                  onPressDateInput={handleDatePickerOpen}
                />
              )}
            </ScrollView>

            {/* Lỗi mở bàn (giữ hộp thoại để thử lại) */}
            {!!openTableError && !isOpeningTable && (
              <View className="flex-row items-start bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 mb-3" accessibilityLiveRegion="polite">
                <Feather name="alert-circle" size={15} color="#e11d48" style={{ marginTop: 1 }} />
                <Text className="flex-1 text-xs text-rose-700 font-medium ml-2 leading-5">{openTableError}</Text>
                <TouchableOpacity onPress={() => setOpenTableError(null)} className="pl-2" accessibilityLabel="Ẩn thông báo lỗi">
                  <Feather name="x" size={14} color="#be123c" />
                </TouchableOpacity>
              </View>
            )}

            {/* Actions Footer */}
            <View className="flex-row gap-3 border-t border-slate-100 pt-4 bg-white">
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={isOpeningTable}
                onPress={() => setIsTableOpenDialogVisible(false)}
                className={`flex-1 py-3 rounded-xl border border-slate-200 items-center justify-center ${isOpeningTable ? 'opacity-50' : ''}`}
              >
                <Text className="text-xs font-medium text-slate-600">Hủy bỏ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isOpeningTable}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  void handleConfirmOpenTable();
                }}
                className={`flex-[2] py-3 rounded-xl flex-row items-center justify-center ${isOpeningTable ? 'bg-orange-400' : 'bg-orange-500 active:bg-orange-600'}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: isOpeningTable, busy: isOpeningTable }}
              >
                {isOpeningTable ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="log-in" size={15} color="#ffffff" />
                )}
                <Text className="text-xs font-semibold text-white ml-2">
                  {isOpeningTable
                    ? `Đang mở ${resNouns.noun}…`
                    : (shopVertical === 'lodging' ? 'Nhận phòng' : 'Bắt đầu sử dụng')}
                </Text>
              </TouchableOpacity>
            </View>



            {renderQuickCustomerModal('open_table')}
          </View>
          <PosDialogHost active={isTableOpenDialogVisible} />
        </KeyboardAvoidingView>
      </Modal>

      <PosDatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        targetField={pickerTargetField || ''}
        initialDate={(pickerTargetField && pickerTargetIndex !== null ? lodgingGuests[pickerTargetIndex]?.[pickerTargetField as keyof LodgingGuest] : undefined) as string | undefined}
        onConfirm={(dateStr) => {
          if (!pickerTargetField || pickerTargetIndex === null) return;
          const updated = [...lodgingGuests];
          if (!updated[pickerTargetIndex]) {
            updated[pickerTargetIndex] = { name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' };
          }
          updated[pickerTargetIndex] = { ...updated[pickerTargetIndex], [pickerTargetField]: dateStr };
          setLodgingGuests(updated);
          setIsDatePickerOpen(false);
        }}
      />


      {/* DIALOG: XÁC NHẬN ĐÃ DỌN XONG */}
      <Modal
        visible={isCleanConfirmModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !cleanConfirmSaving && setIsCleanConfirmModalOpen(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <View className="p-5">
              <Text className="text-lg font-bold text-slate-800 mb-2">
                Xác nhận dọn dẹp
              </Text>
              <Text className="text-sm text-slate-600 mb-6 leading-5">
                {getResourceDisplayName(tableToClean, shopVertical)} đang ở trạng thái chờ dọn dẹp. Bạn có muốn đánh dấu {resNouns.noun} này là đã dọn dẹp xong và sẵn sàng đón khách không?
              </Text>

              <View className="flex-row justify-end gap-3">
                <TouchableOpacity
                  disabled={cleanConfirmSaving}
                  onPress={() => setIsCleanConfirmModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white mr-3"
                >
                  <Text className="text-slate-600 font-semibold text-sm">Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={cleanConfirmSaving}
                  onPress={() => tableToClean && handleCleanTable(tableToClean)}
                  className={`px-5 py-2.5 rounded-xl flex-row items-center justify-center space-x-2 ${cleanConfirmSaving ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                >
                  {cleanConfirmSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                  <Text className="text-white font-semibold text-sm ml-1">
                    {cleanConfirmSaving ? 'Đang lưu...' : 'Đã dọn dẹp'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unused isTablePayDialogVisible Dialog removed since we use POS unified checkout modal */}

      <Dialog
        visible={isScanSuccessDialogVisible}
        onClose={() => setIsScanSuccessDialogVisible(false)}
        onConfirm={handleConfirmAddScanned}
        title="Quét mã thành công"
        description={scannedProductInfo ? `Phát hiện sản phẩm: "${scannedProductInfo.name}"\nĐơn giá: ${formatCurrency(scannedProductInfo.sell_price)}` : ''}
        confirmLabel="Thêm vào giỏ"
        cancelLabel="Hủy bỏ"
        variant="success"
      >
        {scannedProductInfo?.image_url && (
          <View className="items-center justify-center mt-2.5 mb-1 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <Image
              source={{ uri: scannedProductInfo.image_url }}
              style={{ width: 110, height: 110, borderRadius: 16 }}
              resizeMode="cover"
            />
          </View>
        )}
      </Dialog>



      {/* 5. CAMERA SCAN BARCODE POPUP */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => { setIsScannerOpen(false); setIsQuickCreateBarcodeScan(false); }}
        onScan={handleBarcodeScannedReal}
        title="Quét mã sản phẩm"
        placeholder="Nhập mã sản phẩm hoặc SKU..."
      />

      <Modal visible={!!quickCreateRequest && !isQuickCreateBarcodeScan} transparent animationType="fade" onRequestClose={() => { if (!isQuickCreateSaving) setQuickCreateRequest(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/50">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
          <View className="max-h-[88%] rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <View className="mb-4 flex-row items-start justify-between">
              <View><Text className="text-base font-bold text-slate-900">Tạo nhanh sản phẩm</Text><Text className="mt-1 text-xxs text-slate-500">Lưu vào đơn ngay; sản phẩm sẽ được đánh dấu cần review.</Text></View>
              <TouchableOpacity disabled={isQuickCreateSaving} onPress={() => setQuickCreateRequest(null)}><Ionicons name="close" size={22} color={isQuickCreateSaving ? "#cbd5e1" : "#64748b"} /></TouchableOpacity>
            </View>
            {isQuickCreateSaving && <View className="mb-4 flex-row items-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-3"><ActivityIndicator size="small" color="#fa5908" /><View className="ml-3 flex-1"><Text className="text-xs font-bold text-orange-700">Đang xử lý sản phẩm</Text><Text className="mt-0.5 text-xxs text-orange-600">{quickCreateProgress || 'Vui lòng không đóng màn hình này...'}</Text></View></View>}
            <Text className="mb-1 text-xxs font-bold text-slate-600">Tên sản phẩm *</Text>
            <TextInput value={quickProductName} onChangeText={setQuickProductName} placeholder="Ví dụ: Mì gói" className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800" style={singleLineInputStyle} />
            <View className="mb-3 flex-row gap-3"><View className="flex-1"><Text className="mb-1 text-xxs font-bold text-slate-600">Giá bán *</Text><TextInput value={quickProductPrice} onChangeText={(value) => setQuickProductPrice(maskCurrencyInput(value))} keyboardType="number-pad" placeholder="0" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm font-semibold text-slate-800" style={singleLineInputStyle} /></View><View className="flex-1"><Text className="mb-1 text-xxs font-bold text-slate-600">Đơn vị</Text><TextInput value={quickProductUnit} onChangeText={setQuickProductUnit} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800" style={singleLineInputStyle} /></View></View>
            <Text className="mb-1 text-xxs font-bold text-slate-600">Barcode</Text>
            <View className="mb-3 flex-row items-center rounded-xl border border-slate-200 bg-slate-50 pl-4">
              <TextInput value={quickProductBarcode} onChangeText={setQuickProductBarcode} placeholder="Tự điền sau khi quét" className="flex-1 py-2 text-sm font-semibold text-slate-800" style={singleLineInputStyle} />
              <TouchableOpacity onPress={() => { setIsQuickCreateBarcodeScan(true); setIsScannerOpen(true); }} className="self-stretch justify-center px-3" accessibilityLabel="Quét barcode">
                <Ionicons name="scan-outline" size={20} color="#fa5908" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowQuickCreateMore(value => !value)}><Text className="mb-2 text-xxs font-bold text-orange-500">{showQuickCreateMore ? 'Ẩn thông tin thêm' : 'Thêm ảnh / thông tin mở rộng'}</Text></TouchableOpacity>
            {showQuickCreateMore && <View className="mb-2 gap-3 rounded-2xl bg-slate-50 p-3">
              <Text className="text-xxs font-bold text-slate-600">Danh mục</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}><View className="flex-row gap-2"><TouchableOpacity onPress={() => setQuickProductCategoryId('')} className={`rounded-lg border px-3 py-2 ${!quickProductCategoryId ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}><Text className="text-xxs">Chưa phân loại</Text></TouchableOpacity>{categoriesList.map(category => <TouchableOpacity key={category.id} onPress={() => setQuickProductCategoryId(category.id)} className={`rounded-lg border px-3 py-2 ${quickProductCategoryId === category.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}><Text className="text-xxs">{category.name}</Text></TouchableOpacity>)}</View></ScrollView>
              <View className="flex-row gap-3"><View className="flex-1"><Text className="mb-1 text-xxs font-bold text-slate-600">Giá vốn</Text><TextInput value={quickProductCostPrice} onChangeText={(value) => setQuickProductCostPrice(maskCurrencyInput(value))} keyboardType="number-pad" placeholder="0" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-sm font-semibold text-slate-800" style={singleLineInputStyle} /></View><View className="flex-1"><Text className="mb-1 text-xxs font-bold text-slate-600">Giá sàn</Text><TextInput value={quickProductMinPrice} onChangeText={(value) => setQuickProductMinPrice(maskCurrencyInput(value))} keyboardType="number-pad" placeholder="0" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-sm font-semibold text-slate-800" style={singleLineInputStyle} /></View></View>
              <Text className="text-xxs font-bold text-slate-600">Ảnh sản phẩm</Text>
              <View className="items-center py-1" style={{ overflow: 'visible' }}>
                <View className="relative" style={{ overflow: 'visible' }}>
                  {(quickProductLocalImageUri || quickProductImageUrl) ? (
                    <View className="relative" style={{ overflow: 'visible' }}>
                      <Image source={{ uri: quickProductLocalImageUri || quickProductImageUrl }} className="h-24 w-24 rounded-3xl border border-slate-200 bg-slate-50" />
                      <TouchableOpacity className="absolute -right-2.5 -top-2.5 h-7 w-7 items-center justify-center rounded-full border border-white bg-rose-500" onPress={() => { setQuickProductLocalImageUri(null); setQuickProductImageUrl(''); }}><Ionicons name="close" size={14} color="white" /></TouchableOpacity>
                    </View>
                  ) : <View className="h-24 w-24 items-center justify-center rounded-3xl border border-orange-200 bg-orange-50"><MaterialIcons name="image" size={34} color="#fa5908" /></View>}
                  {quickProductLocalImageUri && <View className="absolute -left-2.5 -top-2.5 rounded-full border border-white bg-amber-500 px-2 py-0.5"><Text className="text-[8px] font-bold text-white">Chờ tải</Text></View>}
                </View>
                <View className="mt-3.5 flex-row gap-2">
                  {!isPioneerPlan && <><TouchableOpacity className="flex-row items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2" onPress={takeQuickProductPhoto}><Ionicons name="camera-outline" size={14} color="#64748b" /><Text className="ml-1 text-xxs font-bold text-slate-600">Chụp ảnh</Text></TouchableOpacity>
                  <TouchableOpacity className="flex-row items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2" onPress={pickQuickProductImage}><Ionicons name="image-outline" size={14} color="#64748b" /><Text className="ml-1 text-xxs font-bold text-slate-600">Chọn ảnh</Text></TouchableOpacity></>}
                  <TouchableOpacity className="flex-row items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2" onPress={() => setShowQuickProductUrlInput(value => !value)}><Ionicons name="link-outline" size={14} color="#64748b" /><Text className="ml-1 text-xxs font-bold text-slate-600">URL ảnh</Text></TouchableOpacity>
                </View>
                {isPioneerPlan && <Text className="mt-2 text-center text-[10px] font-medium text-slate-500">Gói Tiên phong chỉ hỗ trợ ảnh từ URL.</Text>}
                {showQuickProductUrlInput && <View className="mt-3.5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3"><Text className="mb-1.5 text-xxs font-bold text-slate-500">Đường dẫn hình ảnh (URL):</Text><TextInput value={quickProductImageUrl} onChangeText={(value) => { setQuickProductImageUrl(value); setQuickProductLocalImageUri(null); }} placeholder="https://image-url.com/prod.webp" autoCapitalize="none" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800" style={singleLineInputStyle} /></View>}
              </View>
            </View>}
            <View className="mt-2 flex-row justify-end gap-3"><TouchableOpacity disabled={isQuickCreateSaving} onPress={() => setQuickCreateRequest(null)} className="rounded-xl px-4 py-3"><Text className={`text-xs font-bold ${isQuickCreateSaving ? 'text-slate-300' : 'text-slate-600'}`}>Huỷ</Text></TouchableOpacity><TouchableOpacity disabled={isQuickCreateSaving} onPress={saveQuickProductToCart} className={`rounded-xl px-5 py-3 ${isQuickCreateSaving ? 'bg-orange-300' : 'bg-orange-500'}`}><Text className="text-xs font-bold text-white">{isQuickCreateSaving ? 'Đang xử lý...' : 'Lưu vào đơn'}</Text></TouchableOpacity></View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* 6. MODAL XEM CHI TIẾT PHÒNG/BÀN ĐANG HOẠT ĐỘNG */}
      <Modal
        visible={!!activeTable}
        animationType="slide"
        transparent={true}
        onShow={onActiveTableModalShown}
        onRequestClose={() => {
          if (posDialog.handleBack()) return;
          if (!isPreparingTablePay) setActiveTable(null);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => { if (!isPreparingTablePay) setActiveTable(null); }}
          />
          {activeTable && (
            <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl relative">
              <PosToast toastMsg={toastMsg} toastOpacity={toastOpacity} isForModal={true} />
              {hasPendingSync && (
                <TouchableOpacity 
                  style={{ marginHorizontal: 4, marginBottom: 16, marginTop: 8, backgroundColor: "#FEF3C7", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#F59E0B", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  onPress={() => {
                    setHasPendingSync(false);
                    loadPosData(true);
                    if (activeTable) {
                      syncActiveTableSession(activeTable);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: "#92400E", fontSize: 13 }}>Cập nhật mới từ thiết bị khác!</Text>
                    <Text style={{ color: "#B45309", fontSize: 12, marginTop: 2 }}>Dữ liệu đã thay đổi, vui lòng tải lại để đồng bộ.</Text>
                  </View>
                  <View style={{ backgroundColor: "#F59E0B", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ color: "white", fontWeight: "bold", fontSize: 13 }}>Tải lại</Text>
                  </View>
                </TouchableOpacity>
              )}
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-4 border-b border-slate-100 pb-2">
                <View className="flex-row items-center flex-1 mr-2">
                  <Ionicons name="time" size={18} color="#fa5908" />
                  <Text className="text-base font-semibold text-slate-800 ml-2 flex-1" numberOfLines={1}>
                    {activeTable.name} ({
                      shopVertical === 'fnb' ? 'Có khách' :
                        shopVertical === 'sports_court' ? 'Sân đang đá' :
                          shopVertical === 'lodging' ? 'Phòng đang ở' :
                            'Bàn đang chơi'
                    })
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                      setIsSyncingTableSession(true);
                      const result = await syncActiveTableSession(activeTable);
                      setIsSyncingTableSession(false);
                      if (!result?.isFinished) {
                        showToast(`Đã đồng bộ ${getResourceDisplayName(activeTable, shopVertical)} mới nhất`, "success");
                      }
                    }}
                    className="p-1.5 rounded-lg active:bg-slate-100"
                    disabled={isSyncingTableSession}
                  >
                    {isSyncingTableSession ? (
                      <ActivityIndicator size="small" color="#fa5908" />
                    ) : (
                      <Ionicons name="sync-outline" size={20} color="#fa5908" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setActiveTable(null)} disabled={isPreparingTablePay} className="p-1.5 rounded-lg active:bg-slate-100">
                    <Ionicons name="close" size={24} color={isPreparingTablePay ? '#cbd5e1' : '#64748b'} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* TAB SELECTOR FOR ACTIVE ROOM */}
              {shopVertical === 'lodging' && (
                <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4">
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setActiveTableTab('billing')}
                    className={`flex-1 py-2 items-center justify-center rounded-lg ${activeTableTab === 'billing' ? 'bg-white border border-slate-200' : 'bg-transparent'
                      }`}
                  >
                    <Text className={`text-xs font-semibold ${activeTableTab === 'billing' ? 'text-slate-800' : 'text-slate-500'}`}>
                      Dịch vụ phòng
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setActiveTableTab('guests')}
                    className={`flex-1 py-2 items-center justify-center rounded-lg ${activeTableTab === 'guests' ? 'bg-white border border-slate-200' : 'bg-transparent'
                      }`}
                  >
                    <Text className={`text-xs font-semibold ${activeTableTab === 'guests' ? 'text-slate-800' : 'text-slate-500'}`}>
                      {`Khách lưu trú (${lodgingGuests.filter(g => g.name || g.id_number || g.idCard).length})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView className="flex-1 my-2" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {activeTableTab === 'billing' || shopVertical !== 'lodging' ? (
                  <View>
                    {/* GIAO DIỆN KHÁCH HÀNG CRM TRONG CHI TIẾT PHÒNG */}
                    {tableCustomers[activeTable.id] ? (
                      <View className="mb-4 bg-slate-50 border border-slate-200 p-3 rounded-xl flex-row items-center justify-between">
                        <View className="flex-1">
                          <Text className="text-[10px] text-slate-400 font-semibold mb-1">Khách hàng đại diện:</Text>
                          <Text className="text-xs font-bold text-slate-800">{tableCustomers[activeTable.id].name}</Text>
                          {tableCustomers[activeTable.id].phone ? (
                            <Text className="text-tiny text-slate-500 font-semibold mt-0.5">📞 {tableCustomers[activeTable.id].phone}</Text>
                          ) : (
                            <Text className="text-tiny text-slate-400 mt-0.5 font-medium">Không có số điện thoại</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          className="bg-rose-50 p-2 rounded-xl border border-rose-200 items-center justify-center active:scale-95"
                          onPress={() => handleUpdateTableCustomer(activeTable.id, null)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View className="mb-4 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className="text-[10px] text-slate-400 font-semibold">Khách hàng đại diện:</Text>
                          <View className="bg-slate-200/60 px-2 py-0.5 rounded">
                            <Text className="text-[9.5px] font-bold text-slate-600">Khách lẻ</Text>
                          </View>
                        </View>

                        {/* Ô tìm kiếm khách hàng */}
                        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 mt-1">
                          <Ionicons name="search-outline" size={14} color="#94a3b8" />
                          <TextInput
                            className="flex-1 ml-2 text-xs text-slate-850 py-0.5"
                            placeholder="Tìm khách hàng đại diện..."
                            placeholderTextColor="#cbd5e1"
                            value={customerSearchQuery}
                            onChangeText={setCustomerSearchQuery}
                            style={{
                              height: 28,
                              paddingVertical: 0,
                              textAlignVertical: 'center',
                              lineHeight: 16,
                              includeFontPadding: false,
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                            }}
                          />
                          {customerSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setCustomerSearchQuery('')} className="mr-1">
                              <Ionicons name="close" size={14} color="#cbd5e1" />
                            </TouchableOpacity>
                          )}
                          <View className="w-px h-4 bg-slate-200 mx-1.5" />
                          <TouchableOpacity 
                            onPress={() => handleOpenQuickAddCustomer('active_table')}
                            className="p-1"
                          >
                            <Ionicons name="person-add-outline" size={15} color="#fa5908" />
                          </TouchableOpacity>
                        </View>

                        {/* Danh sách gợi ý khách hàng ngay trong modal chi tiết phòng */}
                        {customerSearchQuery.trim().length > 0 && (() => {
                          const filtered = customersList.filter(c => {
                            const nameStr = (c.name || '').toLowerCase();
                            const phoneStr = (c.phone || '');
                            const queryStr = customerSearchQuery.toLowerCase();
                            return nameStr.includes(queryStr) || phoneStr.includes(queryStr);
                          });

                          if (filtered.length > 0) {
                            return (
                              <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-32 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                                <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                                  {filtered.map(cust => (
                                    <TouchableOpacity
                                      key={cust.id}
                                      className="p-2.5 border-b border-slate-100 flex-row justify-between items-center active:bg-slate-50"
                                      onPress={() => {
                                        handleUpdateTableCustomer(activeTable.id, cust);
                                        setCustomerSearchQuery('');
                                      }}
                                    >
                                      <View>
                                        <Text className="text-xs font-semibold text-slate-800">{cust.name}</Text>
                                        {cust.phone ? (
                                          <Text className="text-[9.5px] text-slate-400 mt-0.5">{cust.phone}</Text>
                                        ) : null}
                                      </View>
                                      <Ionicons name="chevron-forward" size={12} color="#cbd5e1" />
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            );
                          } else {
                            return (
                              <View className="bg-white border border-slate-200 rounded-xl mt-2 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                                <TouchableOpacity
                                  className="p-4 flex-row items-center active:bg-slate-50"
                                  onPress={() => handleOpenQuickAddCustomer('active_table')}
                                >
                                  <Ionicons name="person-add-outline" size={16} color="#fa5908" />
                                  <Text className="text-xs font-medium text-slate-800 ml-2.5">
                                    Không tìm thấy dữ liệu. Tạo mới khách hàng <Text className="font-bold text-orange-500">"{customerSearchQuery}"</Text>
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          }
                        })()}
                      </View>
                    )}

                    {/* CHI TIẾT MÓN / DỊCH VỤ ĐÃ GỌI KÈM */}
                    {tableCarts[activeTable.id] && Object.keys(tableCarts[activeTable.id]).length > 0 ? (
                      <View className="mb-4">
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-tiny text-slate-500 font-semibold">Món ăn / Dịch vụ đã gọi:</Text>
                          <Text className="text-xs font-bold text-orange-600">
                            Tổng món: {formatCurrency(
                              Object.entries(tableCarts[activeTable.id]).reduce(
                                (sum, [cartItemId, item]: [string, any]) =>
                                  isTimeChargeProduct(item.productId || cartItemId, item.name)
                                    ? sum
                                    : sum + ((Number(item.price) || 0) + (Number(item.modifier_total) || 0)) * (Number(item.quantity) || 0),
                                0
                              )
                            )}
                          </Text>
                        </View>
                        {tableKitchen.status.enabled && (() => {
                          const gone = Object.entries(tableCarts[activeTable.id])
                            .map(([key, it]: [string, any]) => ({ key, it, n: soldOutQtyOf(tableKitchen.status, it._serverItemId) }))
                            .filter((x) => x.n > 0);
                          if (gone.length === 0) return null;
                          return (
                            <View className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 mb-2">
                              <Text className="text-xs font-semibold text-rose-800">Bếp báo hết món – báo khách và bỏ món:</Text>
                              {gone.map(({ key, it, n }) => (
                                <View key={key} className="flex-row items-center mt-1.5">
                                  <Text className="flex-1 text-xs text-rose-700" numberOfLines={1}>{it.name} · hết {n}</Text>
                                  <TouchableOpacity
                                    onPress={() => {
                                      const qty = Number(it.quantity) || 0;
                                      if (n >= qty) handleRemoveTableItem(activeTable.id, key, { voidReason: 'Hết món' });
                                      else for (let i = 0; i < n; i++) handleDecreaseTableItemQty(activeTable.id, key, { voidReason: 'Hết món' });
                                    }}
                                    className="rounded-md border border-rose-300 bg-white px-2 py-1 active:bg-rose-100"
                                    accessibilityLabel={`Bỏ món ${it.name}`}
                                  >
                                    <Text className="text-[11px] font-semibold text-rose-700">Bỏ món</Text>
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          );
                        })()}
                        {tableKitchen.status.enabled && (() => {
                          const unsentQty = Object.entries(tableCarts[activeTable.id]).reduce((n, [key, it]: [string, any]) =>
                            isTimeChargeProduct(it.productId || key, it.name)
                              ? n
                              : n + Math.max(0, (Number(it.quantity) || 0) - sentQtyOf(tableKitchen.status, it._serverItemId)), 0);
                          return (
                            <View className={`flex-row items-center rounded-xl border px-3 py-2 mb-2 ${unsentQty > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                              <Feather name="coffee" size={14} color={unsentQty > 0 ? '#d97706' : '#94a3b8'} />
                              <Text className={`flex-1 ml-2 text-xs font-medium ${unsentQty > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
                                {unsentQty > 0 ? `Món chưa báo bếp: ${unsentQty}` : 'Đã báo bếp đủ món'}
                              </Text>
                              {unsentQty > 0 && (
                                <TouchableOpacity
                                  onPress={() => { void sendTableToKitchen(); }}
                                  disabled={tableKitchen.sending}
                                  className={`flex-row items-center rounded-lg px-3 py-1.5 ${tableKitchen.sending ? 'bg-orange-300' : 'bg-orange-500 active:bg-orange-600'}`}
                                  accessibilityLabel="Gửi bếp"
                                >
                                  {tableKitchen.sending ? <ActivityIndicator size="small" color="white" /> : <Feather name="send" size={12} color="white" />}
                                  <Text className="text-xs font-semibold text-white ml-1.5">Gửi bếp</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })()}
                        <View className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          {Object.entries(tableCarts[activeTable.id]).map(([cartItemId, item]) => (
                            <View 
                              key={cartItemId} 
                              className="flex-row justify-between items-center py-2 border-b border-slate-100 last:border-0"
                            >
                              <View className="flex-1 mr-2">
                                <Text className="text-xs font-semibold text-slate-700" numberOfLines={1}>
                                  {item.name}
                                  {((item as any).original_price != null && Number(item.price) !== Number((item as any).original_price) || Number((item as any).discount_amount || 0) > 0) && (
                                    <Text className="text-orange-500 font-bold ml-1 text-[10px]"> *</Text>
                                  )}
                                </Text>
                                {(() => {
                                  if (isTimeChargeProduct((item as any).productId || cartItemId, item.name)) return null;
                                  const b = kitchenBadge(tableKitchen.status, (item as any)._serverItemId, Number(item.quantity) || 0);
                                  if (!b) return null;
                                  const cls = b.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : b.tone === 'sky' ? 'bg-sky-50 border-sky-200 text-sky-700'
                                    : b.tone === 'rose' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700';
                                  return (
                                    <View className="flex-row mt-0.5">
                                      <Text className={`text-[10px] font-semibold border rounded px-1 ${cls}`}>{b.label}</Text>
                                    </View>
                                  );
                                })()}
                              </View>

                              <View className="flex-row items-center gap-2">
                                {/* Nút giảm số lượng */}
                                <TouchableOpacity
                                  onPress={async () => {
                                    const g = await guardKitchenReduce(item, Math.max(1, (Number(item.quantity) || 0) - 1));
                                    if (g.ok) handleDecreaseTableItemQty(activeTable.id, cartItemId, g.reason ? { voidReason: g.reason } : undefined);
                                  }}
                                  className="w-7 h-7 bg-slate-100 rounded-lg justify-center items-center active:bg-slate-200"
                                >
                                  <Text className="text-slate-600 font-bold text-sm">-</Text>
                                </TouchableOpacity>

                                {/* Ô hiển thị số lượng */}
                                <View className="min-w-[30px] h-7 bg-white border border-slate-200 rounded-lg justify-center items-center px-1">
                                  <Text className="text-xs font-bold text-slate-800">{item.quantity}</Text>
                                </View>

                                {/* Nút tăng số lượng */}
                                <TouchableOpacity
                                  onPress={() => handleIncreaseTableItemQty(activeTable.id, cartItemId)}
                                  className="w-7 h-7 bg-slate-100 rounded-lg justify-center items-center active:bg-slate-200"
                                >
                                  <Text className="text-slate-600 font-bold text-sm">+</Text>
                                </TouchableOpacity>

                                {/* Thành tiền */}
                                <TouchableOpacity 
                                  className="min-w-[70px] ml-1 items-end"
                                  onPress={() => setEditingCartItem({ 
                                    tableId: activeTable.id, 
                                    cartItemId, 
                                    item: { ...item, unit_price: item.price } 
                                  })}
                                >
                                  <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1' }}>
                                    <Text className="text-xs font-bold text-slate-800 text-right">
                                      {formatCurrency((item.price + (item.modifier_total || 0)) * item.quantity)}
                                    </Text>
                                  </View>
                                  {(() => {
                                    const basePrice = (item as any).original_price ?? item.price;
                                    const priceDiff = basePrice - item.price;
                                    const totalReduction = priceDiff * item.quantity;
                                    if (totalReduction > 0) {
                                      return (
                                        <Text className="text-[10px] text-orange-500 italic mt-0.5">
                                          Giảm: -{formatCurrency(totalReduction)}
                                        </Text>
                                      );
                                    }
                                    return null;
                                  })()}
                                </TouchableOpacity>

                                {/* Nút Xóa món */}
                                <TouchableOpacity
                                  onPress={async () => {
                                    const g = await guardKitchenReduce(item, 0);
                                    if (g.ok) handleRemoveTableItem(activeTable.id, cartItemId, g.reason ? { voidReason: g.reason } : undefined);
                                  }}
                                  className="p-1 ml-1"
                                >
                                  <Ionicons name="close" size={16} color="#94a3b8" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {/* MENU CHỨC NĂNG PHỤ TRỢ (Như Web) */}
                    <Text className="text-tiny text-slate-400 font-medium mb-2">Thao tác nghiệp vụ:</Text>
                    <View className="flex-row flex-wrap gap-2.5 mb-5 justify-between">
                      {/* 1. Gọi món / dịch vụ */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                        onPress={() => {
                          // Nháp món mới riêng cho bàn (giỏ bán lẻ được cất lại, trả về khi thoát)
                          void enterTableOrdering(activeTable);
                        }}
                      >
                        <Ionicons name="fast-food-outline" size={16} color="#fa5908" />
                        <Text className="text-tiny font-semibold text-slate-700 ml-2">Gọi món / Dịch vụ</Text>
                      </TouchableOpacity>

                      {/* 2. Đổi phòng/bàn */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                        onPress={() => {
                          const label = shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn';
                          if (!canModifyOrders) {
                            showToast(`Bạn không có quyền Đổi ${label}!`, "error");
                            return;
                          }
                          setTransferSearchQuery('');
                          setIsTransferModalVisible(true);
                        }}
                      >
                        <Ionicons name="swap-horizontal" size={16} color="#0284c7" />
                        <Text className="text-tiny font-semibold text-slate-700 ml-2">Đổi {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}</Text>
                      </TouchableOpacity>

                      {/* 3. Gộp phòng/bàn */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                        onPress={() => {
                          const label = shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn';
                          if (!canModifyOrders) {
                            showToast(`Bạn không có quyền Gộp ${label}!`, "error");
                            return;
                          }
                          setMergeSearchQuery('');
                          setIsMergeModalVisible(true);
                        }}
                      >
                        <Ionicons name="git-merge-outline" size={16} color="#059669" />
                        <Text className="text-tiny font-semibold text-slate-700 ml-2">Gộp {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}</Text>
                      </TouchableOpacity>

                      {/* 4. Hủy đơn / Trả phòng trống */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        className="w-[47%] bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex-row items-center active:bg-rose-100"
                        onPress={async () => {
                          // Hộp thoại xác nhận hủy an toàn
                          const cancelName = getResourceDisplayName(activeTable, shopVertical);
                          const confirmCancel = Platform.OS === 'web'
                            ? window.confirm(`Bạn có chắc chắn muốn Hủy và giải phóng ${cancelName}?`)
                            : (await dialog.confirm({
                              title: `Hủy đơn ${cancelName}?`,
                              message: `Tất cả thông tin sử dụng và dịch vụ hiện tại sẽ bị xóa sạch, ${resNouns.noun} được trả về trạng thái trống.`,
                              tone: 'danger',
                              icon: 'x-circle',
                              actions: [
                                { key: 'no', label: 'Không', style: 'secondary' },
                                { key: 'yes', label: 'Hủy đơn', style: 'destructive' },
                              ],
                            })) === 'yes';

                          if (!confirmCancel) return;

                          try {
                            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
                            let syncSucceeded = false;

                            let cleanedCancelledMeta = '{}';
                            try {
                              const parsedMeta = typeof activeTable.metadata === 'string'
                                ? JSON.parse(activeTable.metadata || '{}')
                                : (activeTable.metadata || {});
                              if (parsedMeta && typeof parsedMeta === 'object' && !Array.isArray(parsedMeta)) {
                                const copy = { ...parsedMeta };
                                delete copy.check_in;
                                delete copy.check_in_time;
                                delete copy.temp_checkout_time;
                                delete copy.actual_checkout_requested_at;
                                delete copy.original_start_time;
                                delete copy.original_temp_checkout_time;
                                delete copy.guests;
                                delete copy.guests_list;
                                delete copy.num_guests;
                                delete copy.expected_checkout;
                                delete copy.customer_phone;
                                delete copy.customer_address;
                                delete copy.note;
                                cleanedCancelledMeta = JSON.stringify(copy);
                              }
                            } catch (e) {}

                            const latestTableOrderId =
                              tables.find(t => t.id === activeTable.id)?.current_order_id ||
                              activeTable.current_order_id ||
                              '';

                            // Table sync v2: online-only cancel through the order cancel endpoint (ends the session)
                            if (isV2Table(activeTable)) {
                              const cancelled = await cancelV2Table(activeTable, cleanedCancelledMeta);
                              if (cancelled) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                                setActiveTable(null);
                                showToast(`Đã hủy đơn & giải phóng ${getResourceDisplayName(activeTable, shopVertical)}!`, "success");
                              }
                              return;
                            }

                            // Dọn dẹp ngay lập tức tableCart & tableCustomers trước khi gọi mạng
                            setTableCarts(prev => {
                              const copy = { ...prev };
                              delete copy[activeTable.id];
                              return copy;
                            });
                            setTableCustomers(prev => {
                              const copy = { ...prev };
                              delete copy[activeTable.id];
                              return copy;
                            });

                            // 1. Đồng bộ cục bộ (Offline-First)
                            if (Platform.OS === 'web') {
                              setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, status: 'available', startTime: null, current_order_id: null, metadata: cleanedCancelledMeta } : t));
                            } else {
                              const orderIdsToRemove = new Set<string>();
                              if (activeTable.current_order_id) orderIdsToRemove.add(activeTable.current_order_id);
                              if (latestTableOrderId) orderIdsToRemove.add(latestTableOrderId);
                              try {
                                const localInProg = await db
                                  .select()
                                  .from(schema.orders)
                                  .where(
                                    and(
                                      eq(schema.orders.resource_id, activeTable.id),
                                      eq(schema.orders.status, 'in_progress')
                                    )
                                  );
                                for (const o of localInProg) {
                                  if (o.id) orderIdsToRemove.add(o.id);
                                }
                              } catch (e) {}

                              for (const oid of orderIdsToRemove) {
                                await db.delete(schema.orders).where(eq(schema.orders.id, oid));
                                await db.delete(schema.order_items).where(eq(schema.order_items.order_id, oid));
                              }
                              await db
                                .update(schema.location_resources)
                                .set({ status: 'available', startTime: null, current_order_id: null, metadata: cleanedCancelledMeta })
                                .where(eq(schema.location_resources.id, activeTable.id));
                              const updated = await db.select().from(schema.location_resources);
                              setTables(updated);
                            }

                            // 2. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng
                            try {
                              const currentUrl = getApiBaseUrl();
                              const headers = await getApiHeaders();

                              // A. Hủy order in_progress trên Next.js Server
                              if (latestTableOrderId && !String(latestTableOrderId).startsWith('ORD-T-INPROG-')) {
                                await fetch(`${currentUrl}/api/shops/${shopId}/orders/${latestTableOrderId}/cancel`, {
                                  method: 'POST',
                                  headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ reason: 'Hủy từ di động' })
                                });
                              }

                              // B. Patch trạng thái bàn về available (trên Server cũng sẽ tự động hủy mọi đơn in_progress mồ côi của bàn này)
                              const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  status: 'available',
                                  current_order_id: '',
                                  startTime: null,
                                  metadata: cleanedCancelledMeta,
                                }),
                              });
                              if (patchRes.ok) {
                                syncSucceeded = true;
                              }
                              broadcastSync?.({ event: 'TABLE_UPDATED', tableId: activeTable.id });
                            } catch (syncErr) {
                              console.log('Mất mạng hoặc lỗi server, bỏ qua hủy trực tiếp:', syncErr);
                            }

                            // Dọn dẹp tableCart
                            setTableCarts(prev => {
                              const copy = { ...prev };
                              delete copy[activeTable.id];
                              return copy;
                            });

                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                            setActiveTable(null);

                            if (syncSucceeded) {
                              showToast(`Đã hủy đơn & giải phóng ${getResourceDisplayName(activeTable, shopVertical)}!`, "success");
                            } else {
                              showToast(`Đã giải phóng ${getResourceDisplayName(activeTable, shopVertical)} (ngoại tuyến)!`, "info");
                            }
                          } catch (err) {
                            console.error('Không thể hủy ca hoạt động:', err);
                            showToast("Có lỗi xảy ra khi hủy ca!", "error");
                          }
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={16} color="#e11d48" />
                        <Text className="text-tiny font-semibold text-rose-700 ml-2">Hủy / Trả trống</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <LodgingGuestsForm
                      guests={lodgingGuests}
                      onChangeGuests={setLodgingGuests}
                      guestCount={roomGuestCount}
                      onChangeGuestCount={setRoomGuestCount}
                      onPressDateInput={handleDatePickerOpen}
                    />
                  </View>
                )}
              </ScrollView>

              {/* Hàng nút thanh toán chính kèm tổng tiền trực quan */}
              <View className="border-t border-slate-100 pt-3 bg-white">
                {(activeTableTab === 'billing' || shopVertical !== 'lodging') && (() => {
                  const footerBilling = calculateBilling(activeTable);
                  let footerMeta: any = {};
                  try {
                    footerMeta = activeTable.metadata
                      ? (typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : activeTable.metadata)
                      : {};
                  } catch {}
                  const footerPres = getResourceBillingPresentationForResource(shopVertical, { ...activeTable, metadata: footerMeta });
                  const footerTimeCost = footerPres.showCost ? (Number(footerBilling.cost) || 0) : 0;
                  const footerItemsCost = Object.entries(tableCarts[activeTable.id] || {}).reduce(
                    (sum, [cartItemId, item]: [string, any]) =>
                      isTimeChargeProduct(item.productId || cartItemId, item.name)
                        ? sum
                        : sum + ((Number(item.price) || 0) + (Number(item.modifier_total) || 0)) * (Number(item.quantity) || 0),
                    0
                  );
                  const footerGrandTotal = footerTimeCost + footerItemsCost;
                  return (
                    <View className="flex-row justify-between items-center mb-2.5 px-1">
                      <View>
                        <Text className="text-[10px] text-slate-500 font-medium">
                          Giờ ({footerBilling.label}): <Text className="font-bold text-slate-700">{formatCurrency(footerTimeCost)}</Text> • Món: <Text className="font-bold text-slate-700">{formatCurrency(footerItemsCost)}</Text>
                        </Text>
                        <Text className="text-xs font-bold text-slate-800 mt-0.5">
                          Tổng thanh toán tạm tính
                        </Text>
                      </View>
                      <Text className="text-lg font-extrabold text-orange-500" style={{ fontVariant: ['tabular-nums'] }}>
                        {formatCurrency(footerGrandTotal)}
                      </Text>
                    </View>
                  );
                })()}
                <View className="flex-row justify-between gap-3">
                  {activeTableTab === 'billing' || shopVertical !== 'lodging' ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isPreparingTablePay}
                      onPress={() => { void triggerPayTable(activeTable); }}
                      className={`flex-1 py-3.5 rounded-xl flex-row items-center justify-center ${isPreparingTablePay ? 'bg-orange-400' : 'bg-orange-500 active:bg-orange-600'}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isPreparingTablePay, busy: isPreparingTablePay }}
                    >
                      {isPreparingTablePay ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons name="card-outline" size={16} color="white" />
                      )}
                      <Text className="text-xs font-medium text-white ml-2" numberOfLines={1}>
                        {isPreparingTablePay
                          ? 'Đang tính tiền giờ…'
                          : `Thanh toán & Trả ${resNouns.noun}`}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Button
                      variant="primary"
                      title="Cập nhật khách lưu trú"
                      icon={<Ionicons name="save-outline" size={16} color="white" />}
                      onPress={handleUpdateActiveRoomGuests}
                      className="flex-1 py-3.5 rounded-xl"
                      loading={isUpdatingGuestsLoading}
                    />
                  )}
                </View>
              </View>

              <PosDatePicker
                isOpen={isDatePickerOpen}
                onClose={() => setIsDatePickerOpen(false)}
                targetField={pickerTargetField || ''}
                initialDate={(pickerTargetField && pickerTargetIndex !== null ? lodgingGuests[pickerTargetIndex]?.[pickerTargetField as keyof LodgingGuest] : undefined) as string | undefined}
                onConfirm={(dateStr) => {
                  if (!pickerTargetField || pickerTargetIndex === null) return;
                  const updated = [...lodgingGuests];
                  if (!updated[pickerTargetIndex]) {
                    updated[pickerTargetIndex] = { name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' };
                  }
                  updated[pickerTargetIndex] = { ...updated[pickerTargetIndex], [pickerTargetField]: dateStr };
                  setLodgingGuests(updated);
                  setIsDatePickerOpen(false);
                }}
              />
              
              <PosDateTimePicker 
                isOpen={isTableTimePickerOpen}
                onClose={() => setIsTableTimePickerOpen(false)}
                onConfirm={(dateStr, hourStr, minStr) => {
                  if (activeTable) {
                    const [d, m, y] = dateStr.split('/');
                    const targetDate = new Date();
                    targetDate.setFullYear(parseInt(y, 10));
                    targetDate.setMonth(parseInt(m, 10) - 1);
                    targetDate.setDate(parseInt(d, 10));
                    targetDate.setHours(parseInt(hourStr, 10));
                    targetDate.setMinutes(parseInt(minStr, 10));
                    targetDate.setSeconds(0);
                    
                    handleUpdateTableTime(activeTable.id, tableTimePickerType, targetDate.toISOString());
                  }
                  setIsTableTimePickerOpen(false);
                }}
                title={tableTimePickerType === 'checkin' ? 'Cập nhật Giờ vào' : 'Cập nhật Giờ ra'}
                initialDate={(() => {
                  if (!activeTable) return undefined;
                  let iso = tableTimePickerType === 'checkin' ? activeTable.startTime : (() => {
                    try {
                      const meta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
                      return meta.temp_checkout_time;
                    } catch(e) { return null; }
                  })();
                  if (!iso) iso = new Date().toISOString();
                  const dt = new Date(iso);
                  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth()+1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
                })()}
                initialHour={(() => {
                  if (!activeTable) return undefined;
                  let iso = tableTimePickerType === 'checkin' ? activeTable.startTime : (() => {
                    try {
                      const meta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
                      return meta.temp_checkout_time;
                    } catch(e) { return null; }
                  })();
                  if (!iso) iso = new Date().toISOString();
                  return new Date(iso).getHours().toString();
                })()}
                initialMinute={(() => {
                  if (!activeTable) return undefined;
                  let iso = tableTimePickerType === 'checkin' ? activeTable.startTime : (() => {
                    try {
                      const meta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
                      return meta.temp_checkout_time;
                    } catch(e) { return null; }
                  })();
                  if (!iso) iso = new Date().toISOString();
                  return new Date(iso).getMinutes().toString();
                })()}
                originalTimeStr={(() => {
                  if (!activeTable) return undefined;
                  try {
                    const meta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
                    const originalIso = tableTimePickerType === 'checkin' ? meta.original_start_time : meta.original_temp_checkout_time;
                    if (originalIso) {
                      const dt = new Date(originalIso);
                      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth()+1).toString().padStart(2, '0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
                    }
                  } catch(e) {}
                  return undefined;
                })()}
              />
              {renderQuickCustomerModal('active_table')}
            </View>
          )}

          {/* OVERLAY CHUYỂN PHÒNG/BÀN */}
          {isTransferModalVisible && activeTable && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable className="absolute inset-0" onPress={() => setIsTransferModalVisible(false)} />
              <Pressable onPress={() => {}} className="h-[75%] rounded-t-[32px] p-6 bg-white justify-between relative" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 12 }}>
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
                  <Text className="text-sm font-semibold text-slate-800">
                    Đổi {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}
                  </Text>
                  <TouchableOpacity onPress={() => setIsTransferModalVisible(false)} className="p-1">
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Nguồn */}
                <View className="bg-orange-50 border border-orange-100 p-3 rounded-xl mt-3 flex-row justify-between items-center">
                  <Text className="text-xs text-orange-850 font-medium">Nguồn: <Text className="font-bold">{activeTable.name}</Text></Text>
                  <Badge variant="warning" label="Đang hoạt động" size="sm" />
                </View>

                {/* Tìm kiếm đích */}
                <View className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 mt-3 flex-row items-center">
                  <Ionicons name="search-outline" size={16} color="#94a3b8" />
                  <TextInput
                    placeholder={`Tìm ${shopVertical === 'lodging' ? 'phòng' : shopVertical === 'sports_court' ? 'sân' : 'bàn'} trống để chuyển...`}
                    placeholderTextColor="#cbd5e1"
                    className="flex-1 ml-2 text-xs font-semibold text-slate-800"
                    value={transferSearchQuery}
                    onChangeText={setTransferSearchQuery}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>

                <ScrollView className="flex-1 my-3" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {(() => {
                    const targets = tables.filter(t => {
                      const isAvailable = t.status !== 'playing' && t.status !== 'occupied';
                      const matchesSearch = !transferSearchQuery.trim() || (t.name && t.name.toLowerCase().includes(transferSearchQuery.toLowerCase()));
                      return t.id !== activeTable.id && isAvailable && matchesSearch;
                    });

                    if (targets.length === 0) {
                      return (
                        <View className="items-center justify-center py-10">
                          <Ionicons name="sad-outline" size={36} color="#cbd5e1" />
                          <Text className="text-xs text-slate-400 font-medium mt-2">Không có {shopVertical === 'lodging' ? 'phòng' : shopVertical === 'sports_court' ? 'sân' : 'bàn'} trống khả dụng</Text>
                        </View>
                      );
                    }

                    return (
                      <View className="flex-row flex-wrap gap-2.5 pt-1">
                        {targets.map(t => {
                          const targetBillingPresentation = getResourceBillingPresentationForResource(shopVertical, t);
                          const targetRateLabel = targetBillingPresentation.rateBadgeLabel ||
                            (targetBillingPresentation.rate > 0 && targetBillingPresentation.rateUnit
                              ? `${formatCurrency(targetBillingPresentation.rate)}/${targetBillingPresentation.rateUnit}`
                              : 'Chưa cấu hình đơn giá');

                          return (
                            <TouchableOpacity
                              key={t.id}
                              onPress={() => {
                                setConfirmTransferMerge({
                                  visible: true,
                                  type: 'transfer',
                                  sourceTable: activeTable,
                                  targetTable: t,
                                  includeStayCost: true,
                                  loading: false,
                                });
                              }}
                              className="w-[48%] bg-slate-50 border border-slate-200 p-3.5 rounded-2xl items-center active:bg-orange-50 active:border-orange-200"
                            >
                              <Ionicons name={shopVertical === 'lodging' ? "bed-outline" : "ellipse-outline"} size={20} color="#64748b" />
                              <Text className="text-xs font-bold text-slate-800 mt-1.5">{t.name}</Text>
                              <Text className="text-[9px] text-slate-450 mt-0.5">{targetRateLabel}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}
                </ScrollView>
              </Pressable>
            </View>
          )}

          {/* OVERLAY GỘP PHÒNG/BÀN */}
          {isMergeModalVisible && activeTable && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable className="absolute inset-0" onPress={() => setIsMergeModalVisible(false)} />
              <Pressable onPress={() => {}} className="h-[75%] rounded-t-[32px] p-6 bg-white justify-between relative" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 12 }}>
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
                  <Text className="text-sm font-semibold text-slate-800">
                    Gộp {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}
                  </Text>
                  <TouchableOpacity onPress={() => setIsMergeModalVisible(false)} className="p-1">
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Nguồn */}
                <View className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl mt-3 flex-row justify-between items-center">
                  <Text className="text-xs text-emerald-850 font-medium">Nguồn (sẽ giải phóng): <Text className="font-bold">{activeTable.name}</Text></Text>
                  <Badge variant="success" label="Đang chọn" size="sm" />
                </View>

                {/* Tìm kiếm đích */}
                <View className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 mt-3 flex-row items-center">
                  <Ionicons name="search-outline" size={16} color="#94a3b8" />
                  <TextInput
                    placeholder={`Tìm ${shopVertical === 'lodging' ? 'phòng' : shopVertical === 'sports_court' ? 'sân' : 'bàn'} đang hoạt động để gộp...`}
                    placeholderTextColor="#cbd5e1"
                    className="flex-1 ml-2 text-xs font-semibold text-slate-800"
                    value={mergeSearchQuery}
                    onChangeText={setMergeSearchQuery}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>

                <ScrollView className="flex-1 my-3" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {(() => {
                    const targets = tables.filter(t => {
                      const isActive = t.status === 'playing' || t.status === 'occupied';
                      const matchesSearch = !mergeSearchQuery.trim() || (t.name && t.name.toLowerCase().includes(mergeSearchQuery.toLowerCase()));
                      return t.id !== activeTable.id && isActive && matchesSearch;
                    });

                    if (targets.length === 0) {
                      return (
                        <View className="items-center justify-center py-10">
                          <Ionicons name="sad-outline" size={36} color="#cbd5e1" />
                          <Text className="text-xs text-slate-400 font-medium mt-2">Không có {shopVertical === 'lodging' ? 'phòng' : shopVertical === 'sports_court' ? 'sân' : 'bàn'} đang sử dụng khác khả dụng</Text>
                        </View>
                      );
                    }

                    return (
                      <View className="flex-row flex-wrap gap-2.5 pt-1">
                        {targets.map(t => (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => {
                              setConfirmTransferMerge({
                                visible: true,
                                type: 'merge',
                                sourceTable: activeTable,
                                targetTable: t,
                                includeStayCost: true,
                                loading: false,
                              });
                            }}
                            className="w-[48%] bg-orange-50/40 border border-orange-100 p-3.5 rounded-2xl items-center active:bg-orange-50 active:border-orange-250"
                          >
                            <Ionicons name={shopVertical === 'lodging' ? "bed-outline" : "ellipse-outline"} size={20} color="#fa5908" />
                            <Text className="text-xs font-bold text-slate-800 mt-1.5">{t.name}</Text>
                            <Text className="text-[9px] text-orange-600 font-semibold mt-1">Đang hoạt động</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })()}
                </ScrollView>
              </Pressable>
            </View>
          )}

          {/* OVERLAY XÁC NHẬN CHUYỂN / GỘP PHÒNG */}
          {confirmTransferMerge.visible && confirmTransferMerge.sourceTable && confirmTransferMerge.targetTable && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, elevation: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable className="absolute inset-0" onPress={() => setConfirmTransferMerge(prev => ({ ...prev, visible: false }))} />
              <Pressable onPress={() => {}} className="w-[88%] max-w-sm rounded-[28px] p-6 bg-white items-center relative" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 15 }}>
                
                {/* Icon & Title */}
                <View className="bg-orange-50 p-4 rounded-full mb-4 items-center justify-center border border-orange-100">
                  <Ionicons name={confirmTransferMerge.type === 'transfer' ? "swap-horizontal" : "git-merge-outline"} size={32} color="#fa5908" />
                </View>
                
                <Text className="text-base font-semibold text-slate-800 text-center leading-tight mb-3">
                  {confirmTransferMerge.type === 'transfer' ? `Xác nhận chuyển ${resNouns.noun}` : `Xác nhận gộp ${resNouns.noun}`}
                </Text>

                {/* Flow Diagram: Source -> Target */}
                <View className="flex-row items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 w-full mb-4">
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">{resNouns.Noun} gốc</Text>
                    <Text className="text-sm font-bold text-slate-800 mt-0.5">{confirmTransferMerge.sourceTable.name}</Text>
                  </View>
                  <Ionicons name="arrow-forward-outline" size={18} color="#94a3b8" className="mx-2" />
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">{resNouns.Noun} đích</Text>
                    <Text className="text-sm font-bold text-slate-800 mt-0.5">{confirmTransferMerge.targetTable.name}</Text>
                  </View>
                </View>

                {/* Items & Stay Cost Details */}
                <View className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl p-3 mb-4">
                  {/* F&B Items list */}
                  <Text className="text-[10px] text-slate-450 font-bold uppercase mb-2">Dịch vụ & món ăn chuyển đi:</Text>
                  {(() => {
                    const sourceCartItems = Object.values(tableCarts[confirmTransferMerge.sourceTable.id] || {}).filter((item: any) => item.productId !== 'TIME_CHARGE');
                    if (sourceCartItems.length === 0) {
                      return <Text className="text-xs text-slate-400 font-semibold italic mb-2">Không có dịch vụ/món ăn đi kèm</Text>;
                    }
                    return (
                      <View className="mb-2">
                        {sourceCartItems.slice(0, 3).map((item: any, idx: number) => (
                          <Text key={idx} className="text-xs text-slate-600 font-semibold mb-1" numberOfLines={1}>
                            • {item.quantity} x {item.name}
                          </Text>
                        ))}
                        {sourceCartItems.length > 3 && (
                          <Text className="text-[10px] text-slate-400 font-medium italic mt-0.5 ml-2">
                            ...và {sourceCartItems.length - 3} món khác
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* Stay Cost Info */}
                  {(() => {
                    const sourceBilling = calculateBilling(confirmTransferMerge.sourceTable);
                    if (!sourceBilling || sourceBilling.cost === 0) return null;
                    return (
                      <View className="border-t border-slate-100 pt-2 mt-2">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-xs text-slate-500 font-semibold">{shopVertical === 'lodging' ? 'Tiền phòng' : 'Tiền giờ'} tạm tính:</Text>
                          <Text className="text-xs font-bold text-slate-800">{formatCurrency(sourceBilling.cost)}</Text>
                        </View>
                        <Text className="text-[10px] text-slate-400 font-medium mt-0.5">({sourceBilling.label} - {sourceBilling.details})</Text>
                      </View>
                    );
                  })()}
                </View>

                {/* Option to waive/charge stay cost (only if there is stay cost > 0) */}
                {(() => {
                  const sourceBilling = calculateBilling(confirmTransferMerge.sourceTable);
                  if (!sourceBilling || sourceBilling.cost === 0) return null;
                  
                  return (
                    <View className="w-full bg-orange-50/30 border border-orange-100/60 rounded-2xl p-3 mb-5">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <Text className="text-xs font-bold text-slate-800">
                            {confirmTransferMerge.type === 'transfer' ? 'Giữ giờ vào gốc' : (shopVertical === 'lodging' ? 'Cộng dồn tiền phòng' : 'Cộng dồn tiền giờ')}
                          </Text>
                          <Text className="text-[10px] text-slate-450 font-medium leading-relaxed mt-0.5">
                            {confirmTransferMerge.type === 'transfer' 
                              ? `Giữ nguyên giờ vào từ ${resNouns.noun} cũ sang ${resNouns.noun} mới`
                              : `Tính ${shopVertical === 'lodging' ? 'tiền phòng' : 'tiền giờ'} của ${resNouns.noun} cũ đến hiện tại và thêm vào hoá đơn ${resNouns.noun} mới`}
                          </Text>
                        </View>
                        <Switch
                          value={confirmTransferMerge.includeStayCost}
                          onValueChange={(val) => setConfirmTransferMerge(prev => ({ ...prev, includeStayCost: val }))}
                        />
                      </View>
                      
                      {!confirmTransferMerge.includeStayCost && (
                        <View className="mt-2 pt-2 border-t border-orange-150/40 flex-row items-start">
                          <Feather name="alert-triangle" size={11} color="#ef4444" style={{ marginTop: 1, marginRight: 4 }} />
                          <Text className="flex-1 text-[10px] text-red-500 font-semibold italic">
                            Bỏ chọn sẽ MIỄN PHÍ {shopVertical === 'lodging' ? 'tiền phòng' : 'tiền giờ'} của {resNouns.noun} gốc.
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Actions */}
                <View className="flex-row gap-3 w-full">
                  <TouchableOpacity
                    disabled={confirmTransferMerge.loading}
                    onPress={() => setConfirmTransferMerge(prev => ({ ...prev, visible: false }))}
                    className="flex-1 bg-slate-100 border border-slate-200/60 py-3 rounded-2xl items-center justify-center active:opacity-70"
                  >
                    <Text className="text-xs font-bold text-slate-600">Hủy bỏ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={confirmTransferMerge.loading}
                    onPress={async () => {
                      try {
                        setConfirmTransferMerge(prev => ({ ...prev, loading: true }));
                        
                        if (confirmTransferMerge.type === 'transfer') {
                          await handleTransferTable(
                            confirmTransferMerge.sourceTable.id,
                            confirmTransferMerge.targetTable.id,
                            confirmTransferMerge.includeStayCost
                          );
                          setIsTransferModalVisible(false);
                        } else {
                          await handleMergeTable(
                            confirmTransferMerge.sourceTable.id,
                            confirmTransferMerge.targetTable.id,
                            confirmTransferMerge.includeStayCost
                          );
                          setIsMergeModalVisible(false);
                        }
                        
                        setConfirmTransferMerge(prev => ({ ...prev, visible: false, loading: false }));
                        setActiveTable(null); // Close main detail modal
                      } catch (err) {
                        console.error('Lỗi khi chuyển/gộp phòng:', err);
                        setConfirmTransferMerge(prev => ({ ...prev, loading: false }));
                      }
                    }}
                    className="flex-[1.3] bg-orange-600 py-3 rounded-2xl items-center justify-center active:opacity-90 flex-row gap-1.5"
                  >
                    {confirmTransferMerge.loading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                        <Text className="text-xs font-bold text-white">Xác nhận</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

              </Pressable>
            </View>
          )}
          <PosDialogHost active={!!activeTable} />
        </KeyboardAvoidingView>
      </Modal>

      {/* 7. MODAL GIỎ HÀNG & THANH TOÁN CHI TIẾT */}
      <CartCheckoutModal
        visible={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        cart={cart}
        updateCartItemQuantity={updateCartItemQuantity}
        removeFromCart={removeFromCart}
        getCartTotal={getCartTotal}
        discountAmount={discountAmount}
        setDiscountAmount={setDiscountAmount}
        orderNote={orderNote}
        setOrderNote={setOrderNote}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        customersList={customersList}
        setCustomersList={setCustomersList}
        paymentRows={paymentRows}
        setPaymentRows={setPaymentRows}
        paymentFundsList={paymentFundsList}
        paymentMethodsList={paymentMethodsList}
        productsList={productsList}
        getCartCount={getCartCount}
        shopId={activeShopId}
        isOnline={isOnline}
        apiBaseUrl={getApiBaseUrl()}
        apiHeaders={apiAuthHeaders}
        loading={isPayingTableLoading || isPayingCartLoading}
        cartOwnerTable={cartOwnerTable}
        shopVertical={shopVertical}
        lockedTimeCharge={cartOwnerTable ? lockedTimeCharge : undefined}
        onCheckout={(opts) => handlePayCart(selectedCustomer, discountAmount, orderNote, paymentRows, opts)}
        onUpdateTime={(type, iso) => cartOwnerTable?.id && handleUpdateTableTime(cartOwnerTable.id, type, iso)}
        onEditItemSave={(cartItemId, finalPrice, originalPriceFromModal, discountAmt, discountPct) => {
          const resolveBasePrice = (item: any) => {
            if (item.original_price != null && item.original_price > 0) return item.original_price;
            const origProd = productsList.find(p => p.id === item.productId);
            if (origProd && Number(origProd.sell_price) > 0) return Number(origProd.sell_price);
            return item.price;
          };

          if (activeTable) {
            setTableCarts((prev: any) => {
              const tableCart = prev[activeTable.id] || {};
              const item = tableCart[cartItemId];
              if (!item) return prev;
              
              const basePrice = resolveBasePrice(item);
              const actualDiscountAmt = Math.max(0, basePrice - finalPrice);
              
              return {
                ...prev,
                [activeTable.id]: {
                  ...tableCart,
                  [cartItemId]: {
                    ...item,
                    original_price: basePrice,
                    price: finalPrice,
                    discount_amount: actualDiscountAmt,
                    discount_pct: discountPct,
                  }
                }
              };
            });
          } else {
            setCart((prev: any) => {
              const item = prev[cartItemId];
              if (!item) return prev;
              
              const basePrice = resolveBasePrice(item);
              const actualDiscountAmt = Math.max(0, basePrice - finalPrice);
              
              return {
                ...prev,
                [cartItemId]: {
                  ...item,
                  original_price: basePrice,
                  price: finalPrice,
                  discount_amount: actualDiscountAmt,
                  discount_pct: discountPct,
                }
              };
            });

            // Also sync to tableCarts when paying for a table (activeTable is null but cartOwnerTable is set)
            if (cartOwnerTable) {
              setTableCarts((prev: any) => {
                const tableCart = prev[cartOwnerTable.id] || {};
                const item = tableCart[cartItemId];
                if (!item) return prev;

                const basePrice = resolveBasePrice(item);
                const actualDiscountAmt = Math.max(0, basePrice - finalPrice);

                return {
                  ...prev,
                  [cartOwnerTable.id]: {
                    ...tableCart,
                    [cartItemId]: {
                      ...item,
                      original_price: basePrice,
                      price: finalPrice,
                      discount_amount: actualDiscountAmt,
                      discount_pct: discountPct,
                    }
                  }
                };
              });
            }
          }
        }}
      />

      {/* 8. MODAL DYNAMIC QR CODE THANH TOÁN CHUYỂN KHOẢN */}
      <QRTransferModal
        visible={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        qrPayload={qrPayload as any}
        paymentFundsList={paymentFundsList}
        onConfirm={() => {
          setIsQrModalOpen(false);
          showToast('Đã xác nhận thanh toán chuyển khoản thành công!', 'success');
        }}
      />

      {/* Toast Notification Overlay */}
      <PosToast toastMsg={(!!activeTable || !!isCartModalOpen || !!isQrModalOpen || !!isTableOpenDialogVisible) ? null : toastMsg} toastOpacity={toastOpacity} />


      {/* Premium Saving & Cloud Syncing Glass Overlay */}
      {isSavingCart && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.65)', zIndex: 99999, justifyContent: 'center', alignItems: 'center' }}>
          <View className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl flex-row items-center shadow-2xl">
            <ActivityIndicator size="small" color="#f97316" />
            <Text className="text-white text-xs font-semibold ml-3">Đang đồng bộ món ăn lên Cloud...</Text>
          </View>
        </View>
      )}

      {/* Drawer Hamburger Sidebar */}
      <DrawerMenu
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        branchName="Chi nhánh chính"
      />

      {/* Modal Mở ca làm việc POS khi Checkout */}
      <Modal
        visible={isShiftModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsShiftModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center px-6">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setIsShiftModalOpen(false)}
          />
          <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 relative">
            <View className="items-center mb-4">
              <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
                <Ionicons name="wallet-outline" size={24} color="#fa5908" />
              </View>
              <Text className="text-base font-bold text-slate-800 text-center">Mở ca làm việc POS</Text>
              <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
                Hệ thống đang bật chế độ Quản lý ca. Bạn cần khai báo số tiền mặt hiện có trong két trước khi thanh toán.
              </Text>
            </View>

            <View className="mb-6">
              <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Số tiền mặt đầu ca
              </Text>
              <View className="relative flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                <TextInput
                  value={openingCashInput}
                  onChangeText={(val) => {
                    const num = val.replace(/\D/g, '');
                    setOpeningCashInput(num ? Number(num).toLocaleString('vi-VN') : '0');
                  }}
                  keyboardType="numeric"
                  className="flex-1 text-center text-lg font-bold text-slate-800"
                  placeholder="0"
                  style={{
                    paddingVertical: 0,
                    textAlignVertical: 'center',
                    lineHeight: undefined,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                  }}
                />
                <Text className="text-sm font-semibold text-slate-400 ml-2">đ</Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 items-center"
                onPress={() => setIsShiftModalOpen(false)}
                disabled={isShiftLoading}
              >
                <Text className="text-slate-500 font-semibold text-xs">Hủy bỏ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
                onPress={handleShiftOpenConfirm}
                disabled={isShiftLoading}
              >
                {isShiftLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-semibold text-xs">Xác nhận</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {shopVertical !== 'retail' && (
        <ConflictResolutionModal
          visible={!!tableConflict}
          conflict={tableConflict}
          tableName={tableConflict ? (tables.find(t => t.id === tableConflict.tableId)?.name || '') : ''}
          onResolve={async (action) => {
            // Errors propagate to the modal's confirmation step, which shows the server's message
            await resolveTableConflict(action);
            showToast('Đã xử lý xung đột.', 'success');
          }}
          onDismiss={dismissTableConflict}
        />
      )}
      {shopVertical !== 'retail' && (
        <TableSyncInboxModal
          visible={isTableSyncInboxOpen && tableSync.inbox.length > 0}
          items={tableSync.inbox}
          tableNameOf={tableNameOfSession}
          itemNameOf={itemNameOfSession}
          onResolve={async (ids) => {
            await tableSync.resolveInbox(ids);
            showToast('Đã gỡ các thao tác bị từ chối khỏi máy này.', 'success');
          }}
          onClose={() => {
            setIsTableSyncInboxOpen(false);
            // Legacy (pre-v2) conflicts share the same button: show them next
            if (pendingConflictTableIds.length > 0) void openPendingConflict();
          }}
        />
      )}

      {/* Mở bàn xong → giữ sơ đồ bàn mờ tối trong lúc chuyển sang màn chi tiết bàn (không nháy sơ đồ) */}
      <TableOpenHandoffDim visible={tableOpenHandoff} />

      {/* Hộp thoại dùng chung khi không có Modal nào đang mở */}
      <PosDialogHost />
    </SafeAreaView>
    </PosDialogProvider>
  );
}

/** Dimmed layer under the modals during the "Nhận bàn" → table detail hand-off; fades out afterwards. */
function TableOpenHandoffDim({ visible }: { visible: boolean }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, opacity]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', opacity, zIndex: 99998, elevation: 99 }}
    />
  );
}
