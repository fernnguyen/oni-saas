import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatCurrency } from '../../lib/utils/format';

type CartLine = {
  productId?: string;
  name?: string;
  price: number;
  quantity: number;
  modifier_total?: number;
  variant_label?: string;
  modifiers?: any;
};

interface TableOrderTicketSheetProps {
  visible: boolean;
  tableName: string;
  /** NEW (unsaved) lines being ordered for the table */
  draft: Record<string, CartLine>;
  /** Lines already on the table (read-only here) */
  previousItems: Record<string, CartLine>;
  saving: boolean;
  onClose: () => void;
  onIncrease: (cartItemId: string) => void;
  onDecrease: (cartItemId: string) => void;
  onRemove: (cartItemId: string) => void;
  onClearAll: () => void;
  onSave: () => void;
}

const lineUnitPrice = (line: CartLine) => (Number(line.price) || 0) + (Number(line.modifier_total) || 0);

const modifierLabel = (line: CartLine): string => {
  const parts: string[] = [];
  if (line.variant_label) parts.push(String(line.variant_label));
  let mods: any = line.modifiers;
  if (typeof mods === 'string') {
    try { mods = JSON.parse(mods); } catch { mods = []; }
  }
  if (Array.isArray(mods)) {
    for (const m of mods) {
      const label = m?.option || m?.name;
      if (label) parts.push(String(label));
    }
  }
  return parts.join(' · ');
};

export function TableOrderTicketSheet({
  visible,
  tableName,
  draft,
  previousItems,
  saving,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
  onClearAll,
  onSave,
}: TableOrderTicketSheetProps) {
  const draftEntries = Object.entries(draft || {});
  const draftCount = draftEntries.reduce((sum, [, l]) => sum + (Number(l.quantity) || 0), 0);
  const draftTotal = draftEntries.reduce((sum, [, l]) => sum + lineUnitPrice(l) * (Number(l.quantity) || 0), 0);
  const previousEntries = Object.entries(previousItems || {}).filter(([key, l]) => key !== 'TIME_CHARGE' && l?.productId !== 'TIME_CHARGE');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} />
        <View
          className="bg-white rounded-t-2xl"
          style={{ maxHeight: '85%', paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
            <View className="flex-1 mr-3">
              <Text className="text-sm font-bold text-slate-800" numberOfLines={1}>Phiếu gọi món</Text>
              <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{tableName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1.5 rounded-lg active:bg-slate-100" accessibilityLabel="Đóng">
              <Feather name="x" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-4" contentContainerStyle={{ paddingVertical: 12 }}>
            {/* Món mới (chưa lưu) */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-slate-700">Món mới (chưa lưu)</Text>
              {draftEntries.length > 0 && (
                <TouchableOpacity onPress={onClearAll} disabled={saving} className="flex-row items-center px-2 py-1 rounded-lg active:bg-rose-50">
                  <Feather name="trash-2" size={12} color="#e11d48" />
                  <Text className="text-xs font-medium text-rose-600 ml-1">Xoá hết món mới</Text>
                </TouchableOpacity>
              )}
            </View>

            {draftEntries.length === 0 ? (
              <View className="items-center py-6 bg-slate-50 border border-slate-100 rounded-xl mb-4">
                <Feather name="shopping-bag" size={20} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 mt-2">Chưa chọn món mới nào.</Text>
              </View>
            ) : (
              <View className="bg-white border border-orange-100 rounded-xl mb-4">
                {draftEntries.map(([cartItemId, line], idx) => {
                  const label = modifierLabel(line);
                  const unit = lineUnitPrice(line);
                  return (
                    <View
                      key={cartItemId}
                      className={`px-3 py-2.5 ${idx < draftEntries.length - 1 ? 'border-b border-slate-100' : ''}`}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-2">
                          <Text className="text-xs font-semibold text-slate-800" numberOfLines={2}>{line.name}</Text>
                          {!!label && (
                            <Text className="text-[11px] text-slate-500 mt-0.5" numberOfLines={2}>{label}</Text>
                          )}
                          <Text className="text-[11px] text-slate-400 mt-0.5">{formatCurrency(unit)} / món</Text>
                        </View>
                        <Text className="text-xs font-bold text-slate-800">{formatCurrency(unit * (Number(line.quantity) || 0))}</Text>
                      </View>
                      <View className="flex-row items-center justify-end mt-2">
                        <TouchableOpacity
                          onPress={() => onDecrease(cartItemId)}
                          disabled={saving}
                          className="w-8 h-8 bg-slate-100 rounded-lg justify-center items-center active:bg-slate-200"
                          accessibilityLabel={`Giảm ${line.name}`}
                        >
                          <Feather name="minus" size={14} color="#475569" />
                        </TouchableOpacity>
                        <View className="min-w-[36px] h-8 mx-1.5 bg-white border border-slate-200 rounded-lg justify-center items-center px-1">
                          <Text className="text-xs font-bold text-slate-800">{line.quantity}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => onIncrease(cartItemId)}
                          disabled={saving}
                          className="w-8 h-8 bg-orange-50 border border-orange-100 rounded-lg justify-center items-center active:bg-orange-100"
                          accessibilityLabel={`Tăng ${line.name}`}
                        >
                          <Feather name="plus" size={14} color="#fa5908" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onRemove(cartItemId)}
                          disabled={saving}
                          className="w-8 h-8 ml-2 rounded-lg justify-center items-center active:bg-rose-50"
                          accessibilityLabel={`Xoá ${line.name}`}
                        >
                          <Feather name="trash-2" size={14} color="#e11d48" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Đã gọi trước đó */}
            <Text className="text-xs font-bold text-slate-700 mb-1">Đã gọi trước đó</Text>
            <Text className="text-[11px] text-slate-400 mb-2">Chỉnh món đã gọi ở màn chi tiết bàn</Text>
            {previousEntries.length === 0 ? (
              <Text className="text-xs text-slate-400 mb-2">Bàn chưa có món nào.</Text>
            ) : (
              <View className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1 mb-2">
                {previousEntries.map(([cartItemId, line]) => {
                  const label = modifierLabel(line);
                  return (
                    <View key={cartItemId} className="flex-row items-center justify-between py-1.5">
                      <Text className="text-xs text-slate-600 flex-1 mr-2" numberOfLines={1}>
                        {line.quantity} × {line.name}{label ? ` (${label})` : ''}
                      </Text>
                      <Text className="text-xs text-slate-500">{formatCurrency(lineUnitPrice(line) * (Number(line.quantity) || 0))}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View className="px-4 pt-3 border-t border-slate-100">
            <View className="flex-row items-center justify-between mb-2.5">
              <Text className="text-xs text-slate-500">Món mới: {draftCount} món</Text>
              <Text className="text-sm font-bold text-orange-500">{formatCurrency(draftTotal)}</Text>
            </View>
            <TouchableOpacity
              onPress={onSave}
              disabled={saving || draftCount === 0}
              activeOpacity={0.85}
              className={`h-12 rounded-xl flex-row items-center justify-center ${saving || draftCount === 0 ? 'bg-slate-300' : 'bg-orange-500 active:bg-orange-600'}`}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Feather name="save" size={15} color="white" />
              )}
              <Text className="text-sm font-semibold text-white ml-2" numberOfLines={1}>
                Lưu vào {tableName} ({draftCount} món)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default TableOrderTicketSheet;
