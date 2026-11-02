import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
// Feather icons ship with @expo/vector-icons (same stroke style, no extra native module)
import { Feather } from '@expo/vector-icons';
import type { InboxItem } from '@oni/core';

// Table sync v2 conflict inbox: operations this device queued that the server refused
// (table already paid/closed, opened elsewhere, line deleted elsewhere...). Nothing here is billed.

interface TableSyncInboxModalProps {
  visible: boolean;
  items: InboxItem[];
  /** Readable table/room name for a session (falls back to a generic label) */
  tableNameOf: (sessionId: string) => string;
  /** Optional: readable product name for a change_qty / remove_item reference */
  itemNameOf?: (sessionId: string, ref: { item_id?: string; line_key?: string }) => string | undefined;
  onResolve: (ids: string[]) => Promise<void> | void;
  onClose: () => void;
}

const REASON_LABELS: Record<string, string> = {
  session_not_open: 'Bàn đã được thanh toán/đóng trên thiết bị khác',
  resource_occupied: 'Bàn đã được mở trên thiết bị khác',
  session_not_found: 'Không tìm thấy phiên bàn trên hệ thống',
  line_not_found: 'Món đã bị xoá trên thiết bị khác',
};

const formatCurrencyVN = (value: number) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;

export function describeInboxEntry(
  item: InboxItem,
  itemNameOf?: TableSyncInboxModalProps['itemNameOf']
): string {
  const entry = item.entry;
  if (entry.kind === 'open') return 'Mở bàn trên máy này';
  const op: any = entry.op;
  const refName = () => itemNameOf?.(item.session_id, { item_id: op.item_id, line_key: op.line_key }) || 'một món';
  switch (op.type) {
    case 'add_item':
      return `Thêm ${Number(op.qty) || 0} × ${op.product_name || 'món'} (${formatCurrencyVN(Number(op.unit_price) || 0)})`;
    case 'change_qty': {
      const delta = Number(op.delta) || 0;
      return `${delta >= 0 ? 'Tăng' : 'Giảm'} ${Math.abs(delta)} × ${refName()}`;
    }
    case 'remove_item':
      return `Xoá ${refName()}`;
    case 'set_time_charge':
      return `Tiền giờ ${formatCurrencyVN(Number(op.amount) || 0)}`;
    default:
      return 'Thao tác không xác định';
  }
}

export default function TableSyncInboxModal({ visible, items, tableNameOf, itemNameOf, onResolve, onClose }: TableSyncInboxModalProps) {
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    for (const it of items) {
      const list = map.get(it.session_id) || [];
      list.push(it);
      map.set(it.session_id, list);
    }
    return Array.from(map.entries());
  }, [items]);

  const confirmResolve = (sessionId: string, groupItems: InboxItem[]) => {
    const tableName = tableNameOf(sessionId) || 'bàn này';
    const lines = groupItems.map((it) => `• ${describeInboxEntry(it, itemNameOf)}`).join('\n');
    Alert.alert(
      'Xác nhận đã xử lý',
      `Được: gỡ ${groupItems.length} thao tác bị từ chối của ${tableName} khỏi máy này.\n\n` +
        `Mất: các thao tác dưới đây KHÔNG được tính tiền trên bất kỳ đơn nào và sẽ bị xoá khỏi máy này:\n${lines}\n\n` +
        'Nếu khách vẫn dùng các món này, hãy gọi lại món trên đúng bàn trước khi bấm xác nhận.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá khỏi máy này',
          style: 'destructive',
          onPress: async () => {
            setResolvingKey(sessionId);
            try {
              await onResolve(groupItems.map((it) => it.id));
            } finally {
              setResolvingKey(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center px-4">
        <View className="bg-white rounded-2xl w-full max-w-lg max-h-[90%]">
          <View className="px-5 pt-5 pb-3 flex-row items-start">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Feather name="alert-triangle" size={18} color="#b45309" />
                <Text className="text-base font-bold text-amber-700">Thao tác bị từ chối</Text>
              </View>
              <Text className="text-xs text-gray-500 mt-1.5">
                Các thao tác dưới đây đã được lưu trên máy này nhưng hệ thống không nhận. Chúng chưa được tính tiền trên đơn nào.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1 ml-2">
              <Feather name="x" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-4" bounces={false} showsVerticalScrollIndicator={false}>
            {groups.length === 0 && (
              <View className="items-center py-6">
                <Feather name="check-circle" size={22} color="#16a34a" />
                <Text className="text-xs text-gray-500 mt-2">Không còn xung đột nào.</Text>
              </View>
            )}
            {groups.map(([sessionId, groupItems]) => (
              <View key={sessionId} className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <View className="flex-row items-center mb-2">
                  <Feather name="grid" size={14} color="#92400e" />
                  <Text className="ml-1.5 text-sm font-bold text-amber-900 flex-1">
                    {tableNameOf(sessionId) || 'Bàn không xác định'}
                  </Text>
                </View>
                {groupItems.map((it) => (
                  <View key={it.id} className="mb-1.5">
                    <Text className="text-xs text-gray-800">• {describeInboxEntry(it, itemNameOf)}</Text>
                    <Text className="text-[11px] text-amber-700 ml-2.5">
                      {REASON_LABELS[it.reason] || it.reason || 'Hệ thống từ chối thao tác'}
                    </Text>
                  </View>
                ))}
                <TouchableOpacity
                  disabled={resolvingKey !== null}
                  onPress={() => confirmResolve(sessionId, groupItems)}
                  className="mt-2 flex-row items-center justify-center rounded-lg bg-rose-600 py-2 active:opacity-80"
                >
                  {resolvingKey === sessionId ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="trash-2" size={14} color="#ffffff" />
                      <Text className="ml-1.5 text-xs font-semibold text-white">Đã xử lý</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View className="px-4 py-3 border-t border-slate-100">
            <TouchableOpacity onPress={onClose} className="items-center rounded-lg border border-slate-200 py-2.5 active:bg-slate-50">
              <Text className="text-xs font-semibold text-slate-700">Để sau</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
