import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../lib/utils/format';

export function ProductPreviewModal({
  visible,
  onClose,
  product,
  setPreviewProduct,
  quantity,
  setQuantity,
  selectedVariant,
  setSelectedVariant,
  selectedModifiers,
  setSelectedModifiers,
  onConfirm
}: any) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState('');
  
  const [discountType, setDiscountType] = useState<'amount'|'percent'>('amount');
  const [tempDiscount, setTempDiscount] = useState('');

  useEffect(() => {
    if (visible) {
      setIsEditingPrice(false);
      setTempPrice('');
      setDiscountType('amount');
      setTempDiscount('');
    }
  }, [visible]);

  if (!product) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center px-4">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
        />
        <View className="w-full max-w-[360px] bg-white rounded-2xl overflow-hidden shadow-2xl relative">
          <View className="flex-row justify-between items-center p-4 border-b border-slate-100">
            <Text className="text-sm font-semibold text-slate-800 flex-1" numberOfLines={1}>{product.name}</Text>
            <TouchableOpacity onPress={onClose} className="ml-2">
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            <View className="p-4">
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} className="w-full h-32 rounded-xl mb-4" resizeMode="cover" />
              ) : null}
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-slate-500 text-xs">Giá cơ bản (Chạm để sửa)</Text>
                {isEditingPrice ? (
                  <TextInput
                    className="text-orange-600 font-semibold text-sm border-b border-orange-300 min-w-[80px] text-right p-0"
                    keyboardType="numeric"
                    autoFocus
                    value={tempPrice}
                    onChangeText={(val) => {
                      const numStr = val.replace(/[^0-9]/g, '');
                      setTempPrice(numStr);
                      if (setPreviewProduct) {
                        setPreviewProduct({ ...product, sell_price: Number(numStr) || 0 });
                      }
                    }}
                    onBlur={() => {
                      setIsEditingPrice(false);
                    }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => {
                    setTempPrice(String(product.sell_price || 0));
                    setIsEditingPrice(true);
                  }}>
                    <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1' }}>
                      <Text className="text-slate-800 font-semibold text-sm">
                        {formatCurrency(product.sell_price)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
              {product.tax_rate && parseFloat(product.tax_rate) > 0 ? (
                <View className="flex-row justify-between items-center mb-4 -mt-2">
                  <Text className="text-slate-400 text-xxs">Thuế suất (VAT)</Text>
                  <Text className="text-slate-600 text-xs font-semibold">{product.tax_rate}%</Text>
                </View>
              ) : null}

              {/* Variant Options */}
              {(() => {
                let variantsConfig: any = null;
                try {
                  if (product.variant_options) {
                    variantsConfig = typeof product.variant_options === 'string' ? JSON.parse(product.variant_options) : product.variant_options;
                  }
                } catch(e) {}
                if (!variantsConfig || Object.keys(variantsConfig).length === 0) return null;
                
                return Object.entries(variantsConfig).map(([groupName, options]: [string, any]) => (
                  <View key={groupName} className="mb-4">
                    <Text className="text-xs font-semibold text-slate-700 mb-2">{groupName}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {Array.isArray(options) && options.map((opt: string) => {
                        const isSelected = selectedVariant?.option === opt;
                        return (
                          <TouchableOpacity
                            key={opt}
                            onPress={() => setSelectedVariant({ group: groupName, option: opt })}
                            className={`px-3 py-1.5 rounded-lg border ${isSelected ? 'bg-orange-50 border-orange-500' : 'bg-white border-slate-200'}`}
                          >
                            <Text className={`text-xs ${isSelected ? 'text-orange-600 font-medium' : 'text-slate-600'}`}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ));
              })()}

              {/* Modifiers */}
              {(() => {
                let modifierGroups: any[] = [];
                try {
                  if (product.modifier_groups) {
                    modifierGroups = typeof product.modifier_groups === 'string' ? JSON.parse(product.modifier_groups) : product.modifier_groups;
                  }
                } catch(e) {}
                if (!modifierGroups || modifierGroups.length === 0) return null;

                return modifierGroups.map((group, gIdx) => (
                  <View key={gIdx} className="mb-4">
                    <Text className="text-xs font-semibold text-slate-700 mb-2">{group.name} {group.required ? <Text className="text-rose-500">*</Text> : ''}</Text>
                    {group.options?.map((opt: any, oIdx: number) => {
                      const isSelected = selectedModifiers.some((m: any) => m.option === opt.name);
                      return (
                        <TouchableOpacity
                          key={oIdx}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedModifiers((prev: any[]) => prev.filter(m => m.option !== opt.name));
                            } else {
                              setSelectedModifiers((prev: any[]) => [...prev, { option: opt.name, price_adj: Number(opt.price_adj) || 0 }]);
                            }
                          }}
                          className="flex-row justify-between items-center py-2 border-b border-slate-50 last:border-0"
                        >
                          <View className="flex-row items-center">
                            <View className={`w-4 h-4 rounded border mr-2 items-center justify-center ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                              {isSelected ? <Ionicons name="checkmark" size={12} color="white" /> : null}
                            </View>
                            <Text className="text-xs text-slate-700">{opt.name}</Text>
                          </View>
                          <Text className="text-xs text-slate-500">{Number(opt.price_adj) > 0 ? `+${formatCurrency(opt.price_adj)}` : ''}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ));
              })()}

              {/* Discount */}
              <View className="mt-2 mb-2 pt-4 border-t border-slate-100">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-sm font-semibold text-slate-700">Giảm giá</Text>
                  <View className="flex-row bg-slate-100 p-0.5 rounded-lg">
                    <Pressable
                      onPress={() => { setDiscountType('amount'); setTempDiscount(''); }}
                      className="px-3 py-1 rounded-md"
                      style={discountType === 'amount' ? {
                        backgroundColor: '#ffffff',
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      } : undefined}
                    >
                      <Text className={`text-[11px] ${discountType === 'amount' ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>Số tiền</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setDiscountType('percent'); setTempDiscount(''); }}
                      className="px-3 py-1 rounded-md"
                      style={discountType === 'percent' ? {
                        backgroundColor: '#ffffff',
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      } : undefined}
                    >
                      <Text className={`text-[11px] ${discountType === 'percent' ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>%</Text>
                    </Pressable>
                  </View>
                </View>
                <View className="flex-row items-center justify-end">
                  <TextInput
                    className="text-orange-600 font-semibold text-sm border-b border-orange-300 min-w-[80px] text-right p-0 pb-1"
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#cbd5e1"
                    value={tempDiscount || (discountType === 'amount' ? (product.discount_amount ? String(product.discount_amount) : '') : (product.discount_pct ? String(product.discount_pct) : ''))}
                    onChangeText={(val) => {
                      let numStr = val.replace(/[^0-9]/g, '');
                      if (discountType === 'percent' && Number(numStr) > 100) numStr = '100';
                      setTempDiscount(numStr);
                      if (setPreviewProduct) {
                        const amt = discountType === 'amount' ? Number(numStr) || 0 : 0;
                        const pct = discountType === 'percent' ? Number(numStr) || 0 : 0;
                        const actualAmt = discountType === 'amount' ? amt : Math.round((product.sell_price * pct) / 100);
                        setPreviewProduct({ ...product, discount_amount: actualAmt, discount_pct: pct });
                      }
                    }}
                  />
                  <Text className="text-slate-500 text-xs ml-1 pb-1">{discountType === 'percent' ? '%' : 'đ'}</Text>
                </View>
              </View>

              {/* Quantity */}
              <View className="mt-2 pt-4 border-t border-slate-100 flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-slate-700">Số lượng</Text>
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <TouchableOpacity 
                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 items-center justify-center bg-white active:bg-slate-100"
                  >
                    <Ionicons name="remove" size={18} color="#64748b" />
                  </TouchableOpacity>
                  <Text className="w-12 text-center text-sm font-semibold text-slate-800">{quantity}</Text>
                  <TouchableOpacity 
                    onPress={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 items-center justify-center bg-white active:bg-slate-100"
                  >
                    <Ionicons name="add" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          <View className="p-4 border-t border-slate-100 flex-row gap-3">
            <TouchableOpacity 
              onPress={onClose}
              className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
            >
              <Text className="text-sm font-semibold text-slate-600">Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={onConfirm}
              className="flex-1 py-3 bg-orange-500 rounded-xl items-center shadow-md shadow-orange-500/20"
            >
              <Text className="text-sm font-semibold text-white">Thêm {formatCurrency(Math.max(0, (product.sell_price - (product.discount_amount || 0) + selectedModifiers.reduce((s: any, m: any) => s + (Number(m.price_adj)||0), 0)) * quantity))}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
