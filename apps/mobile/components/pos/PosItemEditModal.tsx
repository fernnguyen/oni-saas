import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../lib/utils/format';

export function PosItemEditModal({
  visible,
  onClose,
  item,
  onSave,
  inline = false
}: any) {
  const [unitPrice, setUnitPrice] = useState('');
  const [discountAmt, setDiscountAmt] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');

  useEffect(() => {
    if (item && visible) {
      setUnitPrice(item.unit_price?.toString() || '0');
      setDiscountAmt(item.discount_amount?.toString() || '');
      setDiscountPct(item.discount_pct?.toString() || '');
      if (Number(item.discount_pct || 0) > 0) {
        setDiscountMode('percent');
      } else {
        setDiscountMode('amount');
      }
    }
  }, [item, visible]);

  if (!item) return null;

  const currentPrice = Number(unitPrice || 0);
  const currentDiscountAmt = discountMode === 'amount'
    ? Number(discountAmt || 0)
    : Math.floor(currentPrice * Number(discountPct || 0) / 100);

  const finalPrice = Math.max(0, currentPrice - currentDiscountAmt);

  const handleSave = () => {
    onSave(finalPrice, currentPrice, currentDiscountAmt, discountMode === 'percent' ? Number(discountPct || 0) : 0);
    onClose();
  };

  const handlePriceChange = (val: string) => {
    const raw = val.replace(/\D/g, '');
    setUnitPrice(raw);
  };

  const handleDiscountAmtChange = (val: string) => {
    const raw = val.replace(/\D/g, '');
    setDiscountAmt(raw);
  };

  const handleDiscountPctChange = (val: string) => {
    const raw = val.replace(/\D/g, '');
    if (Number(raw) <= 100) setDiscountPct(raw);
  };

  const Content = (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={inline ? "flex-1 w-full justify-center items-center px-5" : "flex-1 justify-end items-center"}
    >
      <Pressable
        className="absolute inset-0 bg-black/40"
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      />
      <Pressable 
        onPress={() => {}} 
        className={inline ? "w-full bg-white rounded-3xl overflow-hidden shadow-2xl relative pb-6 pt-2 max-w-sm" : "w-full bg-white rounded-t-3xl overflow-hidden shadow-2xl relative pb-6 pt-2"}
      >
        {!inline && (
          <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
        )}
        
        <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100 mt-2">
            <View className="flex-1 mr-4">
              <Text className="text-base font-semibold text-slate-800" numberOfLines={1}>{item.name || item.product_name}</Text>
              {(item.original_price != null && Number(item.original_price) !== Number(unitPrice)) && (
                <Text className="text-xs text-slate-500 mt-0.5">Giá gốc: {formatCurrency(item.original_price)}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
              <Ionicons name="close-circle" size={24} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          <View className="p-5">
            {/* Giá bán trực tiếp */}
            <View className="mb-5">
              <Text className="text-sm font-semibold text-slate-700 mb-2">Giá bán trực tiếp</Text>
              <TextInput
                value={unitPrice ? Number(unitPrice).toLocaleString('vi-VN') : ''}
                onChangeText={handlePriceChange}
                keyboardType="numeric"
                className="w-full bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-right text-base font-medium text-slate-900"
                placeholder="0"
                placeholderTextColor="#94a3b8"
                style={{ paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, height: 46 }}
              />
            </View>

            {/* Giảm giá */}
            <View className="mb-6">
              <Text className="text-sm font-semibold text-slate-700 mb-2">Giảm giá</Text>
              <View className="flex-row gap-2 items-center">
                <View className="flex-row bg-slate-100 p-1 rounded-xl">
                  <Pressable
                    onPress={() => setDiscountMode('amount')}
                    className="px-3 py-2 rounded-lg"
                    style={discountMode === 'amount' ? {
                      backgroundColor: '#ffffff',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: 2,
                    } : undefined}
                  >
                    <Text className={`text-sm font-medium ${discountMode === 'amount' ? 'text-slate-800' : 'text-slate-500'}`}>VNĐ</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDiscountMode('percent')}
                    className="px-3 py-2 rounded-lg"
                    style={discountMode === 'percent' ? {
                      backgroundColor: '#ffffff',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: 2,
                    } : undefined}
                  >
                    <Text className={`text-sm font-medium ${discountMode === 'percent' ? 'text-slate-800' : 'text-slate-500'}`}>%</Text>
                  </Pressable>
                </View>
                
                <View className="flex-1">
                  {discountMode === 'amount' ? (
                    <TextInput
                      value={discountAmt ? Number(discountAmt).toLocaleString('vi-VN') : ''}
                      onChangeText={handleDiscountAmtChange}
                      keyboardType="numeric"
                      className="w-full bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-right text-base font-medium text-slate-900"
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      style={{ paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, height: 46 }}
                    />
                  ) : (
                    <TextInput
                      value={discountPct}
                      onChangeText={handleDiscountPctChange}
                      keyboardType="numeric"
                      className="w-full bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-right text-base font-medium text-slate-900"
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      maxLength={3}
                      style={{ paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, height: 46 }}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* Tổng cộng */}
            <View className="bg-orange-50 p-4 rounded-xl flex-row justify-between items-center mb-6 border border-orange-100">
              <Text className="text-sm font-semibold text-orange-800">Đơn giá sau giảm</Text>
              <Text className="text-lg font-bold text-orange-600">{formatCurrency(finalPrice)}</Text>
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-3.5 bg-slate-100 rounded-xl items-center"
              >
                <Text className="font-semibold text-slate-700 text-base">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                className="flex-[2] py-3.5 bg-orange-600 rounded-xl items-center"
              >
                <Text className="font-semibold text-white text-base">Xác nhận cập nhật</Text>
              </TouchableOpacity>
            </View>
          </View>
      </Pressable>
    </KeyboardAvoidingView>
  );

  if (inline) {
    return visible ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 99 }}>
        {Content}
      </View>
    ) : null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      {Content}
    </Modal>
  );
}
