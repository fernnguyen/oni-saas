import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform, Animated, ActivityIndicator, Alert, Pressable, KeyboardAvoidingView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import * as Haptics from 'expo-haptics';
import { formatCurrency, maskCurrencyInput, parseCurrencyToNumber } from '../../lib/utils/format';
import { calculateHourlyBilling } from '@oni/core';

// Import hệ thống component dùng chung
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DrawerMenu } from '../../components/erp/DrawerMenu';
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal';
import { ProductPreviewModal } from '../../components/pos/ProductPreviewModal';
import CartCheckoutModal from '../../components/pos/CartCheckoutModal';
import QRTransferModal from '../../components/pos/QRTransferModal';

import { LodgingGuest, LodgingGuestsForm } from '../../components/pos/LodgingGuestsForm';
import { PosDatePicker } from '../../components/pos/PosDatePicker';
import { PosToast } from '../../components/pos/PosToast';
import { useCart } from '../../hooks/pos/useCart';
import { usePosData } from '../../hooks/pos/usePosData';
import { useTableManager } from '../../hooks/pos/useTableManager';
import { usePosToast } from '../../hooks/pos/usePosToast';
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

  const [isSavingCart, setIsSavingCart] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);



  // Tìm kiếm Nhanh & Phân trang Lazy Load
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);

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
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
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
        employee_name: userEmail.split('@')[0],
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

  // States cho nghiệp vụ phòng/bàn/sân nâng cao & CRM

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
    syncActiveTableSession
  } = useTableManager({
    tables, setTables, shopVertical, activeShopId,
    showToast, setCart, setDiscountAmount, setOrderNote, setSelectedCustomer, setIsPreviewModalOpen,
    isNavReady, isLoading, checkIsQrPayment, currentUserEmail, productsList, paymentFundsList,
    customersList, selectedCustomer, setPaymentRows, handleCheckoutPress, setIsCartModalOpen, setQrPayload, setIsQrModalOpen,
  });

  // Tự động đồng bộ số tiền thanh toán mặc định khi giỏ hàng hoặc giảm giá thay đổi
  useEffect(() => {
    if (!isNavReady) return;
    const finalTotal = Math.max(0, getCartTotal() - discountAmount);
    setPaymentRows([
      { id: '1', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: finalTotal }
    ]);
  }, [cart, discountAmount, isNavReady, paymentFundsList]);

  // Tải dữ liệu thực tế & trạng thái tạm khi màn hình POS nhận focus
  useFocusEffect(
    useCallback(() => {
      if (!isNavReady) return;
      let isMounted = true;
      loadPosData(isMounted);
      return () => {
        isMounted = false;
      };
    }, [isNavReady])
  );

  // Kéo đồng bộ lại sơ đồ phòng bàn từ Cloud
  const handleRefresh = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    setIsLoading(true);
    if (Platform.OS !== 'web') {
      try {
        const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const activeTenantId = await AsyncStorage.getItem('active_tenant_id') || 'default-tenant';
        await SyncManager.pullFullDatabase(activeShopId, activeTenantId, () => { });
      } catch (syncErr) {
        console.warn('Lỗi đồng bộ SQLite đầu ca khi làm mới:', syncErr);
      }
    }
    await loadPosData(true);
  };
  const handlePayCart = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: string; fund_id: string; amount: number }[],
    debtRepayOpts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string }
  ) => {
    const originalTotal = getCartTotal();
    const finalTotal = Math.max(0, originalTotal - discount);



    if (cartOwnerTable) {
      await handlePayTableConfirmUnified(customer, discount, note, payments);
      return;
    }
    setIsPayingCartLoading(true);
    try {
      const debtRepay = debtRepayOpts?.debtRepayAmount || 0;
      const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalAmountDue = finalTotal + debtRepay;
      const cashChange = Math.max(0, paidSum - totalAmountDue);
      let processedPayments = [...payments];
      if (cashChange > 0) {
        const defaultCashFund = paymentFundsList.find(f => f.type === 'cash' && f.is_default === 'TRUE') || paymentFundsList.find(f => f.type === 'cash') || paymentFundsList[0];
        processedPayments.push({
          id: 'change-' + Date.now(),
          method: 'cash',
          fund_id: defaultCashFund?.id || '',
          amount: -cashChange
        });
      }
      const netPaidSum = processedPayments.reduce((sum, p) => sum + p.amount, 0);
      const orderPaidAmt = Math.min(finalTotal, Math.max(0, netPaidSum - debtRepay));
      const orderDebtAmt = Math.max(0, finalTotal - orderPaidAmt);

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

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const orderId = `ORD-R-${Date.now()}`;
      const orderNo = `HD-R-${Date.now().toString().substring(9)}`;
      const nowStr = new Date().toISOString();

      if (Platform.OS !== 'web') {
        await db.insert(schema.orders).values({
          id: orderId,
          order_no: orderNo,
          status: 'completed',
          customer_id: customer ? customer.id : null,
          customer_name: customer ? customer.name : 'Khách mua lẻ',
          total_amount: finalTotal,
          paid_amount: orderPaidAmt,
          payment_method: paymentMethodString,
          created_at: nowStr,
          shift_id: shiftId,
          sync_status: 'pending',
          note: note,
          discount_amount: discount,
        });

        for (const [cartItemId, item] of Object.entries(cart)) {
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-${cartItemId}`,
            order_id: orderId,
            product_id: item.productId,
            product_name: item.name,
            qty: item.quantity,
            unit_price: (item.price + (item.modifier_total || 0)),
            line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
          });

          const originalProd = productsList.find(p => p.id === item.productId);
          if (originalProd) {
            const newStock = Math.max(0, originalProd.stock_qty - item.quantity);
            await db
              .update(schema.products)
              .set({ stock_qty: newStock })
              .where(eq(schema.products.id, item.productId));
          }
        }

        const updatedProds = await db.select().from(schema.products);
        setProductsList(updatedProds);
      }

      // Thu nợ cũ kèm đơn hàng — thử sync trực tiếp để lấy server order_no
      const debtShopId = await AsyncStorage.getItem('active_shop_id') || '';
      const currentUrl = isOnline ? getApiBaseUrl() : null;

      // Thử sync-batch trực tiếp để lấy server order_no cho note cashbook
      let serverOrderNo = orderNo; // fallback là local orderNo
      if (currentUrl && debtShopId) {
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
                customer_id: customer ? customer.id : '',
                customer_name: customer ? customer.name : 'Khách mua lẻ',
                branch_id: debtShopId,
                employee_id: currentUserEmail,
                subtotal: finalTotal + discountAmount,
                discount_amount: discountAmount,
                tax_amount: 0,
                total_amount: finalTotal,
                paid_amount: orderPaidAmt,
                debt_amount: orderDebtAmt,
                note: note || '',
              },
              items: Object.entries(cart).map(([cartItemId, item]: [string, any]) => ({
                product_id: item.productId,
                product_name: item.name,
                qty: item.quantity,
                unit_price: item.price + (item.modifier_total || 0),
                discount_amount: 0,
                line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
              })),
              payments: processedPayments.map(p => {
                const fund = paymentFundsList.find((f: any) => f.id === p.fund_id);
                return { method: p.method, amount: p.amount, fund_id: p.fund_id, meta: { fund_id: p.fund_id, fund_name: fund ? fund.name : '' } };
              }),
              stock_movements: Object.entries(cart).map(([, item]: [string, any]) => ({
                type: 'sale_out',
                product_id: item.productId,
                qty: -item.quantity,
                branch_id: debtShopId,
              })),
            }),
          });

          if (directSyncRes.ok) {
            const syncData = await directSyncRes.json().catch(() => ({}));
            if (syncData.order_no) serverOrderNo = syncData.order_no;
            // Mark as synced in SQLite
            if (Platform.OS !== 'web' && syncData.order_id) {
              const serverId = syncData.order_id;
              if (serverId !== orderId) {
                await db.update(schema.order_items)
                  .set({ order_id: serverId })
                  .where(eq(schema.order_items.order_id, orderId));
              }
              await db.update(schema.orders)
                .set({ id: serverId, order_no: syncData.order_no || orderNo, sync_status: 'synced', reference_no: orderId })
                .where(eq(schema.orders.id, orderId));
            }
          }
        } catch (syncErr) {
          console.warn('[POS] Sync trực tiếp thất bại, sẽ queue:', syncErr);
          // Fallback: push via SyncManager queue
          if (Platform.OS !== 'web') {
            setTimeout(() => SyncManager.pushOfflineOrders(debtShopId), 800);
          }
        }
      } else if (Platform.OS !== 'web') {
        // Offline: queue to sync later
        setTimeout(() => SyncManager.pushOfflineOrders(debtShopId || shopId), 800);
      }

      setCart({});
      setDiscountAmount(0);
      setOrderNote('');
      setSelectedCustomer(null);
      setIsCartModalOpen(false);


      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

      // Tắt trạng thái Loading thanh toán bán lẻ
      setIsPayingCartLoading(false);

      // Hiển thị QR thanh toán hoặc Toast báo thành công bằng server ID
      const hasTransfer = processedPayments.some(p => checkIsQrPayment(p.method) && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = processedPayments.filter(p => checkIsQrPayment(p.method)).reduce((sum, p) => sum + p.amount, 0);
        const transferP = processedPayments.find(p => checkIsQrPayment(p.method) && p.amount > 0);
        setQrPayload({ amount: transferAmount, orderNo: serverOrderNo, fund_id: transferP ? transferP.fund_id : 'bank' });
        setIsQrModalOpen(true);
      } else {
        if (serverOrderNo !== orderNo) {
          showToast(`Đã thanh toán Hóa đơn ${serverOrderNo} thành công!`, 'success');
        } else {
          showToast(`Đã thanh toán Hóa đơn ngoại tuyến ${orderNo} thành công! Sẽ đồng bộ sau.`, 'info');
        }
      }

      // Ghi cashbook debt_collection với server order_no (hoặc local nếu offline)
      if (debtRepay > 0 && customer && customer.id && currentUrl && debtShopId) {
        try {
          await fetch(`${currentUrl}/api/shops/${debtShopId}/cashbook`, {
            method: 'POST',
            headers: { ...(apiAuthHeaders || {}), 'Content-Type': 'application/json' },
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
            })
          });
        } catch (e) {
          console.warn('[POS] Không gửi được debt_collection:', e);
        }
      }
    } catch (err) {
      console.error('Lỗi khi thanh toán đơn lẻ SQLite:', err);
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
    if (productsList.length === 0) {
      showToast('Không có sản phẩm nào trong SQLite để quét.', 'error');
      setIsScannerOpen(false);
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

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      setIsScanSuccessDialogVisible(true);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
      if (Platform.OS === 'web') {
        alert(`Không tìm thấy sản phẩm có mã vạch hoặc SKU: "${barcodeData}"`);
      } else {
        Alert.alert(
          'Không tìm thấy sản phẩm',
          `Không tìm thấy sản phẩm nào khớp với mã vạch hoặc SKU: "${barcodeData}"`,
          [{ text: 'Đóng' }]
        );
      }
    }
  };

  const handleConfirmAddScanned = () => {
    if (scannedProductInfo) {
      addToCart(scannedProductInfo);
    }
    setIsScanSuccessDialogVisible(false);
    setScannedProductInfo(null);
  };

  // Lọc sp
  const filteredProducts = productsList.filter(p => {
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const matchesSearch = !productSearchQuery.trim() ||
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const displayedProducts = filteredProducts.slice(0, displayLimit);
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
              className={`mr-3 px-4 py-2 rounded-xl flex-row items-center border ${activeVertical === 'retail' ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-200'}`}
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
              <Text className={`font-semibold text-tiny ${activeVertical === 'retail' ? 'text-white' : 'text-slate-600'}`}>
                {getFirstTabLabel()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              className={`px-4 py-2 rounded-xl flex-row items-center border ${activeVertical !== 'retail' ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-200'}`}
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
              <Text className={`font-semibold text-tiny ${activeVertical !== 'retail' ? 'text-white' : 'text-slate-600'}`}>
                {
                  shopVertical === 'fnb' ? 'Sơ đồ Bàn' :
                    shopVertical === 'sports_court' ? 'Sơ đồ Sân' :
                      shopVertical === 'lodging' ? 'Sơ đồ Phòng' :
                        'Bàn Bi-a (Giờ)'
                }
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 3. CHI TIẾT NỘI DUNG */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          {/* Skeleton.Text equivalent using raw inline styles */}
          <View style={{ width: '100%', marginBottom: 32 }}>
            {Array.from({ length: 4 }).map((_, idx) => (
              <View
                key={idx}
                style={{
                  width: idx === 3 ? '60%' : '100%',
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: '#e2e8f0',
                  marginBottom: idx < 3 ? 12 : 0
                }}
              />
            ))}
          </View>
          {/* Skeleton blocks equivalent */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: '48%',
                  height: 160,
                  borderRadius: 12,
                  backgroundColor: '#e2e8f0',
                  marginBottom: 16
                }}
              />
            ))}
          </View>
        </View>
      ) : activeVertical === 'retail' ? (
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
                    setIsSavingCart(true);
                    // 1. Lưu món vào phòng/bàn cục bộ
                    setTableCarts(prev => ({
                      ...prev,
                      [cartOwnerTable.id]: cart
                    }));

                    // 2. Đồng bộ trực tuyến lên server nếu có mạng
                    if (cartOwnerTable.current_order_id) {
                      await syncOrderItemsOnline(cartOwnerTable.current_order_id, cart);
                    }

                    setCart({});
                    setCartOwnerTable(null);
                    setActiveVertical(shopVertical);
                    setIsSavingCart(false);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                    showToast("Đã lưu và đồng bộ món thành công!", "success");
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
                  Tất cả ({productsList.length})
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
              className="bg-white border border-slate-200 p-2 rounded-xl active:bg-slate-100 ml-2"
              style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
            >
              <Ionicons name="sync" size={14} color="#fa5908" />
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
            {filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl mt-2">
                <Ionicons name="basket-outline" size={32} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy sản phẩm nào.</Text>
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
          <Text className="text-xxs font-semibold text-slate-450 mb-3 px-1">
            {
              shopVertical === 'fnb' ? 'Sơ đồ bàn Cafe hoạt động' :
                shopVertical === 'sports_court' ? 'Sơ đồ sân thể thao / sân bóng' :
                  shopVertical === 'lodging' ? 'Sơ đồ phòng homestay / khách sạn' :
                    'Sơ đồ bàn bi-a ngoại tuyến'
            }
          </Text>

          {tables.length === 0 ? (
            <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl">
              <Ionicons name="football-outline" size={36} color="#cbd5e1" />
              <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy bàn nào.</Text>
            </View>
          ) : (
            <View className="pb-28">
              {Object.entries(groupedZones).map(([zoneName, zoneTables]) => (
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

                  {/* Grid phòng bàn trong Khu vực */}
                  <View className="flex-row flex-wrap justify-between">
                    {zoneTables.map(t => {
                      const isActive = t.status === 'playing' || t.status === 'occupied';
                      const billing = calculateBilling(t);
                      const cartItemsCount = tableCarts[t.id] ? Object.values(tableCarts[t.id]).reduce((sum, item) => sum + item.quantity, 0) : 0;
                      const guestName = tableCustomers[t.id]?.name || t.customerName || 'Khách lẻ';

                      return (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.85}
                          className={`w-[48%] mb-4 rounded-2xl border ${isActive
                              ? ''
                              : 'bg-white border-slate-200'
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
                              borderColor: 'rgba(244, 63, 94, 0.25)', // border-rose-300 mờ sang trọng
                              backgroundColor: 'rgba(255, 241, 242, 0.65)', // bg-rose-50 mờ cực dịu mắt
                            } : {}
                          ]}
                          onPress={() => handleTablePress(t)}
                        >
                          {/* Stripe màu trên cùng */}
                          <View className={`h-1 w-full ${isActive ? 'bg-rose-500' : 'bg-emerald-500'}`} />

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
                                  {formatCurrency(t.hourly_rate)}/h
                                </Text>
                              </View>

                              {shopVertical === 'lodging' && (
                                <View className="flex-row items-center">
                                  <Ionicons name="moon-outline" size={10} color="#94a3b8" />
                                  <Text className="text-xxs text-slate-455 font-medium ml-1">
                                    {formatCurrency(t.hourly_rate * 3 || 200000)}/đêm
                                  </Text>
                                </View>
                              )}
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
                                  backgroundColor: 'rgba(244, 63, 94, 0.05)', // bg-rose-50 mờ nhạt
                                  borderColor: 'rgba(244, 63, 94, 0.15)', // border-rose-200 mờ nhạt
                                }}
                              >
                                <Text className="text-[8.5px] text-rose-700 font-semibold">
                                  ⏱️ Đã dùng: {billing.hours}h {billing.minutes}m
                                </Text>
                                <Text className="text-xxs text-rose-700 font-semibold mt-0.5">
                                  💵 Tiền giờ: {formatCurrency(billing.cost)}
                                </Text>
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

                            {/* Nút Trạng thái ở đáy card */}
                            <View className={`w-full py-2 rounded-lg items-center justify-center border ${isActive ? 'bg-rose-100/30 border-rose-200' : 'bg-slate-50 border-slate-200'
                              }`}>
                              <Text className={`text-tiny font-semibold ${isActive ? 'text-rose-600' : 'text-emerald-600'
                                }`} numberOfLines={1}>
                                {isActive ? guestName : 'Trống'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Nút refresh thủ công để kéo dữ liệu SQLite */}
              <View className="items-center justify-center mt-4 mb-20 px-2">
                <TouchableOpacity
                  activeOpacity={0.8}
                  className="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-xl flex-row items-center justify-center w-full"
                  onPress={handleRefresh}
                >
                  <Ionicons name="refresh-circle-outline" size={20} color="#fa5908" />
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
            <View className="bg-orange-50 p-2.5 rounded-xl mr-3 relative border border-orange-100">
              <Ionicons name="cart" size={18} color="#fa5908" />
              <View className="absolute -top-1 -right-1 items-center justify-center border border-white" style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fa5908' }}>
                <Text className="text-xxs text-white font-semibold text-center leading-none">{getCartCount()}</Text>
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
                setIsSavingCart(true);
                // 1. Lưu vào bàn/phòng cục bộ
                setTableCarts(prev => ({
                  ...prev,
                  [cartOwnerTable.id]: cart
                }));

                // 2. Đồng bộ trực tuyến lên server nếu có mạng
                if (cartOwnerTable.current_order_id) {
                  await syncOrderItemsOnline(cartOwnerTable.current_order_id, cart);
                }

                setCart({});
                setCartOwnerTable(null);
                setActiveVertical(shopVertical);
                setIsSavingCart(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
                showToast("Đã lưu và đồng bộ món thành công!", "success");
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
                  {selectedTableForOpen && (
                    <View className="bg-orange-50 border border-orange-100 p-4 rounded-2xl mb-4">
                      <Text className="text-tiny text-orange-700 font-medium">Hình thức hoạt động:</Text>
                      <Text className="text-orange-950 font-semibold text-sm mt-1">
                        Tính phí theo thời gian sử dụng
                      </Text>
                      <Text className="text-tiny text-slate-500 mt-2 font-semibold">
                        💵 Đơn giá: {formatCurrency(selectedTableForOpen.hourly_rate)}/{shopVertical === 'lodging' ? 'ngày' : 'giờ'}
                      </Text>
                    </View>
                  )}

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
                            paddingVertical: 0,
                            textAlignVertical: 'center',
                            lineHeight: undefined,
                            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                          }}
                        />
                        {customerSearchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                            <Ionicons name="close" size={14} color="#cbd5e1" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Danh sách gợi ý */}
                    {customerSearchQuery.trim().length > 0 && (
                      <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                        <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                          {customersList
                            .filter(c => {
                              const nameStr = (c.name || '').toLowerCase();
                              const phoneStr = (c.phone || '');
                              const queryStr = customerSearchQuery.toLowerCase();
                              return nameStr.includes(queryStr) || phoneStr.includes(queryStr);
                            })
                            .map(cust => (
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
                    )}
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
          </View>
        </KeyboardAvoidingView>
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
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScannedReal}
        title="Quét mã sản phẩm"
        placeholder="Nhập mã sản phẩm hoặc SKU..."
      />

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
                      await syncActiveTableSession(activeTable);
                      setIsSyncingTableSession(false);
                      showToast("Đã đồng bộ dữ liệu phòng mới nhất từ Cloud!", "success");
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
                    <View className="bg-orange-50 border border-orange-100 p-4 rounded-xl mb-4">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xxs text-slate-455 font-semibold">Phí dịch vụ giờ lẻ:</Text>
                        <Badge variant="primary" label={formatCurrency(activeTable.hourly_rate) + '/' + (shopVertical === 'lodging' ? 'ngày' : 'giờ')} size="sm" />
                      </View>
                      <Text className="text-orange-500 text-3xl font-semibold mt-1.5">
                        {formatCurrency(calculateBilling(activeTable).cost)}
                      </Text>
                      <Text className="text-[9.5px] text-slate-500 mt-3 font-semibold leading-relaxed">
                        ⏱️ Nhận lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                      </Text>
                    </View>

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
                              paddingVertical: 0,
                              textAlignVertical: 'center',
                              lineHeight: undefined,
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                            }}
                          />
                          {customerSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                              <Ionicons name="close" size={14} color="#cbd5e1" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Danh sách gợi ý khách hàng ngay trong modal chi tiết phòng */}
                        {customerSearchQuery.trim().length > 0 && (
                          <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-32 overflow-hidden z-50">
                            <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                              {customersList
                                .filter(c => {
                                  const nameStr = (c.name || '').toLowerCase();
                                  const phoneStr = (c.phone || '');
                                  const queryStr = customerSearchQuery.toLowerCase();
                                  return nameStr.includes(queryStr) || phoneStr.includes(queryStr);
                                })
                                .map(cust => (
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
                                ))
                              }
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    )}

                    {/* CHI TIẾT MÓN / DỊCH VỤ ĐÃ GỌI KÈM */}
                    {tableCarts[activeTable.id] && Object.keys(tableCarts[activeTable.id]).length > 0 ? (
                      <View className="mb-4">
                        <Text className="text-tiny text-slate-400 font-medium mb-2">Món ăn / Dịch vụ đã gọi:</Text>
                        <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-32 overflow-hidden">
                          <ScrollView nestedScrollEnabled={true}>
                            {Object.entries(tableCarts[activeTable.id]).map(([cartItemId, item]) => (
                              <View key={cartItemId} className="flex-row justify-between items-center py-2 border-b border-slate-100 last:border-0">
                                <Text className="text-xs font-semibold text-slate-700 flex-1 mr-2" numberOfLines={1}>{item.name}</Text>

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
                                  <Text className="text-xs font-bold text-slate-800 min-w-[70px] text-right ml-1">
                                    {formatCurrency((item.price + (item.modifier_total || 0)) * item.quantity)}
                                  </Text>

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
                          </ScrollView>
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
                          showToast(`Chức năng Đổi ${label} đang đồng bộ với Cloud.`);
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
                          showToast(`Chức năng Gộp ${label} đang đồng bộ với Cloud.`);
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
        onCheckout={(opts) => {
          handlePayCart(selectedCustomer, discountAmount, orderNote, paymentRows, opts);
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
      <PosToast toastMsg={toastMsg} toastOpacity={toastOpacity} />


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
