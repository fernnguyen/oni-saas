import React, {useEffect, useRef, useState} from 'react';
import {Animated, Dimensions, Modal, Text, TouchableOpacity, View, TouchableWithoutFeedback, Image, Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../lib/supabase';
import {db, switchDatabaseScope} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {Dialog} from '../ui/Dialog';

export interface DrawerMenuProps {
 visible: boolean;
 onClose: () => void;
 branchName?: string;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

export function DrawerMenu({visible, onClose, branchName = 'Chi nhánh chính'}: DrawerMenuProps) {
 const [userInfo, setUserInfo] = useState<{name: string, email: string} | null>(null);
 const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
 const [isLoggingOut, setIsLoggingOut] = useState(false);
 
 // Hoạt ảnh trượt ngang từ trái sang phải
 const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
 const fadeAnim = useRef(new Animated.Value(0)).current;

 useEffect(() => {
 if (visible) {
 Animated.parallel([
 Animated.timing(slideAnim, {
 toValue: 0,
 duration: 250,
 useNativeDriver: true,
}),
 Animated.timing(fadeAnim, {
 toValue: 1,
 duration: 250,
 useNativeDriver: true,
}),
 ]).start();

 // Lấy thông tin tài khoản đăng nhập khi mở drawer
 const fetchUser = async () => {
 try {
 const { data: { user } } = await supabase.auth.getUser();
 if (user) {
 setUserInfo({
 name: user.user_metadata?.full_name || user.user_metadata?.name || 'Nhân viên thu ngân',
 email: user.email || '',
 });
 }
 } catch (err) {
 console.warn('Lỗi khi lấy thông tin user trong DrawerMenu:', err);
 }
 };
 fetchUser();
} else {
 Animated.parallel([
 Animated.timing(slideAnim, {
 toValue: -DRAWER_WIDTH,
 duration: 200,
 useNativeDriver: true,
}),
 Animated.timing(fadeAnim, {
 toValue: 0,
 duration: 200,
 useNativeDriver: true,
}),
 ]).start();
}
}, [visible, slideAnim, fadeAnim]);

 const handleNavigate = (route: string) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 onClose();
 
 if (route.startsWith('/(tabs)')) {
 router.push(route as any);
} else {
 alert(`Tính năng ${route} sẽ có mặt trong phiên bản cập nhật ERP lớn tiếp theo!`);
}
};

 // Đóng ca và đăng xuất
 const handleCloseShift = async () => {
 setIsLoggingOut(true);
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
 try {
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
 setIsLoggingOut(false);
 setIsLogoutConfirmOpen(false);
 onClose(); // Đóng Drawer
 router.replace('/(auth)/login');
 } catch (err: any) {
 console.error('Lỗi khi kết thúc ca làm việc từ Drawer:', err);
 setIsLoggingOut(false);
 }
 };

 const renderMenuItem = (icon: string, label: string, targetRoute: string, isComingSoon = false) => {
 return (
 <TouchableOpacity
 activeOpacity={0.7}
 onPress={() => handleNavigate(targetRoute)}
 className="flex-row items-center py-2 px-3 my-0.5 rounded-lg active:bg-orange-50/50"
 >
 <View className="bg-slate-50 p-1.5 rounded-md mr-2.5 border border-slate-100">
 <Ionicons name={icon as any} size={13} color="#fa5908" />
 </View>
 <View className="flex-1">
 <Text className="font-medium text-xs text-slate-700">
 {label}
 </Text>
 </View>
 {isComingSoon ? (
 <View className="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
 <Text className="text-[7.5px] text-slate-500 font-bold tracking-wider">COMING</Text>
 </View>
 ) : (
 <Ionicons name="chevron-forward" size={10} color="#cbd5e1" />
 )}
 </TouchableOpacity>
 );
 };

 return (
 <Modal
 visible={visible}
 transparent={true}
 animationType="none"
 onRequestClose={onClose}
 >
 <View className="flex-1 flex-row">
 
 {/* Lớp nền tối mờ */}
 <TouchableWithoutFeedback onPress={onClose}>
 <Animated.View 
 style={{opacity: fadeAnim}}
 className="absolute inset-0 bg-black/50" 
 />
 </TouchableWithoutFeedback>

 {/* Thân Menu Trượt */}
 <Animated.View
 style={{
 transform: [{translateX: slideAnim}],
 width: DRAWER_WIDTH,
}}
 className="h-full bg-white shadow-2xl border-r border-slate-100 p-4 pt-12 justify-between"
 >
 <View>
 {/* Header Drawer */}
 <View className="flex-row items-center mb-4 px-1.5">
 <Image 
 source={require('../../assets/logo.png')} 
 style={{width: 34, height: 34, resizeMode: 'contain', marginRight: 10}} 
 />
 <View>
 <Text className="text-xs font-semibold text-slate-800">ONI miniERP</Text>
 <Text className="text-xxs font-medium text-slate-400 mt-0.5" numberOfLines={1}>
 {branchName}
 </Text>
 </View>
 </View>

 <View className="h-0.5 w-full bg-slate-100 my-2.5" />

 {/* Danh sách phân hệ ERP được phân nhóm compact giống web */}
 {/* Group 1: Bán hàng & Khách hàng */}
 <Text className="text-[8.5px] font-bold text-slate-400 mb-1 mt-2 px-1.5 uppercase tracking-wider">
 Bán hàng & Khách hàng
 </Text>
 {renderMenuItem('calculator', 'Bán hàng nhanh POS', '/(tabs)/pos')}
 {renderMenuItem('receipt', 'Lịch sử hóa đơn', '/(tabs)/orders')}
 {renderMenuItem('people-outline', 'Quản lý Khách hàng', '/(tabs)/customers')}

 {/* Group 2: Vận hành & Tài chính */}
 <Text className="text-[8.5px] font-bold text-slate-400 mb-1 mt-3.5 px-1.5 uppercase tracking-wider">
 Vận hành & Tài chính
 </Text>
 {renderMenuItem('cube-outline', 'Quản lý Kho hàng', 'Kho hàng', true)}
 {renderMenuItem('wallet-outline', 'Sổ quỹ (Cashbook)', 'Sổ quỹ', true)}

 {/* Group 3: Hệ thống */}
 <Text className="text-[8.5px] font-bold text-slate-400 mb-1 mt-3.5 px-1.5 uppercase tracking-wider">
 Hệ thống
 </Text>
 {renderMenuItem('analytics', 'Báo cáo tổng quan', '/(tabs)')}
 {renderMenuItem('settings-outline', 'Cài đặt hệ thống', '/(tabs)/settings')}
 </View>

 {/* Footer Drawer */}
 <View className="mb-4 border-t border-slate-100 pt-4">
 <View className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex-row items-center justify-between">
 <View className="flex-row items-center flex-1 mr-2">
 <View className="bg-orange-50 w-8 h-8 rounded-full items-center justify-center mr-2.5 border border-orange-100">
 <Ionicons name="person" size={13} color="#fa5908" />
 </View>
 <View className="flex-1">
 <Text className="font-semibold text-xs text-slate-800" numberOfLines={1}>
 {userInfo?.name || 'Đang tải...'}
 </Text>
 <Text className="text-[9.5px] text-slate-450 mt-0.5" numberOfLines={1}>
 {userInfo?.email || 'email@shop.com'}
 </Text>
 </View>
 </View>
 
 {/* Nút Logout */}
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setIsLogoutConfirmOpen(true);
}}
 className="p-2 bg-red-50 border border-red-100 rounded-lg active:bg-red-100"
 >
 <Ionicons name="log-out-outline" size={14} color="#ef4444" />
 </TouchableOpacity>
 </View>
 
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={onClose}
 className="mt-3.5 flex-row items-center justify-center border border-slate-200/80 py-2 rounded-lg active:bg-slate-50"
 >
 <Ionicons name="close-outline" size={13} color="#64748b" />
 <Text className="text-slate-500 font-medium text-xxs ml-1.5">Đóng Menu</Text>
 </TouchableOpacity>
 </View>

 </Animated.View>
 </View>

 {/* Dialog xác nhận kết ca & đăng xuất */}
 <Dialog
 visible={isLogoutConfirmOpen}
 onClose={() => setIsLogoutConfirmOpen(false)}
 onConfirm={handleCloseShift}
 title="Xác nhận Kết ca & Đóng ca?"
 description="Hệ thống sẽ gửi báo cáo SQLite ca làm việc, đồng bộ hóa đơn chưa sync, đóng ca và đăng xuất an toàn khỏi ứng dụng di động."
 confirmLabel="Xác nhận Đóng ca"
 cancelLabel="Hủy"
 variant="danger"
 loading={isLoggingOut}
 />
 </Modal>
 );
}
