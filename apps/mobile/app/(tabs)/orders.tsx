import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mẫu dữ liệu hóa đơn (Sample Orders)
const SAMPLE_ORDERS = [
  {
    id: 'HD-9831',
    time: '18:15 - 26/05/2026',
    vertical: 'billiards',
    verticalLabel: 'Bàn Bi-a 01 (Vip)',
    total: 215000,
    status: 'synced', // synced | pending
    shift: 'shift_afternoon',
    paymentMethod: 'Chuyển khoản',
    items: [
      { name: 'Tiền giờ (1.5h)', quantity: 1, price: 80000, cost: 120000 },
      { name: 'Cà phê Phin Sữa Đá', quantity: 2, price: 29000, cost: 58000 },
      { name: 'Trà Đào Cam Sả', quantity: 1, price: 37000, cost: 37000 },
    ]
  },
  {
    id: 'HD-9830',
    time: '17:40 - 26/05/2026',
    vertical: 'retail',
    verticalLabel: 'Bán lẻ',
    total: 89000,
    status: 'synced',
    shift: 'shift_afternoon',
    paymentMethod: 'Tiền mặt',
    items: [
      { name: 'Combo Ăn Sáng Cao Cấp', quantity: 1, price: 49000, cost: 49000 },
      { name: 'Nước Suối Tinh Khiết', quantity: 4, price: 10000, cost: 40000 },
    ]
  },
  {
    id: 'HD-9829',
    time: '17:15 - 26/05/2026',
    vertical: 'retail',
    verticalLabel: 'Bán lẻ',
    total: 145000,
    status: 'pending', // Chờ đồng bộ offline
    shift: 'shift_afternoon',
    paymentMethod: 'Tiền mặt',
    items: [
      { name: 'Trà Đào Cam Sả', quantity: 3, price: 35000, cost: 105000 },
      { name: 'Bánh Mì Pate Thịt', quantity: 1, price: 25000, cost: 25000 },
      { name: 'Nước Suối Tinh Khiết', quantity: 1, price: 15000, cost: 15000 },
    ]
  },
  {
    id: 'HD-9828',
    time: '11:30 - 26/05/2026',
    vertical: 'billiards',
    verticalLabel: 'Bàn Bi-a 04',
    total: 110000,
    status: 'synced',
    shift: 'shift_morning',
    paymentMethod: 'Chuyển khoản',
    items: [
      { name: 'Tiền giờ (1h)', quantity: 1, price: 60000, cost: 60000 },
      { name: 'Bánh Mì Pate Thịt', quantity: 2, price: 25000, cost: 50000 },
    ]
  },
  {
    id: 'HD-9827',
    time: '09:15 - 26/05/2026',
    vertical: 'retail',
    verticalLabel: 'Bán lẻ',
    total: 58000,
    status: 'pending', // Chờ đồng bộ offline
    shift: 'shift_morning',
    paymentMethod: 'Chuyển khoản',
    items: [
      { name: 'Cà phê Phin Sữa Đá', quantity: 2, price: 29000, cost: 58000 },
    ]
  }
];

const SHIFTS = [
  { id: 'all', label: 'Tất cả ca' },
  { id: 'shift_morning', label: 'Ca Sáng (06h-14h)' },
  { id: 'shift_afternoon', label: 'Ca Chiều (14h-22h)' },
];

export default function OrdersScreen() {
  const isDark = false; // Luôn hiển thị giao diện Sáng theo yêu cầu thương hiệu

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, synced, pending
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isSyncingOrder, setIsSyncingOrder] = useState<string | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);

  // Bộ lọc hóa đơn
  const filteredOrders = SAMPLE_ORDERS.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.verticalLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesShift = selectedShift === 'all' || order.shift === selectedShift;
    const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
    return matchesSearch && matchesShift && matchesStatus;
  });

  // Tính tổng doanh thu lọc được
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const syncedCount = filteredOrders.filter(o => o.status === 'synced').length;
  const pendingCount = filteredOrders.filter(o => o.status === 'pending').length;

  // Giả lập in lại hóa đơn
  const handleReprint = () => {
    setIsReprinting(true);
    setTimeout(() => {
      setIsReprinting(false);
      alert('Đã gửi lệnh in thành công đến Máy in nhiệt (K80 Bluetooth)!');
    }, 1500);
  };

  // Giả lập đồng bộ đơn lẻ
  const handleSyncSingleOrder = (orderId: string) => {
    setIsSyncingOrder(orderId);
    setTimeout(() => {
      setIsSyncingOrder(null);
      const order = SAMPLE_ORDERS.find(o => o.id === orderId);
      if (order) order.status = 'synced';
      alert(`Đồng bộ hóa đơn ${orderId} thành công lên hệ thống Cloud ONI!`);
    }, 1200);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* 1. HEADER */}
      <View className="px-4 py-3 border-b bg-white border-slate-200 shadow-sm">
        <Text className="text-lg font-black text-slate-800">Lịch sử hóa đơn</Text>
        <Text className="text-xs text-slate-500 mt-0.5 font-semibold">Danh sách hóa đơn được lưu cục bộ trên thiết bị</Text>
      </View>

      {/* 2. THỐNG KÊ DOANH THU NHANH CA LÀM VIỆC */}
      <View className="p-4 flex-row justify-between">
        <View className="flex-1 mr-2 p-3.5 rounded-3xl border bg-white border-slate-200 shadow-sm">
          <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Doanh thu ca</Text>
          <Text className="text-orange-500 font-black text-base mt-1">{totalRevenue.toLocaleString()}đ</Text>
          <Text className="text-[9px] text-slate-400 font-bold mt-0.5">{filteredOrders.length} hóa đơn</Text>
        </View>

        <View className="flex-1 mx-1 p-3.5 rounded-3xl border bg-white border-slate-200 shadow-sm">
          <Text className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Đã đồng bộ</Text>
          <Text className="text-emerald-700 font-black text-base mt-1">{syncedCount}</Text>
          <Text className="text-[9px] text-slate-450 font-bold mt-0.5">Lưu trữ đám mây</Text>
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
        <View className="flex-row items-center px-3.5 py-2.5 rounded-2xl border bg-white border-slate-200 mb-3.5 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            placeholder="Tìm theo mã HD hoặc bàn/sân..."
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-2 text-xs font-semibold text-slate-800"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Lọc theo Ca */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
          {SHIFTS.map(shift => (
            <TouchableOpacity
              key={shift.id}
              className={`mr-2.5 px-4 py-2.5 rounded-2xl border-2 ${
                selectedShift === shift.id
                  ? 'bg-orange-500 border-orange-500 shadow-md shadow-orange-500/10'
                  : 'bg-white border-slate-200'
              }`}
              onPress={() => setSelectedShift(shift.id)}
            >
              <Text className={`text-[10px] font-black uppercase tracking-wider ${
                selectedShift === shift.id ? 'text-white' : 'text-slate-600'
              }`}>
                {shift.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Lọc theo Trạng thái Sync - Cải tiến cực kỳ sắc nét */}
        <View className="flex-row">
          <TouchableOpacity
            className={`mr-2 px-3.5 py-2.5 rounded-xl border-2 ${
              selectedStatus === 'all'
                ? 'bg-orange-500 border-orange-500 shadow-sm'
                : 'bg-white border-slate-200'
            }`}
            onPress={() => setSelectedStatus('all')}
          >
            <Text className={`text-[10px] font-black uppercase tracking-wider ${
              selectedStatus === 'all' ? 'text-white' : 'text-slate-500'
            }`}>
              Tất cả trạng thái
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mr-2 px-3.5 py-2.5 rounded-xl border-2 ${
              selectedStatus === 'synced'
                ? 'bg-emerald-600 border-emerald-600 shadow-sm'
                : 'bg-emerald-50 border-emerald-300'
            }`}
            onPress={() => setSelectedStatus('synced')}
          >
            <Text className={`text-[10px] font-black uppercase tracking-wider ${
              selectedStatus === 'synced' ? 'text-white' : 'text-emerald-700'
            }`}>
              Đã đồng bộ
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`px-3.5 py-2.5 rounded-xl border-2 ${
              selectedStatus === 'pending'
                ? 'bg-amber-600 border-amber-600 shadow-sm'
                : 'bg-amber-50 border-amber-300'
            }`}
            onPress={() => setSelectedStatus('pending')}
          >
            <Text className={`text-[10px] font-black uppercase tracking-wider ${
              selectedStatus === 'pending' ? 'text-white' : 'text-amber-700'
            }`}>
              Chờ đồng bộ
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. DANH SÁCH HÓA ĐƠN */}
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {filteredOrders.length === 0 ? (
          <View className="py-12 items-center justify-center">
            <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
            <Text className="text-xs text-slate-400 font-bold mt-3">Không tìm thấy hóa đơn nào phù hợp</Text>
          </View>
        ) : (
          filteredOrders.map(order => {
            const isPending = order.status === 'pending';

            return (
              <TouchableOpacity
                key={order.id}
                className="mb-3.5 p-4 rounded-[24px] border bg-white border-slate-200 shadow-sm flex-row justify-between items-center"
                onPress={() => setSelectedOrder(order)}
              >
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center">
                    <Text className="text-sm font-black text-slate-800">
                      {order.id}
                    </Text>
                    <View className="mx-2 w-1.5 h-1.5 bg-slate-300 rounded-full" />
                    <Text className="text-xs text-slate-500 font-extrabold">{order.verticalLabel}</Text>
                  </View>

                  <Text className="text-[10px] text-slate-400 font-bold mt-1.5 flex-row items-center">
                    <Ionicons name="time-outline" size={11} /> {order.time}
                  </Text>

                  <View className="flex-row items-center mt-3.5">
                    {/* Label trạng thái đồng bộ cực kỳ cao cấp, rõ ràng */}
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
                      💳 {order.paymentMethod}
                    </Text>
                  </View>
                </View>

                <View className="items-end">
                  <Text className="text-orange-500 font-black text-sm">
                    {order.total.toLocaleString()}đ
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
        <View className="h-10" />
      </ScrollView>

      {/* 5. MODAL CHI TIẾT HÓA ĐƠN (ORDER DETAIL SHEET) */}
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
                      Chi tiết {selectedOrder.id}
                    </Text>
                    <View className={`ml-3 px-2.5 py-1 rounded-full border ${
                      selectedOrder.status === 'pending' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'
                    }`}>
                      <Text className={`text-[8px] font-black uppercase tracking-wider ${
                        selectedOrder.status === 'pending' ? 'text-amber-700' : 'text-emerald-700'
                      }`}>
                        {selectedOrder.status === 'pending' ? 'Chờ đồng bộ' : 'Đã đồng bộ'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-slate-500 mt-1 font-bold">
                    Phân hệ: {selectedOrder.verticalLabel}
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
                    <Text className="text-xs font-black text-slate-800">{selectedOrder.time}</Text>
                  </View>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-xs text-slate-500 font-bold">Hình thức thanh toán:</Text>
                    <Text className="text-xs font-black text-slate-800">{selectedOrder.paymentMethod}</Text>
                  </View>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-xs text-slate-500 font-bold">Thu ngân phụ trách:</Text>
                    <Text className="text-xs font-black text-slate-800">Nguyễn Thu Ngân</Text>
                  </View>
                </View>

                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Danh sách sản phẩm & dịch vụ</Text>
                {selectedOrder.items.map((item: any, idx: number) => (
                  <View 
                    key={idx} 
                    className="flex-row justify-between py-3 border-b border-slate-100 items-center"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-xs font-extrabold text-slate-850">{item.name}</Text>
                      <Text className="text-[10px] text-slate-500 font-bold mt-0.5">
                        {item.quantity} x {item.price.toLocaleString()}đ
                      </Text>
                    </View>
                    <Text className="text-xs font-black text-slate-800">
                      {item.cost.toLocaleString()}đ
                    </Text>
                  </View>
                ))}

                {/* Tổng tiền */}
                <View className="flex-row justify-between py-4 border-t border-slate-200 mt-4 items-center">
                  <Text className="text-sm font-black text-slate-800">TỔNG CỘNG HÓA ĐƠN</Text>
                  <Text className="text-orange-500 text-lg font-black">{selectedOrder.total.toLocaleString()}đ</Text>
                </View>
              </ScrollView>

              {/* Actions Footer */}
              <View className="flex-row border-t border-slate-200 pt-4 justify-between">
                {selectedOrder.status === 'pending' ? (
                  <TouchableOpacity 
                    className="flex-1 bg-amber-500 active:bg-amber-600 py-3.5 rounded-2xl items-center mr-2 shadow-lg shadow-amber-500/10 flex-row justify-center"
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
                  className="flex-1 bg-orange-500 active:bg-orange-600 py-3.5 rounded-2xl items-center ml-2 shadow-lg shadow-orange-500/20 flex-row justify-center"
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
    </SafeAreaView>
  );
}
