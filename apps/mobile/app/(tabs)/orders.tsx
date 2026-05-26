import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';

export default function OrdersScreen() {
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([{ id: 'all', label: 'Tất cả ca' }]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, synced, pending
  
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]);
  const [isSyncingOrder, setIsSyncingOrder] = useState<string | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);

  // Tải dữ liệu thực tế mỗi lần tab được chọn
  const loadOrdersData = async () => {
    try {
      setIsLoading(true);
      const ordersData = await db.select().from(schema.orders);
      const shiftsData = await db.select().from(schema.shop_shifts);

      // Cập nhật danh sách ca chọn lọc
      const mappedShifts = [
        { id: 'all', label: 'Tất cả ca' },
        ...shiftsData.map((s) => ({
          id: s.id,
          label: `Ca ${s.employee_name || 'Thu ngân'} (${s.opened_at.substring(11, 16)} - ${s.closed_at ? s.closed_at.substring(11, 16) : 'Đang mở'})`
        }))
      ];
      
      setOrdersList(ordersData);
      setShiftsList(mappedShifts);
      setIsLoading(false);
    } catch (err) {
      console.error('Lỗi khi tải lịch sử hóa đơn từ SQLite:', err);
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadOrdersData();
    }, [])
  );

  // Xử lý xem chi tiết hóa đơn
  const handleViewOrderDetails = async (order: any) => {
    try {
      const items = await db
        .select()
        .from(schema.order_items)
        .where(eq(schema.order_items.order_id, order.id));
      
      setSelectedOrderItems(items);
      setSelectedOrder(order);
    } catch (err) {
      console.error('Lỗi tải chi tiết dòng sản phẩm:', err);
    }
  };

  // Đồng bộ hóa đơn đơn lẻ / toàn ca ngầm
  const handleSyncSingleOrder = async (orderId: string) => {
    setIsSyncingOrder(orderId);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const results = await SyncManager.pushOfflineOrders(shopId);
      
      await loadOrdersData();
      
      if (results.successCount > 0) {
        Alert.alert('Thành công', `Đã đồng bộ thành công ${results.successCount} hóa đơn ngoại tuyến lên Cloud!`);
      } else if (results.failedCount > 0) {
        Alert.alert('Thất bại', 'Đồng bộ thất bại. Vui lòng kiểm tra lại cấu hình Next.js server.');
      } else {
        Alert.alert('Thông báo', 'Hóa đơn đã được đồng bộ từ trước.');
      }
    } catch (err: any) {
      console.error('Lỗi khi đồng bộ hóa đơn:', err);
      Alert.alert('Lỗi', 'Không thể hoàn tất kết nối đồng bộ hóa.');
    } finally {
      setIsSyncingOrder(null);
      setSelectedOrder(null);
    }
  };

  // Giả lập in lại hóa đơn
  const handleReprint = () => {
    setIsReprinting(true);
    setTimeout(() => {
      setIsReprinting(false);
      Alert.alert('Đã gửi lệnh in', 'Đã in thành công hóa đơn nhiệt K80 Bluetooth!');
    }, 1200);
  };

  // Bộ lọc danh sách hóa đơn trong JS
  const filteredOrders = ordersList.filter(order => {
    const matchesSearch = 
      (order.id && order.id.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (order.order_no && order.order_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesShift = selectedShift === 'all' || order.shift_id === selectedShift;
    const matchesStatus = selectedStatus === 'all' || order.sync_status === selectedStatus;
    
    return matchesSearch && matchesShift && matchesStatus;
  });

  // Tính toán nhanh số liệu
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const syncedCount = filteredOrders.filter(o => o.sync_status === 'synced').length;
  const pendingCount = filteredOrders.filter(o => o.sync_status === 'pending').length;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* 1. HEADER */}
      <View className="px-4 py-3 border-b bg-white border-slate-200 shadow-sm">
        <Text className="text-lg font-black text-slate-800">Lịch sử hóa đơn</Text>
        <Text className="text-xs text-slate-500 mt-0.5 font-semibold">Danh sách hóa đơn được lưu trữ SQLite di động</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-450 font-bold mt-2">Đang tải hóa đơn từ SQLite...</Text>
        </View>
      ) : (
        <View className="flex-1">
          {/* 2. THỐNG KÊ DOANH THU NHANH CA LÀM VIỆC */}
          <View className="p-4 flex-row justify-between">
            <View className="flex-1 mr-2 p-3.5 rounded-3xl border bg-white border-slate-200 shadow-sm">
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Doanh thu ca</Text>
              <Text className="text-orange-500 font-black text-base mt-1">{totalRevenue.toLocaleString()}đ</Text>
              <Text className="text-[9px] text-slate-450 font-bold mt-0.5">{filteredOrders.length} hóa đơn</Text>
            </View>

            <View className="flex-1 mx-1 p-3.5 rounded-3xl border bg-white border-slate-200 shadow-sm">
              <Text className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Đã đồng bộ</Text>
              <Text className="text-emerald-700 font-black text-base mt-1">{syncedCount}</Text>
              <Text className="text-[9px] text-slate-450 font-bold mt-0.5">Đám mây Cloud</Text>
            </View>

            <View className="flex-1 ml-2 p-3.5 rounded-3xl border bg-white border-slate-200 shadow-sm">
              <Text className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Chờ đồng bộ</Text>
              <Text className="text-amber-700 font-black text-base mt-1">{pendingCount}</Text>
              <Text className="text-[9px] text-slate-450 font-bold mt-0.5">Pending offline</Text>
            </View>
          </View>

          {/* 3. TÌM KIẾM & BỘ LỌC */}
          <View className="px-4 pb-3">
            {/* Thanh tìm kiếm */}
            <View className="flex-row items-center px-3.5 py-2.5 rounded-2xl border bg-white border-slate-200 mb-3 shadow-sm">
              <Ionicons name="search-outline" size={18} color="#94a3b8" />
              <TextInput
                placeholder="Tìm mã HD, khách hàng..."
                placeholderTextColor="#94a3b8"
                className="flex-1 ml-2 text-xs font-semibold text-slate-800"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ outlineStyle: 'none' } as any}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Lọc theo Ca */}
            {shiftsList.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
                {shiftsList.map(shift => (
                  <TouchableOpacity
                    key={shift.id}
                    className={`mr-2.5 px-4 py-2 rounded-xl border ${
                      selectedShift === shift.id
                        ? 'bg-orange-500 border-orange-500'
                        : 'bg-white border-slate-200'
                    }`}
                    onPress={() => setSelectedShift(shift.id)}
                  >
                    <Text className={`text-[9px] font-bold uppercase tracking-wider ${
                      selectedShift === shift.id ? 'text-white' : 'text-slate-600'
                    }`}>
                      {shift.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Lọc theo Trạng thái Sync */}
            <View className="flex-row">
              <TouchableOpacity
                className={`mr-2 px-3 py-2 rounded-xl border ${
                  selectedStatus === 'all'
                    ? 'bg-orange-500 border-orange-500'
                    : 'bg-white border-slate-200'
                }`}
                onPress={() => setSelectedStatus('all')}
              >
                <Text className={`text-[9px] font-bold uppercase tracking-wider ${
                  selectedStatus === 'all' ? 'text-white' : 'text-slate-500'
                }`}>
                  Tất cả
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`mr-2 px-3 py-2 rounded-xl border ${
                  selectedStatus === 'synced'
                    ? 'bg-emerald-600 border-emerald-600'
                    : 'bg-emerald-50 border-emerald-300'
                }`}
                onPress={() => setSelectedStatus('synced')}
              >
                <Text className={`text-[9px] font-bold uppercase tracking-wider ${
                  selectedStatus === 'synced' ? 'text-white' : 'text-emerald-700'
                }`}>
                  Đã đồng bộ ({syncedCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`px-3 py-2 rounded-xl border ${
                  selectedStatus === 'pending'
                    ? 'bg-amber-600 border-amber-600'
                    : 'bg-amber-50 border-amber-300'
                }`}
                onPress={() => setSelectedStatus('pending')}
              >
                <Text className={`text-[9px] font-bold uppercase tracking-wider ${
                  selectedStatus === 'pending' ? 'text-white' : 'text-amber-700'
                }`}>
                  Chờ đồng bộ ({pendingCount})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. DANH SÁCH HÓA ĐƠN */}
          <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
            {filteredOrders.length === 0 ? (
              <View className="py-12 items-center justify-center bg-white rounded-3xl border border-slate-200 mt-2">
                <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-bold mt-3">Không tìm thấy hóa đơn nào phù hợp</Text>
              </View>
            ) : (
              filteredOrders.map(order => {
                const isPending = order.sync_status === 'pending';

                return (
                  <TouchableOpacity
                    key={order.id}
                    className="mb-3.5 p-4 rounded-[24px] border bg-white border-slate-200 shadow-sm flex-row justify-between items-center"
                    onPress={() => handleViewOrderDetails(order)}
                  >
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-black text-slate-800">
                          {order.order_no || order.id.substring(0, 12)}
                        </Text>
                        <View className="mx-2 w-1.5 h-1.5 bg-slate-300 rounded-full" />
                        <Text className="text-xs text-slate-500 font-bold">{order.customer_name || 'Khách mua lẻ'}</Text>
                      </View>

                      <Text className="text-[10px] text-slate-400 font-semibold mt-1.5">
                        ⏱️ {order.created_at ? new Date(order.created_at).toLocaleString() : 'Đang mở'}
                      </Text>

                      <View className="flex-row items-center mt-3.5">
                        {/* Label sync status */}
                        <View className={`px-2.5 py-1 rounded-full border flex-row items-center ${
                          isPending 
                            ? 'bg-amber-50 border-amber-300' 
                            : 'bg-emerald-50 border-emerald-300'
                        }`}>
                          <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            isPending ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          <Text className={`text-[9px] font-black uppercase tracking-wider ${
                            isPending ? 'text-amber-700' : 'text-emerald-700'
                          }`}>
                            {isPending ? 'Chờ đồng bộ' : 'Đã đồng bộ'}
                          </Text>
                        </View>

                        <Text className="text-[10px] text-slate-500 font-bold ml-3.5">
                          💳 {order.payment_method === 'bank_transfer' ? 'Chuyển khoản' : order.payment_method}
                        </Text>
                      </View>
                    </View>

                    <View className="items-end">
                      <Text className="text-orange-500 font-black text-sm">
                        {order.total_amount.toLocaleString()}đ
                      </Text>
                      
                      {isPending ? (
                        <TouchableOpacity
                          className="bg-amber-500 active:bg-amber-600 px-3 py-1.5 rounded-xl mt-2 flex-row items-center shadow-sm"
                          onPress={(e) => {
                            e.stopPropagation();
                            handleSyncSingleOrder(order.id);
                          }}
                          disabled={isSyncingOrder === order.id}
                        >
                          <Ionicons 
                            name={isSyncingOrder === order.id ? 'sync' : 'cloud-upload'} 
                            size={12} 
                            color="white" 
                          />
                          <Text className="text-white text-[9px] font-black ml-1.5 uppercase tracking-wide">
                            {isSyncingOrder === order.id ? 'Sync...' : 'Sync'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" className="mt-3.5" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <View className="h-20" />
          </ScrollView>

          {/* 5. MODAL CHI TIẾT HÓA ĐƠN */}
          <Modal
            visible={!!selectedOrder}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setSelectedOrder(null)}
          >
            <View className="flex-1 justify-end bg-black/60">
              {selectedOrder && (
                <View className="h-[75%] rounded-t-[32px] p-6 justify-between bg-white">
                  
                  {/* Header Modal */}
                  <View className="flex-row justify-between items-center border-b border-slate-150 pb-4">
                    <View>
                      <View className="flex-row items-center">
                        <Text className="text-base font-black text-slate-800">
                          Chi tiết {selectedOrder.order_no || selectedOrder.id.substring(0, 12)}
                        </Text>
                        <View className={`ml-3 px-2.5 py-1 rounded-full border ${
                          selectedOrder.sync_status === 'pending' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'
                        }`}>
                          <Text className={`text-[8px] font-black uppercase tracking-wider ${
                            selectedOrder.sync_status === 'pending' ? 'text-amber-700' : 'text-emerald-700'
                          }`}>
                            {selectedOrder.sync_status === 'pending' ? 'Chờ đồng bộ' : 'Đã đồng bộ'}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-xs text-slate-500 mt-1 font-bold">
                        Khách hàng: {selectedOrder.customer_name || 'Khách lẻ'}
                      </Text>
                    </View>

                    <TouchableOpacity onPress={() => setSelectedOrder(null)} className="p-1">
                      <Ionicons name="close" size={24} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {/* Body Modal (Items list) */}
                  <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Thông tin đơn hàng</Text>
                    <View className="p-4 rounded-2xl bg-slate-50 border border-slate-200/65 mb-4">
                      <View className="flex-row justify-between py-1">
                        <Text className="text-xs text-slate-500 font-bold">Thời gian tạo:</Text>
                        <Text className="text-xs font-black text-slate-800">
                          {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : 'Chưa lưu'}
                        </Text>
                      </View>
                      <View className="flex-row justify-between py-1">
                        <Text className="text-xs text-slate-500 font-bold">Hình thức thanh toán:</Text>
                        <Text className="text-xs font-black text-slate-800">
                          {selectedOrder.payment_method === 'bank_transfer' ? 'Chuyển khoản' : selectedOrder.payment_method}
                        </Text>
                      </View>
                      <View className="flex-row justify-between py-1">
                        <Text className="text-xs text-slate-500 font-bold">Mã số hóa đơn:</Text>
                        <Text className="text-xs font-black text-slate-800">{selectedOrder.id}</Text>
                      </View>
                    </View>

                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Danh sách sản phẩm & dịch vụ</Text>
                    {selectedOrderItems.map((item: any, idx: number) => (
                      <View 
                        key={idx} 
                        className="flex-row justify-between py-3 border-b border-slate-100 items-center"
                      >
                        <View className="flex-1 mr-3">
                          <Text className="text-xs font-extrabold text-slate-800">{item.product_name}</Text>
                          <Text className="text-[10px] text-slate-500 font-bold mt-0.5">
                            {item.qty} x {item.unit_price.toLocaleString()}đ
                          </Text>
                        </View>
                        <Text className="text-xs font-black text-slate-800">
                          {item.line_total.toLocaleString()}đ
                        </Text>
                      </View>
                    ))}

                    {/* Tổng tiền */}
                    <View className="flex-row justify-between py-4 border-t border-slate-200 mt-4 items-center">
                      <Text className="text-sm font-black text-slate-800">TỔNG CỘNG HÓA ĐƠN</Text>
                      <Text className="text-orange-500 text-lg font-black">{selectedOrder.total_amount.toLocaleString()}đ</Text>
                    </View>
                  </ScrollView>

                  {/* Actions Footer */}
                  <View className="flex-row border-t border-slate-200 pt-4 justify-between">
                    {selectedOrder.sync_status === 'pending' ? (
                      <TouchableOpacity 
                        className="flex-1 bg-amber-500 active:bg-amber-600 py-3.5 rounded-2xl items-center mr-2 shadow-lg flex-row justify-center"
                        onPress={() => handleSyncSingleOrder(selectedOrder.id)}
                        disabled={isSyncingOrder === selectedOrder.id}
                      >
                        <Ionicons name="cloud-upload" size={16} color="white" />
                        <Text className="text-white font-extrabold text-xs ml-1.5">
                          {isSyncingOrder === selectedOrder.id ? 'Đang đồng bộ...' : 'Đồng bộ hóa đơn'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View className="flex-1 bg-slate-100 py-3.5 rounded-2xl items-center mr-2 flex-row justify-center opacity-70 border border-slate-200">
                        <Ionicons name="checkmark-done-circle" size={16} color="#22c55e" />
                        <Text className="font-extrabold text-xs ml-1.5 text-slate-600">Đã đẩy lên Cloud</Text>
                      </View>
                    )}

                    <TouchableOpacity 
                      className="flex-1 bg-orange-500 active:bg-orange-655 py-3.5 rounded-2xl items-center ml-2 shadow-lg flex-row justify-center"
                      onPress={handleReprint}
                      disabled={isReprinting}
                    >
                      <Ionicons name="print" size={16} color="white" />
                      <Text className="text-white font-extrabold text-xs ml-1.5 uppercase tracking-wide">
                        {isReprinting ? 'Đang in lại...' : 'In lại hóa đơn'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                </View>
              )}
            </View>
          </Modal>
        </View>
      )}
    </SafeAreaView>
  );
}
