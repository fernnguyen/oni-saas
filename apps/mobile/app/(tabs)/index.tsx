import React, {useState, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, Platform, Alert} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {usePermissions} from '../../lib/auth/PermissionsContext';

// Import UI components dùng chung cao cấp
import {Header} from '../../components/layout/Header';
import {Badge} from '../../components/ui/Badge';
import {Skeleton} from '../../components/ui/Skeleton';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {formatCurrency} from '../../lib/utils/format';

export default function DashboardScreen() {
 const {hasPermission, reloadPermissions} = usePermissions();
 const canViewReports = hasPermission('reports.view_shop');

 const [selectedTimeRange, setSelectedTimeRange] = useState('30days'); // today, 7days, 30days
 const [isLoading, setIsLoading] = useState(true);
 const [branchName, setBranchName] = useState('Chi nhánh chính');
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);

 const [stats, setStats] = useState({
 todayRevenue: 0,
 todayOrders: 0,
 monthRevenue: 0,
 monthOrders: 0,
 aov: 0,
 refundRevenue: 0,
 refundCount: 0,
 topProducts: [] as Array<{name: string; qty: number; percentage: number; icon: string}>,
 chartData: [] as Array<{day: string; amount: number; height: number; isPeak: boolean}>
});

 // Tải dữ liệu thực tế SQLite/Cloud
 useFocusEffect(
 useCallback(() => {
 let isMounted = true;

 // Reload permissions từ AsyncStorage khi màn hình được focus
 reloadPermissions();

 const loadDashboardData = async () => {
 try {
 if (isMounted) setIsLoading(true);
 
 const activeShopName = await AsyncStorage.getItem('active_shop_name');
 const activeShiftId = await AsyncStorage.getItem('active_shift_id');
 if (activeShopName && isMounted) {
 setBranchName(activeShopName);
}

 let allOrders: any[] = [];
 let allOrderItems: any[] = [];

 if (Platform.OS === 'web') {
 // Web Mock Data
 allOrders = [
 {id: '1', total_amount: 150000, created_at: new Date().toISOString(), shift_id: 'default'},
 {id: '2', total_amount: 250000, created_at: new Date().toISOString(), shift_id: 'default'},
 ];
 allOrderItems = [
 {product_id: 'p1', product_name: 'Cà phê Phin Sữa Đá', qty: 2},
 {product_id: 'p2', product_name: 'Trà Đào Cam Sả', qty: 3},
 ];
} else {
 // SQLite Native
 allOrders = await db.select().from(schema.orders);
 allOrderItems = await db.select().from(schema.order_items);
}

 // Doanh số ca
 const todayOrdersList = activeShiftId 
 ? allOrders.filter(o => o.shift_id === activeShiftId)
 : allOrders;

 const todayRevenue = todayOrdersList.reduce((sum, o) => sum + o.total_amount, 0);
 const todayOrders = todayOrdersList.length;

 const monthRevenue = allOrders.reduce((sum, o) => sum + o.total_amount, 0);
 const monthOrders = allOrders.length;
 const aov = monthOrders > 0 ? Math.round(monthRevenue / monthOrders) : 0;

 // Bestsellers
 const productMap: Record<string, {name: string; qty: number}> = {};
 allOrderItems.forEach(it => {
 if (!productMap[it.product_id]) {
 productMap[it.product_id] = {name: it.product_name, qty: 0};
}
 productMap[it.product_id].qty += it.qty;
});

 const sortedProds = Object.values(productMap)
 .sort((a, b) => b.qty - a.qty)
 .slice(0, 3);

 const maxQty = sortedProds.length > 0 ? sortedProds[0].qty : 1;
 const topProductsMapped = sortedProds.map(p => {
 let icon = 'cafe-outline';
 if (p.name.toLowerCase().includes('cà phê') || p.name.toLowerCase().includes('coffee')) icon = 'cafe-outline';
 else if (p.name.toLowerCase().includes('trà') || p.name.toLowerCase().includes('juice')) icon = 'wine-outline';
 else if (p.name.toLowerCase().includes('bánh mì') || p.name.toLowerCase().includes('bread')) icon = 'restaurant-outline';
 else if (p.name.toLowerCase().includes('nước') || p.name.toLowerCase().includes('suối')) icon = 'water-outline';

 return {
 name: p.name,
 qty: p.qty,
 percentage: Math.round((p.qty / maxQty) * 100),
 icon,
};
});

 // Biểu đồ
 const dateMap: Record<string, number> = {};
 allOrders.forEach(o => {
 const dateStr = o.created_at ? o.created_at.substring(5, 10) : '05-26';
 dateMap[dateStr] = (dateMap[dateStr] || 0) + o.total_amount;
});

 const days: string[] = [];
 for (let i = 6; i >= 0; i--) {
   const d = new Date();
   d.setDate(d.getDate() - i);
   const month = String(d.getMonth() + 1).padStart(2, '0');
   const day = String(d.getDate()).padStart(2, '0');
   days.push(`${month}-${day}`);
 }

 let maxAmount = 10000;
 const chartDataMapped = days.map(day => {
 const amount = dateMap[day] || 0;
 if (amount > maxAmount) maxAmount = amount;
 return {day, amount};
});

 const finalChartData = chartDataMapped.map(item => ({
 day: item.day,
 amount: item.amount,
 height: Math.max(5, Math.round((item.amount / maxAmount) * 85)),
 isPeak: item.amount === maxAmount && item.amount > 0
}));

 if (isMounted) {
 setStats({
 todayRevenue,
 todayOrders,
 monthRevenue: monthRevenue,
 monthOrders: monthOrders,
 aov: aov,
 refundRevenue: 0,
 refundCount: 0,
 topProducts: topProductsMapped,
 chartData: finalChartData
});
 setIsLoading(false);
}
} catch (error) {
 console.error('Lỗi khi tải dữ liệu báo cáo:', error);
 if (isMounted) setIsLoading(false);
}
};

 loadDashboardData();

 return () => {
 isMounted = false;
};
}, [])
 );

 // ERP Shortcuts permissions check
 const canUsePos = hasPermission('pos.use');
 const canViewWarehouse = hasPermission(['inventory.view', 'products.view']);
 const canViewCashbook = hasPermission('cashbook.view');
 const canViewSettings = hasPermission('settings.view');

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus="synced" />

 <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
 
 {/* 2. ERP LỐI TẮT NHANH */}
 <View className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
 <Text className="text-xxs font-semibold text-slate-450 mb-3 px-1">
 ⚡ Lối tắt phân hệ ERP
 </Text>
 <View className="flex-row justify-between">
 <TouchableOpacity 
 activeOpacity={canUsePos ? 0.7 : 1}
 onPress={() => canUsePos ? router.push('/(tabs)/pos') : Alert.alert('Thông báo', 'Bạn không có quyền sử dụng POS!')}
 className={`items-center w-[23%] ${!canUsePos ? 'opacity-40' : ''}`}
 >
 <View className="bg-orange-50 w-11 h-11 rounded-xl items-center justify-center border border-orange-100 mb-2">
 <Ionicons name="cart-outline" size={20} color="#fa5908" />
 {!canUsePos && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
 </View>
 <Text className="text-xxs font-semibold text-slate-700 text-center">POS</Text>
 </TouchableOpacity>

 <TouchableOpacity 
 activeOpacity={canViewWarehouse ? 0.7 : 1}
 onPress={() => canViewWarehouse ? router.push('/warehouse') : Alert.alert('Thông báo', 'Bạn không có quyền quản lý Kho hàng!')}
 className={`items-center w-[23%] ${!canViewWarehouse ? 'opacity-40' : ''}`}
 >
 <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
 <Ionicons name="cube-outline" size={20} color="#fa5908" />
 {!canViewWarehouse && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
 </View>
 <Text className="text-xxs font-semibold text-slate-500 text-center">Kho hàng</Text>
 </TouchableOpacity>

 <TouchableOpacity 
 activeOpacity={canViewCashbook ? 0.7 : 1}
 onPress={() => canViewCashbook ? router.push('/cashbook') : Alert.alert('Thông báo', 'Bạn không có quyền xem Sổ quỹ!')}
 className={`items-center w-[23%] ${!canViewCashbook ? 'opacity-40' : ''}`}
 >
 <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
 <Ionicons name="wallet-outline" size={20} color="#fa5908" />
 {!canViewCashbook && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
 </View>
 <Text className="text-xxs font-semibold text-slate-500 text-center">Sổ Quỹ</Text>
 </TouchableOpacity>

 <TouchableOpacity 
 activeOpacity={canViewSettings ? 0.7 : 1}
 onPress={() => canViewSettings ? router.push('/(tabs)/settings') : Alert.alert('Thông báo', 'Bạn không có quyền truy cập Cài đặt!')}
 className={`items-center w-[23%] ${!canViewSettings ? 'opacity-40' : ''}`}
 >
 <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
 <Ionicons name="people-outline" size={20} color="#fa5908" />
 {!canViewSettings && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
 </View>
 <Text className="text-xxs font-semibold text-slate-500 text-center">Nhân Sự</Text>
 </TouchableOpacity>
 </View>
 </View>

 {canViewReports ? (
 <>
 {/* 3. BỐ CỤC 4 CARD KPI - Thu nhỏ độ bo xuống rounded-2xl */}
 <View className="flex-row flex-wrap justify-between mb-1">
 {isLoading ? (
 Array.from({length: 4}).map((_, index) => (
 <View key={index} className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between h-32">
 <View className="flex-row justify-between items-center w-full">
 <Skeleton width="60%" height={10} />
 <Skeleton.Circle size={16} />
 </View>
 <Skeleton width="80%" height={18} className="mt-4" />
 <Skeleton width="40%" height={8} className="mt-3" />
 </View>
 ))
 ) : (
 <>
 {/* Card 1: Doanh thu ca/ngày */}
 <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
 <View className="flex-row justify-between items-center">
 <Text className="text-xxs font-semibold text-slate-455">Báo cáo ngày</Text>
 <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100">
 <Ionicons name="card-outline" size={11} color="#fa5908" />
 </View>
 </View>
 <View className="mt-4">
 <Text className="text-xxs font-medium text-slate-400">Doanh thu hôm nay</Text>
 <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.todayRevenue)}</Text>
 <View className="flex-row justify-between items-center mt-2.5">
 <Text className="text-xxs text-slate-455 font-medium">{stats.todayOrders} hóa đơn</Text>
 <Badge variant="success" label="LIVE" size="sm" />
 </View>
 </View>
 </View>

 {/* Card 2: Lũy kế ca SQLite */}
 <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
 <View className="flex-row justify-between items-center">
 <Text className="text-xxs font-semibold text-slate-455">Doanh thu ca</Text>
 <View className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
 <Ionicons name="analytics-outline" size={11} color="#10b981" />
 </View>
 </View>
 <View className="mt-4">
 <Text className="text-xxs font-medium text-slate-400">Tích lũy offline</Text>
 <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.monthRevenue)}</Text>
 <View className="flex-row justify-between items-center mt-2.5">
 <Text className="text-xxs text-slate-455 font-medium">{stats.monthOrders} đơn</Text>
  <Badge variant="info" label="OFFLINE" size="sm" />
 </View>
 </View>
 </View>

 {/* Card 3: AOV */}
 <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
 <View className="flex-row justify-between items-center">
 <Text className="text-xxs font-semibold text-slate-455">Giao dịch AOV</Text>
 <View className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
 <Ionicons name="receipt-outline" size={11} color="#3b82f6" />
 </View>
 </View>
 <View className="mt-4">
 <Text className="text-xxs font-medium text-slate-400">Đơn trung bình</Text>
 <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.aov)}</Text>
 <View className="flex-row justify-between items-center mt-2.5">
 <Text className="text-xxs text-slate-455 font-medium">Bình quân ca</Text>
 <Badge variant="secondary" label="INFO" size="sm" />
 </View>
 </View>
 </View>

 {/* Card 4: Hoàn tiền */}
 <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
 <View className="flex-row justify-between items-center">
 <Text className="text-xxs font-semibold text-slate-455">Đổi trả hàng</Text>
 <View className="bg-rose-50 p-1.5 rounded-lg border border-rose-100">
 <Ionicons name="refresh-outline" size={11} color="#f43f5e" />
 </View>
 </View>
 <View className="mt-4">
 <Text className="text-xxs font-medium text-slate-400">Hủy & hoàn tiền</Text>
 <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.refundRevenue)}</Text>
 <View className="flex-row justify-between items-center mt-2.5">
 <Text className="text-xxs text-slate-455 font-medium">{stats.refundCount} phiếu lỗi</Text>
 <Badge variant="danger" label="0.0%" size="sm" />
 </View>
 </View>
 </View>
 </>
 )}
 </View>

 {/* 4. BIỂU ĐỒ GRADIENT DOANH THU - Thu góc bo về rounded-2xl */}
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 <View className="flex-row justify-between items-start mb-4">
 <View>
 <Text className="text-xs font-semibold text-slate-800">Biến động doanh thu ca</Text>
 <Text className="text-xxs text-slate-400 font-medium mt-0.5">Biểu đồ đối chiếu 7 ngày kinh doanh gần nhất</Text>
 </View>
 
 <View className="flex-row items-center bg-orange-50 px-2 py-0.5 rounded-xl border border-orange-100">
 <View className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5" />
 <Text className="text-xxs text-orange-700 font-semibold">Doanh thu</Text>
 </View>
 </View>

 {isLoading ? (
 <Skeleton width="100%" height={150} borderRadius={12} />
 ) : stats.chartData.length === 0 || stats.chartData.every(c => c.amount === 0) ? (
 <View 
 style={{ borderColor: '#e2e8f0' }}
 className="h-44 items-center justify-center border border-dashed rounded-xl py-6"
 >
 <Ionicons name="bar-chart-outline" size={32} color="#cbd5e1" />
 <Text className="text-xxs font-semibold text-slate-400 mt-2 text-center">Chưa có dữ liệu doanh thu trong 7 ngày qua</Text>
 </View>
 ) : (
 <View className="h-44 justify-end pt-4 pb-2">
 <View className="flex-1 flex-row items-end justify-between px-1 relative">
 <View className="absolute left-0 right-0 top-0 border-t border-slate-100/60 w-full" />
 <View className="absolute left-0 right-0 top-[33%] border-t border-slate-100/60 w-full" />
 <View className="absolute left-0 right-0 top-[66%] border-t border-slate-100/60 w-full" />

 {stats.chartData.map((col, idx) => (
 <View key={idx} className="flex-1 items-center mx-[3px] h-full justify-end">
 {col.isPeak && (
 <View className="bg-slate-800 px-1.5 py-0.5 rounded-md absolute -top-4 z-10">
 <Text className="text-micro text-white font-medium">PEAK</Text>
 </View>
 )}
 
 <View 
 className={`w-full rounded-t-md ${
 col.isPeak 
 ? 'bg-orange-500 shadow-sm shadow-orange-500/20' 
 : 'bg-orange-400'
}`} 
 style={{
 height: `${col.height}%` as any,
 backgroundColor: col.isPeak ? '#fa5908' : '#fb923c'
}} 
 />
 <Text className="text-micro text-slate-400 font-semibold mt-1.5">{col.day}</Text>
 </View>
 ))}
 </View>
 <View className="h-0.5 w-full bg-slate-200 mt-1" />
 </View>
 )}
 </View>

 {/* 5. TOP SẢN PHẨM BÁN CHẠY - Thay thế Emoji bằng Ionicons vector, Bo góc card rounded-2xl */}
 <Text className="text-xxs font-semibold text-slate-455 mb-3 px-1">
 Top sản phẩm & dịch vụ bán chạy
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-6">
 {isLoading ? (
 <Skeleton.Text lines={3} gap={12} height={16} />
 ) : stats.topProducts.length === 0 ? (
 <Text className="text-xxs text-slate-400 text-center py-4 font-semibold">Chưa phát sinh doanh số</Text>
 ) : (
 stats.topProducts.map((p, index) => (
 <View key={index} className={index < stats.topProducts.length - 1 ? 'mb-4' : ''}>
 <View className="flex-row justify-between items-center mb-2">
 <View className="flex-row items-center">
 <View className="bg-slate-50 w-7 h-7 rounded-lg items-center justify-center mr-2 border border-slate-100">
 <Ionicons name={p.icon as any} size={13} color="#fa5908" />
 </View>
 <Text className="text-xs font-medium text-slate-800" numberOfLines={1}>
 {p.name}
 </Text>
 </View>
 <Text className="text-xs font-semibold text-[#fa5908]">{p.qty} lần</Text>
 </View>
 <View className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
 <View 
 className="h-full bg-orange-500 rounded-full" 
 style={{
 width: `${p.percentage}%` as any,
 backgroundColor: '#fa5908' 
}} 
 />
 </View>
 </View>
 ))
 )}
 </View>
 </>
 ) : (
 /* Welcome Card Gating */
 <View className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm mb-6 items-center">
 <View className="bg-orange-50 p-4 rounded-full border border-orange-100 mb-3">
 <Ionicons name="sparkles" size={28} color="#fa5908" />
 </View>
 <Text className="text-sm font-semibold text-slate-800 text-center">Chào mừng bạn làm việc!</Text>
 <Text className="text-xxs text-slate-400 text-center mt-1.5 leading-relaxed max-w-[250px]">
 Hệ thống ghi nhận phiên hoạt động của bạn tại chi nhánh {branchName}. Chúc bạn một ca làm việc thuận lợi và nhiều doanh số!
 </Text>
 </View>
 )}

 {/* 6. NÚT CHUYỂN POS */}
 {canUsePos && (
 <TouchableOpacity 
 activeOpacity={0.85}
 className="bg-orange-500 py-4 rounded-xl items-center shadow-md flex-row justify-center mb-10 shadow-orange-500/20"
 onPress={() => router.push('/(tabs)/pos')}
 style={{backgroundColor: '#fa5908'}}
 >
 <Ionicons name="calculator-outline" size={15} color="white" />
 <Text className="text-white font-medium text-xs ml-2">Bán hàng POS ngay</Text>
 </TouchableOpacity>
 )}

 </ScrollView>

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName={branchName}
 />
 </SafeAreaView>
 );
}
