import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

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

interface ConflictResolutionModalProps {
  visible: boolean;
  conflict: TableConflict | null;
  tableName: string;
  onResolve: (action: 'merge' | 'keep_server' | 'replace_server') => Promise<void>;
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

  if (!conflict) return null;

  const localTotal = conflict.localItems.reduce(
    (sum, it) => sum + it.qty * it.unit_price,
    0
  );

  const handleResolve = async (action: 'merge' | 'keep_server' | 'replace_server') => {
    setResolvingAction(action);
    try {
      await onResolve(action);
    } finally {
      setResolvingAction(null);
    }
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
              <Text className="text-lg font-bold text-amber-700 text-center">
                ⚠️ Phát hiện dữ liệu chưa đồng bộ
              </Text>
              <Text className="text-sm text-gray-500 text-center mt-2">
                {tableName} đã được mở trên thiết bị khác trong khi máy bạn đang mất kết nối.
              </Text>
            </View>

            {/* Comparison */}
            <View className="flex-row px-4 pb-3 gap-2">
              {/* Local */}
              <View className="flex-1 bg-blue-50 rounded-xl p-3">
                <Text className="text-xs font-bold text-blue-700 mb-2">
                  📱 Đơn trên máy bạn
                </Text>
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
                <Text className="text-xs font-bold text-green-700 mb-2">
                  🖥️ Đơn trên hệ thống
                </Text>
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

            {/* Actions */}
            <View className="px-4 pb-3 gap-2">
              {/* Merge */}
              <TouchableOpacity
                className="bg-indigo-600 rounded-xl py-3 px-4"
                disabled={resolvingAction !== null}
                onPress={() => handleResolve('merge')}
              >
                {resolvingAction === 'merge' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text className="text-white font-bold text-sm text-center">
                      🔀 Gộp tất cả món vào 1 đơn
                    </Text>
                    <Text className="text-indigo-200 text-xs text-center mt-1">
                      Giữ đơn hệ thống + thêm món từ máy bạn
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Keep server */}
              <TouchableOpacity
                className="bg-gray-100 rounded-xl py-3 px-4 border border-gray-200"
                disabled={resolvingAction !== null}
                onPress={() => handleResolve('keep_server')}
              >
                {resolvingAction === 'keep_server' ? (
                  <ActivityIndicator color="#6b7280" />
                ) : (
                  <>
                    <Text className="text-gray-700 font-bold text-sm text-center">
                      ☁️ Giữ đơn hệ thống
                    </Text>
                    <Text className="text-gray-400 text-xs text-center mt-1">
                      Bỏ đơn trên máy bạn
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Replace with local */}
              <TouchableOpacity
                className="bg-red-50 rounded-xl py-3 px-4 border border-red-200"
                disabled={resolvingAction !== null}
                onPress={() => handleResolve('replace_server')}
              >
                {resolvingAction === 'replace_server' ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <>
                    <Text className="text-red-600 font-bold text-sm text-center">
                      📱 Dùng đơn trên máy bạn
                    </Text>
                    <Text className="text-red-300 text-xs text-center mt-1">
                      Hủy đơn hệ thống, thay bằng đơn của bạn
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Dismiss */}
            <TouchableOpacity
              className="py-4"
              onPress={onDismiss}
              disabled={resolvingAction !== null}
            >
              <Text className="text-gray-400 text-sm text-center underline">
                Đóng - xử lý sau
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
