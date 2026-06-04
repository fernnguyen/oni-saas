import React, {useState, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import {Header} from '../../components/layout/Header';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {formatCurrency} from '../../lib/utils/format';

export default function CustomersScreen() {
 const [customersList, setCustomersList] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState(true);

 const [searchQuery, setSearchQuery] = useState('');
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);
 const [branchName, setBranchName] = useState('Tạp hóa Linh Ka');
 const [selectedFilter, setSelectedFilter] = useState('all'); // all, VIP, Thân thiết, Thành viên

 // State thêm khách hàng mới
 const [isAddModalOpen, setIsAddModalOpen] = useState(false);
 const [newCustName, setNewCustName] = useState('');
 const [newCustPhone, setNewCustPhone] = useState('');
 const [newCustType, setNewCustType] = useState('Thành viên'); // VIP, Thân thiết, Thành viên
 const [isSaving, setIsSaving] = useState(false);

 // Tải dữ liệu khách hàng từ SQLite (Native) hoặc REST API trực tiếp (Web)
 const loadCustomersData = async () => {
 try {
 setIsLoading(true);
 const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
 setBranchName(activeShopName);
 
 let data = [];
 if (Platform.OS === 'web') {
 const headers = await getApiHeaders();
 const url = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const res = await fetch(`${url}/api/shops/${shopId}/customers?limit=2000`, {headers});
 if (res.ok) {
 const resJson = await res.json();
 data = resJson.data || [];
}
} else {
 data = await db.select().from(schema.customers);
}
 setCustomersList(data);
 setIsLoading(false);
} catch (err) {
 console.error('Lỗi tải danh sách khách hàng:', err);
 setIsLoading(false);
}
};

 useFocusEffect(
 useCallback(() => {
 loadCustomersData();
}, [])
 );

 // Lưu khách hàng mới (Offline-first + Auto cloud sync)
 const handleSaveCustomer = async () => {
 if (!newCustName || !newCustPhone) {
 Alert.alert('Thông báo', 'Vui lòng nhập Tên và Số điện thoại!');
 return;
}

 setIsSaving(true);
 try {
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const custId = `CUST-${Date.now()}`;
 const custCode = `KH-${Date.now().toString().substring(8)}`;

 // 1. Ghi nhận offline vào SQLite di động
 await db.insert(schema.customers).values({
 id: custId,
 name: newCustName,
 phone: newCustPhone,
 customer_type: newCustType,
 customer_code: custCode,
 total_spent: 0,
 orders_count: 0,
 sync_status: 'pending', // Đánh dấu chờ đồng bộ đám mây
});

 // Reload giao diện tức thì
 await loadCustomersData();
 setIsAddModalOpen(false);
 setNewCustName('');
 setNewCustPhone('');
 setNewCustType('Thành viên');
 Alert.alert('Thành công', 'Đã lưu thông tin khách hàng cục bộ ngoại tuyến.');

 // 2. Gửi đồng bộ lên Next.js Cloud REST API ngay lập tức
 const headers = await getApiHeaders();
 const response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/customers`, {
 method: 'POST',
 headers,
 body: JSON.stringify({
 name: newCustName,
 phone: newCustPhone,
 customer_type: newCustType,
 customer_code: custCode,
 email: `${newCustPhone}@oni-pos.vn`,
 address: 'Tạo từ ONI Mobile',
}),
});

 if (response.ok) {
 // Cập nhật trạng thái SQLite thành synced
 await db
 .update(schema.customers)
 .set({sync_status: 'synced'})
 .where(eq(schema.customers.id, custId));
 
 await loadCustomersData();
 console.log(`Đồng bộ khách hàng #${custId} lên Cloud thành công!`);
}
} catch (err) {
 console.warn('Lỗi đồng bộ khách hàng mới:', err);
} finally {
 setIsSaving(false);
}
};

 // Bộ lọc khách hàng
 const filteredCustomers = customersList.filter(customer => {
 const matchesSearch = 
 (customer.name && customer.name.toLowerCase().includes(searchQuery.toLowerCase())) || 
 (customer.phone && customer.phone.includes(searchQuery));
 
 if (!matchesSearch) return false;
 if (selectedFilter === 'all') return true;
 return customer.customer_type === selectedFilter;
});

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus="synced" />

 {/* 2. SEARCH BAR & FILTER TABS */}
 <View className="p-4 bg-white border-b border-slate-200">
 <View className="flex-row items-center bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-2xl mb-3">
 <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
 <TextInput
 placeholder="Tìm theo tên hoặc số điện thoại..."
 placeholderTextColor="#94a3b8"
 className="flex-1 text-slate-800 text-xs font-semibold p-0"
 value={searchQuery}
 onChangeText={setSearchQuery}
 style={{outlineStyle: 'none'} as any}
 />
 {searchQuery.length > 0 && (
 <TouchableOpacity onPress={() => setSearchQuery('')}>
 <Ionicons name="close-circle" size={16} color="#94a3b8" />
 </TouchableOpacity>
 )}
 </View>

 {/* Khung lọc theo nhóm khách hàng */}
 <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
 <TouchableOpacity
 className={`mr-2 px-4 py-2 rounded-xl border ${
 selectedFilter === 'all'
 ? 'bg-orange-500 border-orange-500 shadow-sm'
 : 'bg-slate-100 border-slate-200'
}`}
 onPress={() => setSelectedFilter('all')}
 >
 <Text className={`text-tiny font-medium ${selectedFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>
 Tất cả ({customersList.length})
 </Text>
 </TouchableOpacity>

 {['VIP', 'Thân thiết', 'Thành viên'].map(tier => (
 <TouchableOpacity
 key={tier}
 className={`mr-2 px-4 py-2 rounded-xl border ${
 selectedFilter === tier
 ? 'bg-orange-500 border-orange-500 shadow-sm'
 : 'bg-slate-100 border-slate-200'
}`}
 onPress={() => setSelectedFilter(tier)}
 >
 <Text className={`text-tiny font-medium ${selectedFilter === tier ? 'text-white' : 'text-slate-600'}`}>
 {tier}
 </Text>
 </TouchableOpacity>
 ))}
 </ScrollView>
 </View>

 {/* 3. CUSTOMER LIST */}
 {isLoading ? (
 <View className="flex-1 justify-center items-center">
 <ActivityIndicator size="large" color="#fa5908" />
 <Text className="text-xs text-slate-450 font-medium mt-2">Đang tải khách hàng...</Text>
 </View>
 ) : (
 <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
 {filteredCustomers.length === 0 ? (
 <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-2">
 <Ionicons name="people-outline" size={48} color="#cbd5e1" />
 <Text className="text-slate-400 font-medium text-xs mt-3">Không tìm thấy khách hàng</Text>
 </View>
 ) : (
 filteredCustomers.map(customer => {
 const isPending = customer.sync_status === 'pending';
 const avatarChar = customer.name ? customer.name.charAt(0).toUpperCase() : 'K';

 return (
 <View 
 key={customer.id} 
 className="p-4 bg-white border border-slate-200 rounded-3xl shadow-sm mb-3.5 flex-row justify-between items-center"
 >
 <View className="flex-row items-center flex-1 mr-3">
 <View className="w-11 h-11 rounded-2xl items-center justify-center border-2 mr-3 bg-orange-50 border-orange-200 text-orange-600">
 <Text className="font-medium text-base text-orange-600">{avatarChar}</Text>
 </View>

 <View className="flex-shrink-1">
 <View className="flex-row items-center flex-wrap">
 <Text className="font-medium text-sm text-slate-800 mr-2">
 {customer.name}
 </Text>
 
 <View className="px-1.5 py-0.5 rounded-md border bg-slate-100 border-slate-200">
 <Text className="text-micro font-medium text-slate-500">
 {customer.customer_type || 'Thành viên'}
 </Text>
 </View>
 </View>
 
 <Text className="text-tiny text-slate-400 font-semibold mt-1">
 📞 {customer.phone}
 </Text>
 </View>
 </View>

 <View className="items-end">
 <Text className="text-xxs font-medium text-slate-400">Tích lũy</Text>
 <Text className="text-slate-800 font-medium text-xs mt-0.5">
 {formatCurrency(customer.total_spent || 0)}
 </Text>
 
 <View className="flex-row items-center mt-2.5">
 {isPending ? (
 <View className="bg-amber-50 px-2 py-0.5 rounded border border-amber-300 mr-2">
 <Text className="text-micro font-semibold text-amber-700">Offline</Text>
 </View>
 ) : (
 <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 mr-2">
 <Text className="text-micro font-semibold text-emerald-700">Synced</Text>
 </View>
 )}

 <TouchableOpacity 
 className="w-7 h-7 bg-orange-50 border border-orange-200 rounded-lg items-center justify-center active:bg-orange-100"
 onPress={() => Alert.alert('Đang gọi', `Đang gọi điện thoại đến ${customer.phone}...`)}
 >
 <Ionicons name="call" size={12} color="#fa5908" />
 </TouchableOpacity>
 </View>
 </View>
 </View>
 );
})
 )}
 <View className="h-20" />
 </ScrollView>
 )}

 {/* 4. FLOATING ACTION BUTTON (THÊM KHÁCH HÀNG MỚI) */}
 <TouchableOpacity 
 className="absolute bottom-6 right-6 w-12 h-12 bg-orange-500 active:bg-orange-600 rounded-2xl items-center justify-center shadow-lg shadow-orange-500/20"
 onPress={() => setIsAddModalOpen(true)}
 >
 <Ionicons name="person-add" size={20} color="white" />
 </TouchableOpacity>

 {/* 5. MODAL FORM THÊM KHÁCH HÀNG MỚI */}
 <Modal
 visible={isAddModalOpen}
 animationType="slide"
 transparent={true}
 onRequestClose={() => setIsAddModalOpen(false)}
 >
 <View className="flex-1 justify-end bg-black/60">
 <View className="h-[55%] rounded-t-[32px] p-6 justify-between bg-white">
 <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
 <Text className="text-lg font-medium text-slate-800">Thêm khách hàng mới</Text>
 <TouchableOpacity onPress={() => setIsAddModalOpen(false)} className="p-1">
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
 </View>

 <ScrollView className="flex-1 my-4">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Tên khách hàng</Text>
 <TextInput
 placeholder="Nguyễn Văn A"
 placeholderTextColor="#cbd5e1"
 className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
 value={newCustName}
 onChangeText={setNewCustName}
 style={{outlineStyle: 'none'} as any}
 />

 <Text className="text-xs text-slate-500 font-medium mb-1.5">Số điện thoại</Text>
 <TextInput
 placeholder="0909xxxxxx"
 placeholderTextColor="#cbd5e1"
 keyboardType="phone-pad"
 className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
 value={newCustPhone}
 onChangeText={setNewCustPhone}
 style={{outlineStyle: 'none'} as any}
 />

 <Text className="text-xs text-slate-500 font-medium mb-1.5">Hạng thành viên</Text>
 <View className="flex-row justify-between">
 {['Thành viên', 'Thân thiết', 'VIP'].map(tier => (
 <TouchableOpacity
 key={tier}
 className={`flex-1 mx-1 py-2.5 rounded-xl border-2 items-center ${
 newCustType === tier ? 'bg-orange-50 border-orange-500' : 'bg-white border-slate-200'
}`}
 onPress={() => setNewCustType(tier)}
 >
 <Text className={`text-tiny font-semibold ${
 newCustType === tier ? 'text-orange-500' : 'text-slate-500'
}`}>
 {tier}
 </Text>
 </TouchableOpacity>
 ))}
 </View>
 </ScrollView>

 <TouchableOpacity 
 className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg flex-row justify-center"
 onPress={handleSaveCustomer}
 disabled={isSaving}
 >
 {isSaving ? (
 <ActivityIndicator size="small" color="white" />
 ) : (
 <>
 <Ionicons name="checkmark-circle-outline" size={16} color="white" />
 <Text className="text-white font-medium text-sm ml-1.5">Lưu khách hàng (Offline & Sync)</Text>
 </>
 )}
 </TouchableOpacity>
 </View>
 </View>
 </Modal>

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName={branchName}
 />
 </SafeAreaView>
 );
}
