import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mẫu danh sách khách hàng
const SAMPLE_CUSTOMERS = [
  {
    id: 'c1',
    name: 'Nguyễn Văn Hùng',
    phone: '0987.654.321',
    group: 'VIP',
    groupColor: 'purple', // Dành cho Badge VIP
    totalSpent: 12450000,
    ordersCount: 42,
    avatarChar: 'H',
    avatarBg: 'bg-purple-50 border-purple-200 text-purple-600',
    isActive: true,
  },
  {
    id: 'c2',
    name: 'Trần Thị Mai',
    phone: '0912.345.678',
    group: 'Thân thiết',
    groupColor: 'emerald',
    totalSpent: 4780000,
    ordersCount: 18,
    avatarChar: 'M',
    avatarBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    isActive: true,
  },
  {
    id: 'c3',
    name: 'Lê Hoàng Long',
    phone: '0909.888.999',
    group: 'Khách sỉ',
    groupColor: 'blue',
    totalSpent: 35900000,
    ordersCount: 112,
    avatarChar: 'L',
    avatarBg: 'bg-blue-50 border-blue-200 text-blue-600',
    isActive: true,
  },
  {
    id: 'c4',
    name: 'Phạm Minh Đức',
    phone: '0933.111.222',
    group: 'Thành viên',
    groupColor: 'slate',
    totalSpent: 850000,
    ordersCount: 3,
    avatarChar: 'Đ',
    avatarBg: 'bg-slate-100 border-slate-200 text-slate-600',
    isActive: true,
  },
  {
    id: 'c5',
    name: 'Vũ Thùy Linh',
    phone: '0977.555.666',
    group: 'VIP',
    groupColor: 'purple',
    totalSpent: 8900000,
    ordersCount: 29,
    avatarChar: 'L',
    avatarBg: 'bg-purple-50 border-purple-200 text-purple-600',
    isActive: true,
  },
  {
    id: 'c6',
    name: 'Đặng Quốc Bảo',
    phone: '0868.999.888',
    group: 'Thân thiết',
    groupColor: 'emerald',
    totalSpent: 2150000,
    ordersCount: 8,
    avatarChar: 'B',
    avatarBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    isActive: false, // Tạm ngưng
  }
];

export default function CustomersScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, vip, loyal, wholesale

  // Bộ lọc khách hàng
  const filteredCustomers = SAMPLE_CUSTOMERS.filter(customer => {
    // 1. Lọc theo text search
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          customer.phone.includes(searchQuery);
    
    // 2. Lọc theo tabs
    if (!matchesSearch) return false;
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'vip') return customer.group === 'VIP';
    if (selectedFilter === 'loyal') return customer.group === 'Thân thiết';
    if (selectedFilter === 'wholesale') return customer.group === 'Khách sỉ';
    return true;
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* 1. HEADER SECTION */}
      <View className="px-4 py-3 flex-row justify-between items-center border-b bg-white border-slate-200 shadow-sm">
        <View>
          <Text className="text-lg font-bold text-slate-800">Khách hàng</Text>
          <Text className="text-[10px] text-slate-400 font-semibold mt-0.5">
            Quản lý thông tin đối tác & điểm tích lũy
          </Text>
        </View>
        
        {/* Nút bộ lọc nâng cao */}
        <TouchableOpacity className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
          <Ionicons name="funnel-outline" size={16} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* 2. SEARCH BAR & FILTER TABS */}
      <View className="p-4 bg-white border-b border-slate-150">
        {/* Hộp tìm kiếm */}
        <View className="flex-row items-center bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-2xl mb-3">
          <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
          <TextInput
            placeholder="Tìm theo tên hoặc số điện thoại..."
            placeholderTextColor="#94a3b8"
            className="flex-1 text-slate-800 text-xs font-semibold p-0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Khung lọc theo nhóm khách hàng dạng cuộn ngang */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            className={`mr-2 px-4 py-2 rounded-xl border ${
              selectedFilter === 'all'
                ? 'bg-orange-500 border-orange-500 shadow-sm shadow-orange-500/10'
                : 'bg-slate-100 border-slate-200'
            }`}
            onPress={() => setSelectedFilter('all')}
          >
            <Text className={`text-[10px] font-bold uppercase tracking-wider ${selectedFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>
              Tất cả ({SAMPLE_CUSTOMERS.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mr-2 px-4 py-2 rounded-xl border ${
              selectedFilter === 'vip'
                ? 'bg-orange-500 border-orange-500 shadow-sm shadow-orange-500/10'
                : 'bg-slate-100 border-slate-200'
            }`}
            onPress={() => setSelectedFilter('vip')}
          >
            <Text className={`text-[10px] font-bold uppercase tracking-wider ${selectedFilter === 'vip' ? 'text-white' : 'text-slate-600'}`}>
              Khách VIP
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mr-2 px-4 py-2 rounded-xl border ${
              selectedFilter === 'loyal'
                ? 'bg-orange-500 border-orange-500 shadow-sm shadow-orange-500/10'
                : 'bg-slate-100 border-slate-200'
            }`}
            onPress={() => setSelectedFilter('loyal')}
          >
            <Text className={`text-[10px] font-bold uppercase tracking-wider ${selectedFilter === 'loyal' ? 'text-white' : 'text-slate-600'}`}>
              Thân thiết
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mr-2 px-4 py-2 rounded-xl border ${
              selectedFilter === 'wholesale'
                ? 'bg-orange-500 border-orange-500 shadow-sm shadow-orange-500/10'
                : 'bg-slate-100 border-slate-200'
            }`}
            onPress={() => setSelectedFilter('wholesale')}
          >
            <Text className={`text-[10px] font-bold uppercase tracking-wider ${selectedFilter === 'wholesale' ? 'text-white' : 'text-slate-600'}`}>
              Khách sỉ
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3. CUSTOMER LIST */}
      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {filteredCustomers.length === 0 ? (
          <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-4">
            <Ionicons name="people-outline" size={48} color="#cbd5e1" />
            <Text className="text-slate-400 font-bold text-xs mt-3 uppercase tracking-wider">Không tìm thấy khách hàng</Text>
          </View>
        ) : (
          filteredCustomers.map(customer => (
            <View 
              key={customer.id} 
              className="p-4 bg-white border border-slate-200 rounded-3xl shadow-sm mb-3.5 flex-row justify-between items-center"
            >
              {/* Cột trái: Avatar và thông tin */}
              <View className="flex-row items-center flex-1 mr-3">
                {/* Avatar cá nhân hóa */}
                <View className={`w-11 h-11 rounded-2xl items-center justify-center border-2 mr-3 ${customer.avatarBg}`}>
                  <Text className="font-bold text-base uppercase">{customer.avatarChar}</Text>
                </View>

                {/* Tên & SĐT */}
                <View className="flex-shrink-1">
                  <View className="flex-row items-center flex-wrap">
                    <Text className="font-bold text-sm text-slate-800 mr-2">
                      {customer.name}
                    </Text>
                    {/* Badge Nhóm khách hàng */}
                    <View className={`px-1.5 py-0.5 rounded-md border ${
                      customer.groupColor === 'purple'
                        ? 'bg-purple-50 border-purple-200'
                        : customer.groupColor === 'emerald'
                        ? 'bg-emerald-50 border-emerald-200'
                        : customer.groupColor === 'blue'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-slate-100 border-slate-200'
                    }`}>
                      <Text className={`text-[7px] font-bold uppercase ${
                        customer.groupColor === 'purple'
                          ? 'text-purple-600'
                          : customer.groupColor === 'emerald'
                          ? 'text-emerald-600'
                          : customer.groupColor === 'blue'
                          ? 'text-blue-600'
                          : 'text-slate-500'
                      }`}>
                        {customer.group}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[10px] text-slate-400 font-semibold mt-1">
                    📞 {customer.phone}
                  </Text>
                </View>
              </View>

              {/* Cột phải: Doanh thu tích lũy & Phím tắt */}
              <View className="items-end">
                <Text className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Tích lũy</Text>
                <Text className="text-slate-800 font-bold text-xs mt-0.5">
                  {customer.totalSpent.toLocaleString()} đ
                </Text>
                <Text className="text-[9px] text-slate-400 font-medium mt-0.5">
                  {customer.ordersCount} giao dịch
                </Text>

                {/* Các nút tương tác nhanh */}
                <View className="flex-row items-center mt-2">
                  {/* Nút Call */}
                  <TouchableOpacity 
                    className="w-7 h-7 bg-orange-50 border border-orange-200 rounded-lg items-center justify-center mr-2 active:bg-orange-100"
                    onPress={() => alert(`Đang thực hiện cuộc gọi đến ${customer.phone}`)}
                  >
                    <Ionicons name="call" size={12} color="#fa5908" />
                  </TouchableOpacity>

                  {/* Nút Chat/Zalo */}
                  <TouchableOpacity 
                    className="w-7 h-7 bg-indigo-50 border border-indigo-200 rounded-lg items-center justify-center active:bg-indigo-100"
                    onPress={() => alert(`Mở khung chat Zalo/Tin nhắn với ${customer.name}`)}
                  >
                    <Ionicons name="chatbubble-ellipses" size={12} color="#6366f1" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
        {/* Padding trống dưới cùng */}
        <View className="h-16" />
      </ScrollView>

      {/* 4. FLOATING ACTION BUTTON (THÊM KHÁCH HÀNG MỚI) */}
      <TouchableOpacity 
        className="absolute bottom-6 right-6 w-12 h-12 bg-orange-500 active:bg-orange-600 rounded-2xl items-center justify-center shadow-lg shadow-orange-500/20"
        onPress={() => alert('Chức năng thêm mới khách hàng (Thao tác SQLite offline) đang được chuẩn bị.')}
      >
        <Ionicons name="person-add" size={20} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
