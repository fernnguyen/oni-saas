import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator, TouchableWithoutFeedback, Animated } from 'react-native';
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
import * as Haptics from 'expo-haptics';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States hiển thị selector dropdown
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [showFundSelector, setShowFundSelector] = useState(false);
  const [showCustomerSelector, setShowCustomerSelector] = useState(false);

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
  }, [customer_id, customers]);

  const loadCashbookData = async () => {
    try {
      setIsLoading(true);

      // 1. Tải danh sách quỹ
      const localFunds = await db.select().from(schema.paymentFunds);
      setFunds(localFunds);
      if (localFunds.length > 0 && !fundId) {
        const defaultFund = localFunds.find((f: any) => f.is_default) || localFunds[0];
        setFundId(defaultFund.id);
      }

      // 2. Tải danh sách khách hàng
      const localCustomers = await db.select().from(schema.customers);
      setCustomers(localCustomers);

      // 3. Tải danh sách giao dịch sổ quỹ
      let localTx: any[] = [];
      if (Platform.OS !== 'web') {
        localTx = await db
          .select()
          .from(schema.cashbook)
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

  const handleCreateTransaction = async () => {
    const numericAmt = parseInt(amount.replace(/\D/g, ''), 10) || 0;
    if (numericAmt <= 0) {
      Alert.alert('Lỗi', 'Số tiền giao dịch phải lớn hơn 0đ');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const txId = `cb-local-${Date.now()}`;
      const todayStr = new Date().toISOString();

      let refName = '';
      if (txType === 'receipt' && category === 'debt_collection' && customerId) {
        const matchedCust = customers.find(c => c.id === customerId);
        if (matchedCust) {
          refName = matchedCust.name;
          
          // Khấu trừ công nợ của khách hàng trực tiếp trong SQLite
          if (Platform.OS !== 'web') {
            const currentDebt = matchedCust.debt_amount || 0;
            const newDebt = Math.max(0, currentDebt - numericAmt);
            await db
              .update(schema.customers)
              .set({ debt_amount: newDebt })
              .where(eq(schema.customers.id, customerId));
          }
        }
      }

      // Ghi phiếu thu chi vào SQLite cục bộ
      if (Platform.OS !== 'web') {
        await db.insert(schema.cashbook).values({
          id: txId,
          branch_id: shopId,
          type: txType,
          amount: numericAmt,
          method: 'cash', // hoặc bank_transfer tùy vào Quỹ
          category,
          reference_id: customerId || null,
          reference_name: refName || null,
          employee_id: userEmail,
          note,
          date: todayStr,
          fund_id: fundId || null,
          sync_status: 'pending',
        });
      }

      setShowAddModal(false);
      setAmount('');
      setNote('');
      setCustomerId('');
      
      showToast(`Đã lưu phiếu ${txType === 'receipt' ? 'Thu' : 'Chi'} ngoại tuyến thành công!`, 'success');
      
      // Tải lại dữ liệu
      await loadCashbookData();

      // Kích hoạt đồng bộ nền ngay lập tức để đẩy lên cloud
      KeepAliveManager.triggerSyncIfNeeded(false);
    } catch (err: any) {
      showToast(`Không thể lưu phiếu thu chi: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header 
        title="Sổ quỹ thu chi" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onPressSync={handleManualSync}
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

        {/* Nút Tạo Phiếu Nhanh */}
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

        {/* Danh Sách Giao Dịch */}
        <Text className="text-xxs font-semibold text-slate-500 mb-3 px-1">Lịch sử giao dịch sổ quỹ</Text>
        
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
            const isPending = item.sync_status === 'pending';

            return (
              <View key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs mb-3 flex-row justify-between items-center">
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
                    {isPending ? (
                      <Badge variant="warning" label="OFFLINE" size="sm" />
                    ) : (
                      <Badge variant="success" label="SYNCED" size="sm" />
                    )}
                  </View>
                </View>

                <Text className={`font-bold text-sm ${isReceipt ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isReceipt ? '+' : '-'}{formatCurrency(item.amount)}
                </Text>
              </View>
            );
          })
        )}

        <View className="h-20" />
      </ScrollView>

      {/* Modal Lập Phiếu Thu / Chi */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
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
              
              {/* Số tiền */}
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Số tiền *</Text>
                <View className="relative flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <TextInput
                    value={amount}
                    onChangeText={(val) => {
                      const num = val.replace(/\D/g, '');
                      setAmount(num ? Number(num).toLocaleString('vi-VN') : '');
                    }}
                    keyboardType="numeric"
                    className="flex-1 text-base font-bold text-slate-800"
                    placeholder="0"
                    style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                  />
                  <Text className="text-sm font-semibold text-slate-400 ml-2">đ</Text>
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

              {/* Ghi chú */}
              <View className="mb-6">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Ghi chú</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập nội dung thu chi..."
                  className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-semibold text-slate-800"
                  style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
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
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn khách hàng cần thu nợ</Text>
                  <TouchableOpacity onPress={() => setShowCustomerSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                {customers.filter(c => (c.debt_amount || 0) > 0).length === 0 ? (
                  <Text className="text-xs text-slate-500 py-4 text-center">Không có khách hàng nào có dư nợ.</Text>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {customers.filter(c => (c.debt_amount || 0) > 0).map(c => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => {
                          setCustomerId(c.id);
                          const debt = c.debt_amount || 0;
                          if (debt > 0) {
                            setAmount(debt.toLocaleString('vi-VN'));
                          }
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
                )}
              </View>
            )}

          </View>
        </View>
      </Modal>

      {renderToast()}
    </SafeAreaView>
  );
}
