import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
// Feather icons ship with @expo/vector-icons (same stroke style, no extra native module)
import { Feather } from '@expo/vector-icons';

export interface TableConflict {
  tableId: string;
  localOrderId: string;
  localItems: { product_name: string; qty: number; unit_price: number }[];
  localCheckIn: string;
  localCustomerName: string;
  existingOrder: {
    order_id: string;
    order_no: string;
    check_in: string;
    customer_name: string;
    items_count: number;
    items_summary: { name: string; qty: number }[];
    total_amount: number;
  };
}

type ConflictAction = 'merge' | 'keep_server' | 'replace_server';

interface ConflictResolutionModalProps {
  visible: boolean;
  conflict: TableConflict | null;
  tableName: string;
  /** Must throw (with a user-facing message) on failure so the confirmation step can show it */
  onResolve: (action: ConflictAction) => Promise<void>;
  onDismiss: () => void;
}

const formatTime = (checkIn: string) => {
  try {
    return new Date(checkIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
};

const formatCurrencyVN = (amount: number) => {
  try {
    return Intl.NumberFormat('vi-VN').format(amount) + 'đ';
  } catch {
    return amount + 'đ';
  }
};

export function ConflictResolutionModal({
  visible,
  conflict,
  tableName,
  onResolve,
  onDismiss,
}: ConflictResolutionModalProps) {
  const [resolvingAction, setResolvingAction] = useState<string | null>(null);
  // Every action goes through an explicit confirmation step that states what is kept and what is lost
  const [confirmAction, setConfirmAction] = useState<ConflictAction | null>(null);
  const [resolveError, setResolveError] = useState('');

  useEffect(() => {
    setConfirmAction(null);
    setResolveError('');
  }, [conflict?.tableId, conflict?.localOrderId]);

  if (!conflict) return null;

  const localTotal = conflict.localItems.reduce(
    (sum, it) => sum + it.qty * it.unit_price,
    0
  );

  const handleResolve = async (action: ConflictAction) => {
    setResolvingAction(action);
    setResolveError('');
    try {
      await onResolve(action);
      setConfirmAction(null);
    } catch (err: any) {
      setResolveError(err?.message || 'Không thể xử lý xung đột. Vui lòng thử lại.');
    } finally {
      setResolvingAction(null);
    }
  };

  const server = conflict.existingOrder;
  const serverLabel = `đơn ${server.order_no ? `#${server.order_no} ` : ''}của ${server.customer_name || 'Khách lẻ'}`;
  const localList = conflict.localItems.map((it) => `${it.product_name} x${it.qty}`).join(', ') || 'không có món';
  const serverList = (server.items_summary || []).map((it) => `${it.name} x${it.qty}`).join(', ') || `${server.items_count} món`;

  const confirmCopy: Record<ConflictAction, { title: string; gains: string[]; losses: string[]; confirmLabel: string; danger: boolean }> = {
    merge: {
      title: 'Gộp món vào đơn hệ thống?',
      gains: [
        `${localList} (${formatCurrencyVN(localTotal)}) được thêm vào ${serverLabel}.`,
        'Món trùng tên được cộng dồn số lượng; tổng tiền đơn hệ thống tăng tương ứng.',
        'Nếu đơn hệ thống đã thanh toán: món được cất vào một đơn "cần kiểm tra", KHÔNG tính vào hoá đơn đã trả.',
      ],
      losses: ['Không mất món nào.', `Khách ${server.customer_name || 'Khách lẻ'} sẽ phải trả thêm các món trên nếu gộp nhầm bàn.`],
      confirmLabel: 'Xác nhận gộp',
      danger: false,
    },
    keep_server: {
      title: 'Giữ đơn hệ thống?',
      gains: [`${serverLabel} giữ nguyên (${serverList}, ${formatCurrencyVN(server.total_amount)}).`],
      losses: [
        `${conflict.localItems.length} món chỉ có trên máy này sẽ bị XOÁ VĨNH VIỄN: ${localList} (${formatCurrencyVN(localTotal)}).`,
        'Không thể hoàn tác. Chỉ chọn nếu khách không dùng các món này hoặc đã nhập ở máy khác.',
      ],
      confirmLabel: 'Xoá món trên máy và giữ đơn hệ thống',
      danger: true,
    },
    replace_server: {
      title: 'Thay đơn hệ thống bằng đơn trên máy bạn?',
      gains: [`Bàn dùng đơn mới gồm: ${localList} (${formatCurrencyVN(localTotal)}).`],
      losses: [
        `${serverLabel} bị HUỶ: ${serverList} (${formatCurrencyVN(server.total_amount)}) không còn được tính tiền.`,
        'Nếu đó là khách khác đang ngồi ở bàn này, khách đó sẽ mất toàn bộ hoá đơn.',
        'Hệ thống sẽ từ chối nếu đơn đó đã thu tiền (cọc/trả trước).',
      ],
      confirmLabel: 'Huỷ đơn hệ thống và dùng đơn của tôi',
      danger: true,
    },
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-4">
        <View className="bg-white rounded-2xl w-full max-w-lg max-h-[90%]">
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View className="px-5 pt-5 pb-3">
              <View className="flex-row items-center justify-center gap-2">
                <Feather name="alert-triangle" size={20} color="#b45309" />
                <Text className="text-lg font-bold text-amber-700">Phát hiện dữ liệu chưa đồng bộ</Text>
              </View>
              <Text className="text-sm text-gray-500 text-center mt-2">
                Trong lúc máy bạn mất kết nối, {tableName} đã được thanh toán hoặc mở lại trên thiết bị khác. Các món bên trái chưa được gửi lên hệ thống.
              </Text>
            </View>

            {/* Comparison */}
            <View className="flex-row px-4 pb-3 gap-2">
              {/* Local */}
              <View className="flex-1 bg-blue-50 rounded-xl p-3">
                <View className="flex-row items-center gap-1 mb-2">
                  <Feather name="smartphone" size={14} color="#1d4ed8" />
                  <Text className="text-xs font-bold text-blue-700">Đơn trên máy bạn</Text>
                </View>
                <Text className="text-xs text-gray-500 mb-1">
                  Giờ vào: {formatTime(conflict.localCheckIn)}
                </Text>
                <Text className="text-xs text-gray-500 mb-2">
                  Khách: {conflict.localCustomerName || 'Khách lẻ'}
                </Text>
                {conflict.localItems.map((item, i) => (
                  <Text key={i} className="text-xs text-gray-700">
                    • {item.product_name} x{item.qty}
                  </Text>
                ))}
                <Text className="text-xs font-semibold text-blue-800 mt-2">
                  Tổng: {formatCurrencyVN(localTotal)}
                </Text>
              </View>

              {/* Server */}
              <View className="flex-1 bg-green-50 rounded-xl p-3">
                <View className="flex-row items-center gap-1 mb-2">
                  <Feather name="monitor" size={14} color="#15803d" />
                  <Text className="text-xs font-bold text-green-700">Đơn trên hệ thống</Text>
                </View>
                <Text className="text-xs text-gray-500 mb-1">
                  Giờ vào: {formatTime(conflict.existingOrder.check_in)}
                </Text>
                <Text className="text-xs text-gray-500 mb-2">
                  Khách: {conflict.existingOrder.customer_name || 'Khách lẻ'}
                </Text>
                {(conflict.existingOrder.items_summary || []).map((item, i) => (
                  <Text key={i} className="text-xs text-gray-700">
                    • {item.name} x{item.qty}
                  </Text>
                ))}
                {(!conflict.existingOrder.items_summary || conflict.existingOrder.items_summary.length === 0) && (
                  <Text className="text-xs text-gray-400 italic">
                    {conflict.existingOrder.items_count} món
                  </Text>
                )}
                <Text className="text-xs font-semibold text-green-800 mt-2">
                  Tổng: {formatCurrencyVN(conflict.existingOrder.total_amount)}
                </Text>
              </View>
            </View>

            {confirmAction && (
              <View className="px-4 pb-4">
                <View className={`rounded-xl border p-4 ${confirmCopy[confirmAction].danger ? 'border-red-200 bg-red-50' : 'border-indigo-200 bg-indigo-50'}`}>
                  <Text className={`text-base font-bold mb-3 ${confirmCopy[confirmAction].danger ? 'text-red-700' : 'text-indigo-800'}`}>
                    {confirmCopy[confirmAction].title}
                  </Text>
                  <View className="flex-row items-center gap-1 mb-1">
                    <Feather name="check-circle" size={14} color="#15803d" />
                    <Text className="text-xs font-bold text-green-700">Được</Text>
                  </View>
                  {confirmCopy[confirmAction].gains.map((line, i) => (
                    <Text key={`g${i}`} className="text-xs text-gray-700 mb-1">• {line}</Text>
                  ))}
                  <View className="flex-row items-center gap-1 mt-2 mb-1">
                    <Feather name="x-circle" size={14} color="#b91c1c" />
                    <Text className="text-xs font-bold text-red-700">Mất</Text>
                  </View>
                  {confirmCopy[confirmAction].losses.map((line, i) => (
                    <Text key={`l${i}`} className="text-xs text-gray-700 mb-1">• {line}</Text>
                  ))}
                </View>
                {!!resolveError && (
                  <Text className="text-xs text-red-600 mt-2 text-center">{resolveError}</Text>
                )}
                <TouchableOpacity
                  className={`mt-3 rounded-xl py-3 px-4 ${confirmCopy[confirmAction].danger ? 'bg-red-600' : 'bg-indigo-600'}`}
                  disabled={resolvingAction !== null}
                  onPress={() => handleResolve(confirmAction)}
                >
                  {resolvingAction === confirmAction ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-bold text-sm text-center">{confirmCopy[confirmAction].confirmLabel}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  className="mt-2 rounded-xl py-3 px-4 border border-gray-200 bg-white"
                  disabled={resolvingAction !== null}
                  onPress={() => { setConfirmAction(null); setResolveError(''); }}
                >
                  <Text className="text-gray-700 font-semibold text-sm text-center">Quay lại chọn cách khác</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Actions */}
            {!confirmAction && (
            <View className="px-4 pb-3 gap-2">
              {/* Merge */}
              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-3 px-4"
                disabled={resolvingAction !== null}
                onPress={() => { setResolveError(''); setConfirmAction('merge'); }}
              >
                {resolvingAction === 'merge' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <View className="flex-row items-center justify-center gap-2">
                      <Feather name="git-merge" size={16} color="#ffffff" />
                      <Text className="text-white font-bold text-sm">Gộp món vào đơn hệ thống</Text>
                    </View>
                    <Text className="text-indigo-200 text-xs text-center mt-1">
                      Thêm món trên máy bạn vào đơn đang mở (cộng dồn số lượng). Nếu đơn hệ thống đã thanh toán, món được cất vào đơn "cần kiểm tra"
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Keep server */}
              <TouchableOpacity
                className="bg-gray-100 rounded-xl py-3 px-4 border border-gray-200"
                disabled={resolvingAction !== null}
                onPress={() => { setResolveError(''); setConfirmAction('keep_server'); }}
              >
                {resolvingAction === 'keep_server' ? (
                  <ActivityIndicator color="#6b7280" />
                ) : (
                  <>
                    <View className="flex-row items-center justify-center gap-2">
                      <Feather name="cloud" size={16} color="#374151" />
                      <Text className="text-gray-700 font-bold text-sm">Giữ đơn hệ thống</Text>
                    </View>
                    <Text className="text-gray-400 text-xs text-center mt-1">
                      Bỏ các món chỉ có trên máy bạn (khi khách không dùng các món đó)
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Replace with local */}
              <TouchableOpacity
                className="bg-red-50 rounded-xl py-3 px-4 border border-red-200"
                disabled={resolvingAction !== null}
                onPress={() => { setResolveError(''); setConfirmAction('replace_server'); }}
              >
                {resolvingAction === 'replace_server' ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <>
                    <View className="flex-row items-center justify-center gap-2">
                      <Feather name="repeat" size={16} color="#dc2626" />
                      <Text className="text-red-600 font-bold text-sm">Dùng đơn trên máy bạn</Text>
                    </View>
                    <Text className="text-red-300 text-xs text-center mt-1">
                      Huỷ đơn hệ thống và thay bằng các món trên máy bạn. Không áp dụng khi đơn hệ thống đã thu tiền
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            )}

            {/* Dismiss */}
            {!confirmAction && (
            <TouchableOpacity
              className="py-4"
              onPress={onDismiss}
              disabled={resolvingAction !== null}
            >
              <Text className="text-gray-500 text-sm text-center underline">
                Để sau
              </Text>
              <Text className="text-gray-400 text-xs text-center mt-1 px-6">
                Món vẫn được giữ trên máy này. Mở lại bất cứ lúc nào từ nút "Xung đột" trên màn sơ đồ bàn.
              </Text>
            </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
