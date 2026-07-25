import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { formatCurrency, formatDateTime, maskCurrencyInput, parseCurrencyToNumber } from '../../lib/utils/format';
import { SingleLineInput } from '../../components/ui/single-line-input';
import { PosDatePicker } from '../../components/pos/PosDatePicker';

type Row = Record<string, any>;
type Line = { product: Row; qty: number };
type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt', icon: 'cash-outline', color: '#10b981' },
  { value: 'card', label: 'Thẻ', icon: 'card-outline', color: '#6366f1' },
  { value: 'bank_transfer', label: 'Chuyển khoản', icon: 'business-outline', color: '#3b82f6' },
  { value: 'momo', label: 'MoMo', icon: 'wallet-outline', color: '#ec4899' },
  { value: 'vnpay', label: 'VNPay', icon: 'qr-code-outline', color: '#2563eb' },
  { value: 'zalopay', label: 'ZaloPay', icon: 'wallet-outline', color: '#0ea5e9' },
] as const;

function idOf(row: Row) {
  return row.product_id || row.customer_id || row.id || '';
}

function fundTypeForMethod(method: PaymentMethod) {
  if (method === 'cash') return 'cash';
  if (method === 'momo' || method === 'vnpay' || method === 'zalopay') return 'wallet';
  return 'bank';
}

function isDefaultFund(row: Row) {
  return row.is_default === true || row.is_default === 'TRUE';
}

function formatTwoDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 2);
}

function partsFromDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return { dateText: `${day}/${month}/${year}`, hourText: hour, minuteText: minute };
}

export default function ManualOrderScreen() {
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Row[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Row[]>([]);
  const [customer, setCustomer] = useState<Row | null>(null);
  const [funds, setFunds] = useState<Row[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [fundId, setFundId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [fundPickerOpen, setFundPickerOpen] = useState(false);
  const [dateText, setDateText] = useState(() => partsFromDate(new Date()).dateText);
  const [hourText, setHourText] = useState(() => partsFromDate(new Date()).hourText);
  const [minuteText, setMinuteText] = useState(() => partsFromDate(new Date()).minuteText);

  const selectedMethod = PAYMENT_METHODS.find((item) => item.value === method) || PAYMENT_METHODS[0];
  const matchingFunds = useMemo(
    () => funds.filter((fund) => fund.type === fundTypeForMethod(method)),
    [funds, method]
  );
  const selectedFund = matchingFunds.find((fund) => fund.id === fundId) || null;

  useEffect(() => {
    let cancelled = false;
    const loadFunds = async () => {
      const shopId = await AsyncStorage.getItem('active_shop_id');
      if (!shopId) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/payment-funds?active=TRUE`, {
          headers: await getApiHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        setFunds(body.data || []);
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'AbortError') {
          console.log('[manual-order] load funds failed', error);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };
    void loadFunds();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const active = matchingFunds.find((fund) => fund.id === fundId);
    if (!active) setFundId((matchingFunds.find(isDefaultFund) || matchingFunds[0])?.id || '');
  }, [fundId, matchingFunds]);

  const fetchRows = async (resource: 'products' | 'customers', query: string, setter: (rows: Row[]) => void) => {
    const search = query.trim();
    if (!search) {
      setter([]);
      return;
    }

    const shopId = await AsyncStorage.getItem('active_shop_id');
    if (!shopId) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/${resource}?search=${encodeURIComponent(search)}&limit=8`, {
        headers: await getApiHeaders(),
        signal: controller.signal,
      });
      if (res.ok) setter((await res.json()).data || []);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRows('products', productQuery, setProducts);
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRows('customers', customerQuery, setCustomers);
    }, 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.product.sell_price || line.product.price || 0) * line.qty, 0),
    [lines]
  );
  const discountAmount = Math.max(0, parseCurrencyToNumber(discount));
  const tax = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const gross = Number(line.product.sell_price || line.product.price || 0) * line.qty;
        const allocatedDiscount = subtotal ? (discountAmount * gross) / subtotal : 0;
        return sum + ((gross - allocatedDiscount) * Number(line.product.tax_rate || 0)) / 100;
      }, 0),
    [lines, subtotal, discountAmount]
  );
  const total = Math.max(0, subtotal - discountAmount + tax);

  const add = (product: Row) => {
    const productId = idOf(product);
    setLines((rows) => {
      const found = rows.find((line) => idOf(line.product) === productId);
      if (found) return rows.map((line) => line === found ? { ...line, qty: line.qty + 1 } : line);
      return [...rows, { product, qty: 1 }];
    });
    setProductQuery('');
    setProducts([]);
  };

  const changeQty = (id: string, qty: number) => {
    setLines((rows) =>
      qty <= 0
        ? rows.filter((line) => idOf(line.product) !== id)
        : rows.map((line) => idOf(line.product) === id ? { ...line, qty } : line)
    );
  };

  const openDatePicker = () => {
    const parts = partsFromDate(occurredAt);
    setDateText(parts.dateText);
    setHourText(parts.hourText);
    setMinuteText(parts.minuteText);
    setDatePickerOpen(true);
  };

  const confirmTimePicker = () => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText);
    if (!match) {
      Alert.alert('Ngày không hợp lệ', 'Vui lòng nhập ngày theo định dạng DD/MM/YYYY.');
      return;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const picked = new Date(year, month - 1, day, hour, minute, 0, 0);

    if (
      picked.getFullYear() !== year
      || picked.getMonth() !== month - 1
      || picked.getDate() !== day
      || hour < 0
      || hour > 23
      || minute < 0
      || minute > 59
    ) {
      Alert.alert('Thời gian không hợp lệ', 'Vui lòng kiểm tra lại ngày, giờ và phút.');
      return;
    }
    if (picked.getTime() > Date.now() + 5 * 60 * 1000) {
      Alert.alert('Thời gian không hợp lệ', 'Không thể ghi hóa đơn ở thời điểm tương lai.');
      return;
    }

    setOccurredAt(picked);
    setTimePickerOpen(false);
  };

  const save = async () => {
    if (!lines.length) {
      Alert.alert('Thiếu mặt hàng', 'Hãy thêm ít nhất một mặt hàng.');
      return;
    }
    if (discountAmount > subtotal) {
      Alert.alert('Giảm giá không hợp lệ', 'Giảm giá không được lớn hơn tiền hàng.');
      return;
    }
    if (matchingFunds.length > 0 && !fundId) {
      Alert.alert('Thiếu sổ quỹ', 'Hãy chọn sổ quỹ nhận tiền.');
      return;
    }

    const shopId = await AsyncStorage.getItem('active_shop_id');
    if (!shopId) {
      Alert.alert('Không tìm thấy chi nhánh');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/manual-orders`, {
        method: 'POST',
        headers: { ...(await getApiHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer?.customer_id || customer?.id,
          customer_name: customer?.name,
          occurred_at: occurredAt.toISOString(),
          note,
          discount_amount: discountAmount,
          payment_method: method,
          fund_id: fundId || undefined,
          payment_reference_no: paymentReference,
          items: lines.map((line) => ({ product_id: idOf(line.product), qty: line.qty })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Không thể lưu đơn');
      Alert.alert('Đã lưu', `Đơn ${body.order_no} đã được ghi nhận thủ công.`, [
        { text: 'Đóng', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Không thể lưu', error instanceof Error ? error.message : 'Lỗi không xác định');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        contentContainerClassName="p-4 pb-32"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3 rounded-xl border border-slate-200 bg-white p-2">
              <Ionicons name="chevron-back" size={18} color="#475569" />
            </TouchableOpacity>
            <View>
            <Text className="text-lg font-bold text-slate-900">Ghi đơn thủ công</Text>
            <Text className="text-xxs text-slate-500">Đơn này không đi qua POS</Text>
            </View>
          </View>
        </View>

        <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xxs font-semibold uppercase text-slate-400">Khách hàng</Text>
            {!customer && <Text className="text-xs font-medium text-slate-600">Khách lẻ</Text>}
          </View>

          {customer ? (
            <View className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xs font-bold text-slate-800" numberOfLines={1}>{customer.name}</Text>
                {customer.phone ? <Text className="mt-0.5 text-tiny text-slate-500">{customer.phone}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setCustomer(null)} className="rounded-lg border border-rose-100 bg-rose-50 p-2">
                <Ionicons name="trash-outline" size={14} color="#f43f5e" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <SingleLineInput
                value={customerQuery}
                onChangeText={setCustomerQuery}
                placeholder="Tìm khách hàng theo tên hoặc SĐT..."
                placeholderTextColor="#cbd5e1"
                containerClassName="rounded-xl border border-slate-200 bg-white px-3"
                inputClassName="ml-2 text-xs font-medium text-slate-800"
                leading={<Ionicons name="search-outline" size={14} color="#94a3b8" />}
                trailing={customerQuery ? (
                  <TouchableOpacity onPress={() => setCustomerQuery('')}>
                    <Ionicons name="close" size={14} color="#cbd5e1" />
                  </TouchableOpacity>
                ) : null}
              />

              {customerQuery.trim().length > 0 && customers.length > 0 ? (
                <View className="mt-2 max-h-40 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {customers.map((row) => (
                      <TouchableOpacity
                        key={idOf(row)}
                        onPress={() => {
                          setCustomer(row);
                          setCustomerQuery('');
                          setCustomers([]);
                        }}
                        className="border-b border-slate-100 p-3"
                      >
                        <Text className="text-xs font-semibold text-slate-800">{row.name}</Text>
                        {row.phone ? <Text className="mt-0.5 text-tiny text-slate-400">{row.phone}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <Text className="mb-2 text-xxs font-semibold uppercase text-slate-400">Mặt hàng</Text>
          <SingleLineInput
            value={productQuery}
            onChangeText={setProductQuery}
            placeholder="Tìm và thêm mặt hàng"
            placeholderTextColor="#cbd5e1"
            containerClassName="rounded-xl border border-slate-200 bg-white px-3"
            inputClassName="ml-2 text-xs font-medium text-slate-800"
            leading={<Ionicons name="search-outline" size={14} color="#94a3b8" />}
            trailing={productQuery ? (
              <TouchableOpacity onPress={() => setProductQuery('')}>
                <Ionicons name="close" size={14} color="#cbd5e1" />
              </TouchableOpacity>
            ) : null}
          />

          {productQuery.trim().length > 0 && products.length > 0 ? (
            <View className="mt-2 max-h-52 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {products.map((row) => (
                  <TouchableOpacity
                    key={idOf(row)}
                    onPress={() => add(row)}
                    className="flex-row justify-between border-b border-slate-100 p-3"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-xs font-semibold text-slate-800" numberOfLines={1}>{row.name}</Text>
                      {row.sku ? <Text className="mt-0.5 text-tiny text-slate-400">{row.sku}</Text> : null}
                    </View>
                    <Text className="text-xs font-bold text-slate-700">{formatCurrency(Number(row.sell_price || row.price || 0))}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View className="mt-3">
            {lines.length === 0 ? (
              <Text className="py-4 text-center text-xs text-slate-400">Chưa có mặt hàng.</Text>
            ) : lines.map((line) => {
              const id = idOf(line.product);
              const price = Number(line.product.sell_price || line.product.price || 0);
              return (
                <View key={id} className="flex-row items-center border-b border-slate-100 py-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-xs font-semibold text-slate-800" numberOfLines={1}>{line.product.name}</Text>
                    <Text className="mt-0.5 text-tiny text-slate-500">{formatCurrency(price)} / đơn vị</Text>
                  </View>
                  <View className="flex-row items-center rounded-lg border border-slate-200 bg-slate-50">
                    <TouchableOpacity onPress={() => changeQty(id, line.qty - 1)} className="px-2 py-1.5">
                      <Ionicons name="remove" size={14} color="#64748b" />
                    </TouchableOpacity>
                    <Text className="min-w-7 text-center text-xs font-bold text-slate-800">{line.qty}</Text>
                    <TouchableOpacity onPress={() => changeQty(id, line.qty + 1)} className="px-2 py-1.5">
                      <Ionicons name="add" size={14} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View className="rounded-xl border border-slate-200 bg-white p-4">
          <Text className="mb-2 text-xxs font-semibold uppercase text-slate-400">Thanh toán & hóa đơn</Text>

          <TouchableOpacity onPress={openDatePicker} className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] font-semibold uppercase text-slate-400">Ngày giờ hóa đơn</Text>
                <Text className="mt-1 text-xs font-bold text-slate-800">{formatDateTime(occurredAt)}</Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color="#fa5908" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMethodPickerOpen(true)} className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${selectedMethod.color}18` }}>
                  <Ionicons name={selectedMethod.icon as any} size={17} color={selectedMethod.color} />
                </View>
                <View className="ml-3">
                  <Text className="text-[10px] font-semibold uppercase text-slate-400">Phương thức</Text>
                  <Text className="mt-0.5 text-xs font-bold text-slate-800">{selectedMethod.label}</Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color="#94a3b8" />
            </View>
          </TouchableOpacity>

          {matchingFunds.length > 0 ? (
            <TouchableOpacity
              onPress={() => matchingFunds.length > 1 && setFundPickerOpen(true)}
              disabled={matchingFunds.length === 1}
              className="mb-2 rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-3"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[10px] font-semibold uppercase text-orange-800">Sổ quỹ nhận tiền</Text>
                  <Text className="mt-0.5 text-xs font-bold text-orange-950" numberOfLines={1}>
                    {(selectedFund || matchingFunds[0])?.name}
                    {(selectedFund || matchingFunds[0])?.account_number ? ` (STK: ${(selectedFund || matchingFunds[0])?.account_number})` : ''}
                  </Text>
                </View>
                {matchingFunds.length > 1 ? <Ionicons name="chevron-down" size={16} color="#c2410c" /> : null}
              </View>
            </TouchableOpacity>
          ) : (
            <View className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <Text className="text-xs font-medium text-amber-800">Chưa có sổ quỹ phù hợp cho phương thức này.</Text>
            </View>
          )}

          <SingleLineInput
            value={paymentReference}
            onChangeText={setPaymentReference}
            placeholder="Mã tham chiếu (tùy chọn)"
            placeholderTextColor="#cbd5e1"
            containerClassName="mb-2 rounded-xl border border-slate-200 bg-white px-3"
            inputClassName="text-xs font-medium text-slate-800"
          />

          <SingleLineInput
            value={discount}
            onChangeText={setDiscount}
            formatValue={maskCurrencyInput}
            keyboardType="numeric"
            placeholder="Giảm giá toàn đơn"
            placeholderTextColor="#cbd5e1"
            containerClassName="mb-2 rounded-xl border border-slate-200 bg-white px-3"
            inputClassName="text-right text-xs font-bold text-slate-800"
          />

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ghi chú"
            placeholderTextColor="#cbd5e1"
            multiline
            className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
          />

          <View className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <View className="mb-1 flex-row justify-between">
              <Text className="text-xs text-slate-500">Tạm tính</Text>
              <Text className="text-xs font-semibold text-slate-700">{formatCurrency(subtotal)}</Text>
            </View>
            <View className="mb-1 flex-row justify-between">
              <Text className="text-xs text-slate-500">Giảm giá</Text>
              <Text className="text-xs font-semibold text-slate-700">-{formatCurrency(discountAmount)}</Text>
            </View>
            {tax > 0 ? (
              <View className="mb-1 flex-row justify-between">
                <Text className="text-xs text-slate-500">Thuế</Text>
                <Text className="text-xs font-semibold text-slate-700">{formatCurrency(tax)}</Text>
              </View>
            ) : null}
            <View className="mt-2 flex-row justify-between border-t border-slate-200 pt-2">
              <Text className="text-sm font-bold text-slate-800">Thành tiền</Text>
              <Text className="text-sm font-bold text-orange-600">{formatCurrency(total)}</Text>
            </View>
          </View>

          <TouchableOpacity disabled={saving || !lines.length} onPress={save} className={`mt-4 items-center rounded-xl bg-orange-500 py-3 ${saving || !lines.length ? 'opacity-50' : ''}`}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-bold text-white">Lưu đơn thủ công</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <PosDatePicker
        isOpen={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        onConfirm={(pickedDate) => {
          setDateText(pickedDate);
          setDatePickerOpen(false);
          setTimePickerOpen(true);
        }}
        targetField="invoice_date"
        initialDate={dateText}
        title="Chọn ngày hóa đơn"
      />

      <BottomSheet visible={timePickerOpen} onClose={() => setTimePickerOpen(false)} title="Chọn giờ hóa đơn" icon="time-outline">
        <View className="space-y-3">
          <TouchableOpacity onPress={() => { setTimePickerOpen(false); setDatePickerOpen(true); }} className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-3">
            <Text className="text-center text-sm font-bold text-orange-700">{dateText}</Text>
            <Text className="mt-0.5 text-center text-[10px] font-semibold text-orange-500">Đổi ngày</Text>
          </TouchableOpacity>
          <View className="flex-row gap-3">
            <SingleLineInput
              value={hourText}
              onChangeText={setHourText}
              formatValue={formatTwoDigits}
              keyboardType="numeric"
              placeholder="HH"
              placeholderTextColor="#cbd5e1"
              containerClassName="flex-1 rounded-xl border border-slate-200 bg-white px-3"
              inputClassName="text-center text-sm font-bold text-slate-800"
            />
            <SingleLineInput
              value={minuteText}
              onChangeText={setMinuteText}
              formatValue={formatTwoDigits}
              keyboardType="numeric"
              placeholder="mm"
              placeholderTextColor="#cbd5e1"
              containerClassName="flex-1 rounded-xl border border-slate-200 bg-white px-3"
              inputClassName="text-center text-sm font-bold text-slate-800"
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              const now = new Date();
              const parts = partsFromDate(now);
              setDateText(parts.dateText);
              setHourText(parts.hourText);
              setMinuteText(parts.minuteText);
            }}
            className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-3 py-2"
          >
            <Text className="text-center text-xs font-semibold text-blue-700">Sử dụng thời gian hiện tại</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmTimePicker} className="rounded-xl bg-orange-500 py-3">
            <Text className="text-center text-sm font-bold text-white">Xác nhận</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={methodPickerOpen} onClose={() => setMethodPickerOpen(false)} title="Chọn phương thức thanh toán" icon="wallet-outline">
        <View className="flex-row flex-wrap justify-between">
          {PAYMENT_METHODS.map((item) => {
            const selected = item.value === method;
            return (
              <TouchableOpacity
                key={item.value}
                onPress={() => {
                  setMethod(item.value);
                  setMethodPickerOpen(false);
                }}
                className={`mb-3 w-[48%] items-center rounded-2xl border p-4 ${selected ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${item.color}18` }}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text className={`mt-2 text-center text-xs font-semibold ${selected ? 'text-orange-600' : 'text-slate-700'}`}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet visible={fundPickerOpen} onClose={() => setFundPickerOpen(false)} title="Chọn sổ quỹ nhận tiền" icon="business-outline">
        {matchingFunds.map((fund) => {
          const selected = fund.id === fundId;
          return (
            <TouchableOpacity
              key={fund.id}
              onPress={() => {
                setFundId(fund.id);
                setFundPickerOpen(false);
              }}
              className={`mb-3 flex-row items-center justify-between rounded-xl border p-4 ${selected ? 'border-orange-500 bg-orange-50/50' : 'border-slate-200 bg-slate-50'}`}
            >
              <View className="flex-1 pr-4">
                <Text className={`text-sm font-bold ${selected ? 'text-orange-600' : 'text-slate-800'}`}>{fund.name}</Text>
                {fund.account_number ? <Text className="mt-1 text-xs text-slate-500">STK: {fund.account_number}</Text> : null}
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={20} color="#fa5908" /> : null}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </SafeAreaView>
  );
}

function BottomSheet({
  visible,
  onClose,
  title,
  icon,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
        <Pressable onPress={() => {}} className="max-h-[78%] rounded-t-3xl bg-white p-6 pb-8">
          <View className="mb-4 flex-row items-center justify-between border-b border-slate-100 pb-4">
            <View className="flex-row items-center">
              <Ionicons name={icon} size={20} color="#fa5908" />
              <Text className="ml-2 text-sm font-semibold text-slate-800">{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </View>
    </Modal>
  );
}
