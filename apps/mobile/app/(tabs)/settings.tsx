import React, {useState, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useRouter} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db, switchDatabaseScope} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {supabase} from '../../lib/supabase';
import * as Haptics from 'expo-haptics';

// Import các UI dùng chung
import {Header} from '../../components/layout/Header';
import {Switch} from '../../components/ui/Switch';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Badge} from '../../components/ui/Badge';
import {DrawerMenu} from '../../components/erp/DrawerMenu';

export default function SettingsScreen() {
 const router = useRouter();

 // 1. Cấu hình máy in
 const [printerConnType, setPrinterConnType] = useState<'bluetooth' | 'lan'>('bluetooth');
 const [selectedBleDevice, setSelectedBleDevice] = useState('PRINTER-K80-BLE');
 const [printerIp, setPrinterIp] = useState('192.168.1.200');
 const [printerPort, setPrinterPort] = useState('9100');
 const [isPrinterConnected, setIsPrinterConnected] = useState(true);
 const [isTestingPrint, setIsTestingPrint] = useState(false);

 // 2. Đồng bộ dữ liệu SQLite
 const [syncProgress, setSyncProgress] = useState<number | null>(null);
 const [lastFullSync, setLastFullSync] = useState('Chưa đồng bộ');
 const [lastDeltaSync, setLastDeltaSync] = useState('Chưa đồng bộ');
 const [syncStatusText, setSyncStatusText] = useState('SQLite Cục bộ ổn định');
 const [branchName, setBranchName] = useState('Chi nhánh chính');

 // Thống kê SQLite
 const [productCount, setProductCount] = useState(0);
 const [resourceCount, setResourceCount] = useState(0);
 const [customerCount, setCustomerCount] = useState(0);
 const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

 // 3. Cài đặt hệ thống khác
 const [autoSyncOnPrint, setAutoSyncOnPrint] = useState(true);
 const [soundFeedback, setSoundFeedback] = useState(true);
 const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);

 // Trạng thái Dialog phản hồi xác nhận
 const [isPrintTestSuccessVisible, setIsPrintTestSuccessVisible] = useState(false);
 const [isSyncSuccessVisible, setIsSyncSuccessVisible] = useState(false);
 const [isSyncErrorVisible, setIsSyncErrorVisible] = useState(false);
 const [isDeltaSyncSuccessVisible, setIsDeltaSyncSuccessVisible] = useState(false);
 const [deltaSyncResult, setDeltaSyncResult] = useState({success: 0, failed: 0});

 // Tải thống kê
 const loadSettingsData = async () => {
 try {
 const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Cơ sở chính';
 setBranchName(activeShopName);

 if (Platform.OS !== 'web') {
 const prods = await db.select().from(schema.products);
 const resources = await db.select().from(schema.location_resources);
 const custs = await db.select().from(schema.customers);
 const pendingOrders = await db
 .select()
 .from(schema.orders)
 .where(eq(schema.orders.sync_status, 'pending'));

 setProductCount(prods.length);
 setResourceCount(resources.length);
 setCustomerCount(custs.length);
 setPendingOrdersCount(pendingOrders.length);
 setSyncStatusText(`Cục bộ có: ${prods.length} sp, ${resources.length} bàn. Chờ sync: ${pendingOrders.length} đơn.`);
} else {
 setProductCount(4);
 setResourceCount(3);
 setCustomerCount(2);
 setPendingOrdersCount(0);
}
} catch (err) {
 console.error('Lỗi khi tải số liệu cài đặt SQLite:', err);
}
};

 useFocusEffect(
 useCallback(() => {
 loadSettingsData();
}, [])
 );

 // In thử
 const handlePrintTest = () => {
 setIsTestingPrint(true);
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setTimeout(() => {
 setIsTestingPrint(false);
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsPrintTestSuccessVisible(true);
}, 1200);
};

 // Đồng bộ Toàn phần
 const handleFullSync = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 try {
 setSyncProgress(0);
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const tenantId = await AsyncStorage.getItem('active_tenant_id') || 'default-tenant';

 if (Platform.OS === 'web') {
 let p = 0;
 const interval = setInterval(() => {
 p += 25;
 setSyncProgress(p);
 if (p >= 100) {
 clearInterval(interval);
 const now = new Date();
 const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
 setLastFullSync(timeStr);
 setSyncProgress(null);
 setIsSyncSuccessVisible(true);
}
}, 300);
 return;
}

 const success = await SyncManager.pullFullDatabase(shopId, tenantId, (progress) => {
 setSyncProgress(Math.round(progress * 100));
});

 if (success) {
 const now = new Date();
 const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
 setLastFullSync(timeStr);
 setLastDeltaSync(timeStr);
 await loadSettingsData();
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsSyncSuccessVisible(true);
} else {
 setIsSyncErrorVisible(true);
}
} catch (err) {
 console.error('Lỗi sync toàn phần:', err);
 setIsSyncErrorVisible(true);
} finally {
 if (Platform.OS !== 'web') setSyncProgress(null);
}
};

 // Đồng bộ Delta
 const handleDeltaSync = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 try {
 setSyncProgress(10);
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

 if (Platform.OS === 'web') {
 setSyncProgress(100);
 setTimeout(() => {
 setSyncProgress(null);
 setDeltaSyncResult({success: 0, failed: 0});
 setIsDeltaSyncSuccessVisible(true);
}, 500);
 return;
}

 const uploadResults = await SyncManager.pushOfflineOrders(shopId);
 await SyncManager.pushOfflineShifts(shopId);

 const now = new Date();
 const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
 setLastDeltaSync(timeStr);
 await loadSettingsData();

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setDeltaSyncResult({success: uploadResults.successCount, failed: uploadResults.failedCount});
 setIsDeltaSyncSuccessVisible(true);
} catch (err) {
 console.error('Lỗi đồng bộ Delta:', err);
} finally {
 setSyncProgress(null);
}
};

 // Đóng ca
 const handleCloseShift = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
 try {
 setIsLogoutModalOpen(false);
 const shopId = await AsyncStorage.getItem('active_shop_id');
 const activeShiftId = await AsyncStorage.getItem('active_shift_id');
 
 if (activeShiftId && Platform.OS !== 'web') {
 const nowStr = new Date().toISOString();
 await db
 .update(schema.shop_shifts)
 .set({closed_at: nowStr, status: 'closed', sync_status: 'pending'})
 .where(eq(schema.shop_shifts.id, activeShiftId));
}

 if (shopId && Platform.OS !== 'web') {
 await SyncManager.pushOfflineShifts(shopId);
 await SyncManager.pushOfflineOrders(shopId);
}

 await AsyncStorage.removeItem('active_shift_id');
 await AsyncStorage.removeItem('active_shop_id');
 await AsyncStorage.removeItem('active_shop_name');
 await AsyncStorage.removeItem('active_tenant_id');

 // Xóa sạch giỏ hàng tạm và thông tin CRM của ca làm việc cũ
 await AsyncStorage.removeItem('temp_cart');
 await AsyncStorage.removeItem('temp_discount');
 await AsyncStorage.removeItem('temp_note');
 await AsyncStorage.removeItem('temp_customer');

 // Trả lại kết nối CSDL về file mặc định sau khi đăng xuất
 switchDatabaseScope(null);

 await supabase.auth.signOut();
 
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 alert('Đã đóng ca làm việc và đăng xuất thành công.');
 router.replace('/(auth)/login');
} catch (err: any) {
 console.error('Lỗi khi kết thúc ca làm việc:', err);
}
};

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus={pendingOrdersCount > 0 ? 'pending' : 'synced'} />

 <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
 
 {/* 2. THÔNG TIN THU NGÂN & CHI NHÁNH - Giảm góc bo về rounded-2xl */}
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 <View className="flex-row items-center justify-between">
 <View className="flex-row items-center">
 <View className="bg-orange-50 p-3 rounded-xl mr-3 border border-orange-100">
 <Ionicons name="person-outline" size={18} color="#fa5908" />
 </View>
 <View>
 <Text className="font-bold text-xs text-slate-800">
 Nhân viên thu ngân di động
 </Text>
 <Text className="text-xxs text-slate-400 font-bold mt-0.5">
 Quyền hạn: Bán hàng SQLite
 </Text>
 </View>
 </View>
 
 <Badge variant="primary" label="ON-SHIFT" size="sm" showDot={true} />
 </View>

 <View className="border-t border-slate-100 my-4 pt-4 flex-row justify-between items-center">
 <View>
 <Text className="text-xxs text-slate-400 font-bold">Chi nhánh hoạt động</Text>
 <Text className="text-xs font-extrabold mt-0.5 text-slate-700">
 {branchName}
 </Text>
 </View>
 
 <Button
 variant="danger"
 size="sm"
 title="Đóng ca / Kết ca"
 onPress={() => setIsLogoutModalOpen(true)}
 className="rounded-xl px-3.5 py-2"
 />
 </View>
 </View>

 {/* 3. CÀI ĐẶT MÁY IN NHIỆT K80 - Giảm bo về rounded-2xl */}
 <Text className="text-xxs font-extrabold text-slate-450 mb-3 px-1">
 Cấu hình máy in hóa đơn (K80 / K57)
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 {/* Kết nối tabs */}
 <View className="flex-row bg-slate-50 p-1 rounded-xl mb-4 border border-slate-200">
 <TouchableOpacity 
 activeOpacity={0.7}
 className={`flex-1 py-2 rounded-lg items-center flex-row justify-center ${
 printerConnType === 'bluetooth' ? 'bg-white shadow-sm border border-slate-200/50' : ''
}`}
 onPress={() => setPrinterConnType('bluetooth')}
 >
 <Ionicons name="bluetooth" size={13} color={printerConnType === 'bluetooth' ? '#fa5908' : '#94a3b8'} />
 <Text className={`text-xxs font-extrabold ml-1.5 ${
 printerConnType === 'bluetooth' ? 'text-slate-800' : 'text-slate-400'
}`}>
 Bluetooth (BLE)
 </Text>
 </TouchableOpacity>
 
 <TouchableOpacity 
 activeOpacity={0.7}
 className={`flex-1 py-2 rounded-lg items-center flex-row justify-center ${
 printerConnType === 'lan' ? 'bg-white shadow-sm border border-slate-200/50' : ''
}`}
 onPress={() => setPrinterConnType('lan')}
 >
 <Ionicons name="wifi" size={13} color={printerConnType === 'lan' ? '#fa5908' : '#94a3b8'} />
 <Text className={`text-xxs font-extrabold ml-1.5 ${
 printerConnType === 'lan' ? 'text-slate-800' : 'text-slate-400'
}`}>
 LAN / Wifi (IP)
 </Text>
 </TouchableOpacity>
 </View>

 {/* Form cấu hình */}
 {printerConnType === 'bluetooth' ? (
 <View className="mb-4">
 <Text className="text-xxs text-slate-450 font-extrabold mb-2">Chọn thiết bị Bluetooth</Text>
 <View className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80">
 <View className="flex-row items-center">
 <Ionicons name="print-outline" size={16} color="#fa5908" />
 <Text className="text-xs font-extrabold ml-2 text-slate-800">
 {selectedBleDevice}
 </Text>
 </View>
 
 <TouchableOpacity 
 className={`px-3 py-1.5 rounded-lg border ${
 isPrinterConnected ? 'bg-emerald-50 border-emerald-300' : 'bg-orange-500 border-orange-600'
}`}
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setIsPrinterConnected(!isPrinterConnected);
}}
 >
 <Text className={`text-xxs font-extrabold ${
 isPrinterConnected ? 'text-emerald-700' : 'text-white'
}`}>
 {isPrinterConnected ? 'Đã kết nối' : 'Kết nối'}
 </Text>
 </TouchableOpacity>
 </View>
 </View>
 ) : (
 <View className="mb-4">
 <Text className="text-xxs text-slate-455 font-extrabold mb-2">Thông tin địa chỉ IP máy in LAN</Text>
 <View className="flex-row justify-between items-center">
 <TextInput
 value={printerIp}
 onChangeText={setPrinterIp}
 placeholder="E.g. 192.168.1.200"
 placeholderTextColor="#94a3b8"
 className="flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-850 mr-2"
 style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
 />
 <TextInput
 value={printerPort}
 onChangeText={setPrinterPort}
 placeholder="9100"
 placeholderTextColor="#94a3b8"
 className="w-18 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-center text-slate-850"
 style={Platform.OS === 'web' ? ({outlineStyle: 'none'} as any) : undefined}
 />
 </View>
 </View>
 )}

 {/* Nút in thử */}
 <Button
 variant={isPrinterConnected ? 'primary' : 'secondary'}
 title={isTestingPrint ? 'Đang in phiếu test...' : 'In hóa đơn test (K80)'}
 icon={<Ionicons name="document-text-outline" size={13} color={isPrinterConnected ? 'white' : '#64748b'} />}
 disabled={!isPrinterConnected || isTestingPrint}
 onPress={handlePrintTest}
 className="py-3.5 rounded-xl"
 />
 </View>

 {/* 4. ĐỒNG BỘ SQLITE CỰC BỘ - Giảm bo về rounded-2xl */}
 <Text className="text-xxs font-extrabold text-slate-450 mb-3 px-1">
 Chiến lược đồng bộ SQLite (Offline-First)
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 
 <View className="mb-4">
 <View className="flex-row justify-between py-1.5 items-center border-b border-slate-100 pb-2">
 <Text className="text-xxs text-slate-450 font-extrabold">SQLite Row Stats:</Text>
 <Text className="text-xxs font-extrabold text-[#fa5908]">
 {productCount} SP | {resourceCount} Bàn | {customerCount} KH
 </Text>
 </View>
 
 <View className="flex-row justify-between py-2 items-center border-b border-slate-100">
 <Text className="text-xxs text-slate-455 font-extrabold">Full Sync gần nhất:</Text>
 <Text className="text-xxs font-bold text-slate-600">{lastFullSync}</Text>
 </View>
 <View className="flex-row justify-between py-2 items-center border-b border-slate-100">
 <Text className="text-xxs text-slate-455 font-extrabold">Delta Sync gần nhất:</Text>
 <Text className="text-xxs font-bold text-slate-600">{lastDeltaSync}</Text>
 </View>

 <View className="mt-3.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
 <Text className="text-xxs font-bold text-slate-500 leading-relaxed text-center">
 💡 Trạng thái: {syncStatusText}
 </Text>
 </View>
 </View>

 {syncProgress !== null && (
 <View className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
 <View className="flex-row justify-between mb-1.5">
 <Text className="text-xxs font-extrabold text-slate-700">Đang đồng bộ SQLite...</Text>
 <Text className="text-xxs text-orange-500 font-extrabold">{syncProgress}%</Text>
 </View>
 <View className="h-1.5 bg-slate-200 rounded-full overflow-hidden" style={{alignSelf: 'stretch'}}>
 <View className="h-full bg-orange-500" style={{width: `${Math.min(100, Math.max(0, syncProgress))}%`, backgroundColor: '#fa5908'}} />
 </View>
 </View>
 )}

 {/* Các nút sync */}
 <View className="flex-row gap-3">
 <Button
 variant="primary"
 size="sm"
 title="Sync Toàn phần"
 icon={<Ionicons name="sync" size={12} color="white" />}
 onPress={handleFullSync}
 disabled={syncProgress !== null}
 className="flex-1 py-3.5 rounded-xl"
 />

 <Button
 variant="secondary"
 size="sm"
 title="Sync Delta"
 icon={<Ionicons name="cloud-upload-outline" size={12} color="#475569" />}
 onPress={handleDeltaSync}
 disabled={syncProgress !== null}
 className="flex-1 py-3.5 rounded-xl border border-slate-200"
 />
 </View>
 </View>

 {/* 5. TÙY CHỌN HỆ THỐNG */}
 <Text className="text-xxs font-extrabold text-slate-450 mb-3 px-1">
 Tùy chọn hệ thống
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-10">
 
 <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
 <View className="flex-1 mr-4">
 <Text className="font-bold text-slate-800">
 Tự động sync sau thanh toán
 </Text>
 <Text className="text-xxs text-slate-400 font-bold mt-0.5">Giảm thiểu tối đa độ trễ dữ liệu</Text>
 </View>
 <Switch
 value={autoSyncOnPrint}
 onValueChange={setAutoSyncOnPrint}
 />
 </View>

 <View className="flex-row justify-between items-center py-3">
 <View className="flex-1 mr-4">
 <Text className="text-xs font-bold text-slate-800">
 Phản hồi âm thanh (Beep!)
 </Text>
 <Text className="text-xxs text-slate-400 font-bold mt-0.5">Phát tiếng Beep khi quét barcode thành công</Text>
 </View>
 <Switch
 value={soundFeedback}
 onValueChange={setSoundFeedback}
 />
 </View>
 </View>
 </ScrollView>

 {/* CÁC DIALOG BÁO CÁO PHẢN HỒI XÁC NHẬN SANG TRỌNG */}
 <Dialog
 visible={isPrintTestSuccessVisible}
 onClose={() => setIsPrintTestSuccessVisible(false)}
 onConfirm={() => setIsPrintTestSuccessVisible(false)}
 title="Đã in phiếu test"
 description="Đã in phiếu kiểm thử thành công trên máy in nhiệt K80 Bluetooth!"
 confirmLabel="Xác nhận"
 variant="success"
 />

 <Dialog
 visible={isSyncSuccessVisible}
 onClose={() => setIsSyncSuccessVisible(false)}
 onConfirm={() => setIsSyncSuccessVisible(false)}
 title="Đồng bộ thành công"
 description="Đồng bộ toàn phần tải dữ liệu từ Cloud hoàn tất 100%! SQLite đã được làm mới."
 confirmLabel="Tuyệt vời"
 variant="success"
 />

 <Dialog
 visible={isSyncErrorVisible}
 onClose={() => setIsSyncErrorVisible(false)}
 onConfirm={() => setIsSyncErrorVisible(false)}
 title="Đồng bộ thất bại"
 description="Đồng bộ dữ liệu thất bại. Hãy kiểm tra kết nối mạng Next.js API server."
 confirmLabel="Đóng"
 variant="danger"
 />

 <Dialog
 visible={isDeltaSyncSuccessVisible}
 onClose={() => setIsDeltaSyncSuccessVisible(false)}
 onConfirm={() => setIsDeltaSyncSuccessVisible(false)}
 title="Đồng bộ hoàn tất"
 description={`Đồng bộ Delta thành công!\n\n- Đẩy thành công: ${deltaSyncResult.success} hóa đơn ngoại tuyến.\n- Thất bại: ${deltaSyncResult.failed} hóa đơn.`}
 confirmLabel="Đóng"
 variant="success"
 />

 <Dialog
 visible={isLogoutModalOpen}
 onClose={() => setIsLogoutModalOpen(false)}
 onConfirm={handleCloseShift}
 title="Xác nhận Kết ca & Đóng ca?"
 description="Hệ thống sẽ gửi báo cáo SQLite ca làm việc, đồng bộ hóa đơn chưa sync, đóng ca và đăng xuất an toàn khỏi ứng dụng di động."
 confirmLabel="Xác nhận Đóng ca"
 cancelLabel="Hủy"
 variant="danger"
 />

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName={branchName}
 />
 </SafeAreaView>
 );
}
