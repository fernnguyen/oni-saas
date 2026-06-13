import React, {useEffect, useState} from 'react';
import {Text, View, TouchableOpacity, Platform, Modal, ScrollView, TouchableWithoutFeedback, DeviceEventEmitter} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getApiBaseUrl, getApiHeaders, loadApiBaseUrl} from '../../lib/api/config';
import {SyncManager} from '../../lib/sync/SyncManager';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import * as Haptics from 'expo-haptics';

// UI components
import {SyncBanner} from '../erp/SyncBanner';
import {Dialog} from '../ui/Dialog';
import {useNotifications} from '../../lib/notifications/NotificationContext';

export interface HeaderProps {
 onPressMenu: () => void;
 syncStatus?: 'synced' | 'pending';
 onPressSync?: () => void;
 isSyncing?: boolean;
 title?: string;
 showBack?: boolean;
 pendingCount?: number;
 entityName?: string;
}

export function Header({
  onPressMenu, 
  syncStatus, 
  onPressSync, 
  isSyncing = false, 
  title, 
  showBack = false,
  pendingCount,
  entityName
}: HeaderProps) {
 const insets = useSafeAreaInsets();
 const [activeBranchName, setActiveBranchName] = useState('Tạp hóa Linh Ka');
 const [activeBranchId, setActiveBranchId] = useState('');
 const [tenantId, setTenantId] = useState('');
 const [branchList, setBranchList] = useState<any[]>([]);

 // States chọn chi nhánh dropdown
 const [isDropdownOpen, setIsDropdownOpen] = useState(false);
 const [isSwitchConfirmVisible, setIsSwitchConfirmVisible] = useState(false);
 const [selectedBranchToSwitch, setSelectedBranchToSwitch] = useState<any>(null);
 const [isSwitchingLoading, setIsSwitchingLoading] = useState(false);

 // States thông báo — kết nối với NotificationContext thực tế thay vì mock data
 const [isNotificationOpen, setIsNotificationOpen] = useState(false);
 const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'qr' | 'other'>('all');
 const { notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();

 // Tải thông tin chi nhánh & shops hoạt động
 const loadHeaderData = async () => {
 try {
 const shopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
 const shopId = await AsyncStorage.getItem('active_shop_id') || '';
 const tId = await AsyncStorage.getItem('active_tenant_id') || 'default-tenant';
 
 setActiveBranchName(shopName);
 setActiveBranchId(shopId);
 setTenantId(tId);

 const currentUrl = await loadApiBaseUrl();
 const headers = await getApiHeaders();

 // Gọi API lấy shops
 const res = await fetch(`${currentUrl}/api/shops?tenant_id=${tId}`, {headers});
 if (res.ok) {
 const data = await res.json();
 const shops = data.shops || [];
 const mapped = shops.map((s: any) => ({
 id: s.id,
 name: s.name || 'Chi nhánh',
 address: s.address || 'Địa chỉ đang cập nhật',
 isActive: s.is_active !== false,
 industry_type: s.industry_type || 'retail',
}));
 setBranchList(mapped);
} else {
 // Fallback offline
 setBranchList([
 {id: shopId, name: shopName, address: 'Cơ sở hiện tại (Offline)'}
 ]);
}
} catch (err) {
 console.warn('Lỗi tải danh sách chi nhánh trong Header:', err);
}
};

  useEffect(() => {
    loadHeaderData();
    const subscription = DeviceEventEmitter.addListener('branch-changed', () => {
      loadHeaderData();
    });
    return () => {
      subscription.remove();
    };
  }, []);

 const handleDropdownPress = () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 // Tải lại dữ liệu shops trước khi mở dropdown phòng trường hợp có thay đổi
 loadHeaderData();
 setIsDropdownOpen(!isDropdownOpen);
};

 const handleBranchSelect = (branch: any) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 if (branch.id === activeBranchId) {
 setIsDropdownOpen(false);
 return;
}
 setSelectedBranchToSwitch(branch);
 setIsDropdownOpen(false);
 setIsSwitchConfirmVisible(true);
};

 // Xác nhận chuyển chi nhánh thực tế & tải lại SQLite
 const handleConfirmSwitchBranch = async () => {
 if (!selectedBranchToSwitch) return;
 setIsSwitchingLoading(true);
 try {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
 
 const newShopId = selectedBranchToSwitch.id;
 const newShopName = selectedBranchToSwitch.name;

 if (Platform.OS !== 'web') {
 // 1. Đồng bộ cơ sở dữ liệu SQLite: tải toàn bộ sp, tồn kho, phòng bàn của chi nhánh mới
 const syncSuccess = await SyncManager.pullFullDatabase(newShopId, tenantId, () => {});
 
 if (!syncSuccess) {
 alert('Đồng bộ tải dữ liệu chi nhánh mới thất bại. Vui lòng thử lại sau khi có mạng!');
 setIsSwitchingLoading(false);
 setIsSwitchConfirmVisible(false);
 return;
}

 // 2. Thiết lập ca làm việc di động mới trong SQLite cho chi nhánh mới
 const nowStr = new Date().toISOString();
 const shiftId = `shift-${newShopId}-${Date.now()}`;
 await AsyncStorage.setItem('active_shift_id', shiftId);

 const loggedUserName = await AsyncStorage.getItem('user_name');
 const userEmail = await AsyncStorage.getItem('saved_email');
 const employeeName = loggedUserName || (userEmail ? (userEmail.includes('@') ? userEmail.split('@')[0] : userEmail) : 'Nhân viên');

 await db.insert(schema.shop_shifts).values({
 id: shiftId,
 opened_at: nowStr,
 status: 'open',
 opening_cash: 0,
 actual_closing_cash: 0,
 employee_name: employeeName,
 sync_status: 'pending',
}).onConflictDoNothing();
}

 // 3. Ghi đè thông tin chi nhánh mới vào AsyncStorage
 await AsyncStorage.setItem('active_shop_id', newShopId);
 await AsyncStorage.setItem('active_shop_name', newShopName);
 await AsyncStorage.setItem('active_shop_industry', selectedBranchToSwitch.industry_type);

  setActiveBranchId(newShopId);
  setActiveBranchName(newShopName);

  // Emit event to update other Header instances and the Tab layout label
  DeviceEventEmitter.emit('branch-changed', {
    shopId: newShopId,
    shopName: newShopName,
    industry: selectedBranchToSwitch.industry_type
  });

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsSwitchingLoading(false);
 setIsSwitchConfirmVisible(false);
 setSelectedBranchToSwitch(null);

 // Xóa sạch giỏ hàng tạm thời, ghi chú và thông tin CRM của ca làm việc cũ
 await AsyncStorage.removeItem('temp_cart');
 await AsyncStorage.removeItem('temp_discount');
 await AsyncStorage.removeItem('temp_note');
 await AsyncStorage.removeItem('temp_customer');
 await AsyncStorage.removeItem('temp_table_carts');
 await AsyncStorage.removeItem('temp_table_customers');

  // 4. Tải và đồng bộ quyền hạn/vai trò của chi nhánh mới ngay lập tức
  try {
    await AsyncStorage.removeItem('last_keep_alive_sync_time');
    const currentUrl = await loadApiBaseUrl();
    const headers = await getApiHeaders();
    const res = await fetch(`${currentUrl}/api/shops/${newShopId}/permissions`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.permissions)) {
        await AsyncStorage.setItem('active_user_permissions', JSON.stringify(data.permissions));
      }
      if (data && data.role) {
        await AsyncStorage.setItem('active_user_role_code', data.role.code || 'staff');
        await AsyncStorage.setItem('active_user_role_name', data.role.name || 'Nhân viên');
      }
    }
  } catch (err) {
    console.warn('Lỗi tải quyền hạn khi chuyển chi nhánh trong Header:', err);
  }

  // 5. Kích hoạt reload mượt mà bằng cách thay thế định tuyến
  router.replace('/(tabs)');
} catch (err) {
 console.error('Lỗi chuyển chi nhánh:', err);
 setIsSwitchingLoading(false);
 setIsSwitchConfirmVisible(false);
}
};

  const handleSyncPress = () => {
    if (onPressSync) {
      onPressSync();
    } else {
      alert('Dữ liệu đang được đồng bộ tự động ngầm. Không cần thao tác thủ công.');
    }
  };

 return (
 <View className="px-4 py-2.5 bg-white border-b border-slate-100 flex-row justify-between items-center relative z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
 
  {/* Nút Hamburger và Bộ Chọn Chi Nhánh Dropdown */}
  <View className="flex-row items-center flex-1 mr-4">
  {/* Nút Hamburger Left hoặc Quay lại */}
  <TouchableOpacity 
  activeOpacity={0.7}
  onPress={onPressMenu}
  className="p-2 bg-slate-50 border border-slate-100 rounded-xl mr-3"
  >
  <Ionicons name={showBack ? "chevron-back" : "menu-outline"} size={20} color="#fa5908" />
  </TouchableOpacity>

  {/* Cấu trúc chọn chi nhánh dropdown hoặc Title */}
  {title ? (
    <View className="flex-1 mr-1 justify-center">
      <Text className="text-sm font-semibold text-slate-800 leading-tight" numberOfLines={1}>
        {title}
      </Text>
    </View>
  ) : (
    <TouchableOpacity 
      activeOpacity={0.85}
      onPress={handleDropdownPress}
      className="flex-row items-center flex-1 max-w-[200px]"
    >
      <View className="flex-1 mr-1">
        <Text className="text-micro font-semibold text-slate-450">CHI NHÁNH</Text>
        <Text className="text-sm font-semibold text-slate-800 mt-0.5 leading-tight" numberOfLines={1}>
          {activeBranchName}
        </Text>
      </View>
      
      <Ionicons 
        name={isDropdownOpen ? "chevron-up" : "chevron-down"} 
        size={13} 
        color="#64748b" 
        className="mt-2 ml-1"
      />
    </TouchableOpacity>
  )}
  </View>

  {/* SyncStatusBar và Chuông thông báo Right */}
  <View className="flex-row items-center gap-2">
  <SyncBanner 
    forceStatus={syncStatus} 
    onPressSync={handleSyncPress} 
    isSyncing={isSyncing} 
    pendingCount={pendingCount}
    entityName={entityName}
  />
 
 <TouchableOpacity 
 activeOpacity={0.7}
 className="p-2 bg-slate-50 rounded-xl border border-slate-100 relative"
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setIsNotificationOpen(true);
}}
 >
 <Ionicons name="notifications-outline" size={15} color="#64748b" />
 {unreadCount > 0 && (
 <View className="absolute top-1.5 right-1.5 bg-red-500 w-1.5 h-1.5 rounded-full" />
 )}
 </TouchableOpacity>
 </View>

 {/* DROPDOWN MENU CHUYỂN CHI NHÁNH THẢ XUỐNG */}
 <Modal
 visible={isDropdownOpen}
 transparent={true}
 animationType="none"
 onRequestClose={() => setIsDropdownOpen(false)}
 >
 <TouchableWithoutFeedback onPress={() => setIsDropdownOpen(false)}>
 <View className="flex-1 bg-black/40 justify-center items-center px-6">
 <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
 <View className="bg-white rounded-3xl border border-slate-100 p-5 w-full max-w-sm z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8}}>
 
 {/* Header Dropdown */}
 <View className="flex-row justify-between items-center mb-3">
 <Text className="text-xxs font-semibold text-slate-450">CHUYỂN CHI NHÁNH</Text>
 <View className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
 <Text className="text-micro text-slate-500 font-medium">{branchList.length}/{branchList.length}</Text>
 </View>
 </View>

 {/* Danh sách shops - Loại bỏ chữ cái đại diện, đổi bằng storefront icon */}
 <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
 {branchList.map((branch) => {
 const isSelected = branch.id === activeBranchId;
 return (
 <TouchableOpacity
 key={branch.id}
 activeOpacity={0.8}
 className="p-3 my-1 rounded-xl flex-row justify-between items-center border"
 style={{
    borderColor: isSelected ? '#fed7aa' : '#f1f5f9',
  }}
 onPress={() => handleBranchSelect(branch)}
 >
 <View className="flex-row items-center flex-1 mr-2">
 <View className={`w-7 h-7 rounded-lg items-center justify-center mr-3 border ${
 isSelected 
 ? 'bg-orange-500/10 border-orange-500/20' 
 : 'bg-slate-50 border-slate-200'
}`}>
 <Ionicons name="storefront-outline" size={13} color={isSelected ? '#fa5908' : '#64748b'} />
 </View>
 
 <View className="flex-1">
 <Text className={`text-xs font-semibold ${isSelected ? 'text-orange-500' : 'text-slate-800'}`}>
 {branch.name}
 </Text>
 <Text className="text-xxs text-slate-450 font-medium mt-0.5">
 {branch.address}
 </Text>
 </View>
 </View>

 {isSelected && (
 <Ionicons name="checkmark" size={16} color="#fa5908" />
 )}
 </TouchableOpacity>
 );
})}
 </ScrollView>

 </View>
 </TouchableWithoutFeedback>
 </View>
 </TouchableWithoutFeedback>
 </Modal>

 {/* DROPDOWN MENU THÔNG BÁO THẢ XUỐNG - Kết nối NotificationContext thực tế */}
 <Modal
 visible={isNotificationOpen}
 transparent={true}
 animationType="fade"
 onRequestClose={() => setIsNotificationOpen(false)}
 >
 <TouchableWithoutFeedback onPress={() => setIsNotificationOpen(false)}>
 <View className="flex-1 bg-black/10" style={{paddingTop: insets.top + 52}}>
 <View className="px-4 items-end">

 {/* Mũi tên chỉ lên bell icon — visual connector */}
 <View style={{marginRight: 14, marginBottom: -1, zIndex: 60}}>
 <View style={{width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#e2e8f0'}} />
 <View style={{width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#ffffff', position: 'absolute', top: 1.5, left: 1}} />
 </View>

 <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
 <View className="bg-white rounded-2xl border border-slate-200 p-4 w-full max-w-sm z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
 
 {/* Header */}
 <View className="flex-row justify-between items-center mb-3">
 <View>
 <Text className="text-tiny font-semibold text-slate-450">THÔNG BÁO</Text>
 {unreadCount > 0 && (
 <Text className="text-xxs text-orange-500 font-medium mt-0.5">Bạn có {unreadCount} tin chưa đọc</Text>
 )}
 </View>
 
 {unreadCount > 0 && (
 <TouchableOpacity 
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 markAllAsRead();
}}
 className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg active:bg-slate-100"
 >
 <Text className="text-[7.5px] text-slate-500 font-semibold">ĐỌC TẤT CẢ</Text>
 </TouchableOpacity>
 )}
 </View>

 {/* Filter Tabs */}
  <View className="flex-row bg-slate-50 p-0.5 rounded-xl border border-slate-100 mb-3 gap-1">
  {[
  {key: 'all', label: 'Tất cả'},
  {key: 'qr', label: 'Yêu cầu QR'},
  {key: 'other', label: 'Cảnh báo'}
  ].map(tab => {
  const isActive = activeNotificationTab === tab.key;
  return (
  <TouchableOpacity
  key={tab.key}
  onPress={() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setActiveNotificationTab(tab.key as any);
 }}
  className="flex-1 py-1.5 items-center justify-center rounded-lg"
  style={isActive ? {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
      },
      android: {
        elevation: 1,
      },
    }),
  } : {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  }}
  >
  <Text className={`text-xxs font-semibold ${isActive ? 'text-orange-500' : 'text-slate-500'}`}>
  {tab.label}
  </Text>
  </TouchableOpacity>
  );
 })}
  </View>

 {/* Notification List */}
 <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
 {notifications
 .filter(n => {
 if (activeNotificationTab === 'qr') return n.type === 'qr_order' || n.type === 'qr_session';
 if (activeNotificationTab === 'other') return n.type !== 'qr_order' && n.type !== 'qr_session';
 return true;
})
 .map(n => {
 const isUnread = n.status === 'unread';
 
 // Map colors & icons theo type
 let iconName = 'notifications-outline';
 let iconBg = 'bg-blue-50';
 let iconColor = '#3b82f6';
 
 if (n.type === 'qr_order') {
 iconName = 'restaurant-outline';
 iconBg = 'bg-orange-50';
 iconColor = '#fa5908';
} else if (n.type === 'qr_session') {
 iconName = 'enter-outline';
 iconBg = 'bg-emerald-50';
 iconColor = '#10b981';
} else if (n.type === 'low_stock') {
 iconName = 'warning-outline';
 iconBg = 'bg-amber-50';
 iconColor = '#f59e0b';
} else if (n.type === 'system' || n.type === 'system_broadcast') {
 iconName = 'cube-outline';
 iconBg = 'bg-indigo-50';
 iconColor = '#6366f1';
} else if (n.type === 'payment') {
 iconName = 'card-outline';
 iconBg = 'bg-green-50';
 iconColor = '#22c55e';
} else if (n.type === 'order_expiring') {
 iconName = 'time-outline';
 iconBg = 'bg-red-50';
 iconColor = '#ef4444';
} else if (n.type === 'debt_alert') {
 iconName = 'alert-circle-outline';
 iconBg = 'bg-rose-50';
 iconColor = '#f43f5e';
} else if (n.type === 'return_approval' || n.type === 'purchase_approval') {
 iconName = 'checkmark-circle-outline';
 iconBg = 'bg-violet-50';
 iconColor = '#8b5cf6';
} else if (n.type === 'booking') {
 iconName = 'calendar-outline';
 iconBg = 'bg-cyan-50';
 iconColor = '#06b6d4';
}

 return (
 <TouchableOpacity
 key={n.id}
 activeOpacity={0.8}
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 markAsRead(n.id);
}}
 className={`p-3 my-1 rounded-xl flex-row items-start border ${
 isUnread 
 ? ' border-orange-100' 
 : ' border-slate-100'
}`}
 >
 <View className="flex-row items-center mr-2.5 mt-0.5">
 {isUnread && (
 <View className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-1.5" />
 )}
 <View className={`${iconBg} w-7 h-7 rounded-lg items-center justify-center`}>
 <Ionicons name={iconName as any} size={12} color={iconColor} />
 </View>
 </View>

 <View className="flex-1">
 <View className="flex-row justify-between items-center">
 <Text className={`text-tiny font-semibold ${isUnread ? 'text-slate-800' : 'text-slate-500'}`} style={{flex: 1, marginRight: 8}}>
 {n.title}
 </Text>
 <Text className="text-[7.5px] text-slate-400 font-medium">
 {new Date(n.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}
 </Text>
 </View>
 <Text className={`text-xxs mt-0.5 font-medium ${isUnread ? 'text-slate-660' : 'text-slate-450'}`} numberOfLines={2}>
 {n.description}
 </Text>
 </View>
 </TouchableOpacity>
 );
})}
 
 {notifications.filter(n => {
 if (activeNotificationTab === 'qr') return n.type === 'qr_order' || n.type === 'qr_session';
 if (activeNotificationTab === 'other') return n.type !== 'qr_order' && n.type !== 'qr_session';
 return true;
}).length === 0 && (
 <View className="py-8 items-center justify-center">
 <Ionicons name="notifications-off-outline" size={24} color="#cbd5e1" />
 <Text className="text-tiny text-slate-400 font-semibold mt-2">Hộp thư thông báo trống</Text>
 </View>
 )}
 </ScrollView>

 </View>
 </TouchableWithoutFeedback>
 </View>
 </View>
 </TouchableWithoutFeedback>
 </Modal>

 {/* Dialog Confirm chuyển đổi chi nhánh */}
 <Dialog
 visible={isSwitchConfirmVisible}
 onClose={() => {
 setIsSwitchConfirmVisible(false);
 setSelectedBranchToSwitch(null);
}}
 onConfirm={handleConfirmSwitchBranch}
 loading={isSwitchingLoading}
 title="Chuyển đổi chi nhánh?"
 description={selectedBranchToSwitch ? `Bạn có chắc chắn muốn chuyển sang làm việc tại "${selectedBranchToSwitch.name}"?\nHệ thống sẽ kết thúc ca cũ và tự động tải lại dữ liệu hệ thống mới đầu ca.` : ''}
 confirmLabel="Đồng ý chuyển"
 cancelLabel="Hủy"
 variant="default"
 />

 </View>
 );
}
