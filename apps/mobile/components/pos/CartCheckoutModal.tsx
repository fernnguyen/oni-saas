import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Platform, Modal, Alert, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';

interface CartCheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  cart: Record<string, any>;
  updateCartItemQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  getCartTotal: () => number;
  discountAmount: number;
  setDiscountAmount: (val: number) => void;
  orderNote: string;
  setOrderNote: (val: string) => void;
  selectedCustomer: any;
  setSelectedCustomer: (val: any) => void;
  customersList: any[];
  paymentRows: {id: string; method: string; fund_id: string; amount: number}[];
  setPaymentRows: React.Dispatch<React.SetStateAction<any[]>>;
  paymentFundsList: any[];
  productsList: any[];
  getCartCount: () => number;
  onCheckout: (opts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string }) => void; // Called to trigger final payment or show QR
  // Tích hợp realtime khách hàng
  shopId?: string;
  isOnline?: boolean;
  apiBaseUrl?: string;
  apiHeaders?: Record<string, string>;
  loading?: boolean;
  paymentMethodsList?: any[];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

export function maskCurrencyInput(value: string): string {
  const numericStr = value.replace(/[^0-9]/g, '');
  if (!numericStr) return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(numericStr, 10));
}

export function parseCurrencyToNumber(value: string): number {
  return parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt', icon: 'cash-outline', color: '#10b981' },
  { value: 'bank_transfer', label: 'Chuyển khoản', icon: 'business-outline', color: '#3b82f6' },
  { value: 'card', label: 'Thẻ ATM / POS', icon: 'card-outline', color: '#6366f1' },
  { value: 'momo', label: 'Ví MoMo', icon: 'wallet-outline', color: '#ec4899' },
  { value: 'debt', label: 'Ghi nợ', icon: 'receipt-outline', color: '#ef4444' },
  { value: 'prepaid', label: 'Ví trả trước', icon: 'wallet-outline', color: '#f59e0b' },
];

export default function CartCheckoutModal(props: CartCheckoutModalProps) {
  const {
    visible, onClose, cart, updateCartItemQuantity, removeFromCart, getCartTotal,
    discountAmount, setDiscountAmount, orderNote, setOrderNote,
    selectedCustomer, setSelectedCustomer, customersList,
    paymentRows, setPaymentRows, paymentFundsList, productsList, getCartCount, onCheckout,
    shopId, isOnline = true, apiBaseUrl, apiHeaders, loading = false,
    paymentMethodsList = []
  } = props;

  const resolvedMethods = React.useMemo(() => {
    const list = paymentMethodsList && paymentMethodsList.length > 0
      ? paymentMethodsList
      : PAYMENT_METHODS;

    return list.map((m: any) => {
      const methodCode = m.code || m.value;
      const methodType = m.type;

      let icon = 'business-outline';
      let color = '#3b82f6';

      if (methodType === 'cash' || methodCode === 'cash') {
        icon = 'cash-outline';
        color = '#10b981';
      } else if (methodCode === 'card') {
        icon = 'card-outline';
        color = '#6366f1';
      } else if (methodCode === 'momo' || methodType === 'wallet') {
        icon = 'wallet-outline';
        color = '#ec4899';
      } else if (methodType === 'debt' || methodCode === 'debt') {
        icon = 'receipt-outline';
        color = '#ef4444';
      } else if (methodType === 'prepaid' || methodCode === 'prepaid') {
        icon = 'wallet-outline';
        color = '#f59e0b';
      }

      return {
        value: m.id || m.value,
        label: m.name || m.label,
        code: methodCode,
        type: methodType,
        icon,
        color
      };
    });
  }, [paymentMethodsList]);

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [selectingMethodRow, setSelectingMethodRow] = useState<{ rowId: string; idx: number } | null>(null);
  const [selectingFundRow, setSelectingFundRow] = useState<{ rowId: string; idx: number; matchingFunds: any[] } | null>(null);
  const [hidePrepaidSuggest, setHidePrepaidSuggest] = useState(false);
  const [hideDebtRepaySuggest, setHideDebtRepaySuggest] = useState(false);
  const [debtRepayAmount, setDebtRepayAmount] = useState(0);
  const [isEditingDebtRepay, setIsEditingDebtRepay] = useState(false);
  // Dữ liệu realtime khách hàng (chứa debt_amount, prepaid_balance cập nhật mới nhất)
  const [enrichedCustomer, setEnrichedCustomer] = useState<any>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  // Reset khi đổi khách
  React.useEffect(() => {
    setHidePrepaidSuggest(false);
    setHideDebtRepaySuggest(false);
    setDebtRepayAmount(0);
    setEnrichedCustomer(null);
  }, [selectedCustomer?.id]);

  // Tự động gán quỹ thực tế cho các dòng thanh toán chưa có quỹ hoặc đang dùng ID tạm 'cash'
  React.useEffect(() => {
    if (paymentFundsList && paymentFundsList.length > 0) {
      setPaymentRows(prev => {
        let changed = false;
        const next = prev.map(p => {
          if ((!p.fund_id || p.fund_id === 'cash') && p.method !== 'debt' && p.method !== 'prepaid') {
            const methodObj = resolvedMethods.find(m => m.value === p.method);
            const fundType = methodObj ? (methodObj.type || 'bank') : (p.method === 'cash' ? 'cash' : 'bank');
            const matching = paymentFundsList.filter(f => f.type === fundType);
            const defaultFund = matching.find(f => f.is_default === 'TRUE') || matching[0];
            if (defaultFund && defaultFund.id !== p.fund_id) {
              changed = true;
              return { ...p, fund_id: defaultFund.id };
            }
          }
          return p;
        });
        return changed ? next : prev;
      });
    }
  }, [paymentFundsList, resolvedMethods]);

  // Fetch realtime khi chọn khách và đang online
  React.useEffect(() => {
    if (!selectedCustomer?.id || !isOnline || !apiBaseUrl) return;
    let cancelled = false;
    setIsLoadingCustomer(true);
    // Đọc shopId trực tiếp từ AsyncStorage để tránh race condition với prop
    const doFetch = async () => {
      let resolvedShopId = shopId;
      if (!resolvedShopId) {
        try {
          resolvedShopId = (await AsyncStorage.getItem('active_shop_id')) || '';
        } catch {}
      }
      if (!resolvedShopId) {
        console.log('[CartCheckoutModal] shopId not available, skipping fetch');
        setIsLoadingCustomer(false);
        return;
      }
      const url = `${apiBaseUrl}/api/shops/${resolvedShopId}/customers/${selectedCustomer.id}`;
      console.log('[CartCheckoutModal] Fetching customer detail:', url);
      try {
        const res = await fetch(url, {
          headers: { ...(apiHeaders || {}), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
          cache: 'no-store' as RequestCache,
        });
        console.log('[CartCheckoutModal] Response status:', res.status);
        if (!res.ok || cancelled) { setIsLoadingCustomer(false); return; }
        const data = await res.json();
        console.log('[CartCheckoutModal] Customer data:', JSON.stringify({ debt: data.debt_amount, prepaid: data.prepaid_balance }));
        if (cancelled) return;
        const debt = data.debt_amount != null ? parseFloat(String(data.debt_amount)) : 0;
        const prepaid = data.prepaid_balance != null ? parseFloat(String(data.prepaid_balance)) : 0;
        setEnrichedCustomer({
          ...selectedCustomer,
          debt_amount: isNaN(debt) ? 0 : debt,
          prepaid_balance: isNaN(prepaid) ? 0 : prepaid,
          loyalty_points: parseFloat(String(data.loyalty_points ?? 0)) || 0,
        });
      } catch (err) {
        console.log('[CartCheckoutModal] Fetch error:', err);
      } finally {
        if (!cancelled) setIsLoadingCustomer(false);
      }
    };
    doFetch();
    return () => { cancelled = true; };
  }, [selectedCustomer?.id, isOnline, shopId, apiBaseUrl]);

  // Customer thực tế dùng cho hiển thị: ưu tiên enriched (realtime), fallback local
  const activeCustomer = enrichedCustomer || selectedCustomer;

  const finalTotal = Math.max(0, getCartTotal() - discountAmount);
  const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);

  // --- Debt & prepaid logic ---
  const customerDebt = Number(activeCustomer?.debt_amount || 0);
  const currentOrderDebtAmount = paymentRows
    .filter(p => p.method === 'debt')
    .reduce((s, p) => s + p.amount, 0);
  const prepaidBalance = Number(activeCustomer?.prepaid_balance || 0);

  // Tổng thực tế cần thu = đơn hàng + tiền trả nợ cũ thêm
  const clampedDebtRepay = Math.min(debtRepayAmount, customerDebt);
  const effectiveTotal = finalTotal + clampedDebtRepay;

  // Cảnh báo khi khách có nợ cũ (chưa được trả hết)
  const hasDebtWarning = !!activeCustomer && customerDebt > 0 && isOnline && !!enrichedCustomer;

  /**
   * Chọn quỹ thông minh để ghi cashbook trả nợ:
   * Ưu tiên payment row nào có amount >= debtRepay (không cần nhiều quỹ).
   * Nếu không có row đơn nào đủ → dùng row lớn nhất.
   */
  const selectDebtFund = (): { fund_id: string; method: string } => {
    const real = paymentRows.filter(r => r.method !== 'debt' && r.method !== 'prepaid');
    if (!real.length) return { fund_id: paymentRows[0]?.fund_id || '', method: paymentRows[0]?.method || 'cash' };
    const covering = real.filter(r => r.amount >= clampedDebtRepay);
    if (covering.length > 0) {
      const smallest = [...covering].sort((a, b) => a.amount - b.amount)[0];
      return { fund_id: smallest.fund_id, method: smallest.method };
    }
    const largest = [...real].sort((a, b) => b.amount - a.amount)[0];
    return { fund_id: largest.fund_id, method: largest.method };
  };

  const handlePressCheckout = () => {
    // 1. Kiểm tra khách lẻ (no selectedCustomer) dùng Ghi nợ hoặc Ví trả trước
    const hasDebt = paymentRows.some((p) => p.method === 'debt' && p.amount > 0);
    const hasPrepaid = paymentRows.some((p) => p.method === 'prepaid' && p.amount > 0);

    if (hasDebt && !selectedCustomer) {
      Alert.alert('Lỗi thanh toán', 'Phương thức Ghi nợ yêu cầu phải chọn Khách hàng.');
      return;
    }

    if (hasPrepaid && !selectedCustomer) {
      Alert.alert('Lỗi thanh toán', 'Phương thức Ví trả trước yêu cầu phải chọn Khách hàng.');
      return;
    }

    // 2. Kiểm tra số dư ví trả trước
    if (hasPrepaid && selectedCustomer) {
      const prepaidSpent = paymentRows
        .filter((p) => p.method === 'prepaid')
        .reduce((sum, p) => sum + p.amount, 0);
      const customerPrepaid = Number(activeCustomer?.prepaid_balance || 0);
      if (prepaidSpent > customerPrepaid) {
        Alert.alert(
          'Không đủ số dư ví',
          `Số dư Ví trả trước của khách chỉ còn ${formatCurrency(customerPrepaid)}, không đủ để thanh toán ${formatCurrency(prepaidSpent)}.`
        );
        return;
      }
    }

    // 3. Kiểm tra tổng số tiền đã trả
    if (paidSum < effectiveTotal) {
      Alert.alert(
        'Chưa đủ tiền',
        `Tổng cần thu (${formatCurrency(effectiveTotal)}) bao gồm ${formatCurrency(finalTotal)} tiền hàng${clampedDebtRepay > 0 ? ` + ${formatCurrency(clampedDebtRepay)} trả nợ cũ` : ''}. Khách mới trả ${formatCurrency(paidSum)}.`
      );
      return;
    }
    setIsConfirmVisible(true);
  };

  const methodNames = paymentRows.map(p => {
    const foundMethod = resolvedMethods.find(m => m.value === p.method || m.code === p.method);
    const methodName = foundMethod ? foundMethod.label : p.method;

    if (p.method === 'debt' || p.method === 'prepaid') {
      return methodName;
    }

    let fundType = 'bank';
    if (foundMethod) {
      fundType = foundMethod.type || 'bank';
    } else {
      if (p.method === 'cash') fundType = 'cash';
      else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(p.method)) fundType = 'wallet';
    }
    const matchingFunds = paymentFundsList.filter(f => f.type === fundType);
    const activeFund = paymentFundsList.find(f => f.id === p.fund_id) || matchingFunds[0];
    const fundName = activeFund ? `Quỹ ${activeFund.name}` : 'Chưa chọn quỹ';

    return `${methodName} (${fundName})`;
  }).join(' + ');

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={loading ? undefined : onClose}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={loading ? undefined : onClose}
          />
          <View className="h-[90%] rounded-t-2xl p-6 bg-white justify-between relative" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
            
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="wallet-outline" size={20} color="#fa5908" />
                <Text className="text-sm font-semibold text-slate-800 ml-2">
                  Thanh toán đơn hàng ({getCartCount()} món)
                </Text>
              </View>
              <TouchableOpacity onPress={loading ? undefined : onClose} disabled={loading} className="p-1">
                <Ionicons name="close" size={24} color={loading ? "#cbd5e1" : "#64748b"} />
              </TouchableOpacity>
            </View>

            {/* Thân Modal */}
            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              {/* 1. KHÁCH HÀNG (CRM) */}
              <View className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xxs font-semibold text-slate-400">Khách hàng</Text>
                  {!selectedCustomer && (
                    <Text className="text-xs font-medium text-slate-600">Khách lẻ</Text>
                  )}
                </View>

                {selectedCustomer ? (
                  <View>
                    <View className="bg-white border border-slate-200 rounded-xl p-3.5 flex-row justify-between items-center" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                      <View className="flex-1 mr-4">
                        <Text className="text-xs font-semibold text-slate-800">{selectedCustomer.name}</Text>
                        <Text className="text-tiny text-slate-500 font-medium mt-1">📞 {selectedCustomer.phone}</Text>
                        {selectedCustomer.address ? (
                          <Text className="text-[9.5px] text-slate-400 font-semibold mt-1">📍 {selectedCustomer.address}</Text>
                        ) : null}
                        {/* Realtime data: loading / offline / hiển thị */}
                        {isLoadingCustomer ? (
                          <View className="flex-row items-center mt-1.5">
                            <Ionicons name="sync-outline" size={11} color="#94a3b8" />
                            <Text className="text-tiny text-slate-400 ml-1">Đang tải thông tin...</Text>
                          </View>
                        ) : !isOnline && selectedCustomer ? (
                          <View className="flex-row items-center mt-1.5 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            <Ionicons name="cloud-offline-outline" size={11} color="#d97706" />
                            <Text className="text-tiny text-amber-700 ml-1 font-medium">
                              Ngoại tuyến — kết nối mạng để xem công nợ & điểm tích lũy
                            </Text>
                          </View>
                        ) : enrichedCustomer ? (
                          <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
                            {enrichedCustomer.debt_amount > 0 && (
                              <View className="flex-row items-center bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-md">
                                <Ionicons name="warning-outline" size={9} color="#f43f5e" />
                                <Text className="text-[9px] font-bold text-rose-600 ml-0.5">Nợ: {formatCurrency(enrichedCustomer.debt_amount)}</Text>
                              </View>
                            )}
                            {enrichedCustomer.prepaid_balance > 0 && (
                              <View className="flex-row items-center bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
                                <Ionicons name="wallet-outline" size={9} color="#10b981" />
                                <Text className="text-[9px] font-bold text-emerald-700 ml-0.5">Ví: {formatCurrency(enrichedCustomer.prepaid_balance)}</Text>
                              </View>
                            )}
                          </View>
                        ) : null}
                      </View>
                      <TouchableOpacity 
                        activeOpacity={0.7}
                        className={`bg-rose-50 p-2 rounded-xl border border-rose-100 items-center justify-center active:scale-95 ${loading ? 'opacity-50' : ''}`}
                        onPress={() => {
                          if (loading) return;
                          setSelectedCustomer(null);
                          setCustomerSearchQuery('');
                        }}
                        disabled={loading}
                      >
                        <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                      <Ionicons name="search-outline" size={14} color="#94a3b8" />
                      <TextInput
                        className="flex-1 ml-2 text-xs text-slate-800 py-1"
                        placeholder="Tìm khách hàng theo tên hoặc SĐT..."
                        placeholderTextColor="#cbd5e1"
                        value={customerSearchQuery}
                        onChangeText={setCustomerSearchQuery}
                        editable={!loading}
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
                  </>
                )}

                {/* Danh sách gợi ý */}
                {customerSearchQuery.trim().length > 0 && (
                  <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5}}>
                    <ScrollView nestedScrollEnabled={true}>
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

              {/* GỢI Ý VÍ TRẢ TRƯỚC — hiển thị khi khách có số dư */}
              {selectedCustomer && prepaidBalance > 0 && !hidePrepaidSuggest && (
                <View className="mb-4 flex-row items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <View className="flex-row items-center flex-1 min-w-0">
                    <Text className="text-base mr-1.5">💳</Text>
                    <Text className="text-tiny text-emerald-800 flex-1 leading-relaxed">
                      Khách có <Text className="font-bold">{formatCurrency(prepaidBalance)}</Text> ví trả trước. Sử dụng không?
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => {
                        if (loading) return;
                        const payAmount = Math.min(prepaidBalance, finalTotal);
                        const remaining = finalTotal - payAmount;
                        const rows: any[] = [{id: Date.now().toString(), method: 'prepaid', fund_id: '', amount: payAmount}];
                        if (remaining > 0) rows.push({id: (Date.now() + 1).toString(), method: 'cash', fund_id: '', amount: remaining});
                        setPaymentRows(rows);
                        setHidePrepaidSuggest(true);
                      }}
                      disabled={loading}
                      className={`bg-emerald-600 px-3 py-1.5 rounded-lg ${loading ? 'opacity-50' : ''}`}
                    >
                      <Text className="text-white text-tiny font-bold">Dùng ngay</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => !loading && setHidePrepaidSuggest(true)} disabled={loading} className="px-2 py-1.5">
                      <Ionicons name="close" size={14} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 2. CHI TIẾT SẢN PHẨM */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                {Object.entries(cart).map(([cartItemId, item], idx) => (
                  <View key={cartItemId} className={`py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    {/* Top Row: Name, Quantity, Total Price */}
                    <View className="flex-row justify-between items-start mb-1">
                      {/* Name & Modifiers */}
                      <View className="flex-1 pr-2">
                        <Text className="font-medium text-sm text-slate-800 leading-tight">{item.name}</Text>
                        {item.variant_label && (!item.modifiers || item.modifiers.length === 0) && (
                          <Text className="text-xs text-violet-600 font-medium mt-0.5">{item.variant_label}</Text>
                        )}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <Text className="text-xs text-amber-600 mt-0.5">
                            {item.modifiers.map((m: any) => m.option).join(' · ')}
                            {(item.modifier_total || 0) > 0 && (
                              <Text className="text-emerald-600 font-medium"> +{formatCurrency(item.modifier_total || 0)}</Text>
                            )}
                          </Text>
                        )}
                      </View>

                      <View className="flex-row items-center">
                        {/* Quantity Control */}
                        <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden mr-2">
                          <TouchableOpacity onPress={() => !loading && updateCartItemQuantity(cartItemId, item.quantity - 1)} disabled={loading} className="w-7 h-7 items-center justify-center border-r border-slate-200 bg-white active:bg-slate-100"><Text className="text-slate-600 font-medium">-</Text></TouchableOpacity>
                          <Text className="w-8 text-center text-xs font-semibold text-slate-800 bg-white" style={{lineHeight: 28}}>{item.quantity}</Text>
                          <TouchableOpacity onPress={() => !loading && updateCartItemQuantity(cartItemId, item.quantity + 1)} disabled={loading} className="w-7 h-7 items-center justify-center border-l border-slate-200 bg-white active:bg-slate-100"><Text className="text-slate-600 font-medium">+</Text></TouchableOpacity>
                        </View>

                        {/* Total Price */}
                        <View className="w-[85px] items-end">
                           <Text className="font-bold text-[15px] text-slate-800">{formatCurrency((item.price + (item.modifier_total || 0)) * item.quantity)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Bottom Row: Unit Price, Delete */}
                    <View className="flex-row justify-between items-center mt-1">
                      <Text className="text-xs text-slate-500 font-medium">
                        Đơn giá: {formatCurrency(item.price + (item.modifier_total || 0))} {productsList.find(pr => pr.id === item.productId)?.unit ? `/ ${productsList.find(pr => pr.id === item.productId)?.unit}` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => !loading && removeFromCart(cartItemId)} disabled={loading} className="p-1">
                        <Ionicons name="trash-outline" size={16} color="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* Hàng Giảm giá */}
                <TouchableOpacity 
                  className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200 mt-2 active:opacity-60"
                  onPress={() => !loading && setIsEditingDiscount(prev => !prev)}
                  disabled={loading}
                >
                  <Text className="text-xs text-slate-450 font-medium">Giảm giá (Chạm để sửa):</Text>
                  {isEditingDiscount ? (
                    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-0.5">
                      <TextInput
                        className="text-right text-xs font-semibold text-slate-800 w-28 py-0.5"
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#cbd5e1"
                        value={discountAmount === 0 ? '' : maskCurrencyInput(discountAmount.toString())}
                        onChangeText={(val) => {
                          const masked = maskCurrencyInput(val);
                          const amt = parseCurrencyToNumber(masked);
                          setDiscountAmount(amt);
                        }}
                        autoFocus={true}
                        editable={!loading}
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                        }}
                      />
                    </View>
                  ) : (
                    <Text className="text-xs text-rose-500 font-semibold">
                      -{formatCurrency(discountAmount)}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Hàng Tổng cộng */}
                <View className="flex-row justify-between items-center py-2.5 border-t border-slate-200">
                  <Text className="text-xs text-slate-800 font-semibold">Tổng cộng:</Text>
                  <Text className="text-orange-500 font-semibold text-base">
                    {formatCurrency(finalTotal)}
                  </Text>
                </View>
              </View>

              {/* 3. GHI CHÚ ĐƠN HÀNG */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Ionicons name="document-text-outline" size={14} color="#94a3b8" />
                  <TextInput
                    className="flex-1 ml-2 text-xs text-slate-800 py-1"
                    placeholder="Ghi chú đơn hàng ngoại tuyến..."
                    placeholderTextColor="#cbd5e1"
                    value={orderNote}
                    onChangeText={setOrderNote}
                    editable={!loading}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>
              </View>


              {/* NỢ CŨ — Nhắc nhở & trả kèm đơn (đặt sát phần thanh toán để dễ kiểm soát) */}
              {hasDebtWarning && !hideDebtRepaySuggest && (
                <View className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                  {/* Header */}
                  <View className="flex-row items-start justify-between mb-2.5">
                    <View className="flex-row items-center flex-1">
                      <Ionicons name="alert-circle" size={15} color="#e11d48" style={{marginTop: 1}} />
                      <View className="ml-2 flex-1">
                        <Text className="text-xs font-bold text-rose-800">Khách đang có nợ cũ</Text>
                        <Text className="text-[10px] text-rose-600 mt-0.5 leading-relaxed">
                          Còn <Text className="font-bold">{formatCurrency(customerDebt)}</Text> chưa thanh toán. Trả kèm đơn này?
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => !loading && setHideDebtRepaySuggest(true)} disabled={loading} className="p-1">
                      <Ionicons name="close" size={14} color="#9f1239" />
                    </TouchableOpacity>
                  </View>

                  {/* Input trả nợ */}
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[10px] text-rose-700 font-semibold w-[70px]">Trả nợ:</Text>
                    <View className="flex-1 bg-white border border-rose-200 rounded-lg px-2.5 py-1.5 flex-row items-center">
                      <TextInput
                        className="flex-1 text-sm font-bold text-rose-700 text-right"
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#fda4af"
                        value={debtRepayAmount === 0 ? '' : maskCurrencyInput(debtRepayAmount.toString())}
                        onChangeText={(val) => {
                          const amt = parseCurrencyToNumber(maskCurrencyInput(val));
                          setDebtRepayAmount(Math.min(amt, customerDebt));
                        }}
                        editable={!loading}
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none', padding: 0 } as any : { padding: 0 })
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      className={`bg-rose-600 px-2.5 py-1.5 rounded-lg ${loading ? 'opacity-50' : ''}`}
                      onPress={() => !loading && setDebtRepayAmount(customerDebt)}
                      disabled={loading}
                    >
                      <Text className="text-white text-[10px] font-bold">Trả hết</Text>
                    </TouchableOpacity>
                    {debtRepayAmount > 0 && (
                      <TouchableOpacity className="px-1.5 py-1.5" onPress={() => !loading && setDebtRepayAmount(0)} disabled={loading}>
                        <Ionicons name="close-circle" size={16} color="#be123c" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Tóm tắt nếu có nhập */}
                  {clampedDebtRepay > 0 && (
                    <View className="mt-2.5 pt-2.5 border-t border-rose-200 flex-row justify-between">
                      <View>
                        <Text className="text-[10px] text-rose-600">Tiền hàng</Text>
                        <Text className="text-xs font-semibold text-slate-700">{formatCurrency(finalTotal)}</Text>
                      </View>
                      <View className="items-center">
                        <Text className="text-[10px] text-rose-600">Trả nợ</Text>
                        <Text className="text-xs font-bold text-rose-700">+{formatCurrency(clampedDebtRepay)}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] text-rose-600 font-bold">Tổng cần thu</Text>
                        <Text className="text-sm font-bold text-rose-800">{formatCurrency(effectiveTotal)}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4 z-10" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, zIndex: 10}}>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xxs font-semibold text-slate-455">Phương thức thanh toán</Text>
                  {paymentFundsList.length > 0 && (
                    <TouchableOpacity 
                      className="flex-row items-center"
                      onPress={() => {
                        if (loading) return;
                        const METHODS = resolvedMethods;
                        const paidSumNow = paymentRows.reduce((sum, p) => sum + p.amount, 0);
                        const remaining = Math.max(0, effectiveTotal - paidSumNow);
                        
                        const usedMethods = new Set(paymentRows.map((p) => p.method));
                        const nextMethod = METHODS.find((m) => !usedMethods.has(m.value)) || METHODS[0];
                        
                        let fundType = 'bank';
                        if (nextMethod.type === 'cash' || nextMethod.code === 'cash') fundType = 'cash';
                        else if (nextMethod.type === 'wallet') fundType = 'wallet';
                        
                        const matchingFunds = paymentFundsList.filter(f => f.type === fundType);
                        const defaultFund = matchingFunds.find(f => f.is_default === 'TRUE') || matchingFunds[0];

                        setPaymentRows(prev => [
                          ...prev,
                          {id: Date.now().toString(), method: nextMethod.value, fund_id: defaultFund?.id || '', amount: remaining}
                        ]);
                      }}
                      disabled={loading}
                    >
                      <Ionicons name="add-circle-outline" size={13} color="#fa5908" />
                      <Text className="text-xs font-semibold text-orange-500 ml-1">+ Thêm</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {paymentFundsList.length === 0 ? (
                  <Text className="text-xs text-slate-500 italic">Vui lòng đồng bộ dữ liệu để lấy danh sách Quỹ.</Text>
                ) : (
                  paymentRows.map((row, idx) => {
                    const METHODS = resolvedMethods;
                    
                    const paidSumOfOthers = paymentRows.filter((_, i) => i !== idx).reduce((sum, p) => sum + p.amount, 0);
                    const remaining = Math.max(0, effectiveTotal - paidSumOfOthers);
                    
                    let fundType = 'bank';
                    const activeMethodObj = resolvedMethods.find(m => m.value === row.method);
                    if (activeMethodObj) {
                      fundType = activeMethodObj.type || 'bank';
                    } else {
                      if (row.method === 'cash') fundType = 'cash';
                      else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(row.method)) fundType = 'wallet';
                    }
                    
                    const matchingFunds = paymentFundsList.filter(f => f.type === fundType);
                    const activeFund = paymentFundsList.find(f => f.id === row.fund_id) || matchingFunds[0];

                    return (
                    <View key={row.id} className="mb-3.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200" style={{zIndex: paymentRows.length - idx}}>
                      
                      <View className="flex-row items-center justify-between">
                        {/* Chọn Method */}
                        <View style={{width: '45%'}}>
                          <TouchableOpacity 
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2.5 flex-row justify-between items-center"
                            onPress={() => {
                              if (loading) return;
                              setSelectingMethodRow({ rowId: row.id, idx });
                            }}
                            disabled={loading}
                          >
                            <Text className="text-xs font-semibold text-slate-700" numberOfLines={1}>
                              {METHODS.find(m => m.value === row.method)?.label || 'Chọn...'}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>

                        {/* Số tiền */}
                        <View className="w-[52%]">
                          <View className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex-row items-center h-10">
                            <TextInput
                              className="flex-1 text-right text-[15px] font-bold text-slate-800"
                              keyboardType="numeric"
                              value={row.amount === 0 ? '' : maskCurrencyInput(row.amount.toString())}
                              onChangeText={(val) => {
                                const masked = maskCurrencyInput(val);
                                const amt = parseCurrencyToNumber(masked);
                                setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: amt} : r));
                              }}
                              placeholder="0"
                              placeholderTextColor="#cbd5e1"
                              editable={!loading}
                              style={{
                                paddingVertical: 0,
                                textAlignVertical: 'center',
                                lineHeight: undefined,
                                ...(Platform.OS === 'web' ? { outlineStyle: 'none', padding: 0 } as any : { padding: 0 })
                              }}
                            />
                          </View>
                          {/* Hint điền đủ — hiện bên dưới input, ẩn khi amount đã = remaining */}
                          {remaining > 0 && row.amount < remaining && (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              className="mt-0.5 self-end"
                              onPress={() => {
                                if (loading) return;
                                setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: remaining} : r));
                              }}
                              disabled={loading}
                            >
                              <Text className="text-[10px] font-semibold text-orange-500">
                                ↑ Đủ: {formatCurrency(remaining)}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Chọn Quỹ (Nếu có >= 1 quỹ) */}
                      {matchingFunds.length >= 1 && row.method !== 'debt' && row.method !== 'prepaid' && (
                        <View className="mt-2 flex-row items-center relative">
                          <View className="w-6 items-center justify-center">
                            <View className="w-px h-full bg-slate-300 absolute" />
                            <View className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          </View>
                          {matchingFunds.length === 1 ? (
                            <View 
                              className="flex-1 ml-1 bg-orange-50/50 border border-orange-100/80 rounded-lg px-2.5 py-2 flex-row items-center"
                            >
                              <Text className="text-[10px] text-orange-800 font-semibold uppercase mr-1">Quỹ:</Text>
                              <Text className="text-xs font-bold text-orange-900" numberOfLines={1}>{activeFund?.name || matchingFunds[0].name}</Text>
                            </View>
                          ) : (
                            <TouchableOpacity 
                              className="flex-1 ml-1 bg-orange-50/50 border border-orange-100/80 rounded-lg px-2.5 py-2 flex-row justify-between items-center"
                              onPress={() => {
                                if (loading) return;
                                setSelectingFundRow({ rowId: row.id, idx, matchingFunds });
                              }}
                              disabled={loading}
                            >
                              <View className="flex-row items-center flex-1 pr-2">
                                <Text className="text-[10px] text-orange-800 font-semibold uppercase mr-1">Quỹ:</Text>
                                <Text className="text-xs font-bold text-orange-900" numberOfLines={1}>{activeFund?.name || 'Chọn quỹ...'}</Text>
                              </View>
                              <Ionicons name="chevron-down" size={12} color="#c2410c" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Info for PrePaid / Debt */}
                      {row.method === 'prepaid' && (
                        <View className="mt-2 flex-row justify-between bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                          <Text className="text-xs font-medium text-emerald-800">Ví khả dụng:</Text>
                          <Text className="text-xs font-bold text-emerald-700">{selectedCustomer ? formatCurrency(selectedCustomer.prepaid_balance || 0) : '0 ₫'}</Text>
                        </View>
                      )}
                      {row.method === 'debt' && (
                        <View className="mt-2 flex-row justify-between bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100">
                          <Text className="text-xs font-medium text-rose-800">Nợ hiện tại:</Text>
                          <Text className="text-xs font-bold text-rose-700">{selectedCustomer ? formatCurrency(selectedCustomer.debt_amount || 0) : '0 ₫'}</Text>
                        </View>
                      )}

                      {/* Xóa */}
                      {paymentRows.length > 1 && (
                        <TouchableOpacity 
                          onPress={() => {
                            if (loading) return;
                            setPaymentRows(prev => prev.filter(r => r.id !== row.id));
                          }}
                          disabled={loading}
                          className="absolute -top-2 -right-2 bg-white border border-rose-200 rounded-full p-1"
                        >
                          <Ionicons name="close" size={12} color="#f43f5e" />
                        </TouchableOpacity>
                      )}
                    </View>
                    );
                  })
                )}
              </View>
<View className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 relative z-0" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                {clampedDebtRepay > 0 && (
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="text-[11px] text-slate-500">Tiền hàng:</Text>
                    <Text className="text-[11px] text-slate-600 font-medium">{formatCurrency(finalTotal)}</Text>
                  </View>
                )}
                {clampedDebtRepay > 0 && (
                  <View className="flex-row justify-between mb-2 pb-2 border-b border-slate-200">
                    <Text className="text-[11px] text-rose-600">+ Trả nợ cũ:</Text>
                    <Text className="text-[11px] text-rose-700 font-medium">{formatCurrency(clampedDebtRepay)}</Text>
                  </View>
                )}
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs text-slate-700 font-semibold">{clampedDebtRepay > 0 ? 'Tổng cần thu:' : 'Khách trả:'}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className={`font-bold text-sm ${paidSum >= effectiveTotal ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(paidSum)}
                    </Text>
                    {clampedDebtRepay > 0 && (
                      <Text className="text-[10px] text-slate-400">/ {formatCurrency(effectiveTotal)}</Text>
                    )}
                  </View>
                </View>
                {paidSum > effectiveTotal && (
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-emerald-600">Tiền thừa:</Text>
                    <Text className="text-[11px] font-semibold text-emerald-700">{formatCurrency(paidSum - effectiveTotal)}</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Thanh nút Hoàn tất */}
            <View className="flex-row justify-between items-center border-t border-slate-100 pt-4 bg-white gap-3">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={onClose}
                disabled={loading}
                className="flex-1 py-3.5 rounded-xl"
              />

              <Button
                variant="primary"
                title={paidSum < effectiveTotal ? `Còn thiếu ${formatCurrency(effectiveTotal - paidSum)}` : 'Thanh toán'}
                icon={!loading ? <Ionicons name="checkmark-done" size={14} color="white" /> : undefined}
                iconPosition="right"
                onPress={handlePressCheckout}
                disabled={paidSum < effectiveTotal || loading}
                loading={loading}
                className={`flex-[2] py-3.5 rounded-xl ${paidSum < effectiveTotal || loading ? 'opacity-50' : ''}`}
              />
            </View>
          </View>

          {/* Modal chọn phương thức thanh toán */}
          {selectingMethodRow !== null && (
            <View className="absolute inset-0 z-50 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable
                className="absolute inset-0"
                onPress={() => setSelectingMethodRow(null)}
              />
              <View className="bg-white rounded-t-3xl p-6 pb-8 max-h-[70%]" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
                  <View className="flex-row items-center">
                    <Ionicons name="wallet-outline" size={20} color="#fa5908" />
                    <Text className="text-sm font-semibold text-slate-800 ml-2">Chọn phương thức thanh toán</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectingMethodRow(null)} className="p-1">
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View className="flex-row flex-wrap justify-between">
                    {resolvedMethods.map((m) => {
                      const isSelected = selectingMethodRow && paymentRows[selectingMethodRow.idx]?.method === m.value;
                      
                      const isPrepaid = m.type === 'prepaid' || m.code === 'prepaid';
                      const isDebt = m.type === 'debt' || m.code === 'debt';
                      const customerPrepaid = Number(activeCustomer?.prepaid_balance || 0);

                      let isDisabled = false;
                      let disableReason = '';

                      if ((isPrepaid || isDebt) && !selectedCustomer) {
                        isDisabled = true;
                        disableReason = 'Cần khách hàng';
                      } else if (isPrepaid && customerPrepaid <= 0) {
                        isDisabled = true;
                        disableReason = 'Số dư ví = 0';
                      }

                      return (
                        <TouchableOpacity
                          key={m.value}
                          disabled={isDisabled}
                          className={`w-[48%] border p-4 rounded-2xl flex-col items-center justify-center mb-3 active:scale-95 ${
                            isSelected ? 'border-orange-500 bg-orange-50/50' : 'border-slate-200'
                          } ${isDisabled ? 'bg-slate-100 opacity-40' : 'bg-slate-50'}`}
                          onPress={() => {
                            if (!selectingMethodRow) return;
                            const idx = selectingMethodRow.idx;
                            let newFundType = 'bank';
                            if (m.type === 'cash' || m.code === 'cash') newFundType = 'cash';
                            else if (m.type === 'wallet') newFundType = 'wallet';
                            
                            const mFunds = paymentFundsList.filter(f => f.type === newFundType);
                            const dFund = mFunds.find(f => f.is_default === 'TRUE') || mFunds[0];
                            
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, method: m.value, fund_id: dFund?.id || ''} : r));
                            setSelectingMethodRow(null);
                          }}
                        >
                          <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: `${m.color}15` }}>
                            <Ionicons name={m.icon as any} size={22} color={m.color} />
                          </View>
                          <Text className={`text-xs font-semibold text-center mt-2 ${isSelected ? 'text-orange-600' : 'text-slate-700'} ${isDisabled ? 'text-slate-400' : ''}`}>
                            {m.label}
                          </Text>
                          {isDisabled && disableReason ? (
                            <Text className="text-[9px] text-slate-400 font-medium text-center mt-1">
                              ({disableReason})
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {/* Modal chọn quỹ tài chính */}
          {selectingFundRow !== null && (
            <View className="absolute inset-0 z-50 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable
                className="absolute inset-0"
                onPress={() => setSelectingFundRow(null)}
              />
              <View className="bg-white rounded-t-3xl p-6 pb-8 max-h-[70%]" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
                  <View className="flex-row items-center">
                    <Ionicons name="business-outline" size={20} color="#fa5908" />
                    <Text className="text-sm font-semibold text-slate-800 ml-2">Chọn quỹ tài chính</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectingFundRow(null)} className="p-1">
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View className="space-y-3">
                    {selectingFundRow?.matchingFunds.map((f) => {
                      const isSelected = selectingFundRow && paymentRows[selectingFundRow.idx]?.fund_id === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          className={`p-4 rounded-xl border flex-row justify-between items-center mb-3 active:scale-98 ${
                            isSelected ? 'border-orange-500 bg-orange-50/30' : 'border-slate-200 bg-slate-50'
                          }`}
                          onPress={() => {
                            if (!selectingFundRow) return;
                            const idx = selectingFundRow.idx;
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, fund_id: f.id} : r));
                            setSelectingFundRow(null);
                          }}
                        >
                          <View className="flex-1 pr-4">
                            <Text className={`text-sm font-bold ${isSelected ? 'text-orange-600' : 'text-slate-800'}`}>
                              {f.name}
                            </Text>
                            {f.bank_name ? (
                              <Text className="text-xs text-slate-500 mt-1">
                                {f.bank_name} {f.account_number ? `· ${f.account_number}` : ''}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color="#fa5908" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}
          {/* Dialog xác nhận thanh toán */}
          <Dialog
            visible={isConfirmVisible}
            onClose={() => setIsConfirmVisible(false)}
            onConfirm={() => {
              setIsConfirmVisible(false);
              const debtOpts = clampedDebtRepay > 0 ? { debtRepayAmount: clampedDebtRepay, ...selectDebtFund() } : undefined;
              onCheckout(debtOpts);
            }}
            title="Xác nhận Thanh toán"
            description={`Bạn có chắc chắn muốn hoàn tất thanh toán hóa đơn trị giá ${formatCurrency(finalTotal)} bằng phương thức: ${methodNames}?`}
            confirmLabel="Xác nhận"
            cancelLabel="Hủy"
            variant="default"
          />
        </View>
      </Modal>
    </>
  );
}
