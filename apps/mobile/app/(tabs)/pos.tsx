import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform, Animated, ActivityIndicator, Alert, Pressable, KeyboardAvoidingView, DeviceEventEmitter } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { getSystemTaxGroups } from '../../lib/utils/tax';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { formatCurrency, maskCurrencyInput, parseCurrencyToNumber } from '../../lib/utils/format';
import { formatResourceStartTime, getResourceBillingPresentationForResource } from '../../lib/utils/resource-billing-presentation';
import { allowsProductNegativeStock, buildQuickCreateMetadata, calculateHourlyBilling, isTimeChargeProduct, isSystemTimeChargeProduct } from '@oni/core';

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

import { LodgingGuest, LodgingGuestsForm } from '../../components/pos/LodgingGuestsForm';
import { PosDatePicker } from '../../components/pos/PosDatePicker';
import { PosDateTimePicker } from '../../components/pos/PosDateTimePicker';
import { PosToast } from '../../components/pos/PosToast';
import { useCart } from '../../hooks/pos/useCart';
import { usePosData } from '../../hooks/pos/usePosData';
import { useTableManager } from '../../hooks/pos/useTableManager';
import { usePosToast } from '../../hooks/pos/usePosToast';
import { usePermissions } from '../../lib/auth/PermissionsContext';
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
  } = useCart(isNavReady, isLoading);

  const [editingCartItem, setEditingCartItem] = useState<{ tableId?: string, cartItemId: string, item: any, fromCartModal?: boolean } | null>(null);

  // Premium Toast Notification state
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ message, type });
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
        type === 'error' ? Haptics.NotificationFeedbackType.Error :
          Haptics.NotificationFeedbackType.Warning
    ).catch(() => { });

    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
    ]).start(() => setToastMsg(null));
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
    // Kích hoạt state để useEffect bên dưới xử lý auto-refresh
    if (payload?.tableId && syncTableSilentRef.current) {
      syncTableSilentRef.current(payload.tableId);
    } else {
      setSyncTriggerTick(prev => prev + 1);
    }
  });

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
    handleUpdateTableTime
  } = useTableManager({
    tables, setTables, shopVertical, activeShopId,
    showToast, setCart, setDiscountAmount, setOrderNote, setSelectedCustomer, setIsPreviewModalOpen,
    isNavReady, isLoading, isOnline, checkIsQrPayment, currentUserEmail, productsList, paymentFundsList,
    customersList, selectedCustomer, setPaymentRows, handleCheckoutPress, setIsCartModalOpen, setQrPayload, setIsQrModalOpen,
    broadcastSync,
  });

  // State thêm nhanh khách hàng cho sơ đồ phòng bàn
  const { hasPermission } = usePermissions();
  const canModifyOrders = hasPermission(['orders.edit', 'orders.update', 'owner', 'admin']);

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
      loadPosData(true);
      if (activeTable) {
        syncActiveTableSession(activeTable);
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
    debtRepayOpts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string; customCheckoutTime?: Date; rentalType?: 'hourly' | 'overnight' | 'daily' }
  ) => {
    const originalTotal = getCartTotal();
    let finalTotal = Math.max(0, originalTotal - discount);



    if (cartOwnerTable) {
      // Pass cart directly as overrideCartItems since triggerPayTable copies tableCarts→cart
      // and all edits in CartCheckoutModal go to cart (activeTable is null at this point)
      await handlePayTableConfirmUnified(customer, discount, note, payments, debtRepayOpts?.customCheckoutTime, debtRepayOpts?.rentalType, cart);
      return;
    }
    setIsPayingCartLoading(true);
    try {
      const { isTaxPeriodLocked } = await import('../../lib/utils/tax');
      const isLocked = await isTaxPeriodLocked(debtRepayOpts?.customCheckoutTime || new Date());
      if (isLocked) {
        Alert.alert(
          'Kỳ thuế đã khóa',
          'Thời điểm thanh toán nằm trong kỳ thuế đã bị khóa sổ. Không thể tạo hóa đơn mới!'
        );
        setIsPayingCartLoading(false);
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
              onPress={() => setActiveVertical(!['retail', 'fashion'].includes(shopVertical) ? shopVertical : 'billiards')}
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
              accessibilityLabel="Quản lý phòng bàn"
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

          {/* BANNER GỌI MÓN PHÒNG BAN CHUYÊN DỤNG */}
          {cartOwnerTable && (
            <View className="bg-orange-50 border border-orange-200 p-3.5 rounded-xl flex-row justify-between items-center mb-3">
              <View className="flex-row items-center flex-1 mr-4">
                <Ionicons name="fast-food" size={16} color="#fa5908" />
                <Text className="text-xs font-semibold text-slate-800 ml-2" numberOfLines={1}>
                  Đang chọn món cho: <Text className="text-orange-600 font-medium">{cartOwnerTable.name}</Text>
                </Text>
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-slate-200 border border-slate-300 px-2.5 py-1 rounded-lg active:scale-95"
                  onPress={() => {
                    // Hủy chọn món
                    setCart({});
                    setCartOwnerTable(null);
                    setActiveVertical(shopVertical);
                  }}
                >
                  <Text className="text-xxs font-semibold text-slate-600">Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  className="bg-orange-500 border border-orange-600 px-3 py-1 rounded-lg active:scale-95"
                  onPress={async () => {
                    if (!cartOwnerTable) return;
                    
                    const targetTable = cartOwnerTable;
                    const targetCart = cart;

                    // 1. Lưu món vào phòng/bàn cục bộ lập tức (Offline-First)
                    setTableCarts(prev => ({
                      ...prev,
                      [targetTable.id]: targetCart
                    }));

                    // Reset trạng thái giỏ hàng & chuyển màn hình ngay lập tức (Zero-Lag)
                    setCart({});
                    setCartOwnerTable(null);
                    setActiveVertical(shopVertical);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                    
                    // Thông báo lưu local thành công & đang sync
                    showToast(`Đã lưu món vào ${targetTable.name}! Đang đồng bộ...`, "info");

                    // 2. Đồng bộ trực tuyến lên server ở chế độ nền
                    if (targetTable.current_order_id) {
                      (async () => {
                        try {
                          const success = await syncOrderItemsOnline(targetTable.current_order_id, targetCart, targetTable.id);
                          if (success) {
                            showToast(`Đã đồng bộ món ăn cho ${targetTable.name} thành công!`, "success");
                          } else {
                            showToast(`Lỗi đồng bộ trực tuyến, món ăn đã được lưu cục bộ tại ${targetTable.name}.`, "error");
                          }
                        } catch (err) {
                          console.error('Lỗi khi đồng bộ nền món phòng bàn:', err);
                          showToast(`Mất kết nối, món ăn đã được lưu cục bộ tại ${targetTable.name}.`, "error");
                        }
                      })();
                    }
                  }}
                >
                  <Text className="text-xxs font-semibold text-white">Lưu món</Text>
                </TouchableOpacity>
              </View>
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
                {displayedProducts.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.85}
                    className="w-[48%] mb-4 p-3 rounded-2xl border bg-white border-slate-100 justify-between active:scale-[0.98]" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
                    onPress={() => addToCart(p)}
                  >
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

                      <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100">
                        <Ionicons name="add" size={11} color="#fa5908" />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // 🎱 PHÂN HỆ ĐẶC THÙ PHÒNG BÀN (BI-A / CAFE / SÂN / PHÒNG NGHỈ)
        <ScrollView className="flex-1 px-4 pt-3" showsVerticalScrollIndicator={false}>
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
                <Text className={`text-[11px] font-medium ${tableSortMode === 'last_checkout' ? 'text-indigo-700' : 'text-slate-500'}`}>Xoay vòng phòng</Text>
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
                        const cartItemsCount = tableCarts[t.id] ? Object.values(tableCarts[t.id]).reduce((sum, item) => sum + item.quantity, 0) : 0;
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
                                  <View className="flex-row items-center mt-1">
                                    <Ionicons name="person-outline" size={12} color="#94a3b8" />
                                    <Text className="text-xs text-slate-500 ml-1 mr-3">{isActive ? guestName : `${t.capacity || '4'} người`}</Text>
                                    {isActive && (
                                      <View className="flex-row items-center">
                                        <Ionicons name="time-outline" size={12} color="#94a3b8" />
                                        <Text className="text-xs text-slate-500 ml-1">{billing.label}</Text>
                                      </View>
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
                                {isActive && tableBillingPresentation.showCost && (
                                  <Text className="text-rose-600 font-semibold text-sm mt-1.5">{formatCurrency(billing.cost)}</Text>
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
                                    💵 Tạm tính: {formatCurrency(billing.cost)}
                                  </Text>
                                )}
                                {cartItemsCount > 0 && (
                                  <Text
                                    className="text-xxs text-slate-550 font-semibold mt-0.5 pt-0.5 border-t"
                                    style={{ borderTopColor: 'rgba(244, 63, 94, 0.15)' }}
                                  >
                                    🍴 Đã gọi: {cartItemsCount} món
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
      {getCartCount() > 0 && activeVertical === 'retail' && (
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
            onPress={async () => {
              if (cartOwnerTable) {
                const targetTable = cartOwnerTable;
                const targetCart = cart;

                // 1. Lưu vào bàn/phòng cục bộ lập tức
                setTableCarts(prev => ({
                  ...prev,
                  [targetTable.id]: targetCart
                }));

                // Reset trạng thái giỏ hàng & chuyển màn hình ngay lập tức
                setCart({});
                setCartOwnerTable(null);
                setActiveVertical(shopVertical);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                showToast(`Đã lưu món vào ${targetTable.name}! Đang đồng bộ...`, "info");

                // 2. Đồng bộ trực tuyến lên server ở chế độ nền
                if (targetTable.current_order_id) {
                  (async () => {
                    try {
                      const success = await syncOrderItemsOnline(targetTable.current_order_id, targetCart, targetTable.id);
                      if (success) {
                        showToast(`Đã đồng bộ món ăn cho ${targetTable.name} thành công!`, "success");
                      } else {
                        showToast(`Lỗi đồng bộ trực tuyến, món ăn đã được lưu cục bộ tại ${targetTable.name}.`, "error");
                      }
                    } catch (err) {
                      console.error('Lỗi khi đồng bộ nền món phòng bàn:', err);
                      showToast(`Mất kết nối, món ăn đã được lưu cục bộ tại ${targetTable.name}.`, "error");
                    }
                  })();
                }
              } else {
                handleCheckoutPress(() => {
                  setIsCartModalOpen(true);
                });
              }
            }}
            icon={<Ionicons name={cartOwnerTable ? "save" : "arrow-forward"} size={12} color="white" />}
            iconPosition="right"
            title={cartOwnerTable ? "Lưu vào phòng/bàn" : "Thanh toán"}
            className="rounded-xl px-4"
          />
        </View>
      )}

      {/* CÁC DIALOG XÁC NHẬN SANG TRỌNG - RÚT GỌN CARD BO TRÒN rounded-2xl */}
      {/* 5.5. MODAL MỞ BÀN / CHECK-IN PHÒNG KHÁCH SẠN */}
      <Modal
        visible={isTableOpenDialogVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTableOpenDialogVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setIsTableOpenDialogVisible(false)}
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
                    ? `Nhận ${shopVertical === 'fnb' ? 'Bàn' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'lodging' ? 'Phòng' : 'Bàn'} - ${selectedTableForOpen.name}`
                    : 'Nhận vị trí mới'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsTableOpenDialogVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
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

            {/* Actions Footer */}
            <View className="flex-row gap-3 border-t border-slate-100 pt-4 bg-white">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={() => setIsTableOpenDialogVisible(false)}
                className="flex-1 py-3 rounded-xl"
              />

              <Button
                variant="primary"
                title={shopVertical === 'lodging' ? 'Nhận phòng' : 'Bắt đầu sử dụng'}
                onPress={handleConfirmOpenTable}
                className="flex-[2] py-3 rounded-xl"
              />
            </View>



            {renderQuickCustomerModal('open_table')}
          </View>
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
                Phòng đang ở trạng thái chờ dọn dẹp. Bạn có muốn đánh dấu phòng này là đã dọn dẹp xong và sẵn sàng đón khách không?
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
        onRequestClose={() => setActiveTable(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setActiveTable(null)}
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
                        showToast("Đã đồng bộ dữ liệu phòng mới nhất từ Cloud!", "success");
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
                  <TouchableOpacity onPress={() => setActiveTable(null)} className="p-1.5 rounded-lg active:bg-slate-100">
                    <Ionicons name="close" size={24} color="#64748b" />
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
                    {/* Tình trạng tiền giờ */}
                    {(() => {
                      const billing = calculateBilling(activeTable);
                      let activeMeta: any = {};
                      try {
                        activeMeta = activeTable.metadata
                          ? (typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : activeTable.metadata)
                          : {};
                      } catch (e) {}
                      const billingPresentation = getResourceBillingPresentationForResource(
                        shopVertical,
                        { ...activeTable, metadata: activeMeta }
                      );
                      const rateLabel = billingPresentation.rateBadgeLabel ||
                        (billingPresentation.rate > 0 && billingPresentation.rateUnit
                          ? `${formatCurrency(billingPresentation.rate)}/${billingPresentation.rateUnit}`
                          : 'Chưa cấu hình đơn giá');

                      return (
                        <View className="bg-orange-50 border border-orange-100 p-4 rounded-xl mb-4">
                          <View className="flex-row justify-between items-center">
                            <Text className="text-xxs text-slate-455 font-semibold">
                              {billingPresentation.title}
                            </Text>
                            <Badge variant="primary" label={rateLabel} size="sm" />
                          </View>
                          <Text
                            selectable
                            className="text-orange-500 text-3xl font-semibold mt-1.5"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {billingPresentation.showCost ? formatCurrency(billing.cost) : billing.label}
                          </Text>
                          <Text className="text-[9px] text-orange-700/70 font-semibold mt-0.5">
                            {billingPresentation.showCost ? 'Tạm tính đến hiện tại' : 'Thời gian sử dụng'}
                          </Text>

                          <View className="mt-3 pt-3 border-t border-orange-100 gap-2">
                            <TouchableOpacity 
                              activeOpacity={0.7} 
                              onPress={() => {
                                setTableTimePickerType('checkin');
                                setIsTableTimePickerOpen(true);
                              }}
                              className="flex-row justify-between items-center gap-3 p-1 -mx-1 rounded-lg active:bg-orange-200/50"
                            >
                              <Text className="text-[9.5px] text-slate-500 font-semibold">Giờ vào</Text>
                              <View className="flex-row items-center flex-1 justify-end">
                                <Text
                                  selectable
                                  className="text-[9.5px] text-slate-700 font-semibold text-right"
                                  style={{ fontVariant: ['tabular-nums'] }}
                                >
                                  {formatResourceStartTime(activeTable.startTime)}
                                </Text>
                                <Ionicons name="pencil" size={10} color="#94a3b8" style={{ marginLeft: 4 }} />
                              </View>
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                              activeOpacity={0.7} 
                              onPress={() => {
                                setTableTimePickerType('checkout');
                                setIsTableTimePickerOpen(true);
                              }}
                              className="flex-row justify-between items-center gap-3 p-1 -mx-1 rounded-lg active:bg-orange-200/50"
                            >
                              <Text className="text-[9.5px] text-slate-500 font-semibold">Giờ ra</Text>
                              <View className="flex-row items-center flex-1 justify-end">
                                <Text
                                  selectable
                                  className="text-[9.5px] text-slate-700 font-semibold text-right"
                                  style={{ fontVariant: ['tabular-nums'] }}
                                >
                                  {(() => {
                                    try {
                                      const m = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
                                      if (m.temp_checkout_time) return formatResourceStartTime(m.temp_checkout_time);
                                    } catch(e) {}
                                    return '- (Chưa kết thúc)';
                                  })()}
                                </Text>
                                <Ionicons name="pencil" size={10} color="#94a3b8" style={{ marginLeft: 4 }} />
                              </View>
                            </TouchableOpacity>

                            {billingPresentation.showCost && (
                              <View className="flex-row justify-between items-start gap-3 p-1 -mx-1">
                                <Text className="text-[9.5px] text-slate-500 font-semibold">Thời gian tính</Text>
                                <Text
                                  selectable
                                  className="text-[9.5px] text-slate-700 font-semibold text-right flex-1"
                                  style={{ fontVariant: ['tabular-nums'] }}
                                >
                                  {billing.label}
                                </Text>
                              </View>
                            )}
                            <View className="flex-row justify-between items-start gap-3 p-1 -mx-1">
                              <Text className="text-[9.5px] text-slate-500 font-semibold">Hình thức</Text>
                              <Text className="text-[9.5px] text-slate-700 font-semibold text-right flex-1">
                                {billingPresentation.methodLabel}
                              </Text>
                            </View>
                          </View>
                          {billingPresentation.showCost && billing.details ? (
                            <Text className="text-[9px] text-slate-400 mt-1 italic font-medium">
                              {billing.details}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })()}

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
                        <Text className="text-tiny text-slate-400 font-medium mb-2">Món ăn / Dịch vụ đã gọi:</Text>
                        <View className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          {Object.entries(tableCarts[activeTable.id]).map(([cartItemId, item]) => (
                            <View 
                              key={cartItemId} 
                              className="flex-row justify-between items-center py-2 border-b border-slate-100 last:border-0"
                            >
                              <Text className="text-xs font-semibold text-slate-700 flex-1 mr-2" numberOfLines={1}>
                                {item.name}
                                {((item as any).original_price != null && Number(item.price) !== Number((item as any).original_price) || Number((item as any).discount_amount || 0) > 0) && (
                                  <Text className="text-orange-500 font-bold ml-1 text-[10px]"> *</Text>
                                )}
                              </Text>

                              <View className="flex-row items-center gap-2">
                                {/* Nút giảm số lượng */}
                                <TouchableOpacity
                                  onPress={() => handleDecreaseTableItemQty(activeTable.id, cartItemId)}
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
                                  onPress={() => handleRemoveTableItem(activeTable.id, cartItemId)}
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
                          // Đồng bộ giỏ hàng và khóa bàn
                          setCart(tableCarts[activeTable.id] || {});
                          setCartOwnerTable(activeTable);
                          setActiveVertical('retail'); // Switch to product catalog
                          setActiveTable(null); // Close this modal
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
                          const confirmCancel = Platform.OS === 'web'
                            ? window.confirm("Bạn có chắc chắn muốn Hủy và giải phóng phòng này?")
                            : await new Promise<boolean>((resolve) => {
                              Alert.alert(
                                "Xác nhận Hủy phòng",
                                "Tất cả thông tin sử dụng và dịch vụ hiện tại sẽ bị xóa sạch. Bạn có chắc chắn muốn giải phóng phòng trống?",
                                [
                                  { text: "Không", onPress: () => resolve(false), style: "cancel" },
                                  { text: "Đồng ý", onPress: () => resolve(true), style: "destructive" }
                                ]
                              );
                            });

                          if (!confirmCancel) return;

                          try {
                            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
                            let syncSucceeded = false;

                            // 1. Đồng bộ cục bộ (Offline-First)
                            if (Platform.OS === 'web') {
                              setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, status: 'available', startTime: null } : t));
                            } else {
                              if (activeTable.current_order_id) {
                                await db.delete(schema.orders).where(eq(schema.orders.id, activeTable.current_order_id));
                                await db.delete(schema.order_items).where(eq(schema.order_items.order_id, activeTable.current_order_id));
                              }
                              await db
                                .update(schema.location_resources)
                                .set({ status: 'available', startTime: null, current_order_id: null })
                                .where(eq(schema.location_resources.id, activeTable.id));
                              const updated = await db.select().from(schema.location_resources);
                              setTables(updated);
                            }

                            // 2. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng
                            try {
                              const currentUrl = getApiBaseUrl();
                              const headers = await getApiHeaders();

                              // A. Hủy order in_progress trên Next.js Server
                              if (activeTable.current_order_id) {
                                await fetch(`${currentUrl}/api/shops/${shopId}/orders/${activeTable.current_order_id}/cancel`, {
                                  method: 'POST',
                                  headers: { ...headers, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ reason: 'Hủy từ di động' })
                                });
                              }

                              // B. Patch trạng thái bàn về available
                              const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  status: 'available',
                                  current_order_id: '',
                                  startTime: null
                                }),
                              });
                              if (patchRes.ok) {
                                syncSucceeded = true;
                              }
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
                              showToast("Hủy đơn & Giải phóng phòng/bàn thành công!", "success");
                            } else {
                              showToast("Giải phóng phòng/bàn ngoại tuyến thành công!", "info");
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

              {/* Hàng nút thanh toán chính */}
              <View className="flex-row justify-between gap-3 border-t border-slate-100 pt-4 bg-white">
                {activeTableTab === 'billing' || shopVertical !== 'lodging' ? (
                  <Button
                    variant="primary"
                    title="Thanh toán & Trả phòng"
                    icon={<Ionicons name="card-outline" size={16} color="white" />}
                    onPress={() => triggerPayTable(activeTable)}
                    className="flex-1 py-3.5 rounded-xl"
                  />
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
                  {confirmTransferMerge.type === 'transfer' ? 'Xác nhận chuyển phòng' : 'Xác nhận gộp phòng'}
                </Text>

                {/* Flow Diagram: Source -> Target */}
                <View className="flex-row items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 w-full mb-4">
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">Phòng gốc</Text>
                    <Text className="text-sm font-bold text-slate-800 mt-0.5">{confirmTransferMerge.sourceTable.name}</Text>
                  </View>
                  <Ionicons name="arrow-forward-outline" size={18} color="#94a3b8" className="mx-2" />
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">Phòng đích</Text>
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
                          <Text className="text-xs text-slate-500 font-semibold">Tiền phòng tạm tính:</Text>
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
                            {confirmTransferMerge.type === 'transfer' ? 'Giữ giờ vào gốc' : 'Cộng dồn tiền phòng'}
                          </Text>
                          <Text className="text-[10px] text-slate-450 font-medium leading-relaxed mt-0.5">
                            {confirmTransferMerge.type === 'transfer' 
                              ? 'Giữ nguyên giờ check-in từ phòng cũ sang phòng mới'
                              : 'Tính tiền phòng cũ đến hiện tại và thêm vào bill phòng mới'}
                          </Text>
                        </View>
                        <Switch
                          value={confirmTransferMerge.includeStayCost}
                          onValueChange={(val) => setConfirmTransferMerge(prev => ({ ...prev, includeStayCost: val }))}
                        />
                      </View>
                      
                      {!confirmTransferMerge.includeStayCost && (
                        <View className="mt-2 pt-2 border-t border-orange-150/40">
                          <Text className="text-[10px] text-red-500 font-semibold italic">
                            ⚠️ Bỏ chọn sẽ MIỄN PHÍ tiền phòng cũ (bỏ qua chi phí lưu trú của phòng gốc).
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
    </SafeAreaView>
  );
}
