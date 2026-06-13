import React, {useEffect, useRef, useState} from 'react';
import {Animated, Dimensions, Modal, Text, TouchableOpacity, View, TouchableWithoutFeedback, Image, Platform, ScrollView, TextInput, ActivityIndicator, Pressable} from 'react-native';
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
import {Button} from '../ui/Button';
import {formatCurrency} from '../../lib/utils/format';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import Constants from 'expo-constants';
import {usePermissions} from '../../lib/auth/PermissionsContext';


export interface DrawerMenuProps {
 visible: boolean;
 onClose: () => void;
 branchName?: string;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

export function DrawerMenu({visible, onClose, branchName = 'Chi nhánh chính'}: DrawerMenuProps) {
 const {hasPermission} = usePermissions();
 const appVersion = Constants.expoConfig?.version || '1.0.0';
 const buildNumber = Platform.select({
   ios: Constants.expoConfig?.ios?.buildNumber,
   android: Constants.expoConfig?.android?.versionCode?.toString(),
   default: '',
 });
 const displayVersion = buildNumber ? `v${appVersion} (${buildNumber})` : `v${appVersion}`;

 const canViewDebt = hasPermission('debt.view') || hasPermission('customers.view');

 const [userInfo, setUserInfo] = useState<{name: string, email: string} | null>(null);
 const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
 const [isLoggingOut, setIsLoggingOut] = useState(false);
 const [isShiftOpen, setIsShiftOpen] = useState(false);
 const [mobileShiftEnabled, setMobileShiftEnabled] = useState(false);
 const [logoutAfterClose, setLogoutAfterClose] = useState(false);

 // States chốt ca làm việc
 const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
 const [actualClosingCashInput, setActualClosingCashInput] = useState('0');
 const [closingShiftNote, setClosingShiftNote] = useState('');
 const [openingCashVal, setOpeningCashVal] = useState(0);
 const [expectedClosingCashVal, setExpectedClosingCashVal] = useState(0);
 const [isClosingShift, setIsClosingShift] = useState(false);
 
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

 // Lấy thông tin tài khoản đăng nhập khi mở drawer (Offline-first)
  const fetchUser = async () => {
  try {
  const name = await AsyncStorage.getItem('user_name');
  const email = await AsyncStorage.getItem('saved_email');
  const activeShiftId = await AsyncStorage.getItem('active_shift_id');
  const isShiftEnabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
  
  setIsShiftOpen(!!activeShiftId);
  setMobileShiftEnabled(isShiftEnabled);
 
 if (name || email) {
 setUserInfo({
 name: name || 'Nhân viên',
 email: email || '',
 });
 } else {
 // Fallback nếu chưa lưu trong AsyncStorage
 const { data: { session } } = await supabase.auth.getSession();
 if (session?.user) {
 const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Nhân viên';
 setUserInfo({
 name: fallbackName,
 email: session.user.email || '',
 });
 }
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
    if (route.startsWith('/')) {
   router.push(route as any);
 } else {
   alert(`Tính năng ${route} sẽ có mặt trong phiên bản cập nhật ERP lớn tiếp theo!`);
 }
};

  // Helper tính tiền mặt thu từ hóa đơn
  const getOrderCashAmount = (paymentMethod: string, paidAmount: number): number => {
    if (!paymentMethod) return paidAmount;
    if (paymentMethod.startsWith('[') || paymentMethod.startsWith('{')) {
      try {
        const parsed = JSON.parse(paymentMethod);
        if (Array.isArray(parsed)) {
          return parsed.reduce((sum: number, p: any) => {
            const methodStr = (p.method || p.METHOD || '').toLowerCase();
            if (methodStr === 'cash' || methodStr === 'tiền mặt') {
              return sum + (p.amount || 0);
            }
            return sum;
          }, 0);
        }
      } catch (e) {
        // ignore
      }
    }
    const normalized = paymentMethod.toLowerCase();
    if (normalized === 'cash' || normalized === 'tiền mặt') {
      return paidAmount;
    }
    return 0;
  };

  // Khai báo chốt ca trước khi đóng
  const handleTriggerCloseShift = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      if (!activeShiftId) {
        setIsLogoutConfirmOpen(true);
        return;
      }

      // 1. Lấy thông tin ca hiện tại từ SQLite
      const shiftRecord = await db
        .select()
        .from(schema.shop_shifts)
        .where(eq(schema.shop_shifts.id, activeShiftId))
        .limit(1);

      const openingCash = shiftRecord[0]?.opening_cash || 0;
      setOpeningCashVal(openingCash);

      // 2. Tính expected closing cash
      const shiftOrders = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.shift_id, activeShiftId));

      let totalCashReceived = 0;
      for (const order of shiftOrders) {
        totalCashReceived += getOrderCashAmount(order.payment_method, order.paid_amount || 0);
      }

      const expectedCash = openingCash + totalCashReceived;
      setExpectedClosingCashVal(expectedCash);
      setActualClosingCashInput(expectedCash.toString());
      setClosingShiftNote('');
      setShowCloseShiftModal(true);
    } catch (err) {
      console.error('Lỗi khi tính toán chốt ca trong DrawerMenu:', err);
      setIsLogoutConfirmOpen(true);
    }
  };

  // Xác nhận đóng ca làm việc và GIỮ phiên đăng nhập hoặc ĐĂNG XUẤT tùy theo flag
  const handleCloseShiftConfirm = async () => {
    if (isClosingShift) return;
    setIsClosingShift(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id');
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      const actualClosingCash = parseInt(actualClosingCashInput.replace(/\D/g, ''), 10) || 0;
      const nowStr = new Date().toISOString();

      if (activeShiftId && Platform.OS !== 'web') {
        // Cập nhật SQLite
        await db
          .update(schema.shop_shifts)
          .set({
            closed_at: nowStr,
            status: 'closed',
            actual_closing_cash: actualClosingCash,
            sync_status: 'pending'
          })
          .where(eq(schema.shop_shifts.id, activeShiftId));

        // PUT lên server
        if (shopId) {
          try {
            const currentUrl = await getApiBaseUrl();
            const headers = await getApiHeaders();
            await fetch(`${currentUrl}/api/shops/${shopId}/shifts/${activeShiftId}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                closed_at: nowStr,
                actual_closing_cash: actualClosingCash,
                note: closingShiftNote,
              }),
            });
          } catch (err) {
            console.warn('Lỗi đồng bộ đóng ca lên server trong DrawerMenu:', err);
          }
        }
      }

      // Đẩy offline
      if (shopId && Platform.OS !== 'web') {
        try {
          await SyncManager.pushOfflineShifts(shopId);
          await SyncManager.pushOfflineOrders(shopId);
        } catch (syncErr) {
          console.warn('Lỗi push offline chốt ca trong DrawerMenu:', syncErr);
        }
      }

      // Xóa ca làm việc trong AsyncStorage
      await AsyncStorage.removeItem('active_shift_id');
      await AsyncStorage.removeItem('temp_cart');
      await AsyncStorage.removeItem('temp_discount');
      await AsyncStorage.removeItem('temp_note');
      await AsyncStorage.removeItem('temp_customer');

      setShowCloseShiftModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      alert('Đã đóng ca làm việc thành công.');

      if (logoutAfterClose) {
        // Đăng xuất hoàn toàn
        await AsyncStorage.removeItem('active_shop_id');
        await AsyncStorage.removeItem('active_shop_name');
        await AsyncStorage.removeItem('active_tenant_id');
        switchDatabaseScope(null);
        await supabase.auth.signOut();
        onClose();
        router.replace('/(auth)/login');
      } else {
        // Quay về chọn chi nhánh để có thể mở ca mới
        onClose();
        router.replace('/(auth)/select-branch');
      }
    } catch (err: any) {
      console.error('Lỗi khi đóng ca trong DrawerMenu:', err);
      alert(`Không thể đóng ca: ${err.message || err}`);
    } finally {
      setIsClosingShift(false);
    }
  };

  // Đăng xuất không đóng ca (Chỉ Thoát)
  const handleLogoutOnly = async () => {
    setIsLoggingOut(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      setIsLogoutConfirmOpen(false);
      
      // Xóa các session lưu trữ
      await AsyncStorage.removeItem('active_shift_id');
      await AsyncStorage.removeItem('active_shop_id');
      await AsyncStorage.removeItem('active_shop_name');
      await AsyncStorage.removeItem('active_tenant_id');
      await AsyncStorage.removeItem('temp_cart');
      await AsyncStorage.removeItem('temp_discount');
      await AsyncStorage.removeItem('temp_note');
      await AsyncStorage.removeItem('temp_customer');

      switchDatabaseScope(null);
      await supabase.auth.signOut();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setIsLoggingOut(false);
      onClose(); // Đóng Drawer
      router.replace('/(auth)/login');
    } catch (err: any) {
      console.error('Lỗi khi đăng xuất từ Drawer:', err);
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
 {renderMenuItem('cube-outline', 'Quản lý Kho hàng', '/warehouse')}
 {renderMenuItem('wallet-outline', 'Sổ quỹ (Cashbook)', '/cashbook')}
 {canViewDebt && renderMenuItem('card-outline', 'Quản lý Công nợ', '/debt')}

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
 
 <View className="flex-row items-center">
    {/* Nút Chốt ca */}
    {mobileShiftEnabled && isShiftOpen && (
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => {
          setLogoutAfterClose(false);
          handleTriggerCloseShift();
        }}
        className="p-2 bg-orange-50 border border-orange-100 rounded-lg active:bg-orange-100 mr-2"
      >
        <Ionicons name="lock-closed-outline" size={14} color="#fa5908" />
      </TouchableOpacity>
    )}
    
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
 </View>
 <Text className="text-center text-[10px] text-slate-400 mt-3 font-medium">
   Phiên bản {displayVersion}
 </Text>

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
  onConfirm={(mobileShiftEnabled && isShiftOpen) ? () => {
    setIsLogoutConfirmOpen(false);
    setLogoutAfterClose(true);
    handleTriggerCloseShift();
  } : handleLogoutOnly}
  title="Đăng xuất tài khoản?"
  description={
    (mobileShiftEnabled && isShiftOpen)
      ? "Cảnh báo: Bạn đang có ca làm việc đang mở. Vui lòng chọn đóng ca trước khi thoát hoặc chỉ đăng xuất và giữ nguyên ca."
      : "Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng di động?"
  }
  confirmLabel={(mobileShiftEnabled && isShiftOpen) ? "Đóng ca & Thoát" : "Đăng xuất"}
  cancelLabel="Hủy"
  variant="danger"
  loading={isLoggingOut}
  >
    {(mobileShiftEnabled && isShiftOpen) && (
      <Button
        variant="outline"
        size="md"
        title="Chỉ đăng xuất (Giữ ca mở)"
        onPress={handleLogoutOnly}
        className="w-full mb-3 rounded-2xl border border-slate-200"
      />
    )}
  </Dialog>

  {/* Modal Chốt Ca và Đóng Ca */}
  <Modal
    visible={showCloseShiftModal}
    animationType="fade"
    transparent={true}
    onRequestClose={() => setShowCloseShiftModal(false)}
  >
    <View className="flex-1 justify-center items-center px-6">
      <Pressable
        className="absolute inset-0 bg-black/60"
        onPress={() => setShowCloseShiftModal(false)}
      />
      <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 max-h-[90%] relative">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
          <View className="items-center mb-4">
            <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
              <Ionicons name="lock-closed-outline" size={24} color="#fa5908" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Xác nhận Kết ca & Đóng ca</Text>
            <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
              Vui lòng kiểm kê tiền mặt thực tế trong két trước khi bàn giao và đóng ca.
            </Text>
          </View>

          {/* Chi tiết ca */}
          <View className="bg-slate-50 p-4 rounded-2xl border mb-4" style={{ borderColor: '#f1f5f9' }}>
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-xxs text-slate-500 font-semibold">Tiền mặt bàn giao đầu ca:</Text>
              <Text className="text-xs font-bold text-slate-700">{formatCurrency(openingCashVal)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-1 border-t mt-2 pt-2" style={{ borderTopColor: '#e2e8f0' }}>
              <View className="flex-1 mr-4">
                <Text className="text-xxs text-slate-500 font-semibold">Tiền mặt hệ thống tính:</Text>
                <Text className="text-[10px] text-slate-400 font-medium mt-0.5">
                  (Bằng: Đầu ca + Doanh thu tiền mặt phát sinh)
                </Text>
              </View>
              <Text className="text-xs font-bold text-slate-800">{formatCurrency(expectedClosingCashVal)}</Text>
            </View>
          </View>

          {/* Form nhập thực tế */}
          <View className="mb-4">
            <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Tiền mặt thực tế cuối ca
            </Text>
            <View className="relative flex-row items-center bg-slate-50 border rounded-xl px-4 py-2" style={{ borderColor: '#cbd5e1' }}>
              <TextInput
                value={actualClosingCashInput ? Number(actualClosingCashInput.replace(/\D/g, '')).toLocaleString('vi-VN') : '0'}
                onChangeText={(val) => {
                  const num = val.replace(/\D/g, '');
                  setActualClosingCashInput(num || '0');
                }}
                keyboardType="numeric"
                className="flex-1 text-center text-lg font-bold text-slate-800"
                placeholder="0"
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />
              <Text className="text-sm font-semibold text-slate-400 ml-2" style={{ lineHeight: undefined }}>đ</Text>
            </View>
          </View>

          {/* Tính chênh lệch */}
          {(() => {
            const actualCash = parseInt(actualClosingCashInput.replace(/\D/g, ''), 10) || 0;
            const diff = actualCash - expectedClosingCashVal;
            return (
              <View className="flex-row justify-between items-center bg-slate-50 p-3.5 rounded-xl border mb-4" style={{ borderColor: '#e2e8f0' }}>
                <Text className="text-xxs text-slate-500 font-semibold">Chênh lệch két:</Text>
                <Text className={`text-xs font-bold ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                </Text>
              </View>
            );
          })()}

          {/* Ghi chú */}
          <View className="mb-6">
            <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Ghi chú chốt ca (Không bắt buộc)
            </Text>
            <TextInput
              value={closingShiftNote}
              onChangeText={setClosingShiftNote}
              className="bg-slate-50 border rounded-xl px-4 py-3 text-xs text-slate-800 h-20"
              placeholder="Nhập ghi chú bàn giao hoặc lý do chênh lệch két..."
              multiline={true}
              textAlignVertical="top"
              style={{
                lineHeight: undefined,
                borderColor: '#e2e8f0',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl border bg-slate-50 items-center justify-center"
              style={{ borderColor: '#cbd5e1' }}
              onPress={() => setShowCloseShiftModal(false)}
              disabled={isClosingShift}
            >
              <Text className="text-slate-500 font-semibold text-xs">Hủy bỏ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
              onPress={handleCloseShiftConfirm}
              disabled={isClosingShift}
            >
              {isClosingShift ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold text-xs">Xác nhận đóng ca</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>
 </Modal>
 );
}
