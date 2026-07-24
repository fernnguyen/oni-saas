import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { formatCurrency, formatDateTime } from '../../lib/utils/format';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { SyncManager } from '../../lib/sync/SyncManager';
import { KeepAliveManager } from '../../lib/sync/KeepAliveManager';
import { Dialog } from './Dialog';

interface DebtOrder {
  id: string;
  order_no: string;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  created_at: string;
}

interface DebtCollectionModalProps {
  visible: boolean;
  onClose: () => void;
  customer: any;
  onSuccess: () => void;
}

export function DebtCollectionModal({ visible, onClose, customer, onSuccess }: DebtCollectionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<DebtOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  
  const [amount, setAmount] = useState('');
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');
  const [showFundSelector, setShowFundSelector] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    if (visible && customer) {
      loadFunds();
      loadDebtOrders();
      setAmount('');
      setNote('');
      setFundId('');
      setSelectedOrderIds([]);
    }
  }, [visible, customer]);

  const loadFunds = async () => {
    try {
      const localFunds = await db.select().from(schema.paymentFunds);
      setFunds(localFunds);
      if (localFunds.length > 0) {
        // Find default fund, prioritize cash if there are multiple defaults
        const defaults = localFunds.filter((f: any) => f.is_default === true || f.is_default === 1 || f.is_default === '1' || f.is_default === 'TRUE');
        const defaultCash = defaults.find((f: any) => f.type === 'cash');
        const defaultFund = defaultCash || defaults[0];
        
        if (defaultFund) setFundId(defaultFund.id);
        else setFundId(localFunds[0].id);
      }
    } catch (e) {
      console.error('Lỗi khi tải quỹ:', e);
    }
  };

  const loadDebtOrders = async () => {
    setIsLoading(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      
      // 1. ONLINE FIRST: Gọi API Live
      let fetchedOrders: DebtOrder[] = [];
      let isOnline = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/orders/debt?customer_id=${customer.id}`, {
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            fetchedOrders = json.data.map((o: any) => ({
              id: o.id,
              order_no: o.order_no || (o.id ? `#${o.id.split('-').pop()}` : ''),
              total_amount: parseFloat(o.total_amount || '0'),
              paid_amount: parseFloat(o.paid_amount || '0'),
              debt_amount: parseFloat(o.debt_amount || '0'),
              created_at: o.created_at
            }));
            isOnline = true;
          }
        }
      } catch (e) {
        console.log('Không thể gọi API thu nợ, fallback về offline', e);
      }

      // 2. OFFLINE FALLBACK: Query từ SQLite
      if (!isOnline) {
        const localOrders = await db.select().from(schema.orders)
          .where(eq(schema.orders.customer_id, customer.id));
          
        fetchedOrders = localOrders
          .filter((o: any) => o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'returned')
          .map((o: any) => {
            const tAmount = o.total_amount || 0;
            const pAmount = o.paid_amount || 0;
            return {
              id: o.id,
              order_no: o.order_no || (o.id ? `#${o.id.split('-').pop()}` : ''),
              total_amount: tAmount,
              paid_amount: pAmount,
              debt_amount: tAmount - pAmount,
              created_at: o.created_at
            };
          })
          .filter((o: any) => o.debt_amount > 0)
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setOrders(fetchedOrders);
      // Auto select all by default
      setSelectedOrderIds(fetchedOrders.map(o => o.id));
    } catch (err) {
      console.error('Lỗi khi tải đơn nợ:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedOrdersData = useMemo(() => {
    return orders.filter(o => selectedOrderIds.includes(o.id));
  }, [orders, selectedOrderIds]);

  const selectedOrdersDebt = useMemo(() => {
    return selectedOrdersData.reduce((acc, cur) => acc + cur.debt_amount, 0);
  }, [selectedOrdersData]);

  // customerDebt là lớn nhất giữa entity.debt_amount và tổng nợ đơn (đề phòng Nợ Đầu Kỳ)
  const customerDebt = useMemo(() => {
    const rawDebt = customer?.debt_amount || 0;
    const totalOrdersDebt = orders.reduce((acc, cur) => acc + cur.debt_amount, 0);
    return Math.max(rawDebt, totalOrdersDebt);
  }, [customer, orders]);

  useEffect(() => {
    if (orders.length > 0) {
      setAmount(selectedOrdersDebt.toString());
      if (selectedOrdersData.length > 0) {
        setNote(`Thu nợ ${selectedOrdersData.length} đơn hàng (${selectedOrdersData.map(o => o.order_no || o.id.slice(0, 8)).join(', ')}) của khách hàng ${customer?.name}`);
      } else {
        setNote('');
      }
    }
  }, [selectedOrdersDebt, selectedOrdersData, customer?.name, orders.length]);

  // Numeric amount
  const numericAmount = parseInt(amount.replace(/\D/g, ''), 10) || 0;

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSubmit = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Lỗi', 'Số tiền thu phải lớn hơn 0đ');
      return;
    }
    
    if (!fundId) {
      Alert.alert('Lỗi', 'Vui lòng chọn sổ quỹ nhận tiền');
      return;
    }
    
    // Nếu chọn gạch theo đơn nhưng lại chọn số tiền lớn hơn tổng nợ của các đơn đó
    if (orders.length > 0 && numericAmount > selectedOrdersDebt) {
      Alert.alert('Lưu ý', `Số tiền thu (${formatCurrency(numericAmount)}) lớn hơn tổng nợ các đơn đã chọn (${formatCurrency(selectedOrdersDebt)}). Vui lòng chọn thêm đơn hoặc giảm số tiền.`);
      return;
    }

    setShowConfirmDialog(true);
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    setShowConfirmDialog(false);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';

      // Tạo order allocations
      const allocations = [];
      let remaining = numericAmount;

      for (const order of selectedOrdersData) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, order.debt_amount);
        allocations.push({
          order_id: order.id,
          amount: applied
        });
        remaining -= applied;
      }

      // Tìm quỹ đang chọn để ánh xạ method (cash | bank_transfer)
      const selectedFund = funds.find(f => f.id === fundId);
      const paymentMethod = selectedFund?.type === 'bank' || selectedFund?.type === 'wallet' ? 'bank_transfer' : 'cash';
      const fundName = selectedFund?.name || 'Sổ quỹ';

      // Lưu vào cashbook SQLite
      const cbId = `cb-local-debt-${Date.now()}`;
      await db.insert(schema.cashbook).values({
        id: cbId,
        branch_id: shopId,
        type: 'receipt',
        amount: numericAmount,
        method: paymentMethod,
        category: 'debt_collection',
        reference_id: customer.id,
        reference_name: customer.name,
        employee_id: userEmail,
        note: (note ? note : `Thu nợ khách hàng ${customer.name}`),
        date: new Date().toISOString(),
        fund_id: fundId || null,
        sync_status: 'pending',
        order_allocations: JSON.stringify(allocations),
      });

      // Cập nhật lại customers.debt_amount cục bộ tạm thời để UI responsive
      await db.update(schema.customers)
        .set({ debt_amount: Math.max(0, customerDebt - numericAmount) })
        .where(eq(schema.customers.id, customer.id));

      // Cập nhật paid_amount cho các đơn hàng được gạch nợ
      for (const alloc of allocations) {
        const order = selectedOrdersData.find(o => o.id === alloc.order_id);
        if (order) {
          await db.update(schema.orders)
            .set({ 
              paid_amount: String(Number(order.paid_amount || 0) + alloc.amount)
            })
            .where(eq(schema.orders.id, alloc.order_id));
        }
      }

      // Trigger sync ngầm
      KeepAliveManager.triggerSyncIfNeeded(true).catch(() => {});

      onSuccess();
    } catch (e: any) {
      Alert.alert('Lỗi', `Lỗi khi lưu phiếu: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 bg-slate-50">
          {/* Header */}
          <View className="flex-row justify-between items-center px-4 py-4 bg-white border-b border-slate-200">
            <Text className="text-lg font-bold text-slate-800">Thu nợ khách hàng</Text>
            <TouchableOpacity onPress={onClose} className="p-1 rounded-full bg-slate-100">
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
            {/* Customer Info */}
            <View className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-sm font-semibold text-slate-500">Khách hàng:</Text>
                <Text className="text-sm font-bold text-slate-800">{customer?.name}</Text>
              </View>
              {!!customer?.phone && (
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-sm font-semibold text-slate-500">SĐT:</Text>
                  <Text className="text-sm font-bold text-slate-800">{customer.phone}</Text>
                </View>
              )}
              <View className="flex-row justify-between items-center pt-3 border-t border-slate-100">
                <Text className="text-sm font-bold text-slate-700">Tổng dư nợ hiện tại:</Text>
                <Text className="text-lg font-bold text-red-600">{formatCurrency(customerDebt)}</Text>
              </View>
            </View>

            {/* Orders Checklist */}
            {isLoading ? (
              <ActivityIndicator size="small" color="#fa5908" className="py-8" />
            ) : orders.length > 0 ? (
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2 ml-1">
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đơn hàng đang nợ ({orders.length})</Text>
                  <TouchableOpacity onPress={loadDebtOrders} className="flex-row items-center bg-slate-100 px-2.5 py-1.5 rounded-xl">
                    <Ionicons name="sync-outline" size={14} color="#64748b" className="mr-1" />
                    <Text className="text-xs font-semibold text-slate-600">Tải lại</Text>
                  </TouchableOpacity>
                </View>
                <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {orders.map((order, idx) => {
                    const isChecked = selectedOrderIds.includes(order.id);
                    return (
                      <TouchableOpacity 
                        key={order.id} 
                        activeOpacity={0.7}
                        onPress={() => handleToggleOrder(order.id)}
                        className={`p-3 flex-row items-center border-slate-100 ${idx !== orders.length - 1 ? 'border-b' : ''} ${isChecked ? 'bg-orange-50/30' : ''}`}
                      >
                        <View className={`w-5 h-5 rounded border items-center justify-center mr-3 ${isChecked ? 'bg-orange-500 border-orange-500' : 'border-slate-300 bg-white'}`}>
                          {isChecked && <Ionicons name="checkmark" size={14} color="white" />}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row justify-between items-center">
                            <Text className="font-bold text-slate-800 text-sm">{order.order_no || 'Không mã'}</Text>
                            <Text className="font-bold text-red-600 text-sm">{formatCurrency(order.debt_amount)}</Text>
                          </View>
                          <View className="flex-row justify-between items-center mt-1">
                            <Text className="text-xs text-slate-500">{formatDateTime(order.created_at)}</Text>
                            <Text className="text-xs text-slate-500">Tổng: {formatCurrency(order.total_amount)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View className="bg-orange-50 rounded-xl p-4 mb-4 border border-orange-100 flex-row items-start">
                <Ionicons name="information-circle" size={20} color="#fa5908" className="mr-2" />
                <Text className="flex-1 text-sm text-orange-800 leading-5">Không có hóa đơn nợ nào. Bạn có thể sử dụng chế độ thu nợ cơ bản (Không gán đơn).</Text>
              </View>
            )}

            {/* Input Form */}
            <View className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-6">
              <View className="mb-4">
                <View className="flex-row justify-between items-end mb-1.5">
                  <Text className="text-sm font-bold text-slate-700">Số tiền thu *</Text>
                  {orders.length > 0 && selectedOrderIds.length > 0 && numericAmount < selectedOrdersDebt && (
                    <TouchableOpacity onPress={() => setAmount(selectedOrdersDebt.toString())}>
                      <Text className="text-xs font-bold text-orange-500">Thu đủ {selectedOrderIds.length} đơn</Text>
                    </TouchableOpacity>
                  )}
                  {orders.length === 0 && numericAmount < customerDebt && (
                    <TouchableOpacity onPress={() => setAmount(customerDebt.toString())}>
                      <Text className="text-xs font-bold text-orange-500">Thu toàn bộ</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  value={amount ? formatCurrency(numericAmount).replace('đ', '').trim() : ''}
                  onChangeText={(v) => {
                    const num = parseInt(v.replace(/\D/g, ''), 10) || 0;
                    const max = orders.length > 0 ? selectedOrdersDebt : customerDebt;
                    setAmount(Math.min(num, max).toString());
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 px-4 rounded-xl text-lg font-bold text-slate-800"
                  style={{
                    paddingTop: 12, paddingBottom: 12,
                    textAlignVertical: 'center',
                    lineHeight: undefined,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                  }}
                />
                {orders.length > 0 && selectedOrderIds.length > 0 && (
                  <Text className="text-xs font-medium text-slate-500 mt-2">
                    Đang chọn thanh toán cho <Text className="font-bold text-slate-700">{selectedOrderIds.length} đơn</Text> (Tổng: <Text className="font-bold text-red-600">{formatCurrency(selectedOrdersDebt)}</Text>)
                  </Text>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-sm font-bold text-slate-700 mb-1.5">Sổ quỹ nhận *</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowFundSelector(true)}
                  className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                >
                  <Text className="text-sm font-semibold text-slate-800">
                    {funds.find(f => f.id === fundId)?.name || 'Chọn quỹ'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View className="mb-2">
                <Text className="text-sm font-bold text-slate-700 mb-1.5">Ghi chú</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập ghi chú thu nợ..."
                  className="w-full bg-slate-50 border border-slate-200 px-4 rounded-xl text-sm font-medium text-slate-800"
                  style={{
                    paddingTop: 12, paddingBottom: 12,
                    textAlignVertical: 'center',
                    lineHeight: undefined,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                  }}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting || numericAmount <= 0 || !fundId}
              className={`w-full py-4 rounded-xl flex-row justify-center items-center ${isSubmitting || numericAmount <= 0 || !fundId ? 'bg-orange-300' : 'bg-orange-500'}`}
              style={{ backgroundColor: isSubmitting || numericAmount <= 0 || !fundId ? '#fdba74' : '#fa5908' }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Xác nhận thu nợ</Text>
              )}
            </TouchableOpacity>

            <View className="h-10" />
          </ScrollView>

          {/* Fund Selector Overlay */}
          {showFundSelector && (
            <View className="absolute inset-0 bg-black/50 z-50 justify-end">
              <View className="bg-white rounded-t-3xl p-6">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-lg font-bold text-slate-800">Chọn sổ quỹ</Text>
                  <TouchableOpacity onPress={() => setShowFundSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} className="max-h-80">
                  {funds.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => {
                        setFundId(f.id);
                        setShowFundSelector(false);
                      }}
                      className="py-4 border-b border-slate-100 flex-row justify-between items-center"
                    >
                      <Text className={`text-base ${fundId === f.id ? 'font-bold text-orange-500' : 'text-slate-700 font-medium'}`}>
                        {f.name}
                      </Text>
                      {fundId === f.id && (
                        <Ionicons name="checkmark-circle" size={22} color="#fa5908" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          <Dialog
            visible={showConfirmDialog}
            onClose={() => setShowConfirmDialog(false)}
            title="Xác nhận thu nợ"
            description={selectedOrderIds.length > 0 
              ? `Bạn có chắc chắn muốn xác nhận phiếu thu nợ ${formatCurrency(numericAmount)} từ khách hàng ${customer?.name}?\n\n(Đang gạch nợ cho ${selectedOrderIds.length} đơn hàng)`
              : `Bạn có chắc chắn muốn xác nhận phiếu thu nợ ${formatCurrency(numericAmount)} từ khách hàng ${customer?.name}?`}
            confirmLabel="Thu tiền"
            cancelLabel="Hủy bỏ"
            variant="default"
            onConfirm={executeSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
