import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { formatCurrency } from '../lib/utils/format';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { KeepAliveManager } from '../lib/sync/KeepAliveManager';
import * as Haptics from 'expo-haptics';

const CATEGORY_MAP: Record<string, string> = {
  debt_collection: 'Thu nợ khách hàng',
  debt_payment: 'Chi trả nợ NCC',
  salary: 'Chi lương nhân viên',
  rent: 'Chi mặt bằng',
  utilities: 'Chi điện nước',
  other_revenue: 'Thu khác',
  other_expense: 'Chi khác',
  inventory: 'Thanh toán mua hàng',
};

const CATEGORIES = [
  { value: 'other_expense', label: 'Chi khác' },
  { value: 'salary', label: 'Chi lương nhân viên' },
  { value: 'rent', label: 'Chi mặt bằng' },
  { value: 'utilities', label: 'Chi điện nước' },
  { value: 'debt_payment', label: 'Chi trả nợ NCC' },
  { value: 'other_revenue', label: 'Thu khác' },
  { value: 'debt_collection', label: 'Thu nợ khách hàng' },
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
  const [category, setCategory] = useState('other_expense');
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          { id: '1', type: 'receipt', amount: 350000, category: 'debt_collection', reference_name: 'Nguyễn Văn A', note: 'Thu nợ', date: '2026-06-08', sync_status: 'synced' },
          { id: '2', type: 'payment', amount: 1200000, category: 'rent', note: 'Thanh toán tiền điện', date: '2026-06-07', sync_status: 'synced' },
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
      const todayStr = new Date().toISOString().split('T')[0];

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
      
      Alert.alert('Thành công', `Đã lưu phiếu ${txType === 'receipt' ? 'Thu' : 'Chi'} ngoại tuyến thành công.`);
      
      // Tải lại dữ liệu
      await loadCashbookData();

      // Kích hoạt đồng bộ nền ngay lập tức để đẩy lên cloud
      KeepAliveManager.triggerSyncIfNeeded(false);
    } catch (err: any) {
      Alert.alert('Lỗi', `Không thể lưu phiếu thu chi: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header title="Sổ quỹ thu chi" onPressMenu={() => router.push('/(tabs)')} showBack={true} />

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
            onPress={() => { setTxType('receipt'); setCategory('other_revenue'); setShowAddModal(true); }}
            className="flex-1 bg-emerald-50 border border-emerald-100 py-3.5 rounded-2xl items-center flex-row justify-center"
          >
            <Ionicons name="add-circle" size={18} color="#059669" />
            <Text className="text-emerald-800 font-semibold text-xs ml-2">Lập phiếu THU</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => { setTxType('payment'); setCategory('other_expense'); setShowAddModal(true); }}
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
                    <Text className="text-micro font-medium text-slate-400">{item.date}</Text>
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
          <View className="bg-white rounded-t-3xl p-6 max-h-[85%]">
            
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
                <View className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (e.target.value !== 'debt_collection') {
                        setCustomerId('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: 12,
                      fontSize: 13,
                      border: 'none',
                      backgroundColor: 'transparent',
                      outline: 'none',
                    }}
                  >
                    {CATEGORIES.filter(c => {
                      if (txType === 'receipt') return c.value === 'other_revenue' || c.value === 'debt_collection';
                      return c.value !== 'other_revenue' && c.value !== 'debt_collection';
                    }).map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </View>
              </View>

              {/* Quỹ thanh toán */}
              <View className="mb-4">
                <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sổ quỹ thanh toán *</Text>
                <View className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <select
                    value={fundId}
                    onChange={(e) => setFundId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 12,
                      fontSize: 13,
                      border: 'none',
                      backgroundColor: 'transparent',
                      outline: 'none',
                    }}
                  >
                    {funds.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                    {funds.length === 0 && <option value="">Đang tải danh sách quỹ...</option>}
                  </select>
                </View>
              </View>

              {/* Liên kết khách hàng (nếu là Thu Nợ) */}
              {txType === 'receipt' && category === 'debt_collection' && (
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Khách hàng cần thu nợ *</Text>
                  <View className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 12,
                        fontSize: 13,
                        border: 'none',
                        backgroundColor: 'transparent',
                        outline: 'none',
                      }}
                    >
                      <option value="">-- Chọn khách hàng --</option>
                      {customers.filter(c => (c.debt_amount || 0) > 0).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Nợ: {formatCurrency(c.debt_amount)})
                        </option>
                      ))}
                    </select>
                  </View>
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
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
