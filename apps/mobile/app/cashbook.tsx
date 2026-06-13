import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator, TouchableWithoutFeedback, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils/format';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { KeepAliveManager } from '../lib/sync/KeepAliveManager';
import { SyncManager } from '../lib/sync/SyncManager';
import * as Haptics from 'expo-haptics';
import { usePermissions } from '../lib/auth/PermissionsContext';
import { getApiBaseUrl, getApiHeaders } from '../lib/api/config';

const CATEGORY_MAP: Record<string, string> = {
  sales: 'Bán hàng',
  debt_collection: 'Thu nợ',
  debt_payment: 'Trả nợ',
  import: 'Nhập hàng',
  salary: 'Lương nhân viên',
  utilities: 'Điện nước/Mặt bằng',
  other: 'Khác',
  refund: 'Hoàn tiền',
  inventory: 'Kho hàng',
  inventory_payment: 'Thanh toán nhập kho',
  inventory_receipt: 'Thu nhập kho',
  prepaid_deposit: 'Nạp tiền ví trả trước',
  depreciation_expense: 'Chi phí khấu hao',
};

const RECEIPT_CATEGORIES = [
  { value: 'sales', label: 'Bán hàng' },
  { value: 'debt_collection', label: 'Thu nợ khách hàng' },
  { value: 'other', label: 'Thu nhập khác' },
];

const PAYMENT_CATEGORIES = [
  { value: 'import', label: 'Nhập hàng' },
  { value: 'salary', label: 'Lương nhân viên' },
  { value: 'utilities', label: 'Điện nước/Mặt bằng' },
  { value: 'other', label: 'Chi phí khác' },
];

export default function CashbookScreen() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('cashbook.manage');
  const { customer_id } = useLocalSearchParams<{ customer_id?: string }>();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Tổng quan tài chính
  const [netBalance, setNetBalance] = useState(0);
  const [totalReceipt, setTotalReceipt] = useState(0);
  const [totalPayment, setTotalPayment] = useState(0);

  // Form states tạo phiếu thu chi
  const [showAddModal, setShowAddModal] = useState(false);
  const [txType, setTxType] = useState<'receipt' | 'payment'>('payment');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  
  const availableCategories = txType === 'receipt' ? RECEIPT_CATEGORIES : PAYMENT_CATEGORIES;
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States hiển thị selector dropdown
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [showFundSelector, setShowFundSelector] = useState(false);
  const [showCustomerSelector, setShowCustomerSelector] = useState(false);

  // Confirm Modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    type: 'receipt' | 'payment';
    isOffline: boolean;
    amount: number;
    category: string;
    categoryLabel: string;
    refName: string;
    customerId: string;
    currentDebt: number;
    isDebtCollection: boolean;
    debtToPay: number;
    prepaidToDeposit: number;
    remainingDebt: number;
    shopId: string;
    userEmail: string;
  } | null>(null);

  // Sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');

  // Toast states
  const [toastMsg, setToastMsg] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({message, type});
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
      type === 'error' ? Haptics.NotificationFeedbackType.Error :
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    
    Animated.sequence([
      Animated.timing(toastOpacity, {toValue: 1, duration: 250, useNativeDriver: true}),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {toValue: 0, duration: 250, useNativeDriver: true})
    ]).start(() => setToastMsg(null));
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    showToast('Đang tiến hành đồng bộ dữ liệu...', 'info');
    try {
      await KeepAliveManager.triggerSyncIfNeeded(true);
      await loadCashbookData();
      showToast('Đồng bộ dữ liệu sổ quỹ thành công!', 'success');
    } catch (err) {
      showToast('Đồng bộ thất bại, vui lòng thử lại!', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const renderToast = () => {
    if (!toastMsg) return null;
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
          shadowOffset: {width: 0, height: 4},
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 999
        }}
        className={`flex-row items-center px-4 py-3.5 rounded-2xl border ${
          toastMsg.type === 'success' ? 'bg-emerald-500 border-emerald-600' :
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

  // Tự động mở modal thu nợ khi chuyển hướng từ danh sách khách hàng
  React.useEffect(() => {
    if (customer_id && customers.length > 0) {
      if (!canManage) {
        Alert.alert('Không có quyền', 'Bạn không có quyền thực hiện lập phiếu thu nợ.');
        router.replace('/cashbook');
        return;
      }
      const matchedCust = customers.find(c => c.id === customer_id);
      if (matchedCust) {
        setTxType('receipt');
        setCategory('debt_collection');
        setCustomerId(customer_id);
        
        const debt = matchedCust.debt_amount || 0;
        if (debt > 0) {
          setAmount(debt.toLocaleString('vi-VN'));
        } else {
          setAmount('');
        }
        
        setShowAddModal(true);
      }
    }
  }, [customer_id, customers, canManage]);

  const loadCashbookData = async () => {
    try {
      setIsLoading(true);

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

      // 1. Tải danh sách quỹ (Lọc theo chi nhánh an toàn)
      const localFunds = await db
        .select()
        .from(schema.paymentFunds)
        .where(eq(schema.paymentFunds.branch_id, shopId));
      setFunds(localFunds);
      if (localFunds.length > 0 && !fundId) {
        const defaultFund = localFunds.find((f: any) => f.is_default) || localFunds[0];
        setFundId(defaultFund.id);
      }

      // 2. Tải danh sách khách hàng
      const localCustomers = await db.select().from(schema.customers);
      setCustomers(localCustomers);

      // 3. Tải danh sách giao dịch sổ quỹ (Lọc theo chi nhánh an toàn)
      let localTx: any[] = [];
      if (Platform.OS !== 'web') {
        localTx = await db
          .select()
          .from(schema.cashbook)
          .where(eq(schema.cashbook.branch_id, shopId))
          .orderBy(desc(schema.cashbook.date), desc(schema.cashbook.id));
      } else {
        // Mock data cho web simulator
        localTx = [
          { id: '1', type: 'receipt', amount: 350000, category: 'debt_collection', reference_name: 'Nguyễn Văn A', note: 'Thu nợ', date: '2026-06-08T10:30:00.000Z', sync_status: 'synced' },
          { id: '2', type: 'payment', amount: 1200000, category: 'utilities', note: 'Thanh toán tiền điện', date: '2026-06-07T15:45:00.000Z', sync_status: 'synced' },
        ];
      }
      setTransactions(localTx);

      // 4. Tính toán số dư tổng quan
      let receipts = 0;
      let payments = 0;
      localTx.forEach(t => {
        if (t.type === 'receipt') receipts += t.amount;
        else payments += t.amount;
      });

      // Số dư ban đầu của các quỹ
      const initialBalanceSum = localFunds.reduce((sum: number, f: any) => sum + (f.initial_balance || 0), 0);

      setTotalReceipt(receipts);
      setTotalPayment(payments);
      setNetBalance(initialBalanceSum + receipts - payments);

      // 5. Cập nhật syncStatus dựa trên xem có dòng nào pending không
      const hasPending = localTx.some(t => t.sync_status === 'pending');
      setSyncStatus(hasPending ? 'pending' : 'synced');
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu sổ quỹ:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCashbookData();
    }, [])
  );

  const saveSingleTransaction = async (
    shopId: string, 
    userEmail: string, 
    amt: number, 
    cat: string, 
    refName: string, 
    isOffline: boolean
  ) => {
    const txId = `cb-local-${Date.now()}`;
    const todayStr = new Date().toISOString();

    if (txType === 'receipt' && cat === 'debt_collection' && customerId) {
      // Khấu trừ công nợ của khách hàng trực tiếp trong SQLite
      if (Platform.OS !== 'web') {
        const matchedCust = customers.find(c => c.id === customerId);
        const currentDebt = matchedCust?.debt_amount || 0;
        const newDebt = Math.max(0, currentDebt - amt);
        await db
          .update(schema.customers)
          .set({ debt_amount: newDebt })
          .where(eq(schema.customers.id, customerId));
      }
    }

    // Ghi phiếu thu chi vào SQLite cục bộ
    if (Platform.OS !== 'web') {
      const isBank = fundId && funds.find(f => f.id === fundId)?.type === 'bank';
      await db.insert(schema.cashbook).values({
        id: txId,
        branch_id: shopId,
        type: txType,
        amount: amt,
        method: isBank ? 'bank_transfer' : 'cash',
        category: cat,
        reference_id: customerId || null,
        reference_name: refName || null,
        employee_id: userEmail,
        note,
        date: todayStr,
        fund_id: fundId || null,
        sync_status: 'pending',
      });
    }

    finishSubmit(`Đã lưu phiếu ${txType === 'receipt' ? 'Thu' : 'Chi'} ${isOffline ? 'ngoại tuyến ' : ''}thành công!`);
  };

  const saveSplitTransaction = async (
    shopId: string, 
    userEmail: string, 
    debtAmt: number, 
    prepaidAmt: number, 
    refName: string, 
    isOffline: boolean
  ) => {
    const todayStr = new Date().toISOString();
    const isBank = fundId && funds.find(f => f.id === fundId)?.type === 'bank';
    const payMethod = isBank ? 'bank_transfer' : 'cash';

    // 1. Cập nhật SQLite
    if (Platform.OS !== 'web' && customerId) {
      const matchedCust = customers.find(c => c.id === customerId);
      const currentPrepaid = matchedCust?.prepaid_balance || 0;
      await db
        .update(schema.customers)
        .set({ debt_amount: 0, prepaid_balance: currentPrepaid + prepaidAmt })
        .where(eq(schema.customers.id, customerId));
    }

    // 2. Tạo 2 phiếu thu chi locally
    if (Platform.OS !== 'web') {
      // Phiếu 1: Thu nợ (debt_collection)
      if (debtAmt > 0) {
        await db.insert(schema.cashbook).values({
          id: `cb-local-debt-${Date.now()}`,
          branch_id: shopId,
          type: 'receipt',
          amount: debtAmt,
          method: payMethod,
          category: 'debt_collection',
          reference_id: customerId || null,
          reference_name: refName || null,
          employee_id: userEmail,
          note: note ? `${note} (Khấu trừ nợ)` : 'Thu nợ đối tác',
          date: todayStr,
          fund_id: fundId || null,
          sync_status: 'pending',
        });
      }

      // Phiếu 2: Nạp ví trả trước (prepaid_deposit)
      if (prepaidAmt > 0) {
        await db.insert(schema.cashbook).values({
          id: `cb-local-prepaid-${Date.now() + 1}`,
          branch_id: shopId,
          type: 'receipt',
          amount: prepaidAmt,
          method: payMethod,
          category: 'prepaid_deposit',
          reference_id: customerId || null,
          reference_name: refName || null,
          employee_id: userEmail,
          note: note ? `${note} (Nạp ví trả trước)` : 'Nạp tiền ví trả trước',
          date: todayStr,
          fund_id: fundId || null,
          sync_status: 'pending',
        });
      }
    }

    finishSubmit(`Đã khấu trừ nợ ${formatCurrency(debtAmt)} và nạp ví ${formatCurrency(prepaidAmt)} thành công!`);
  };

  const finishSubmit = async (msg: string) => {
    setShowAddModal(false);
    setAmount('');
    setNote('');
    setCustomerId('');
    setCustomerSearch('');
    
    showToast(msg, 'success');
    
    // Đợi đồng bộ nền hoàn thành (nếu đang online) trước khi tải lại dữ liệu để UI cập nhật trạng thái 'synced'
    try {
      await KeepAliveManager.triggerSyncIfNeeded(false);
    } catch (e) {}

    // Tải lại dữ liệu
    await loadCashbookData();
    setIsSubmitting(false);
  };

  const handleCreateTransaction = async () => {
    const numericAmt = parseInt(amount.replace(/\D/g, ''), 10) || 0;
    if (numericAmt <= 0) {
      Alert.alert('Lỗi', 'Số tiền giao dịch phải lớn hơn 0đ');
      return;
    }

    if (!canManage) {
      Alert.alert('Không có quyền', 'Bạn không có quyền thực hiện lập phiếu thu/chi.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';

      // --- 1. KIỂM TRA CA LÀM VIỆC (SHIFT VALIDATION) ---
      const isShiftEnabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      const hasBypassShift = hasPermission('cashbook.shift.manage');

      if (isShiftEnabled && !activeShiftId && !hasBypassShift) {
        Alert.alert(
          'Yêu cầu mở ca làm việc',
          'Vui lòng mở ca làm việc tại POS trước khi thực hiện thu/chi!'
        );
        setIsSubmitting(false);
        return;
      }

      // --- 2. KIỂM TRA MẠNG (CONNECTIVITY CHECK) ---
      let isDeviceOffline = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        await fetch(getApiBaseUrl(), {
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (err) {
        isDeviceOffline = true;
      }

      // Thay thế Alert.alert bằng Custom Modal Xác Nhận
      let refName = '';
      let currentDebt = 0;
      let debtToPay = 0;
      let prepaidToDeposit = 0;
      let remainingDebt = 0;
      const isDebtCollection = txType === 'receipt' && category === 'debt_collection' && !!customerId;

      if (isDebtCollection) {
        const matchedCust = customers.find(c => c.id === customerId);
        if (matchedCust) {
          refName = matchedCust.name;
          currentDebt = matchedCust.debt_amount || 0;
          if (numericAmt === currentDebt) {
            debtToPay = currentDebt;
            prepaidToDeposit = 0;
            remainingDebt = 0;
          } else if (numericAmt > currentDebt) {
            debtToPay = currentDebt;
            prepaidToDeposit = numericAmt - currentDebt;
            remainingDebt = 0;
          } else {
            debtToPay = numericAmt;
            prepaidToDeposit = 0;
            remainingDebt = currentDebt - numericAmt;
          }
        }
      } else {
        if (customerId) {
          const matchedCust = customers.find(c => c.id === customerId);
          refName = matchedCust?.name || '';
        }
      }

      const categoryLabel = availableCategories.find(c => c.value === category)?.label || category;

      setConfirmData({
        type: txType,
        isOffline: isDeviceOffline,
        amount: numericAmt,
        category,
        categoryLabel,
        refName,
        customerId,
        currentDebt,
        isDebtCollection,
        debtToPay,
        prepaidToDeposit,
        remainingDebt,
        shopId,
        userEmail,
      });
      setShowConfirmModal(true);
      setIsSubmitting(false);

    } catch (err: any) {
      showToast(`Không thể lưu phiếu thu chi: ${err.message}`, 'error');
      setIsSubmitting(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!confirmData) return;
    setIsSubmitting(true);
    setShowConfirmModal(false);
    try {
      const {
        shopId,
        userEmail,
        amount: numericAmt,
        category,
        refName,
        isOffline,
        isDebtCollection,
        debtToPay,
        prepaidToDeposit,
      } = confirmData;

      if (isDebtCollection && prepaidToDeposit > 0) {
        await saveSplitTransaction(shopId, userEmail, debtToPay, prepaidToDeposit, refName, isOffline);
      } else {
        await saveSingleTransaction(shopId, userEmail, numericAmt, category, refName, isOffline);
      }
    } catch (err: any) {
      showToast(`Lỗi khi lưu phiếu: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
      setConfirmData(null);
    }
  };

  if (!hasPermission('cashbook.view')) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50 justify-center items-center px-6">
        <Ionicons name="lock-closed-outline" size={48} color="#ef4444" />
        <Text className="text-slate-800 font-bold text-base mt-4 text-center">Không có quyền truy cập</Text>
        <Text className="text-slate-400 text-xs text-center mt-2">Bạn không có quyền xem Sổ quỹ. Vui lòng liên hệ quản trị viên.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 bg-orange-500 px-6 py-2.5 rounded-xl"
          style={{ backgroundColor: '#fa5908' }}
        >
          <Text className="text-white font-bold text-xs">Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header 
        title="Sổ quỹ thu chi" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
      />

      <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
        
        {/* Card Số Dư Tổng Quan */}
        <View className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm mb-4">
          <Text className="text-xxs font-semibold text-slate-400">TỔNG SỐ DƯ QUỸ</Text>
          <Text className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(netBalance)}</Text>
          
          <View className="flex-row justify-between border-t border-slate-100 mt-4 pt-3">
            <View>
              <Text className="text-micro text-slate-400 font-semibold">TỔNG THU</Text>
              <Text className="text-xs font-bold text-emerald-600 mt-0.5">+{formatCurrency(totalReceipt)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-micro text-slate-400 font-semibold">TỔNG CHI</Text>
              <Text className="text-xs font-bold text-rose-600 mt-0.5">-{formatCurrency(totalPayment)}</Text>
            </View>
          </View>
        </View>

        {/* Nút Tạo Phiếu Nhanh (Chỉ hiển thị nếu có quyền manage) */}
        {canManage && (
          <View className="flex-row justify-between gap-3 mb-5">
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => { setTxType('receipt'); setCategory('other'); setShowAddModal(true); }}
              className="flex-1 bg-emerald-50 border border-emerald-100 py-3.5 rounded-2xl items-center flex-row justify-center"
            >
              <Ionicons name="add-circle" size={18} color="#059669" />
              <Text className="text-emerald-800 font-semibold text-xs ml-2">Lập phiếu THU</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => { setTxType('payment'); setCategory('other'); setShowAddModal(true); }}
              className="flex-1 bg-rose-50 border border-rose-100 py-3.5 rounded-2xl items-center flex-row justify-center"
            >
              <Ionicons name="remove-circle" size={18} color="#e11d48" />
              <Text className="text-rose-800 font-semibold text-xs ml-2">Lập phiếu CHI</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row justify-between items-center mb-3 px-1">
          <Text className="text-xxs font-semibold text-slate-500">Lịch sử giao dịch sổ quỹ</Text>
          <TouchableOpacity 
            onPress={handleManualSync}
            disabled={isSyncing}
            className="flex-row items-center"
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fa5908" className="mr-1" style={{ transform: [{ scale: 0.7 }] }} />
            ) : (
              <Ionicons name="sync-outline" size={14} color="#fa5908" className="mr-1" />
            )}
            <Text className="text-xxs font-bold text-orange-500">Đồng bộ</Text>
          </TouchableOpacity>
        </View>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#fa5908" className="py-10" />
        ) : transactions.length === 0 ? (
          <View className="bg-white border border-slate-100 rounded-3xl p-10 items-center justify-center">
            <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
            <Text className="text-xxs font-semibold text-slate-400 mt-3 text-center">Chưa phát sinh giao dịch nào.</Text>
          </View>
        ) : (
          transactions.map(item => {
            const isReceipt = item.type === 'receipt';
            const catName = CATEGORY_MAP[item.category] || item.category || 'Khác';
            
            const handleItemPress = async () => {
              if (item.sync_status !== 'failed') return;
              
              Alert.alert(
                'Đồng bộ lại giao dịch?',
                'Giao dịch này bị lỗi đồng bộ trước đó. Bạn có muốn gửi lại lên máy chủ ERP ngay bây giờ không?',
                [
                  { text: 'Hủy', style: 'cancel' },
                  { 
                    text: 'Đồng ý', 
                    onPress: async () => {
                      try {
                        showToast('Đang gửi lại giao dịch...', 'info');
                        
                        // Chuyển sync_status thành 'pending' trong SQLite
                        await db.update(schema.cashbook)
                          .set({ sync_status: 'pending' })
                          .where(eq(schema.cashbook.id, item.id));
                        
                        // Reset bộ đếm retry
                        SyncManager.clearCashbookRetry(item.id);

                        // Kích hoạt đồng bộ nền ngay lập tức
                        await KeepAliveManager.triggerSyncIfNeeded(true);
                        
                        // Tải lại giao dịch để cập nhật UI
                        await loadCashbookData();
                        showToast('Đã kích hoạt gửi lại giao dịch thành công!', 'success');
                      } catch (err: any) {
                        showToast(`Lỗi khi gửi lại: ${err.message}`, 'error');
                      }
                    }
                  }
                ]
              );
            };

            const CardComponent = item.sync_status === 'failed' ? Pressable : View;

            return (
              <CardComponent 
                key={item.id} 
                onPress={item.sync_status === 'failed' ? handleItemPress : undefined}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs mb-3 flex-row justify-between items-center"
              >
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center">
                    <View className={`w-2 h-2 rounded-full mr-2 ${isReceipt ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <Text className="text-xs font-semibold text-slate-800">{catName}</Text>
                  </View>
                  
                  {item.reference_name && (
                    <Text className="text-xxs font-medium text-slate-500 mt-1">Đối tác: {item.reference_name}</Text>
                  )}
                  {item.note && (
                    <Text className="text-xxs text-slate-400 font-semibold mt-1">Ghi chú: {item.note}</Text>
                  )}
                  
                  <View className="flex-row items-center mt-2.5">
                    <Text className="text-micro font-medium text-slate-400">
                      {item.date.includes('T') || item.date.includes(' ') ? formatDateTime(item.date) : formatDate(item.date)}
                    </Text>
                    <View className="mx-1.5 w-1 h-1 rounded-full bg-slate-200" />
                    {item.sync_status === 'pending' ? (
                      <Badge variant="warning" label="OFFLINE" size="sm" />
                    ) : item.sync_status === 'failed' ? (
                      <Badge variant="danger" label="THẤT BẠI - BẤM ĐỂ THỬ LẠI" size="sm" />
                    ) : item.sync_status === 'review' ? (
                      <Badge variant="danger" label="LỆCH - CẦN THAO TÁC TAY TRÊN WEB" size="sm" />
                    ) : (
                      <Badge variant="success" label="SYNCED" size="sm" />
                    )}
                  </View>
                </View>

                <Text className={`font-bold text-sm ${isReceipt ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isReceipt ? '+' : '-'}{formatCurrency(item.amount)}
                </Text>
              </CardComponent>
            );
          })
        )}

        <View className="h-20" />
      </ScrollView>

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setShowAddModal(false)}
          />
          <View className="bg-white rounded-t-3xl p-6 max-h-[85%] relative">
            
            {/* Header modal */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-base font-bold text-slate-800">
                Lập phiếu {txType === 'receipt' ? 'THU TIỀN' : 'CHI TIỀN'} ngoại tuyến
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
              
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Số tiền *</Text>
                <View className="relative justify-center">
                  <TextInput
                    value={amount}
                    onChangeText={(val) => {
                      const num = val.replace(/\D/g, '');
                      setAmount(num ? Number(num).toLocaleString('vi-VN') : '');
                    }}
                    keyboardType="numeric"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-base font-bold text-slate-800"
                    placeholder="0"
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                  <View style={{ position: 'absolute', right: 16, height: '100%', justifyContent: 'center' }}>
                    <Text className="text-sm font-semibold text-slate-400" style={{ lineHeight: undefined }}>đ</Text>
                  </View>
                </View>
              </View>

              {/* Loại phân mục thu chi */}
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Phân mục *</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowCategorySelector(true)}
                  className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                >
                  <Text className="text-xs font-semibold text-slate-800">
                    {availableCategories.find(c => c.value === category)?.label || 'Chọn phân mục'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Quỹ thanh toán */}
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sổ quỹ thanh toán *</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowFundSelector(true)}
                  className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                >
                  <Text className="text-xs font-semibold text-slate-800">
                    {funds.find(f => f.id === fundId)?.name || (funds.length === 0 ? 'Đang tải danh sách quỹ...' : 'Chọn quỹ')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Liên kết khách hàng (nếu là Thu Nợ) */}
              {txType === 'receipt' && category === 'debt_collection' && (
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Khách hàng cần thu nợ *</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowCustomerSelector(true)}
                    className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                  >
                    <Text className="text-xs font-semibold text-slate-800">
                      {customers.find(c => c.id === customerId)?.name 
                        ? `${customers.find(c => c.id === customerId)?.name} (Nợ: ${formatCurrency(customers.find(c => c.id === customerId)?.debt_amount || 0)})` 
                        : '-- Chọn khách hàng --'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>
              )}
              <View className="mb-6">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Ghi chú</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập nội dung thu chi..."
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-semibold text-slate-800"
                  style={{
                    paddingVertical: 0,
                    textAlignVertical: 'center',
                    lineHeight: undefined,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                  }}
                />
              </View>

              {/* Actions */}
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
                  onPress={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="flex-1 py-3.5 rounded-xl bg-orange-500 items-center justify-center flex-row"
                  onPress={handleCreateTransaction}
                  disabled={isSubmitting}
                  style={{ backgroundColor: '#fa5908' }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                      <Text className="text-white font-semibold text-xs ml-1.5">Lưu phiếu</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              
              <View className="h-10" />
            </ScrollView>

            {/* Category Selector Overlay */}
            {showCategorySelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn phân mục</Text>
                  <TouchableOpacity onPress={() => setShowCategorySelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {availableCategories.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => {
                        setCategory(c.value);
                        if (c.value !== 'debt_collection') {
                          setCustomerId('');
                        }
                        setShowCategorySelector(false);
                      }}
                      className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                    >
                      <Text className={`text-xs ${category === c.value ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                        {c.label}
                      </Text>
                      {category === c.value && (
                        <Ionicons name="checkmark" size={18} color="#fa5908" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Fund Selector Overlay */}
            {showFundSelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn sổ quỹ thanh toán</Text>
                  <TouchableOpacity onPress={() => setShowFundSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                {funds.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-4 text-center">Đang tải danh sách quỹ...</Text>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {funds.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => {
                          setFundId(f.id);
                          setShowFundSelector(false);
                        }}
                        className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                      >
                        <Text className={`text-xs ${fundId === f.id ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                          {f.name}
                        </Text>
                        {fundId === f.id && (
                          <Ionicons name="checkmark" size={18} color="#fa5908" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Customer Selector Overlay */}
            {showCustomerSelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-base font-bold text-slate-800">Chọn khách hàng cần thu nợ</Text>
                  <TouchableOpacity onPress={() => {
                    setCustomerSearch('');
                    setShowCustomerSelector(false);
                  }}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Thanh tìm kiếm nhanh khách hàng */}
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 mb-4">
                  <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
                  <TextInput
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    placeholder="Tìm kiếm tên hoặc số điện thoại..."
                    className="flex-1 text-xs text-slate-800 h-8 p-0"
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                  {customerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setCustomerSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>

                {(() => {
                  const filtered = customers.filter(c => {
                    const hasDebt = (c.debt_amount || 0) > 0;
                    if (!hasDebt) return false;
                    if (!customerSearch) return true;
                    const s = customerSearch.toLowerCase();
                    return (
                      (c.name || '').toLowerCase().includes(s) ||
                      (c.phone || '').toLowerCase().includes(s) ||
                      (c.customer_code || '').toLowerCase().includes(s)
                    );
                  });

                  if (filtered.length === 0) {
                    return <Text className="text-xs text-slate-500 py-4 text-center">Không tìm thấy khách hàng phù hợp.</Text>;
                  }

                  return (
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {filtered.map(c => (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => {
                            setCustomerId(c.id);
                            const debt = c.debt_amount || 0;
                            if (debt > 0) {
                              setAmount(debt.toLocaleString('vi-VN'));
                            }
                            setCustomerSearch('');
                            setShowCustomerSelector(false);
                          }}
                          className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                        >
                          <Text className={`text-xs ${customerId === c.id ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                            {c.name} (Nợ: {formatCurrency(c.debt_amount || 0)})
                          </Text>
                          {customerId === c.id && (
                            <Ionicons name="checkmark" size={18} color="#fa5908" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  );
                })()}
              </View>
            )}
                      </View>
        </View>
      </Modal>
      
      {/* Custom Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowConfirmModal(false);
          setConfirmData(null);
        }}
      >
        <View className="flex-1 justify-center items-center px-6">
          <TouchableWithoutFeedback onPress={() => {
            setShowConfirmModal(false);
            setConfirmData(null);
          }}>
            <View className="absolute inset-0 bg-black/60" />
          </TouchableWithoutFeedback>

          <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-sm relative z-50">
            <View className="items-center mb-4">
              <View className={`p-3 rounded-full mb-3 border ${
                confirmData?.isOffline 
                  ? 'bg-amber-50 border-amber-100' 
                  : confirmData?.type === 'receipt' 
                    ? 'bg-emerald-50 border-emerald-100' 
                    : 'bg-rose-50 border-rose-100'
              }`}>
                <Ionicons 
                  name={
                    confirmData?.isOffline 
                      ? 'cloud-offline-outline' 
                      : confirmData?.type === 'receipt' 
                        ? 'checkmark-circle-outline' 
                        : 'remove-circle-outline'
                  } 
                  size={24} 
                  color={
                    confirmData?.isOffline 
                      ? '#d97706' 
                      : confirmData?.type === 'receipt' 
                        ? '#059669' 
                        : '#e11d48'
                  } 
                />
              </View>
              <Text className="text-base font-bold text-slate-800 text-center font-semibold">
                {confirmData?.isOffline ? 'Xác nhận lưu ngoại tuyến' : 'Xác nhận lập phiếu'}
              </Text>
              <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
                Vui lòng kiểm tra lại thông tin giao dịch trước khi lưu.
              </Text>
            </View>

            {/* Chi tiết giao dịch */}
            <View className="bg-slate-50 p-4 rounded-2xl border mb-5" style={{ borderColor: '#f1f5f9' }}>
              
              {confirmData?.isDebtCollection ? (
                <>
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-xxs text-slate-400 font-semibold">KHÁCH HÀNG:</Text>
                    <Text className="text-xs font-bold text-slate-850">{confirmData.refName}</Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
                    <Text className="text-xxs text-slate-400 font-semibold">NỢ HIỆN TẠI:</Text>
                    <Text className="text-xs font-bold text-slate-800">{formatCurrency(confirmData.currentDebt)}</Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
                    <Text className="text-xxs text-slate-400 font-semibold">SỐ TIỀN KHÁCH TRẢ:</Text>
                    <Text className="text-xs font-bold text-orange-500">{formatCurrency(confirmData.amount)}</Text>
                  </View>

                  {/* Chi tiết phân bổ công nợ */}
                  <View className="border-t border-slate-200 mt-2 pt-2">
                    <Text className="text-[9px] font-bold text-slate-400 mb-1">PHÂN BỔ CHI TIẾT:</Text>
                    
                    {/* Dòng trả nợ */}
                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-xxs text-slate-600">Thu nợ:</Text>
                      <Text className="text-xs font-bold text-slate-800">{formatCurrency(confirmData.debtToPay)}</Text>
                    </View>

                    {/* Dòng cộng tài khoản trả trước (nếu có tiền thừa) */}
                    {confirmData.prepaidToDeposit > 0 && (
                      <View className="flex-row justify-between items-center py-1">
                        <Text className="text-xxs text-slate-600">Cộng tài khoản trả trước:</Text>
                        <Text className="text-xs font-bold text-emerald-600">+{formatCurrency(confirmData.prepaidToDeposit)}</Text>
                      </View>
                    )}

                    {/* Dòng nợ còn lại (nếu thu thiếu) */}
                    {confirmData.remainingDebt > 0 && (
                      <View className="flex-row justify-between items-center py-1">
                        <Text className="text-xxs text-slate-600">Số tiền nợ còn lại:</Text>
                        <Text className="text-xs font-bold text-rose-500">{formatCurrency(confirmData.remainingDebt)}</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-xxs text-slate-400 font-semibold">LOẠI PHIẾU:</Text>
                    <Text className={`text-xs font-bold ${confirmData?.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {confirmData?.type === 'receipt' ? 'PHIẾU THU' : 'PHIẾU CHI'}
                    </Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
                    <Text className="text-xxs text-slate-400 font-semibold">PHÂN MỤC:</Text>
                    <Text className="text-xs font-bold text-slate-800">{confirmData?.categoryLabel}</Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
                    <Text className="text-xxs text-slate-400 font-semibold">SỐ TIỀN:</Text>
                    <Text className={`text-xs font-bold ${confirmData?.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(confirmData?.amount || 0)}
                    </Text>
                  </View>

                  {note ? (
                    <View className="flex-row justify-between items-start py-2 border-t border-slate-200/50">
                      <Text className="text-xxs text-slate-400 font-semibold">GHI CHÚ:</Text>
                      <Text className="text-xs font-semibold text-slate-600 flex-1 text-right ml-4" numberOfLines={2}>
                        {note}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {confirmData?.isOffline && (
              <View className="bg-amber-50 border border-amber-100 p-3 rounded-xl mb-5 flex-row items-start">
                <Ionicons name="information-circle-outline" size={14} color="#d97706" style={{ marginTop: 1, marginRight: 6 }} />
                <Text className="text-[10px] text-amber-800 font-medium flex-1 leading-normal">
                  Thiết bị đang ngoại tuyến. Giao dịch này sẽ được lưu offline và tự động đồng bộ khi có kết nối mạng.
                </Text>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
                onPress={() => {
                  setShowConfirmModal(false);
                  setConfirmData(null);
                }}
                disabled={isSubmitting}
              >
                <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-xl bg-orange-500 items-center justify-center flex-row"
                onPress={handleConfirmSave}
                disabled={isSubmitting}
                style={{ backgroundColor: '#fa5908' }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-semibold text-xs">Xác nhận lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {renderToast()}
    </SafeAreaView>
  );
}
