import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Platform, Modal } from 'react-native';
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
  paymentRows: {id: string; fund_id: string; amount: number}[];
  setPaymentRows: React.Dispatch<React.SetStateAction<any[]>>;
  paymentFundsList: any[];
  productsList: any[];
  getCartCount: () => number;
  onCheckout: (qrFundId: string | null, qrAmount: number) => void; // Called to trigger final payment or show QR
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

export default function CartCheckoutModal(props: CartCheckoutModalProps) {
  const {
    visible, onClose, cart, updateCartItemQuantity, removeFromCart, getCartTotal,
    discountAmount, setDiscountAmount, orderNote, setOrderNote,
    selectedCustomer, setSelectedCustomer, customersList,
    paymentRows, setPaymentRows, paymentFundsList, productsList, getCartCount, onCheckout
  } = props;

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [openDropdownRowId, setOpenDropdownRowId] = useState<string | null>(null);
  const [isCheckoutConfirmVisible, setIsCheckoutConfirmVisible] = useState(false);

  const finalTotal = Math.max(0, getCartTotal() - discountAmount);
  const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);

  const handlePressCheckout = () => {
    if (paidSum < finalTotal) {
      alert(`Tổng tiền khách trả (${formatCurrency(paidSum)}) chưa đủ hóa đơn (${formatCurrency(finalTotal)}).`);
      return;
    }

    // Kiểm tra xem có thanh toán bằng chuyển khoản không (loại 'bank')
    const transferRow = paymentRows.find(p => {
      const fund = paymentFundsList.find(f => f.id === p.fund_id);
      return fund?.type === 'bank' && p.amount > 0;
    });

    if (transferRow) {
      onCheckout(transferRow.fund_id, transferRow.amount);
    } else {
      setIsCheckoutConfirmVisible(true);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View className="flex-1 justify-end" style={{backgroundColor: 'rgba(0, 0, 0, 0.6)'}}>
          <View className="h-[90%] rounded-t-2xl p-6 bg-white justify-between" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
            
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="wallet-outline" size={20} color="#fa5908" />
                <Text className="text-sm font-semibold text-slate-800 ml-2">
                  Thanh toán đơn hàng ({getCartCount()} món)
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
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
                  <View className="bg-white border border-slate-200 rounded-xl p-3.5 flex-row justify-between items-center" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                    <View className="flex-1 mr-4">
                      <Text className="text-xs font-semibold text-slate-800">{selectedCustomer.name}</Text>
                      <Text className="text-tiny text-slate-500 font-medium mt-1">📞 {selectedCustomer.phone}</Text>
                      {selectedCustomer.address ? (
                        <Text className="text-[9.5px] text-slate-400 font-semibold mt-1">📍 {selectedCustomer.address}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity 
                      activeOpacity={0.7}
                      className="bg-rose-50 p-2 rounded-xl border border-rose-100 items-center justify-center active:scale-95"
                      onPress={() => {
                        setSelectedCustomer(null);
                        setCustomerSearchQuery('');
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                    </TouchableOpacity>
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
                        style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
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

              {/* 2. CHI TIẾT SẢN PHẨM */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                {Object.entries(cart).map(([cartItemId, item], idx) => (
                  <View key={cartItemId} className={`flex-row justify-between items-start py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View className="flex-1 mr-3">
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
                      <Text className="text-xs text-slate-400 mt-1">
                        {formatCurrency(item.price + (item.modifier_total || 0))} {productsList.find(pr => pr.id === item.productId)?.unit ? `/ ${productsList.find(pr => pr.id === item.productId)?.unit}` : ''}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                        <TouchableOpacity onPress={() => updateCartItemQuantity(cartItemId, item.quantity - 1)} className="w-7 h-7 items-center justify-center border-r border-slate-200 bg-white active:bg-slate-100"><Text className="text-slate-600 font-medium">-</Text></TouchableOpacity>
                        <Text className="w-8 text-center text-xs font-semibold text-slate-800 bg-white" style={{lineHeight: 28}}>{item.quantity}</Text>
                        <TouchableOpacity onPress={() => updateCartItemQuantity(cartItemId, item.quantity + 1)} className="w-7 h-7 items-center justify-center border-l border-slate-200 bg-white active:bg-slate-100"><Text className="text-slate-600 font-medium">+</Text></TouchableOpacity>
                      </View>
                      <Text className="font-semibold text-sm text-slate-850 mt-1.5">{formatCurrency((item.price + (item.modifier_total || 0)) * item.quantity)}</Text>
                      <TouchableOpacity onPress={() => removeFromCart(cartItemId)} className="mt-1"><Text className="text-rose-500 text-[11px] font-medium px-2 py-1 bg-rose-50 rounded-md">Xóa</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* Hàng Giảm giá */}
                <TouchableOpacity 
                  className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200 mt-2 active:opacity-60"
                  onPress={() => setIsEditingDiscount(prev => !prev)}
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
                        style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
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
                    style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
                  />
                </View>
              </View>

              {/* 4. CHIA PHƯƠNG THỨC THANH TOÁN (SPLIT PAYMENT) - ĐÃ ĐỒNG BỘ FUNDS */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xxs font-semibold text-slate-455">Phương thức thanh toán</Text>
                  {paymentFundsList.length > 0 && (
                    <TouchableOpacity 
                      className="flex-row items-center"
                      onPress={() => {
                        const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);
                        const remaining = Math.max(0, finalTotal - paidSum);
                        
                        // Tìm fund chưa được chọn, ưu tiên cash
                        let availableFund = paymentFundsList.find(f => !paymentRows.some(r => r.fund_id === f.id));
                        if (!availableFund) availableFund = paymentFundsList[0];

                        setPaymentRows(prev => [
                          ...prev,
                          {id: Date.now().toString(), fund_id: availableFund.id, amount: remaining}
                        ]);
                      }}
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
                    const paidSumOfOthers = paymentRows.filter((_, i) => i !== idx).reduce((sum, p) => sum + p.amount, 0);
                    const remaining = Math.max(0, finalTotal - paidSumOfOthers);
                    const activeFund = paymentFundsList.find(f => f.id === row.fund_id);

                    return (
                    <View key={row.id} className="mb-3.5">
                      <View className="flex-row items-center justify-between">
                        {/* Chọn quỹ - Dropdown list */}
                        <View style={{width: '45%'}}>
                          <TouchableOpacity 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 flex-row justify-between items-center"
                          onPress={() => {
                            setOpenDropdownRowId(openDropdownRowId === row.id ? null : row.id);
                          }}
                          >
                          <Text className="text-tiny font-semibold text-slate-700" numberOfLines={1}>
                            {activeFund ? activeFund.name : 'Chọn quỹ...'}
                          </Text>
                          <Ionicons name="chevron-down" size={11} color="#fa5908" />
                          </TouchableOpacity>
                        </View>

                        {/* Số tiền với nút tự điền tiền còn lại */}
                        <View className="w-[52%] bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 flex-row items-center">
                          <TextInput
                          className="flex-1 text-right text-xs font-semibold text-slate-800"
                          keyboardType="numeric"
                          value={row.amount === 0 ? '' : maskCurrencyInput(row.amount.toString())}
                          onChangeText={(val) => {
                            const masked = maskCurrencyInput(val);
                            const amt = parseCurrencyToNumber(masked);
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: amt} : r));
                          }}
                          style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
                          />
                          {remaining > 0 && row.amount < remaining && (
                          <TouchableOpacity 
                            activeOpacity={0.7}
                            className="bg-orange-50 border border-orange-200 px-1.5 py-1 rounded-md ml-1.5 active:scale-95"
                            onPress={() => {
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: remaining} : r));
                            }}
                          >
                            <Text className="text-xxs font-semibold text-orange-600">Còn lại</Text>
                          </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Dropdown list */}
                      {openDropdownRowId === row.id && (
                      <View className="bg-white border border-slate-200 rounded-xl mt-1.5 py-1 w-[60%] shadow-sm z-50 absolute top-[44px]">
                        {paymentFundsList
                          .filter(f => f.id === row.fund_id || !paymentRows.some(r => r.fund_id === f.id))
                          .map(f => (
                          <TouchableOpacity
                            key={f.id}
                            className="px-3 py-2 border-b border-slate-50 active:bg-slate-50"
                            onPress={() => {
                              setPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, fund_id: f.id} : r));
                              setOpenDropdownRowId(null);
                            }}
                          >
                            <Text className={`text-tiny ${f.id === row.fund_id ? 'font-semibold text-orange-500' : 'font-medium text-slate-700'}`}>
                              {f.name}
                            </Text>
                          </TouchableOpacity>
                          ))}
                      </View>
                      )}

                      {/* Nút xóa */}
                      {paymentRows.length > 1 && (
                      <TouchableOpacity 
                      onPress={() => {
                      setPaymentRows(prev => prev.filter(r => r.id !== row.id));
                      if (openDropdownRowId === row.id) setOpenDropdownRowId(null);
                      }}
                      className="p-1 mt-1.5 items-end"
                      >
                        <Text className="text-xxs text-rose-500 font-medium">Xóa phương thức này</Text>
                      </TouchableOpacity>
                      )}
                    </View>
                    );
                  })
                )}
              </View>

              <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4 flex-row justify-between items-center" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
                <Text className="text-xs text-emerald-800 font-semibold">Khách trả:</Text>
                <Text className="text-emerald-700 text-sm font-semibold">
                  {formatCurrency(paidSum)}
                </Text>
              </View>
            </ScrollView>

            {/* Thanh nút Hoàn tất */}
            <View className="flex-row justify-between items-center border-t border-slate-100 pt-4 bg-white gap-3">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={onClose}
                className="flex-1 py-3.5 rounded-xl"
              />

              <Button
                variant="primary"
                title="Thanh toán"
                icon={<Ionicons name="checkmark-done" size={14} color="white" />}
                iconPosition="right"
                onPress={handlePressCheckout}
                className="flex-[2] py-3.5 rounded-xl"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* HỘP THOẠI XÁC NHẬN THANH TOÁN KHI KHÔNG CÓ QR */}
      <Dialog
        visible={isCheckoutConfirmVisible}
        onClose={() => setIsCheckoutConfirmVisible(false)}
        onConfirm={() => {
          setIsCheckoutConfirmVisible(false);
          onCheckout(null, 0); // null means no QR
        }}
        loading={false}
        title="Xác nhận Thanh toán"
        description={`Bạn có chắc chắn muốn hoàn tất hóa đơn này?\nTổng thanh toán: ${formatCurrency(Math.max(0, getCartTotal() - discountAmount))}`}
        confirmLabel="Xác nhận & Lưu"
        cancelLabel="Quay lại"
        variant="success"
      />
    </>
  );
}
