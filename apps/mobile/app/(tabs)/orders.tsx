import React, {useState, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, Modal, Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq, desc} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {formatCurrency, formatDateTime} from '../../lib/utils/format';

const PAYMENT_METHOD_VI: Record<string, string> = {
 cash: 'Tiền mặt',
 bank_transfer: 'Chuyển khoản',
 transfer: 'Chuyển khoản',
 card: 'Quẹt thẻ',
 debit: 'Quẹt thẻ',
 momo: 'Ví MoMo',
 vnpay: 'VNPay',
 zalopay: 'ZaloPay',
 debt: 'Ghi nợ',
 prepaid: 'Ví trả trước',
 wallet: 'Ví điện tử',
};

const translateMethod = (code: string): string => {
 return PAYMENT_METHOD_VI[code?.toLowerCase()] || code || 'Tiền mặt';
};

const getPaymentMethodDisplay = (pm: string) => {
 if (!pm) return 'Tiền mặt';
 if (pm.startsWith('[') || pm.startsWith('{')) {
  try {
   const parsed = JSON.parse(pm);
   if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map((p: any) => translateMethod(p.METHOD || p.method)).join(' + ');
   }
  } catch (e) {
   return 'Thanh toán hỗn hợp';
  }
 }
 return translateMethod(pm);
};

// Import hệ thống UI dùng chung cao cấp
import {Header} from '../../components/layout/Header';
import {Badge} from '../../components/ui/Badge';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Skeleton} from '../../components/ui/Skeleton';
import {DrawerMenu} from '../../components/erp/DrawerMenu';

export default function OrdersScreen() {
 const [ordersList, setOrdersList] = useState<any[]>([]);
 const [shiftsList, setShiftsList] = useState<any[]>([{id: 'all', label: 'Tất cả ca'}]);
 const [isLoading, setIsLoading] = useState(true);

 const [searchQuery, setSearchQuery] = useState('');
 const [selectedShift, setSelectedShift] = useState('all');
 const [selectedStatus, setSelectedStatus] = useState('all'); // all, synced, pending
 
 const [selectedOrder, setSelectedOrder] = useState<any>(null);
 const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]);
 const [selectedOrderCustomerPhone, setSelectedOrderCustomerPhone] = useState<string | null>(null);
 const [paymentFundsList, setPaymentFundsList] = useState<any[]>([]);
 const [isSyncingOrder, setIsSyncingOrder] = useState<string | null>(null);
 const [isReprinting, setIsReprinting] = useState(false);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);
 const [copiedId, setCopiedId] = useState(false);

 const handleCopyOrderNo = async (text: string) => {
   await Clipboard.setStringAsync(text);
   setCopiedId(true);
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
   setTimeout(() => {
     setCopiedId(false);
   }, 1500);
 };

 // Dialog xác nhận in và sync thay Alert.alert
 const [isReprintSuccessVisible, setIsReprintSuccessVisible] = useState(false);
 const [isSyncSuccessVisible, setIsSyncSuccessVisible] = useState(false);
 const [isSyncErrorVisible, setIsSyncErrorVisible] = useState(false);

 // Tải dữ liệu SQLite hoặc Cloud
 const loadOrdersData = async () => {
 try {
 setIsLoading(true);
 let ordersData = [];
 let shiftsData = [];
 const activeShopId = await AsyncStorage.getItem('active_shop_id') || '';

 if (Platform.OS === 'web') {
 const headers = await getApiHeaders();
 const url = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 
 const res = await fetch(`${url}/api/shops/${shopId}/orders?limit=1000`, {headers});
 if (res.ok) {
 const resJson = await res.json();
 const cloudOrders = resJson.data || [];
 ordersData = cloudOrders.map((o: any) => ({
 id: o.id || o.order_id,
 order_no: o.order_no || 'HD',
 status: o.status || 'completed',
 customer_name: o.customer_name || 'Khách lẻ',
 total_amount: parseInt(o.total_amount || '0', 10),
 paid_amount: parseInt(o.paid_amount || '0', 10),
 payment_method: o.payment_method || 'Tiền mặt',
 created_at: o.created_at || new Date().toISOString(),
 shift_id: o.shift_id || 'default-shift',
 sync_status: 'synced',
 discount_amount: parseInt(o.discount_amount || '0', 10),
 note: o.note || '',
}));
}
} else {
 const allOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.created_at));
 ordersData = allOrders.filter((o: any) => o.shift_id && o.shift_id.startsWith(`shift-${activeShopId}-`));

 const allShifts = await db.select().from(schema.shop_shifts);
 shiftsData = allShifts.filter((s: any) => s.id && s.id.startsWith(`shift-${activeShopId}-`));

 const funds = await db.select().from(schema.paymentFunds);
 setPaymentFundsList(funds);
}

 const mappedShifts = [
 {id: 'all', label: 'Tất cả ca'},
 ...shiftsData.map((s: any) => ({
 id: s.id,
 label: `Ca ${s.employee_name || 'Thu ngân'} (${s.opened_at.substring(11, 16)} - ${s.closed_at ? s.closed_at.substring(11, 16) : 'Đang mở'})`
}))
 ];
 
 setOrdersList(ordersData);
 setShiftsList(mappedShifts);
 setIsLoading(false);
} catch (err) {
 console.error('Lỗi khi tải lịch sử hóa đơn:', err);
 setIsLoading(false);
}
};

 useFocusEffect(
 useCallback(() => {
 loadOrdersData();
}, [])
 );

 // Xem chi tiết
 const handleViewOrderDetails = async (order: any) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 try {
 let items = [];
 let customerPhone: string | null = null;
 if (Platform.OS === 'web') {
 items = [
 {id: 'it1', product_name: 'Cà phê Phin Sữa Đá', qty: 2, unit_price: 29000, line_total: 58000},
 {id: 'it2', product_name: 'Trà Đào Cam Sả', qty: 1, unit_price: 39000, line_total: 39000}
 ];
 } else {
 items = await db
 .select()
 .from(schema.order_items)
 .where(eq(schema.order_items.order_id, order.id));
 // Lấy số điện thoại từ bảng customers
 if (order.customer_id) {
 const customerRows = await db
 .select()
 .from(schema.customers)
 .where(eq(schema.customers.id, order.customer_id));
 if (customerRows.length > 0) customerPhone = customerRows[0].phone || null;
 }
 // Fallback: lấy từ metadata nếu có
 if (!customerPhone && order.metadata) {
 try {
 const meta = JSON.parse(order.metadata);
 customerPhone = meta.customer_phone || null;
 } catch {}
 }
 }
 
 setSelectedOrderItems(items);
 setSelectedOrderCustomerPhone(customerPhone);
 setSelectedOrder(order);
} catch (err) {
 console.error('Lỗi tải chi tiết dòng sản phẩm:', err);
}
};

 // Đồng bộ
 const handleSyncSingleOrder = async (orderId: string) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 setIsSyncingOrder(orderId);
 try {
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const results = await SyncManager.pushOfflineOrders(shopId);
 
 await loadOrdersData();
 
 if (results.successCount > 0) {
 setIsSyncSuccessVisible(true);
} else {
 setIsSyncErrorVisible(true);
}
} catch (err: any) {
 console.error('Lỗi khi đồng bộ hóa đơn:', err);
 setIsSyncErrorVisible(true);
} finally {
 setIsSyncingOrder(null);
 setSelectedOrder(null);
}
};

 // In lại bill
 const handleReprint = () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 setIsReprinting(true);
 setTimeout(() => {
 setIsReprinting(false);
 setIsReprintSuccessVisible(true);
}, 1200);
};

 const filteredOrders = ordersList.filter(order => {
 const matchesSearch = 
 (order.id && order.id.toLowerCase().includes(searchQuery.toLowerCase())) || 
 (order.order_no && order.order_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
 (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
 
 const matchesShift = selectedShift === 'all' || order.shift_id === selectedShift;
 const matchesStatus = selectedStatus === 'all' || order.sync_status === selectedStatus;
 
 return matchesSearch && matchesShift && matchesStatus;
});

 const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.total_amount, 0);
 const syncedCount = filteredOrders.filter(o => o.sync_status === 'synced').length;
 const pendingCount = filteredOrders.filter(o => o.sync_status === 'pending').length;

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus={pendingCount > 0 ? 'pending' : 'synced'} />

 {isLoading ? (
 <View className="flex-1 px-4 pt-4">
 <View className="flex-row justify-between mb-6">
 <Skeleton width="30%" height={70} borderRadius={12} />
 <Skeleton width="30%" height={70} borderRadius={12} />
 <Skeleton width="30%" height={70} borderRadius={12} />
 </View>
 <Skeleton.Text lines={5} gap={16} height={20} />
 </View>
 ) : (
 <View className="flex-1">
 
 {/* 2. THỐNG KÊ DOANH THU NHANH CA - Giảm góc bo về rounded-2xl */}
 <View className="p-4 flex-row justify-between">
 <View className="flex-1 mr-2 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-slate-400">Tổng doanh số ca</Text>
 <Text className="text-orange-500 font-semibold text-xs mt-1.5">{formatCurrency(totalRevenue)}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">{filteredOrders.length} hóa đơn</Text>
 </View>

 <View className="flex-1 mx-1 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-emerald-600">Đã đồng bộ</Text>
 <Text className="text-emerald-700 font-semibold text-xs mt-1.5">{syncedCount}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">Đã lưu trữ</Text>
 </View>

 <View className="flex-1 ml-2 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between">
 <Text className="text-xxs font-semibold text-amber-600">Chờ đồng bộ</Text>
 <Text className="text-amber-700 font-semibold text-xs mt-1.5">{pendingCount}</Text>
 <Text className="text-xxs text-slate-455 font-medium mt-0.5">Chưa gửi lên</Text>
 </View>
 </View>

 {/* 3. TÌM KIẾM & BỘ LỌC */}
 <View className="px-4 pb-3">
 <View className="flex-row items-center px-3 py-1.5 rounded-xl border bg-white border-slate-200 mb-3 shadow-sm">
 <Ionicons name="search-outline" size={16} color="#94a3b8" />
 <TextInput
 placeholder="Tìm mã hóa đơn, tên khách hàng..."
 placeholderTextColor="#94a3b8"
 className="flex-1 ml-2 text-xs text-slate-800 py-1"
 value={searchQuery}
 onChangeText={setSearchQuery}
 style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
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
 className={`mr-2 px-3 py-1.5 rounded-xl border ${
 selectedShift === shift.id
 ? 'bg-orange-500 border-orange-500'
 : 'bg-white border-slate-200'
}`}
 onPress={() => setSelectedShift(shift.id)}
 >
 <Text className={`text-xxs font-semibold ${
 selectedShift === shift.id ? 'text-white' : 'text-slate-500'
}`}>
 {shift.label}
 </Text>
 </TouchableOpacity>
 ))}
 </ScrollView>
 )}

 {/* Lọc theo Trạng thái Sync */}
 <View className="flex-row mb-1">
 <TouchableOpacity
 className={`mr-2 px-3 py-1.5 rounded-xl border ${
 selectedStatus === 'all'
 ? 'bg-orange-500 border-orange-500'
 : 'bg-white border-slate-200'
}`}
 onPress={() => setSelectedStatus('all')}
 >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'all' ? 'text-white' : 'text-slate-500'
}`}>
 Tất cả
 </Text>
 </TouchableOpacity>

 <TouchableOpacity
 className={`mr-2 px-3 py-1.5 rounded-xl border ${
 selectedStatus === 'synced'
 ? 'bg-emerald-600 border-emerald-600'
 : 'bg-emerald-50 border-emerald-300'
}`}
 onPress={() => setSelectedStatus('synced')}
 >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'synced' ? 'text-white' : 'text-emerald-700'
}`}>
 Đã đồng bộ ({syncedCount})
 </Text>
 </TouchableOpacity>

 <TouchableOpacity
 className={`px-3 py-1.5 rounded-xl border ${
 selectedStatus === 'pending'
 ? 'bg-amber-600 border-amber-600'
 : 'bg-amber-50 border-amber-300'
}`}
 onPress={() => setSelectedStatus('pending')}
 >
 <Text className={`text-xxs font-semibold ${
 selectedStatus === 'pending' ? 'text-white' : 'text-amber-700'
}`}>
 Chờ đồng bộ ({pendingCount})
 </Text>
 </TouchableOpacity>
 </View>
 </View>

 {/* 4. DANH SÁCH LỚP PHÂN CẤP - Giảm bo card dòng xuống rounded-2xl */}
 <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
 {filteredOrders.length === 0 ? (
 <View className="py-12 items-center justify-center bg-white rounded-2xl border border-slate-100 mt-2 shadow-sm">
 <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
 <Text className="text-xs text-slate-455 font-medium mt-3">Không tìm thấy hóa đơn nào phù hợp</Text>
 </View>
 ) : (
 filteredOrders.map(order => {
 const isPending = order.sync_status === 'pending';

 return (
 <TouchableOpacity
 key={order.id}
 activeOpacity={0.8}
 className="mb-3 p-4 rounded-2xl border bg-white border-slate-100 flex-row justify-between items-center"
 style={{shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}
 onPress={() => handleViewOrderDetails(order)}
 >
 <View className="flex-1 mr-3">
 <View className="flex-row items-center">
 <Text className="text-xs font-semibold text-slate-800">
 {order.order_no || order.id.substring(0, 12)}
 </Text>
 <View className="mx-1.5 w-1 h-1 bg-slate-300 rounded-full" />
 <Text className="text-tiny text-slate-500 font-medium" numberOfLines={1}>
 {order.customer_name || 'Khách mua lẻ'}
 </Text>
 </View>

 <Text className="text-xxs text-slate-400 font-semibold mt-1">
 ⏱️ {order.created_at ? formatDateTime(order.created_at) : 'Ngoại tuyến'}
 </Text>

 <View className="flex-row items-center mt-3">
 <Badge 
 variant={isPending ? 'warning' : 'success'} 
 label={isPending ? 'Chờ đồng bộ' : 'Đã đồng bộ'} 
 size="sm" 
 />

 <Text className="text-xxs text-slate-500 font-medium ml-3.5">
 💳 {getPaymentMethodDisplay(order.payment_method)}
 </Text>
 </View>
 </View>

 <View className="items-end">
 <Text className="text-orange-500 font-semibold text-xs">
 {formatCurrency(order.total_amount)}
 </Text>
 
 {isPending ? (
 <TouchableOpacity
 activeOpacity={0.7}
 className="bg-amber-500 px-3 py-1 rounded-xl mt-2 flex-row items-center shadow-sm"
 onPress={(e) => {
 e.stopPropagation();
 handleSyncSingleOrder(order.id);
}}
 disabled={isSyncingOrder === order.id}
 >
 <Ionicons 
 name={isSyncingOrder === order.id ? 'sync' : 'cloud-upload-outline'} 
 size={11} 
 color="white" 
 />
 <Text className="text-white text-xxs font-semibold ml-1.5">
 {isSyncingOrder === order.id ? 'Đang gửi...' : 'Đồng bộ'}
 </Text>
 </TouchableOpacity>
 ) : (
 <Ionicons name="chevron-forward-outline" size={14} color="#cbd5e1" className="mt-3" />
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
 <View className="flex-1 bg-black/60">
  {/* Vùng backdrop phía trên — bấm để đóng */}
  <TouchableWithoutFeedback onPress={() => setSelectedOrder(null)}>
   <View className="flex-1" />
  </TouchableWithoutFeedback>

  {/* Panel nội dung phía dưới */}
  {selectedOrder && (
  <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl">
 
 {/* Header Modal */}
 <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
 <View>
 <View className="flex-row items-center">
  <Text className="text-sm font-semibold text-slate-800">
  {selectedOrder.order_no || selectedOrder.id.substring(0, 12)}
  </Text>
  <TouchableOpacity
    onPress={() => handleCopyOrderNo(selectedOrder.order_no || selectedOrder.id)}
    className="ml-1.5 p-1 bg-slate-100 active:bg-slate-200 rounded"
  >
    <Ionicons name={copiedId ? "checkmark" : "copy-outline"} size={12} color={copiedId ? "#10b981" : "#64748b"} />
  </TouchableOpacity>
  <Badge 
  variant={selectedOrder.sync_status === 'pending' ? 'warning' : 'success'} 
  label={selectedOrder.sync_status === 'pending' ? 'Chờ đồng bộ' : 'Đã đồng bộ'} 
  size="sm"
  className="ml-2"
  />
 </View>
 <Text className="text-tiny text-slate-450 mt-1 font-medium">
 Khách hàng: {selectedOrder.customer_name || 'Khách lẻ'}
 </Text>
 </View>

 <TouchableOpacity onPress={() => setSelectedOrder(null)} className="p-1">
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
 </View>

 {/* Body Modal */}
 <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
 <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Thông tin chi tiết</Text>
 <View className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 mb-4">
 <View className="flex-row justify-between py-1">
 <Text className="text-tiny text-slate-500 font-medium">Mốc thời gian:</Text>
 <Text className="text-tiny font-semibold text-slate-800">
 {selectedOrder.created_at ? formatDateTime(selectedOrder.created_at) : 'Ngoại tuyến'}
 </Text>
 </View>
  <View className="flex-row justify-between py-1 items-center">
  <Text className="text-tiny text-slate-500 font-medium">Mã hóa đơn:</Text>
  <TouchableOpacity
    onPress={() => handleCopyOrderNo(selectedOrder.order_no || selectedOrder.id)}
    className="flex-row items-center active:opacity-75"
  >
    <Text className="text-tiny font-semibold text-slate-700 mr-1">{selectedOrder.order_no || selectedOrder.id}</Text>
    <Ionicons name={copiedId ? "checkmark" : "copy-outline"} size={11} color={copiedId ? "#10b981" : "#64748b"} />
  </TouchableOpacity>
  </View>
 <View className="flex-row justify-between py-1">
 <Text className="text-tiny text-slate-500 font-medium">Khách hàng:</Text>
 <View className="items-end">
 <Text className="text-tiny font-semibold text-slate-800">{selectedOrder.customer_name || 'Khách lẻ'}</Text>
 {selectedOrderCustomerPhone && (
 <Text className="text-tiny text-slate-500 mt-0.5">📞 {selectedOrderCustomerPhone}</Text>
 )}
 </View>
 </View>
 {selectedOrder.note && (
 <View className="border-t border-slate-200 mt-2 pt-2">
 <Text className="text-tiny text-slate-450 font-medium">Ghi chú đơn:</Text>
 <Text className="text-xs text-slate-700 mt-1 font-semibold">{selectedOrder.note}</Text>
 </View>
 )}
 </View>

 {/* Thanh toán chi tiết theo từng phương thức + quỹ */}
 <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Thanh toán</Text>
 <View className="mb-4">
 {(() => {
 const pm = selectedOrder.payment_method;
 let rows: {method: string; fund_id?: string; amount?: number}[] = [];
 if (pm && (pm.startsWith('[') || pm.startsWith('{'))) {
 try { rows = JSON.parse(pm); } catch {}
 }
 if (rows.length === 0) {
 rows = [{method: pm || 'cash', amount: selectedOrder.total_amount}];
 }
 return rows.map((row: any, i: number) => {
 const method = row.METHOD || row.method || 'cash';
 const amount = row.AMOUNT || row.amount;
 const fund = paymentFundsList.find((f: any) => f.id === (row.FUND_ID || row.fund_id));
 const methodLabel = translateMethod(method);
 const isDebt = method === 'debt';
 const isPrepaid = method === 'prepaid';
 return (
 <View key={i} className={`flex-row justify-between items-start py-2.5 border-b border-slate-100 ${i === 0 ? '' : ''}`}>
 <View className="flex-1">
 <Text className={`text-xs font-semibold ${isDebt ? 'text-rose-600' : isPrepaid ? 'text-emerald-700' : 'text-slate-800'}`}>
 {methodLabel}
 </Text>
 {fund && (
 <Text className={`text-tiny font-medium mt-0.5 ${isDebt ? 'text-rose-400' : isPrepaid ? 'text-emerald-500' : 'text-orange-600'}`}>
 🏦 {fund.name}{fund.bank_name ? ` (${fund.bank_name})` : ''}
 </Text>
 )}
 </View>
 {amount != null && (
 <Text className={`text-xs font-bold ml-3 ${isDebt ? 'text-rose-600' : isPrepaid ? 'text-emerald-700' : 'text-slate-800'}`}>
 {formatCurrency(Number(amount))}
 </Text>
 )}
 </View>
 );
 });
 })()}
 </View>

 <Text className="text-xxs font-semibold text-slate-400 mb-2.5 px-1">Mặt hàng đã mua</Text>
 {selectedOrderItems.map((item: any, idx: number) => (
 <View 
 key={idx} 
 className="flex-row justify-between py-3 border-b border-slate-100 items-center"
 >
 <View className="flex-1 mr-3">
 <Text className="text-xs font-medium text-slate-800">{item.product_name}</Text>
 <Text className="text-tiny text-slate-500 font-medium mt-0.5">
 {item.qty} x {formatCurrency(item.unit_price)}
 </Text>
 </View>
 <Text className="text-xs font-semibold text-slate-800">
 {formatCurrency(item.line_total)}
 </Text>
 </View>
 ))}

  {(() => {
    const discountAmount = Number(selectedOrder.discount_amount || 0);
    if (discountAmount > 0) {
      return (
        <View className="border-t border-slate-200 mt-4 pt-2">
          <View className="flex-row justify-between py-2 items-center">
            <Text className="text-xs text-slate-500 font-medium">Tạm tính</Text>
            <Text className="text-xs font-semibold text-slate-800">
              {formatCurrency(selectedOrder.total_amount + discountAmount)}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 items-center">
            <Text className="text-xs text-slate-500 font-medium">Giảm giá</Text>
            <Text className="text-xs font-semibold text-rose-600">
              -{formatCurrency(discountAmount)}
            </Text>
          </View>
          <View className="flex-row justify-between py-4 border-t border-slate-200 mt-2 items-center">
            <Text className="text-xs font-semibold text-slate-800">Tổng thanh toán</Text>
            <Text className="text-orange-500 text-base font-semibold">
              {formatCurrency(selectedOrder.total_amount)}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View className="flex-row justify-between py-4 border-t border-slate-200 mt-4 items-center">
        <Text className="text-xs font-semibold text-slate-800">Tổng thanh toán</Text>
        <Text className="text-orange-500 text-base font-semibold">
          {formatCurrency(selectedOrder.total_amount)}
        </Text>
      </View>
    );
  })()}
 </ScrollView>

 {/* Actions Footer */}
 <View className="flex-row border-t border-slate-100 pt-4 justify-between gap-3">
 {selectedOrder.sync_status === 'pending' ? (
 <Button
 variant="primary"
 title="Đồng bộ ngay"
 icon={<Ionicons name="cloud-upload" size={14} color="white" />}
 onPress={() => handleSyncSingleOrder(selectedOrder.id)}
 loading={isSyncingOrder === selectedOrder.id}
 className="flex-1 py-3.5 rounded-xl"
 />
 ) : (
 <View className="flex-1 bg-emerald-50 py-3.5 rounded-xl items-center flex-row justify-center border border-emerald-200 opacity-80">
 <Ionicons name="checkmark-done-circle-outline" size={14} color="#10b981" />
 <Text className="font-medium text-tiny ml-1 text-emerald-700">ĐÃ ĐỒNG BỘ</Text>
 </View>
 )}

 <Button
 variant={selectedOrder.sync_status === 'pending' ? 'outline' : 'primary'}
 title="In lại hóa đơn"
 icon={<Ionicons name="print" size={14} color={selectedOrder.sync_status === 'pending' ? '#475569' : 'white'} />}
 onPress={handleReprint}
 loading={isReprinting}
 className="flex-1 py-3.5 rounded-xl"
 />
 </View>

 </View>
 )}
 </View>
 </Modal>
 </View>
 )}

 {/* CÁC DIALOG THÔNG BÁO XÁC NHẬN SANG TRỌNG */}
 <Dialog
 visible={isReprintSuccessVisible}
 onClose={() => setIsReprintSuccessVisible(false)}
 onConfirm={() => setIsReprintSuccessVisible(false)}
 title="Đã gửi lệnh in"
 description="Lệnh in lại đã được gửi đến máy in K80 Bluetooth thành công!"
 confirmLabel="Hoàn tất"
 variant="success"
 />

 <Dialog
 visible={isSyncSuccessVisible}
 onClose={() => setIsSyncSuccessVisible(false)}
 onConfirm={() => setIsSyncSuccessVisible(false)}
 title="Đồng bộ thành công"
 description="Đơn hàng ngoại tuyến đã được đồng bộ lên hệ thống thành công!"
 confirmLabel="Đóng"
 variant="success"
 />

 <Dialog
 visible={isSyncErrorVisible}
 onClose={() => setIsSyncErrorVisible(false)}
 onConfirm={() => setIsSyncErrorVisible(false)}
 title="Đồng bộ thất bại"
 description="Không thể kết nối đến máy chủ. Vui lòng thử lại sau khi có mạng ổn định."
 confirmLabel="Xác nhận"
 variant="danger"
 />

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName="Chi nhánh chính"
 />

 </SafeAreaView>
 );
}
