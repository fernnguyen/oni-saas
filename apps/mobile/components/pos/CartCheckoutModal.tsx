import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Platform, Modal, Alert, Pressable, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { calculateHourlyBilling } from '@oni/core';

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
  setCustomersList?: React.Dispatch<React.SetStateAction<any[]>>;
  paymentRows: {id: string; method: string; fund_id: string; amount: number}[];
  setPaymentRows: React.Dispatch<React.SetStateAction<any[]>>;
  paymentFundsList: any[];
  productsList: any[];
  getCartCount: () => number;
  onCheckout: (opts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string; customCheckoutTime?: Date; rentalType?: 'hourly' | 'overnight' | 'daily' }) => void; // Called to trigger final payment or show QR
  // Tích hợp realtime khách hàng
  shopId?: string;
  isOnline?: boolean;
  apiBaseUrl?: string;
  apiHeaders?: Record<string, string>;
  loading?: boolean;
  paymentMethodsList?: any[];
  cartOwnerTable?: any;
  shopVertical?: string;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

export function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${hours}:${minutes} ${day}/${month}/${year}`;
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
    selectedCustomer, setSelectedCustomer, customersList, setCustomersList,
    paymentRows, setPaymentRows, paymentFundsList, productsList, getCartCount, onCheckout,
    shopId, isOnline = true, apiBaseUrl, apiHeaders, loading = false,
    paymentMethodsList = [],
    cartOwnerTable,
    shopVertical
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
  const [isDiscountModalVisible, setIsDiscountModalVisible] = useState(false);
  const [discountTypeTab, setDiscountTypeTab] = useState<'amount' | 'percent'>('amount');
  const [discountInputValue, setDiscountInputValue] = useState('');
  const [selectingMethodRow, setSelectingMethodRow] = useState<{ rowId: string; idx: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const [localRentalType, setLocalRentalType] = useState<'hourly' | 'overnight' | 'daily'>('hourly');

  React.useEffect(() => {
    if (visible && cartOwnerTable) {
      let rmd: any = {};
      try {
        rmd = typeof cartOwnerTable.metadata === 'string' ? JSON.parse(cartOwnerTable.metadata) : (cartOwnerTable.metadata || {});
      } catch (e) {}
      setLocalRentalType(rmd.rental_type || 'hourly');
    }
  }, [visible, cartOwnerTable]);

  // Thêm các state phục vụ chỉnh sửa giờ ra
  const [customCheckoutTime, setCustomCheckoutTime] = useState<Date | null>(null);
  const [isEditingCheckoutTime, setIsEditingCheckoutTime] = useState(false);
  const [editHour, setEditHour] = useState('');
  const [editMinute, setEditMinute] = useState('');
  const [editDate, setEditDate] = useState(''); // DD/MM/YYYY
  const [isConfirmCheckoutTimeVisible, setIsConfirmCheckoutTimeVisible] = useState(false);
  const [pendingCheckoutTime, setPendingCheckoutTime] = useState<Date | null>(null);

  const calculateBilling = React.useCallback((table: any, customCheckoutTime?: Date, currentRentalType?: 'hourly' | 'overnight' | 'daily') => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0, label: '0h 0p', details: '' };

    let rmd: any = {};
    try {
      rmd = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
    } catch (e) {
      console.warn('Cannot parse table metadata:', e);
    }

    const rentalType = currentRentalType || rmd.rental_type || 'hourly';

    if (rentalType === 'overnight') {
      const overnightRate = Number(rmd.overnight_rate) || Number(table.hourly_rate * 3) || 200000;
      return {
        hours: 0,
        minutes: 0,
        cost: overnightRate,
        label: 'Qua đêm',
        details: 'Trọn gói qua đêm'
      };
    }

    if (rentalType === 'daily') {
      const dailyRate = Number(rmd.overnight_rate) || Number(table.hourly_rate * 3) || 200000;
      const checkInDate = new Date(table.startTime);
      const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());
      
      const d1 = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const d2 = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      const nights = Math.max(1, diffDays);
      
      const cost = nights * dailyRate;
      const formatCurrencyLocal = (value: number) => {
        return value.toLocaleString('vi-VN') + '₫';
      };

      return {
        hours: 0,
        minutes: 0,
        cost,
        label: `${nights} ngày`,
        details: `Thuê theo ngày: ${nights} ngày x ${formatCurrencyLocal(dailyRate)}/ngày`
      };
    }

    const hourlyRate = Number(table.hourly_rate) || 0;
    const checkInDate = new Date(table.startTime);
    const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());

    const pricingResult = calculateHourlyBilling({
      checkIn: checkInDate,
      checkOut: checkOutDate,
      standardRate: hourlyRate,
      config: rmd.advanced_pricing
    });

    const diffMs = Math.max(0, checkOutDate.getTime() - checkInDate.getTime());
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      cost: pricingResult.totalAmount,
      label: pricingResult.durationLabel,
      details: pricingResult.detailsLabel
    };
  }, []);

  const localCartTotal = React.useMemo(() => {
    return Object.entries(cart).reduce((sum, [key, item]) => {
      if (key === 'TIME_CHARGE') {
        if (cartOwnerTable && cartOwnerTable.startTime) {
          const billing = calculateBilling(cartOwnerTable, customCheckoutTime || undefined, localRentalType);
          return sum + billing.cost;
        }
      }
      return sum + ((item.price + (item.modifier_total || 0)) * item.quantity);
    }, 0);
  }, [cart, cartOwnerTable, customCheckoutTime, calculateBilling, localRentalType]);

  const localTaxTotal = React.useMemo(() => {
    return Object.entries(cart).reduce((sum, [key, item]) => {
      if (key === 'TIME_CHARGE') return sum;
      const itemTotal = (item.price + (item.modifier_total || 0)) * item.quantity;
      const taxRateVal = parseFloat(item.tax_rate || '0');
      if (isNaN(taxRateVal) || taxRateVal <= 0) return sum;
      return sum + Math.round(itemTotal * (taxRateVal / 100));
    }, 0);
  }, [cart]);

  const handleStartEditCheckoutTime = () => {
    let currentMeta: any = {};
    if (cartOwnerTable && cartOwnerTable.metadata) {
      try {
        currentMeta = typeof cartOwnerTable.metadata === 'string' ? JSON.parse(cartOwnerTable.metadata) : cartOwnerTable.metadata;
      } catch (e) {}
    }
    const currentCheckout = customCheckoutTime || (currentMeta.actual_checkout_requested_at ? new Date(currentMeta.actual_checkout_requested_at) : currentTime);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setEditHour(pad(currentCheckout.getHours()));
    setEditMinute(pad(currentCheckout.getMinutes()));
    setEditDate(`${pad(currentCheckout.getDate())}/${pad(currentCheckout.getMonth() + 1)}/${currentCheckout.getFullYear()}`);
    setIsEditingCheckoutTime(true);
  };

  const handleConfirmEditCheckoutTime = () => {
    try {
      const hour = parseInt(editHour, 10);
      const minute = parseInt(editMinute, 10);
      if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
        Alert.alert('Lỗi', 'Giờ (0-23) hoặc Phút (0-59) không hợp lệ!');
        return;
      }
      
      const dateParts = editDate.split('/');
      if (dateParts.length !== 3) {
        Alert.alert('Lỗi', 'Định dạng ngày phải là DD/MM/YYYY!');
        return;
      }
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10);
      const year = parseInt(dateParts[2], 10);
      if (isNaN(day) || day < 1 || day > 31 || isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
        Alert.alert('Lỗi', 'Ngày, tháng hoặc năm không hợp lệ!');
        return;
      }
      
      const newDate = new Date(year, month - 1, day, hour, minute, 0);
      if (isNaN(newDate.getTime())) {
        Alert.alert('Lỗi', 'Thời gian đã nhập không hợp lệ!');
        return;
      }
      
      if (cartOwnerTable && cartOwnerTable.startTime) {
        const checkInDate = new Date(cartOwnerTable.startTime);
        if (newDate.getTime() < checkInDate.getTime()) {
          Alert.alert('Lỗi', 'Giờ ra không được nhỏ hơn giờ vào!');
          return;
        }
      }

      setPendingCheckoutTime(newDate);
      setIsConfirmCheckoutTimeVisible(true);
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể phân tích thời gian đã nhập!');
    }
  };

  React.useEffect(() => {
    if (!visible || !cartOwnerTable) return;
    let rmd: any = {};
    try {
      rmd = typeof cartOwnerTable.metadata === 'string' ? JSON.parse(cartOwnerTable.metadata) : (cartOwnerTable.metadata || {});
    } catch (e) {
      console.warn('Cannot parse table metadata:', e);
    }
    if (rmd.actual_checkout_requested_at) return;

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, [visible, cartOwnerTable]);

  const billingInfo = React.useMemo(() => {
    if (!cartOwnerTable || !cartOwnerTable.startTime) return null;

    let rmd: any = {};
    try {
      rmd = typeof cartOwnerTable.metadata === 'string'
        ? JSON.parse(cartOwnerTable.metadata)
        : (cartOwnerTable.metadata || {});
    } catch (e) {
      console.warn('Cannot parse table metadata:', e);
    }

    const rentalType = localRentalType;
    const checkInDate = new Date(cartOwnerTable.startTime);
    const actualCheckout = customCheckoutTime || (rmd.actual_checkout_requested_at ? new Date(rmd.actual_checkout_requested_at) : currentTime);
    const checkOutDate = actualCheckout;

    let durationLabel = '';
    if (rentalType === 'overnight') {
      durationLabel = 'Qua đêm';
    } else if (rentalType === 'daily') {
      const d1 = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const d2 = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      const nights = Math.max(1, diffDays);
      durationLabel = `${nights} ngày`;
    } else {
      const hourlyRate = Number(cartOwnerTable.hourly_rate) || 0;
      const pricingResult = calculateHourlyBilling({
        checkIn: checkInDate,
        checkOut: checkOutDate,
        standardRate: hourlyRate,
        config: rmd.advanced_pricing
      });
      durationLabel = pricingResult.durationLabel;
    }

    const formatDateTime = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const d = pad(date.getDate());
      const m = pad(date.getMonth() + 1);
      const y = date.getFullYear();
      const h = pad(date.getHours());
      const min = pad(date.getMinutes());
      return `${h}:${min} ${d}/${m}/${y}`;
    };

    return {
      checkIn: formatDateTime(checkInDate),
      checkOut: formatDateTime(checkOutDate),
      duration: durationLabel,
      rentalType
    };
  }, [cartOwnerTable, currentTime, customCheckoutTime, localRentalType]);
  const [selectingFundRow, setSelectingFundRow] = useState<{ rowId: string; idx: number; matchingFunds: any[] } | null>(null);
  const [hidePrepaidSuggest, setHidePrepaidSuggest] = useState(false);
  const [hideDebtRepaySuggest, setHideDebtRepaySuggest] = useState(false);
  const [debtRepayAmount, setDebtRepayAmount] = useState(0);
  const [isEditingDebtRepay, setIsEditingDebtRepay] = useState(false);
  // Dữ liệu realtime khách hàng (chứa debt_amount, prepaid_balance cập nhật mới nhất)
  const [enrichedCustomer, setEnrichedCustomer] = useState<any>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  // Trạng thái cho thêm nhanh khách hàng
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickCustType, setQuickCustType] = useState('Thành viên'); // VIP, Thân thiết, Thành viên
  const [quickCustEmail, setQuickCustEmail] = useState('');
  const [quickCustAddress, setQuickCustAddress] = useState('');
  const [quickCustNote, setQuickCustNote] = useState('');
  const [isQuickSaving, setIsQuickSaving] = useState(false);

  const handleOpenQuickAddCustomer = () => {
    const query = customerSearchQuery.trim();
    // Reset form
    setQuickCustName('');
    setQuickCustPhone('');
    setQuickCustType('Thành viên');
    setQuickCustEmail('');
    setQuickCustAddress('');
    setQuickCustNote('');
    
    // Tự động phân tích và điền thông tin từ ô tìm kiếm
    if (query) {
      const isPhone = /^[0-9+\s-]+$/.test(query);
      if (isPhone) {
        setQuickCustPhone(query);
      } else {
        setQuickCustName(query);
      }
    }
    
    setIsQuickAddModalOpen(true);
  };

  const handleSaveQuickCustomer = async () => {
    if (!quickCustName || !quickCustPhone) {
      Alert.alert('Thông báo', 'Vui lòng nhập Tên và Số điện thoại!');
      return;
    }

    setIsQuickSaving(true);
    try {
      const activeShopId = shopId || (await AsyncStorage.getItem('active_shop_id')) || 'default-shop';
      const custId = `CUST-${Date.now()}`;
      const custCode = `KH-${Date.now().toString().substring(8)}`;
      
      const newCustomerData: any = {
        id: custId,
        name: quickCustName,
        phone: quickCustPhone,
        customer_type: quickCustType,
        customer_code: custCode,
        total_spent: 0,
        orders_count: 0,
        sync_status: 'pending',
        email: quickCustEmail || null,
        address: quickCustAddress || null,
        credit_limit: 0,
        note: quickCustNote || null,
        prepaid_balance: 0,
        loyalty_points: 0,
        debt_amount: 0,
      };

      // 1. Lưu offline vào SQLite di động
      if (Platform.OS !== 'web') {
        try {
          await db.insert(schema.customers).values({
            id: custId,
            name: quickCustName,
            phone: quickCustPhone,
            customer_type: quickCustType,
            customer_code: custCode,
            total_spent: 0,
            orders_count: 0,
            sync_status: 'pending',
            email: quickCustEmail || null,
            address: quickCustAddress || null,
            credit_limit: 0,
            note: quickCustNote || null,
            prepaid_balance: 0,
            loyalty_points: 0,
            debt_amount: 0,
          });
        } catch (dbErr) {
          console.error('[CartCheckoutModal] SQLite insert error:', dbErr);
        }
      }

      // 2. Cập nhật danh sách local và tự động chọn khách
      if (setCustomersList) {
        setCustomersList(prev => [newCustomerData, ...prev]);
      }
      
      setSelectedCustomer(newCustomerData);
      setIsQuickAddModalOpen(false);
      setCustomerSearchQuery('');

      // Clean inputs
      setQuickCustName('');
      setQuickCustPhone('');
      setQuickCustType('Thành viên');
      setQuickCustEmail('');
      setQuickCustAddress('');
      setQuickCustNote('');

      // 3. API request đồng bộ lên Cloud
      if (isOnline && apiBaseUrl) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/shops/${activeShopId}/customers`, {
            method: 'POST',
            headers: {
              ...(apiHeaders || {}),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: quickCustName,
              phone: quickCustPhone,
              customer_type: quickCustType,
              customer_code: custCode,
              email: quickCustEmail || `${quickCustPhone}@oni-pos.vn`,
              address: quickCustAddress || 'Tạo nhanh từ POS',
              credit_limit: '0',
              note: quickCustNote || '',
            }),
          });

          if (response.ok) {
            const serverCust = await response.json();
            const serverCustId = serverCust.id || serverCust.customer_id || custId;
            
            if (Platform.OS !== 'web') {
              try {
                await db
                  .update(schema.customers)
                  .set({ 
                    id: serverCustId,
                    sync_status: 'synced' 
                  })
                  .where(eq(schema.customers.id, custId));
              } catch (dbErr) {
                console.error('[CartCheckoutModal] SQLite update synced error:', dbErr);
              }
            }

            const finalCust = { ...newCustomerData, id: serverCustId, sync_status: 'synced' };
            setSelectedCustomer(finalCust);
            if (setCustomersList) {
              setCustomersList(prev => 
                prev.map(c => c.id === custId ? finalCust : c)
              );
            }
            console.log(`[CartCheckoutModal] Synced quick customer #${serverCustId} to Cloud!`);
          }
        } catch (apiErr) {
          console.warn('[CartCheckoutModal] Cloud sync failed for quick customer creation:', apiErr);
        }
      }
      
      Alert.alert('Thành công', 'Đã tạo và chọn khách hàng mới.');
    } catch (err) {
      console.error('[CartCheckoutModal] Quick add customer error:', err);
      Alert.alert('Lỗi', 'Không thể tạo khách hàng mới.');
    } finally {
      setIsQuickSaving(false);
    }
  };

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
          if ((!p.fund_id || p.fund_id === 'cash') && p.method !== 'debt' && !p.method?.startsWith('debt-') && p.method !== 'prepaid' && !p.method?.startsWith('prepaid-')) {
            const methodObj = resolvedMethods.find(m => m.value === p.method);
            const fundType = methodObj ? (methodObj.type || 'bank') : (p.method === 'cash' || p.method?.startsWith('cash-') ? 'cash' : 'bank');
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

  // Đồng bộ phương thức thanh toán dạng text/code (như 'cash') sang ID thực tế của database
  React.useEffect(() => {
    if (resolvedMethods && resolvedMethods.length > 0 && paymentRows && paymentRows.length > 0) {
      let changed = false;
      const nextRows = paymentRows.map(p => {
        // Kiểm tra xem p.method hiện tại có khớp hoàn toàn với một phương thức đang hoạt động của chi nhánh hiện tại không
        const exactMatch = resolvedMethods.find(m => m.value === p.method);
        if (!exactMatch) {
          // Nếu không khớp hoàn toàn (có thể do p.method là 'cash' legacy hoặc 'cash-old_branch_id' từ ca trước/màn hình khác)
          // Ta tìm phương thức phù hợp nhất trong chi nhánh hiện tại theo logic:
          const isCash = p.method === 'cash' || p.method?.startsWith('cash-') || p.method?.startsWith('cash_');
          const isBank = p.method === 'bank_transfer' || p.method?.startsWith('bank_transfer-') || p.method?.startsWith('bank_transfer_') || p.method === 'transfer' || p.method?.startsWith('transfer-') || p.method === 'card' || p.method?.startsWith('card-');
          const isPrepaid = p.method === 'prepaid' || p.method?.startsWith('prepaid-');
          const isDebt = p.method === 'debt' || p.method?.startsWith('debt-');
          const isWallet = p.method === 'momo' || p.method?.startsWith('momo-') || p.method === 'vnpay' || p.method?.startsWith('vnpay-') || p.method === 'zalopay' || p.method?.startsWith('zalopay-') || p.method === 'wallet' || p.method?.startsWith('wallet-');

          let matchedMethod = null;
          if (isCash) {
            matchedMethod = resolvedMethods.find(m => m.code?.startsWith('cash') || m.type === 'cash');
          } else if (isBank) {
            matchedMethod = resolvedMethods.find(m => m.code?.startsWith('bank') || m.code?.startsWith('transfer') || m.code?.startsWith('card') || m.type === 'bank');
          } else if (isPrepaid) {
            matchedMethod = resolvedMethods.find(m => m.code?.startsWith('prepaid') || m.type === 'prepaid');
          } else if (isDebt) {
            matchedMethod = resolvedMethods.find(m => m.code?.startsWith('debt') || m.type === 'debt');
          } else if (isWallet) {
            const walletBrand = p.method.split('-')[0].split('_')[0];
            matchedMethod = resolvedMethods.find(m => m.code?.startsWith(walletBrand)) || resolvedMethods.find(m => m.type === 'wallet');
          }

          // Nếu tìm thấy phương thức tương ứng ở chi nhánh hiện tại, chuẩn hóa nó sang ID/value mới
          if (matchedMethod && matchedMethod.value !== p.method) {
            changed = true;
            return { ...p, method: matchedMethod.value };
          }
        }
        return p;
      });
      if (changed) {
        setPaymentRows(nextRows);
      }
    }
  }, [resolvedMethods, paymentRows, setPaymentRows]);

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

  const finalTotal = Math.max(0, localCartTotal - discountAmount);
  const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);

  // --- Debt & prepaid logic ---
  const customerDebt = Number(activeCustomer?.debt_amount || 0);
  const currentOrderDebtAmount = paymentRows
    .filter(p => p.method === 'debt' || p.method?.startsWith('debt-'))
    .reduce((s, p) => s + p.amount, 0);
  const prepaidBalance = Number(activeCustomer?.prepaid_balance || 0);

  // Tổng thực tế cần thu = đơn hàng + tiền trả nợ cũ thêm
  const clampedDebtRepay = Math.min(debtRepayAmount, customerDebt);
  const effectiveTotal = finalTotal + clampedDebtRepay;
  const changeToReturn = paidSum - effectiveTotal;

  const prevEffectiveTotalRef = React.useRef(effectiveTotal);
  const prevCustomCheckoutTimeRef = React.useRef(customCheckoutTime);
  // Tự động điều chỉnh số tiền ở dòng thanh toán duy nhất khớp với effectiveTotal
  React.useEffect(() => {
    if (paymentRows.length === 1) {
      const targetVal = effectiveTotal;
      const prevVal = prevEffectiveTotalRef.current;
      const customTimeChanged = customCheckoutTime?.getTime() !== prevCustomCheckoutTimeRef.current?.getTime();
      
      if (customTimeChanged || paymentRows[0].amount === prevVal || paymentRows[0].amount === 0) {
        if (paymentRows[0].amount !== targetVal) {
          setPaymentRows([{ ...paymentRows[0], amount: targetVal }]);
        }
      }
    }
    prevEffectiveTotalRef.current = effectiveTotal;
    prevCustomCheckoutTimeRef.current = customCheckoutTime;
  }, [effectiveTotal, paymentRows, setPaymentRows, customCheckoutTime]);

  // Cảnh báo khi khách có nợ cũ (chưa được trả hết)
  const hasDebtWarning = !!activeCustomer && customerDebt > 0 && isOnline && !!enrichedCustomer;

  /**
   * Chọn quỹ thông minh để ghi cashbook trả nợ:
   * Ưu tiên payment row nào có amount >= debtRepay (không cần nhiều quỹ).
   * Nếu không có row đơn nào đủ → dùng row lớn nhất.
   */
  const selectDebtFund = (): { fund_id: string; method: string } => {
    const real = paymentRows.filter(r => r.method !== 'debt' && !r.method?.startsWith('debt-') && r.method !== 'prepaid' && !r.method?.startsWith('prepaid-'));
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
    const hasDebt = paymentRows.some((p) => (p.method === 'debt' || p.method?.startsWith('debt-')) && p.amount > 0);
    const hasPrepaid = paymentRows.some((p) => (p.method === 'prepaid' || p.method?.startsWith('prepaid-')) && p.amount > 0);

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
        .filter((p) => p.method === 'prepaid' || p.method?.startsWith('prepaid-'))
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
                        <TouchableOpacity onPress={() => setCustomerSearchQuery('')} className="mr-1">
                          <Ionicons name="close" size={14} color="#cbd5e1" />
                        </TouchableOpacity>
                      )}
                      <View className="w-px h-4 bg-slate-200 mx-1.5" />
                      <TouchableOpacity 
                        onPress={handleOpenQuickAddCustomer}
                        disabled={loading}
                        className="p-1"
                      >
                        <Ionicons name="person-add-outline" size={15} color="#fa5908" />
                      </TouchableOpacity>
                    </View>
                  </>
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
                      <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5}}>
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
                      <View className="bg-white border border-slate-200 rounded-xl mt-2 overflow-hidden z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5}}>
                        <TouchableOpacity 
                          className="p-4 flex-row items-center active:bg-slate-55"
                          onPress={handleOpenQuickAddCustomer}
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

              {/* CHI TIẾT THỜI GIAN THUÊ */}
              {billingInfo && (
                <View className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                  <View className="flex-row justify-between items-center mb-2.5">
                    <Text className="text-xxs font-semibold text-slate-400">CHI TIẾT THỜI GIAN THUÊ</Text>
                    {!isEditingCheckoutTime && (
                      <TouchableOpacity 
                        onPress={handleStartEditCheckoutTime}
                        className="flex-row items-center bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg"
                      >
                        <Ionicons name="create-outline" size={12} color="#fa5908" />
                        <Text className="text-[10px] font-semibold text-orange-500 ml-1">Sửa giờ ra</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                   {shopVertical === 'lodging' && (
                    <View className="flex-row bg-slate-200/50 p-0.5 rounded-lg border border-slate-200 mb-3">
                      <Pressable
                        onPress={() => setLocalRentalType('hourly')}
                        className="flex-1 py-1 rounded-md items-center justify-center"
                        style={localRentalType === 'hourly' ? {
                          backgroundColor: '#ffffff',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 1,
                          elevation: 1,
                        } : undefined}
                      >
                        <Text className={`text-[10px] font-bold ${localRentalType === 'hourly' ? 'text-slate-800' : 'text-slate-500'}`}>⏱️ Theo giờ</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setLocalRentalType('overnight')}
                        className="flex-1 py-1 rounded-md items-center justify-center"
                        style={localRentalType === 'overnight' ? {
                          backgroundColor: '#ffffff',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 1,
                          elevation: 1,
                        } : undefined}
                      >
                        <Text className={`text-[10px] font-bold ${localRentalType === 'overnight' ? 'text-slate-800' : 'text-slate-500'}`}>🌙 Qua đêm</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setLocalRentalType('daily')}
                        className="flex-1 py-1 rounded-md items-center justify-center"
                        style={localRentalType === 'daily' ? {
                          backgroundColor: '#ffffff',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 1,
                          elevation: 1,
                        } : undefined}
                      >
                        <Text className={`text-[10px] font-bold ${localRentalType === 'daily' ? 'text-slate-800' : 'text-slate-500'}`}>☀️ Theo ngày</Text>
                      </Pressable>
                    </View>
                  )}
                  
                  {isEditingCheckoutTime ? (
                    <View className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <Text className="text-xxs font-bold text-slate-500">NHẬP GIỜ CHECKOUT MỚI</Text>
                      
                      {/* Cảnh báo ghi log đảm bảo tính minh bạch */}
                      <View className="flex-row items-start bg-amber-50 border border-amber-200 rounded-lg p-2 mb-[5px]">
                        <Ionicons name="warning-outline" size={14} color="#d97706" style={{ marginTop: 1 }} />
                        <Text className="text-[10px] text-amber-800 flex-1 leading-relaxed ml-1.5 font-medium">
                          Mọi thao tác thay đổi giờ checkout sẽ được ghi lại trong nhật ký hệ thống để đảm bảo tính minh bạch.
                        </Text>
                      </View>
                      
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <Text className="text-[9px] font-semibold text-slate-400 mb-1">GIỜ (0-23)</Text>
                          <TextInput
                            value={editHour}
                            onChangeText={setEditHour}
                            keyboardType="numeric"
                            maxLength={2}
                            placeholder="HH"
                            className="bg-slate-50 border border-slate-200 rounded-lg h-9 px-2 text-center text-xs font-semibold text-slate-800"
                            style={{
                              paddingVertical: 0,
                              textAlignVertical: 'center',
                              lineHeight: undefined,
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                            }}
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[9px] font-semibold text-slate-400 mb-1">PHÚT (0-59)</Text>
                          <TextInput
                            value={editMinute}
                            onChangeText={setEditMinute}
                            keyboardType="numeric"
                            maxLength={2}
                            placeholder="mm"
                            className="bg-slate-50 border border-slate-200 rounded-lg h-9 px-2 text-center text-xs font-semibold text-slate-800"
                            style={{
                              paddingVertical: 0,
                              textAlignVertical: 'center',
                              lineHeight: undefined,
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                            }}
                          />
                        </View>
                        <View className="flex-[2]">
                          <Text className="text-[9px] font-semibold text-slate-400 mb-1">NGÀY (DD/MM/YYYY)</Text>
                          <TextInput
                            value={editDate}
                            onChangeText={setEditDate}
                            placeholder="DD/MM/YYYY"
                            className="bg-slate-50 border border-slate-200 rounded-lg h-9 px-2 text-center text-xs font-semibold text-slate-800"
                            style={{
                              paddingVertical: 0,
                              textAlignVertical: 'center',
                              lineHeight: undefined,
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                            }}
                          />
                        </View>
                      </View>
                      
                      {/* Nút khôi phục sử dụng giờ hệ thống */}
                      <TouchableOpacity
                        onPress={() => {
                          setCustomCheckoutTime(null);
                          setIsEditingCheckoutTime(false);
                        }}
                        className="py-2.5 mt-[5px] bg-blue-50 border border-dashed border-blue-300 rounded-lg flex-row items-center justify-center active:bg-blue-100"
                      >
                        <Ionicons name="refresh-outline" size={12} color="#1d4ed8" style={{ marginRight: 4 }} />
                        <Text className="text-[10px] font-semibold text-blue-700">Sử dụng giờ hệ thống (Khôi phục)</Text>
                      </TouchableOpacity>
                      
                      <View className="flex-row gap-2.5 pt-1">
                        <TouchableOpacity
                          onPress={() => setIsEditingCheckoutTime(false)}
                          className="flex-1 py-2 bg-slate-100 border border-slate-200 rounded-lg items-center"
                        >
                          <Text className="text-[10px] font-semibold text-slate-600">Hủy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleConfirmEditCheckoutTime}
                          className="flex-1 py-2 bg-orange-500 rounded-lg items-center"
                        >
                          <Text className="text-[10px] font-semibold text-white">Xác nhận</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View className="space-y-2">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-slate-500">Giờ vào:</Text>
                        <Text className="text-xs font-semibold text-slate-850">{billingInfo.checkIn}</Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-slate-500">Giờ ra:</Text>
                        <Text className="text-xs font-semibold text-slate-850">{billingInfo.checkOut}</Text>
                      </View>
                      <View className="flex-row justify-between items-center border-t border-slate-200 pt-2">
                        <Text className="text-xs text-slate-500">Tổng thời gian:</Text>
                        <Text className="text-xs font-bold text-emerald-600">{billingInfo.duration}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

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
                {Object.entries(cart)
                .sort(([, aItem], [, bItem]) => {
                  if (aItem.productId === 'TIME_CHARGE') return -1;
                  if (bItem.productId === 'TIME_CHARGE') return 1;
                  return 0;
                })
                .map(([cartItemId, item], idx) => {
                  const isTimeCharge = item.productId === 'TIME_CHARGE';
                  let itemToRender = item;
                  if (isTimeCharge && cartOwnerTable && cartOwnerTable.startTime) {
                    const billing = calculateBilling(cartOwnerTable, customCheckoutTime || undefined, localRentalType);
                    const billingName = cartOwnerTable.type === 'room'
                      ? `Tiền phòng - ${cartOwnerTable.name} (${billing.label})`
                      : `Tiền giờ - ${cartOwnerTable.name} (${billing.label})`;
                    
                    itemToRender = {
                      ...item,
                      price: billing.cost,
                      name: billingName
                    };
                  }
                  return (
                    <View key={cartItemId} className={`py-3 px-2 rounded-xl ${idx > 0 && !isTimeCharge ? 'border-t border-slate-100' : ''} ${isTimeCharge ? 'bg-emerald-50/60 border border-emerald-100 my-1.5' : ''}`}>
                      {/* Top Row: Name, Quantity, Total Price */}
                      <View className="flex-row justify-between items-start mb-1">
                        {/* Name & Modifiers */}
                        <View className="flex-1 pr-2">
                          <Text className={`font-semibold text-sm leading-tight ${isTimeCharge ? 'text-emerald-800' : 'text-slate-800'}`}>
                            {itemToRender.name}
                            {itemToRender.tax_rate && parseFloat(itemToRender.tax_rate) > 0 ? (
                              <Text className="text-[10px] text-slate-400 font-normal"> (VAT {itemToRender.tax_rate}%)</Text>
                            ) : null}
                          </Text>
                          {itemToRender.variant_label && (!itemToRender.modifiers || itemToRender.modifiers.length === 0) && (
                            <Text className="text-xs text-violet-600 font-medium mt-0.5">{itemToRender.variant_label}</Text>
                          )}
                          {itemToRender.modifiers && itemToRender.modifiers.length > 0 && (
                            <Text className="text-xs text-amber-600 mt-0.5">
                              {itemToRender.modifiers.map((m: any) => m.option).join(' · ')}
                              {(itemToRender.modifier_total || 0) > 0 && (
                                <Text className="text-emerald-600 font-medium"> +{formatCurrency(itemToRender.modifier_total || 0)}</Text>
                              )}
                            </Text>
                          )}
                        </View>
 
                        <View className="flex-row items-center">
                          {/* Quantity Control */}
                          {!isTimeCharge && (
                            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden mr-2">
                              <TouchableOpacity 
                                onPress={() => !loading && updateCartItemQuantity(cartItemId, itemToRender.quantity - 1)} 
                                disabled={loading} 
                                className="w-7 h-7 items-center justify-center border-r border-slate-200 bg-white active:bg-slate-100"
                              >
                                <Text className="text-slate-600 font-medium">-</Text>
                              </TouchableOpacity>
                              <Text className="w-8 text-center text-xs font-semibold text-slate-800 bg-white" style={{lineHeight: 28}}>{itemToRender.quantity}</Text>
                              <TouchableOpacity 
                                onPress={() => !loading && updateCartItemQuantity(cartItemId, itemToRender.quantity + 1)} 
                                disabled={loading} 
                                className="w-7 h-7 items-center justify-center border-l border-slate-200 bg-white active:bg-slate-100"
                              >
                                <Text className="text-slate-600 font-medium">+</Text>
                              </TouchableOpacity>
                            </View>
                          )}
 
                          {/* Total Price */}
                          <View className="w-[85px] items-end">
                            <Text className={`font-bold text-[15px] ${isTimeCharge ? 'text-emerald-700' : 'text-slate-800'}`}>{formatCurrency((itemToRender.price + (itemToRender.modifier_total || 0)) * itemToRender.quantity)}</Text>
                          </View>
                        </View>
                      </View>
 
                        {/* Bottom Row: Unit Price, Delete */}
                        <View className="flex-row justify-between items-center mt-1">
                          <Text className="text-xs text-slate-500 font-medium">
                            Đơn giá: {formatCurrency(itemToRender.price + (itemToRender.modifier_total || 0))} {productsList.find(pr => pr.id === itemToRender.productId)?.unit ? `/ ${productsList.find(pr => pr.id === itemToRender.productId)?.unit}` : ''}
                          </Text>
                          <TouchableOpacity 
                            onPress={() => !loading && removeFromCart(cartItemId)} 
                            disabled={loading || isTimeCharge} 
                            className={`p-1 ${(loading || isTimeCharge) ? 'opacity-30' : ''}`}
                          >
                            <Ionicons name="trash-outline" size={16} color="#f43f5e" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                {/* Hàng Giảm giá */}
                <TouchableOpacity 
                  className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200 mt-2 active:opacity-60"
                  onPress={() => {
                    if (loading) return;
                    setDiscountTypeTab('amount');
                    setDiscountInputValue(discountAmount > 0 ? discountAmount.toString() : '');
                    setIsDiscountModalVisible(true);
                  }}
                  disabled={loading}
                >
                  <Text className="text-xs text-slate-450 font-medium">Giảm giá (Chạm để sửa):</Text>
                  <Text className="text-xs text-rose-500 font-semibold">
                    -{formatCurrency(discountAmount)}
                  </Text>
                </TouchableOpacity>

                {/* Hàng Thuế (VAT) */}
                {localTaxTotal > 0 && (
                  <View className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200">
                    <Text className="text-xs text-slate-455 font-medium">Thuế (VAT):</Text>
                    <Text className="text-xs text-slate-700 font-semibold">
                      {formatCurrency(localTaxTotal)}
                    </Text>
                  </View>
                )}

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
                      <Text className="text-xs font-semibold text-orange-500 ml-1">Thêm</Text>
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
                      if (row.method === 'cash' || row.method?.startsWith('cash-')) fundType = 'cash';
                      else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(row.method) || row.method?.startsWith('momo-') || row.method?.startsWith('zalopay-') || row.method?.startsWith('vnpay-')) fundType = 'wallet';
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
                      {matchingFunds.length >= 1 && row.method !== 'debt' && !row.method?.startsWith('debt-') && row.method !== 'prepaid' && !row.method?.startsWith('prepaid-') && (
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
                              <Text className="text-xs font-bold text-orange-900" numberOfLines={1}>
                                {(() => {
                                  const f = activeFund || matchingFunds[0];
                                  return f ? `${f.name}${f.account_number ? ` (STK: ${f.account_number})` : ''}` : '';
                                })()}
                              </Text>
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
                                <Text className="text-xs font-bold text-orange-900" numberOfLines={1}>
                                  {activeFund 
                                    ? `${activeFund.name}${activeFund.account_number ? ` (STK: ${activeFund.account_number})` : ''}` 
                                    : 'Chọn quỹ...'}
                                </Text>
                              </View>
                              <Ionicons name="chevron-down" size={12} color="#c2410c" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Info for PrePaid / Debt */}
                      {(row.method === 'prepaid' || row.method?.startsWith('prepaid-')) && (
                        <View className="mt-2 flex-row justify-between bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                          <Text className="text-xs font-medium text-emerald-800">Ví khả dụng:</Text>
                          <Text className="text-xs font-bold text-emerald-700">{selectedCustomer ? formatCurrency(selectedCustomer.prepaid_balance || 0) : '0 ₫'}</Text>
                        </View>
                      )}
                      {(row.method === 'debt' || row.method?.startsWith('debt-')) && (
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
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable
                className="absolute inset-0"
                onPress={() => setSelectingMethodRow(null)}
              />
              <Pressable onPress={() => {}} className="bg-white rounded-t-3xl p-6 pb-8 max-h-[70%]" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
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
                            
                            const isBankTransfer = m.type === 'bank' && m.code !== 'card';
                            if (isBankTransfer && (!dFund || !dFund.account_number || dFund.account_number.trim() === '')) {
                              Alert.alert(
                                "Cảnh báo thông tin Quỹ",
                                "Tài khoản đã chọn chưa được cấu hình số tài khoản, bạn có chắc muốn tiếp tục sử dụng phương thức này?",
                                [
                                  { text: "Quay lại", style: "cancel" },
                                  { 
                                    text: "Đồng ý tiếp tục", 
                                    onPress: () => {
                                      setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, method: m.value, fund_id: dFund?.id || ''} : r));
                                      setSelectingMethodRow(null);
                                    } 
                                  }
                                ]
                              );
                            } else {
                              setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, method: m.value, fund_id: dFund?.id || ''} : r));
                              setSelectingMethodRow(null);
                            }
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
              </Pressable>
            </View>
          )}

          {/* Modal chọn quỹ tài chính */}
          {selectingFundRow !== null && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable
                className="absolute inset-0"
                onPress={() => setSelectingFundRow(null)}
              />
              <Pressable onPress={() => {}} className="bg-white rounded-t-3xl p-6 pb-8 max-h-[70%]" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }}>
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
                            const currentRow = paymentRows[idx];
                            const methodObj = resolvedMethods.find(rm => rm.value === currentRow?.method);
                            const isBankTransfer = methodObj && methodObj.type === 'bank' && methodObj.code !== 'card';
                            
                            if (isBankTransfer && (!f.account_number || f.account_number.trim() === '')) {
                              Alert.alert(
                                "Cảnh báo thông tin Quỹ",
                                "Tài khoản đã chọn chưa được cấu hình số tài khoản, bạn có chắc muốn tiếp tục sử dụng phương thức này?",
                                [
                                  { text: "Quay lại", style: "cancel" },
                                  { 
                                    text: "Đồng ý tiếp tục", 
                                    onPress: () => {
                                      setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, fund_id: f.id} : r));
                                      setSelectingFundRow(null);
                                    } 
                                  }
                                ]
                              );
                            } else {
                              setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, fund_id: f.id} : r));
                              setSelectingFundRow(null);
                            }
                          }}
                        >
                          <View className="flex-1 pr-4">
                            <Text className={`text-sm font-bold ${isSelected ? 'text-orange-600' : 'text-slate-800'}`}>
                              {f.name}
                            </Text>
                            {f.account_number ? (
                              <Text className="text-xs text-slate-500 mt-1">
                                STK: {f.account_number}
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
              </Pressable>
            </View>
          )}
          {/* Dialog xác nhận thanh toán */}
          <Dialog
            visible={isConfirmVisible}
            onClose={() => setIsConfirmVisible(false)}
            onConfirm={() => {
              const debtOpts = clampedDebtRepay > 0 ? { debtRepayAmount: clampedDebtRepay, ...selectDebtFund() } : undefined;
              const checkoutOpts = {
                ...debtOpts,
                customCheckoutTime: customCheckoutTime || undefined,
                rentalType: localRentalType
              };
              setIsConfirmVisible(false);
              setTimeout(async () => {
                await onCheckout(checkoutOpts);
              }, 400);
            }}
            title="Xác nhận Thanh toán"
            description="Bạn có chắc chắn muốn hoàn tất thanh toán hóa đơn này không?"
            confirmLabel="Xác nhận"
            cancelLabel="Hủy"
            variant="default"
            loading={loading}
          >
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={true} className="w-full">
            {/* Alert Banner */}
            <View className="flex-row gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 w-full">
              <Ionicons name="warning-outline" size={16} color="#d97706" style={{ marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-[10px] text-amber-700 mt-0.5 leading-normal">
                  Vui lòng đối chiếu kỹ số tiền thực tế và phương thức thanh toán trước khi xác nhận.
                </Text>
              </View>
            </View>

            {/* Bill Info Table */}
            <View className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50 w-full mb-3">
              <View className="flex-row justify-between p-3 border-b border-slate-100 items-center">
                <Text className="text-slate-500 text-xs font-medium">Tiền hàng</Text>
                <View className="flex-row items-baseline">
                  <Text className="font-semibold text-slate-800 text-xs">{formatCurrency(finalTotal).replace(/[đ₫]/g, '').trim()}</Text>
                  <Text className="text-[9px] font-bold text-slate-400 ml-0.5">đ</Text>
                </View>
              </View>
              
              {clampedDebtRepay > 0 && (
                <View className="flex-row justify-between p-3 border-b border-slate-100 bg-rose-50/10 items-center">
                  <Text className="text-rose-600/90 text-xs font-medium">Trả nợ cũ</Text>
                  <View className="flex-row items-baseline">
                    <Text className="font-semibold text-rose-700 text-xs">+{formatCurrency(clampedDebtRepay).replace(/[đ₫]/g, '').trim()}</Text>
                    <Text className="text-[9px] font-bold text-slate-400 ml-0.5">đ</Text>
                  </View>
                </View>
              )}

              {(clampedDebtRepay > 0 || changeToReturn > 0) && (
                <View className="flex-row justify-between p-3 bg-slate-100/50 items-center border-b border-slate-100">
                  <Text className="text-emerald-600 text-xs font-bold">Tổng cần thu</Text>
                  <View className="flex-row items-baseline">
                    <Text className="font-bold text-emerald-600 text-sm">{formatCurrency(finalTotal + clampedDebtRepay).replace(/[đ₫]/g, '').trim()}</Text>
                    <Text className="text-[9px] font-bold text-emerald-600 ml-0.5">đ</Text>
                  </View>
                </View>
              )}

              {changeToReturn > 0 && (
                <>
                  <View className="flex-row justify-between p-3 border-b border-slate-100 bg-blue-50/10 items-center">
                    <Text className="text-blue-600/90 text-xs font-medium">Khách đưa</Text>
                    <View className="flex-row items-baseline">
                      <Text className="font-bold text-blue-750 text-xs">{formatCurrency(paidSum).replace(/[đ₫]/g, '').trim()}</Text>
                      <Text className="text-[9px] font-bold text-slate-400 ml-0.5">đ</Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between p-3 bg-red-50/20 items-center">
                    <Text className="text-red-600 text-xs font-bold">Tiền thừa trả khách</Text>
                    <View className="flex-row items-baseline">
                      <Text className="font-bold text-red-600 text-sm">{formatCurrency(changeToReturn).replace(/[đ₫]/g, '').trim()}</Text>
                      <Text className="text-[9px] font-bold text-red-500 ml-0.5">đ</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Detailed Payments Table */}
            <View className="w-full mt-1">
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Chi tiết thanh toán</Text>
              <View className="border border-slate-100 rounded-xl bg-white w-full">
                {paymentRows.filter(p => (parseFloat(String(p.amount)) || 0) > 0).map((p, idx, arr) => {
                  const foundMethod = resolvedMethods.find(m => m.value === p.method || m.code === p.method);
                  const methodName = foundMethod ? foundMethod.label : p.method;
                  const amt = parseFloat(String(p.amount)) || 0;
                  
                  let fundDetail = '';
                  if (p.method !== 'debt' && p.method !== 'prepaid') {
                    let fundType = 'bank';
                    if (foundMethod) {
                      fundType = foundMethod.type || 'bank';
                    } else {
                      if (p.method === 'cash') fundType = 'cash';
                      else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(p.method)) fundType = 'wallet';
                    }
                    const matchingFunds = paymentFundsList.filter(f => f.type === fundType);
                    const activeFund = paymentFundsList.find(f => f.id === p.fund_id) || matchingFunds[0];
                    if (activeFund) {
                      fundDetail = activeFund.name + (activeFund.account_number ? ` (STK: ${activeFund.account_number})` : '');
                    }
                  }

                  const isLast = idx === arr.length - 1;

                  return (
                    <View key={p.id} className={`flex-row justify-between items-center p-3 w-full ${!isLast ? 'border-b border-slate-100' : ''}`}>
                      <View className="flex-1 pr-2">
                        <Text className="font-semibold text-slate-800 text-xs">{methodName}</Text>
                        {fundDetail ? <Text className="text-[9px] text-slate-400 mt-0.5 leading-normal">{fundDetail}</Text> : null}
                      </View>
                      <View className="flex-row items-baseline shrink-0">
                        <Text className="font-bold text-slate-900 text-xs">{formatCurrency(amt).replace(/[đ₫]/g, '').trim()}</Text>
                        <Text className="text-[9px] font-bold text-slate-400 ml-0.5">đ</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
            </ScrollView>
          </Dialog>

          {/* Dialog xác nhận thay đổi giờ ra */}
          <Dialog
            visible={isConfirmCheckoutTimeVisible}
            onClose={() => setIsConfirmCheckoutTimeVisible(false)}
            onConfirm={() => {
              if (pendingCheckoutTime) {
                setCustomCheckoutTime(pendingCheckoutTime);
                setIsEditingCheckoutTime(false);
                setIsConfirmCheckoutTimeVisible(false);
                setPendingCheckoutTime(null);
              }
            }}
            title="Xác nhận thay đổi giờ ra"
            confirmLabel="Xác nhận"
            cancelLabel="Hủy"
            variant="default"
          >
            {pendingCheckoutTime && (
              <View className="space-y-3.5 w-full">
                {/* 1. Các mốc thời gian so sánh */}
                <View className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[10px] text-slate-500 font-semibold">GIỜ VÀO:</Text>
                    <Text className="text-xs font-bold text-slate-800">
                      {cartOwnerTable?.startTime ? formatDateTime(new Date(cartOwnerTable.startTime)) : 'N/A'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center border-t border-slate-100 pt-2.5">
                    <Text className="text-[10px] text-slate-500 font-semibold">GIỜ RA (ĐÃ SỬA):</Text>
                    <Text className="text-xs font-bold text-orange-600">
                      {formatDateTime(pendingCheckoutTime)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center border-t border-slate-100 pt-2.5">
                    <Text className="text-[10px] text-slate-500 font-semibold">GIỜ HIỆN TẠI (HỆ THỐNG):</Text>
                    <Text className="text-xs font-bold text-slate-600">
                      {formatDateTime(new Date())}
                    </Text>
                  </View>
                </View>

                {/* 2. Phần thông báo nếu lệch quá lớn */}
                {(() => {
                  const now = new Date();
                  const diffMs = Math.abs(pendingCheckoutTime.getTime() - now.getTime());
                  const totalMinutes = Math.floor(diffMs / (1000 * 60));
                  
                  const days = Math.floor(totalMinutes / (24 * 60));
                  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                  const mins = totalMinutes % 60;
                  
                  const parts = [];
                  if (days > 0) parts.push(`${days} ngày`);
                  if (hours > 0) parts.push(`${hours} giờ`);
                  if (mins > 0) parts.push(`${mins} phút`);
                  const diffLabel = parts.join(' ');

                  const isDeviationLarge = totalMinutes >= 15;
                  
                  return (
                    <View className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 mt-3">
                      <View className="flex-row items-center">
                        <Ionicons name="shield-checkmark-outline" size={14} color="#d97706" />
                        <Text className="text-[10px] font-bold text-amber-800 ml-1">Cảnh báo</Text>
                      </View>
                      <Text className="text-[10px] text-amber-800 leading-relaxed font-medium">
                        {isDeviationLarge 
                          ? `Chú ý: Giờ ra lệch ${diffLabel} so với giờ thực tế. Hành động thay đổi giờ giấc này sẽ được ghi nhận chi tiết vào lịch sử hệ thống.`
                          : 'Hành động thay đổi giờ ra này sẽ được ghi lại trong nhật ký hệ thống để đảm bảo tính minh bạch.'
                        }
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </Dialog>

          {/* MODAL FORM THÊM NHANH KHÁCH HÀNG MỚI (Dùng absolute View thay vì lồng Modal để tránh đơ UI trên React Native) */}
          {isQuickAddModalOpen && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
              <Pressable
                className="absolute inset-0"
                onPress={() => setIsQuickAddModalOpen(false)}
              />
              <Pressable onPress={() => {}} className="h-[80%] rounded-t-[32px] p-6 justify-between bg-white relative">
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
                  <Text className="text-lg font-medium text-slate-800">Thêm khách hàng mới</Text>
                  <TouchableOpacity onPress={() => setIsQuickAddModalOpen(false)} className="p-1">
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Tên khách hàng <Text className="text-red-500">*</Text></Text>
                  <TextInput
                    placeholder="Nguyễn Văn A"
                    placeholderTextColor="#cbd5e1"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                    value={quickCustName}
                    onChangeText={setQuickCustName}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />

                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Số điện thoại <Text className="text-red-500">*</Text></Text>
                  <TextInput
                    placeholder="0909xxxxxx"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="phone-pad"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                    value={quickCustPhone}
                    onChangeText={setQuickCustPhone}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />

                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Hạng thành viên</Text>
                  <View className="flex-row justify-between mb-4">
                    {['Thành viên', 'Thân thiết', 'VIP'].map(tier => (
                      <TouchableOpacity
                        key={tier}
                        className="flex-1 mx-1 py-2.5 rounded-xl border-2 items-center"
                        style={quickCustType === tier ? {
                          backgroundColor: '#fff7ed', // bg-orange-50
                          borderColor: '#fa5908', // border-orange-500
                        } : {
                          backgroundColor: '#ffffff', // bg-white
                          borderColor: '#e2e8f0', // border-slate-200
                        }}
                        onPress={() => setQuickCustType(tier)}
                      >
                        <Text className={`text-tiny font-semibold ${
                          quickCustType === tier ? 'text-orange-500' : 'text-slate-500'
                        }`}>
                          {tier}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Địa chỉ Email</Text>
                  <TextInput
                    placeholder="email@example.com"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="email-address"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                    value={quickCustEmail}
                    onChangeText={setQuickCustEmail}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />

                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Địa chỉ nhà</Text>
                  <TextInput
                    placeholder="Số nhà, đường, phường/xã..."
                    placeholderTextColor="#cbd5e1"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                    value={quickCustAddress}
                    onChangeText={setQuickCustAddress}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />

                  <Text className="text-xs text-slate-500 font-medium mb-1.5">Ghi chú đặc biệt</Text>
                  <TextInput
                    placeholder="Nhập ghi chú khách hàng..."
                    placeholderTextColor="#cbd5e1"
                    multiline={true}
                    numberOfLines={3}
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4 h-20"
                    value={quickCustNote}
                    onChangeText={setQuickCustNote}
                    style={{
                      lineHeight: undefined,
                      textAlignVertical: 'top',
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </ScrollView>

                <TouchableOpacity 
                  className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg flex-row justify-center mt-2"
                  onPress={handleSaveQuickCustomer}
                  disabled={isQuickSaving}
                >
                  {isQuickSaving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                      <Text className="text-white font-medium text-sm ml-1.5">Lưu khách hàng (Offline & Sync)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Pressable>
            </View>
          )}

          {/* Modal chỉnh sửa giảm giá (Dùng absolute View thay vì lồng Modal để tránh đơ UI trên React Native) */}
          {isDiscountModalVisible && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingHorizontal: 20 }}>
              <Pressable className="absolute inset-0" onPress={() => setIsDiscountModalVisible(false)} />
              <Pressable onPress={() => {}} className="bg-white rounded-3xl p-6 w-full max-w-sm relative" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}>
                {/* Header */}
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-sm font-semibold text-slate-800">Cấu hình giảm giá</Text>
                  <TouchableOpacity onPress={() => setIsDiscountModalVisible(false)} className="p-1">
                    <Ionicons name="close" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Tabs Selector */}
                <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4 border border-slate-200">
                  <Pressable
                    onPress={() => {
                      setDiscountTypeTab('amount');
                      setDiscountInputValue('');
                    }}
                    className="flex-1 py-2 items-center justify-center rounded-lg"
                    style={discountTypeTab === 'amount' ? {
                      backgroundColor: '#ffffff',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: 2,
                    } : undefined}
                  >
                    <Text className={`text-xs font-semibold ${discountTypeTab === 'amount' ? 'text-slate-800' : 'text-slate-500'}`}>
                      Số tiền (đ)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setDiscountTypeTab('percent');
                      setDiscountInputValue('');
                    }}
                    className="flex-1 py-2 items-center justify-center rounded-lg"
                    style={discountTypeTab === 'percent' ? {
                      backgroundColor: '#ffffff',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: 2,
                    } : undefined}
                  >
                    <Text className={`text-xs font-semibold ${discountTypeTab === 'percent' ? 'text-slate-800' : 'text-slate-500'}`}>
                      Phần trăm (%)
                    </Text>
                  </Pressable>
                </View>

                {/* Input tương ứng */}
                <View className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-5 flex-row items-center">
                  <Text className="text-xs font-semibold text-slate-500 mr-2">
                    {discountTypeTab === 'amount' ? '💵' : '🏷️'}
                  </Text>
                  <TextInput
                    className="flex-1 text-xs font-semibold text-slate-800"
                    keyboardType="numeric"
                    placeholder={discountTypeTab === 'amount' ? 'Nhập số tiền giảm giá...' : 'Nhập phần trăm giảm (0-100)...'}
                    placeholderTextColor="#cbd5e1"
                    value={discountTypeTab === 'amount' ? (discountInputValue === '' ? '' : maskCurrencyInput(discountInputValue)) : discountInputValue}
                    onChangeText={(val) => {
                      if (discountTypeTab === 'amount') {
                        const masked = maskCurrencyInput(val);
                        const amt = parseCurrencyToNumber(masked);
                        setDiscountInputValue(amt > 0 ? amt.toString() : '');
                      } else {
                        const raw = val.replace(/[^\d.]/g, '');
                        const num = parseFloat(raw);
                        if (isNaN(num)) {
                          setDiscountInputValue('');
                        } else {
                          setDiscountInputValue(Math.min(100, num).toString());
                        }
                      }
                    }}
                    autoFocus={true}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                  {discountInputValue.length > 0 && (
                    <TouchableOpacity onPress={() => setDiscountInputValue('')} className="p-0.5">
                      <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Preview giảm giá thực tế */}
                {discountInputValue.length > 0 && (
                  <View className="mb-5 bg-orange-50 border border-orange-100 p-3.5 rounded-xl">
                    <Text className="text-[10px] text-orange-700 font-semibold uppercase tracking-wider mb-1">
                      Ước tính giảm giá:
                    </Text>
                    <Text className="text-xs font-semibold text-slate-800">
                      Tổng giảm giá: <Text className="text-rose-500 font-bold">
                        {(() => {
                          if (discountTypeTab === 'amount') {
                            const amt = parseCurrencyToNumber(discountInputValue);
                            return formatCurrency(Math.min(localCartTotal, amt));
                          } else {
                            const percent = parseFloat(discountInputValue) || 0;
                            const amt = Math.round((localCartTotal * percent) / 100);
                            return formatCurrency(Math.min(localCartTotal, amt));
                          }
                        })()}
                      </Text>
                    </Text>
                  </View>
                )}

                {/* Actions Footer */}
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setIsDiscountModalVisible(false)}
                    className="flex-1 py-2.5 items-center justify-center rounded-xl border border-slate-200 bg-white"
                  >
                    <Text className="text-xs font-semibold text-slate-650">Hủy bỏ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      let finalAmt = 0;
                      if (discountTypeTab === 'amount') {
                        const parsed = parseCurrencyToNumber(discountInputValue);
                        finalAmt = isNaN(parsed) ? 0 : parsed;
                      } else {
                        const percent = parseFloat(discountInputValue) || 0;
                        const cappedPercent = Math.min(100, Math.max(0, percent));
                        finalAmt = Math.round((localCartTotal * cappedPercent) / 100);
                      }
                      finalAmt = Math.min(localCartTotal, finalAmt);
                      setDiscountAmount(finalAmt);
                      setIsDiscountModalVisible(false);
                    }}
                    className="flex-[2] py-2.5 items-center justify-center rounded-xl bg-orange-500"
                  >
                    <Text className="text-xs font-bold text-white">Đồng ý</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}
