import React, {useEffect, useState} from 'react';
import {Text, View, TouchableOpacity, Platform, Modal, ScrollView, TouchableWithoutFeedback, DeviceEventEmitter, Animated} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getApiBaseUrl, getApiHeaders, loadApiBaseUrl} from '../../lib/api/config';
import {SyncManager} from '../../lib/sync/SyncManager';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import * as Haptics from 'expo-haptics';
import {KeepAliveManager} from '../../lib/sync/KeepAliveManager';
import {eq, and, or, like} from 'drizzle-orm';
import {ActivityIndicator, Modal as RNModal} from 'react-native';

// UI components
import {SyncDotButton} from '../erp/SyncDotButton';
import {QRLoginModal} from '../erp/QRLoginModal';
import {Dialog} from '../ui/Dialog';
import {useNotifications} from '../../lib/notifications/NotificationContext';

export interface HeaderProps {
 onPressMenu?: () => void;
 onPressBack?: () => void;
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
  onPressBack,
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

  // States hiển thị chi tiết đồng bộ cục bộ
  const [isSyncModalVisible, setIsSyncModalVisible] = useState(false);
  const [syncCounts, setSyncCounts] = useState({
    orders: 0,
    cashbook: 0,
    shifts: 0,
    movements: 0,
    categories: 0,
    products: 0
  });

  // Toast states
  const [toastMsg, setToastMsg] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({message, type});
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
      type === 'error' ? Haptics.NotificationFeedbackType.Error :
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    
    Animated.sequence([
      Animated.timing(toastOpacity, {toValue: 1, duration: 250, useNativeDriver: true}),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {toValue: 0, duration: 250, useNativeDriver: true})
    ]).start(() => setToastMsg(null));
  };

  const renderToast = () => {
    if (!toastMsg) return null;
    return (
      <Animated.View 
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 60 : 30,
          left: 20,
          right: 20,
          zIndex: 999999,
          opacity: toastOpacity,
          transform: [
            {
              translateY: toastOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })
            }
          ],
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 4},
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 999
        }}
        className={`flex-row items-center px-4 py-3.5 rounded-2xl border ${
          toastMsg.type === 'success' ? 'bg-emerald-500 border-emerald-600' :
          toastMsg.type === 'error' ? 'bg-rose-500 border-rose-600' :
          'bg-blue-600 border-blue-700'
        }`}
      >
        <Ionicons 
          name={
            toastMsg.type === 'success' ? 'checkmark-circle' :
            toastMsg.type === 'error' ? 'alert-circle' :
            'information-circle'
          } 
          size={18} 
          color="white" 
        />
        <Text className="flex-1 ml-2.5 text-white font-medium text-xs">
          {toastMsg.message}
        </Text>
      </Animated.View>
    );
  };

  const loadSyncCounts = async () => {
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      if (!shopId) return;

      const pOrders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.sync_status, 'pending'),
          like(schema.orders.shift_id, `shift-${shopId}-%`)
        ));

      const pCashbook = await db
        .select({ id: schema.cashbook.id })
        .from(schema.cashbook)
        .where(and(
          or(
            eq(schema.cashbook.sync_status, 'pending'),
            eq(schema.cashbook.sync_status, 'failed')
          ),
          eq(schema.cashbook.branch_id, shopId)
        ));

      const pShifts = await db
        .select({ id: schema.shop_shifts.id })
        .from(schema.shop_shifts)
        .where(and(
          eq(schema.shop_shifts.sync_status, 'pending'),
          like(schema.shop_shifts.id, `shift-${shopId}-%`)
        ));

      const pMovements = await db
        .select({ id: schema.stockMovements.id })
        .from(schema.stockMovements)
        .where(and(
          eq(schema.stockMovements.sync_status, 'pending'),
          eq(schema.stockMovements.branch_id, shopId)
        ));

      const pCategories = await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.sync_status, 'pending'));

      const pProducts = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(eq(schema.products.sync_status, 'pending'));

      setSyncCounts({
        orders: pOrders.length,
        cashbook: pCashbook.length,
        shifts: pShifts.length,
        movements: pMovements.length,
        categories: pCategories.length,
        products: pProducts.length
      });
    } catch (e) {
      console.warn('Lỗi tải số liệu đồng bộ trong Header:', e);
    }
  };

 // States chọn chi nhánh dropdown
 const [isDropdownOpen, setIsDropdownOpen] = useState(false);
 const [isSwitchConfirmVisible, setIsSwitchConfirmVisible] = useState(false);
 const [selectedBranchToSwitch, setSelectedBranchToSwitch] = useState<any>(null);
 const [isSwitchingLoading, setIsSwitchingLoading] = useState(false);

 // States thông báo — kết nối với NotificationContext thực tế thay vì mock data
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

  // 2. Thiết lập ca làm việc di động cho chi nhánh mới
  let isShiftEnabled = false;
  let activeShiftId = null;

  const currentUrl = await loadApiBaseUrl();
  const headers = await getApiHeaders();
  const userEmail = (await AsyncStorage.getItem('saved_email')) || '';

  // A. Kiểm tra cài đặt quản lý ca kíp
  try {
    const settingsRes = await fetch(`${currentUrl}/api/shops/${newShopId}/settings`, { headers });
    if (settingsRes.ok) {
      const settingsJson = await settingsRes.json();
      isShiftEnabled = settingsJson.enable_shift_management ?? false;
      await AsyncStorage.setItem(`cached_enable_shift_management_${newShopId}`, isShiftEnabled ? 'true' : 'false');
    } else {
      const cached = await AsyncStorage.getItem(`cached_enable_shift_management_${newShopId}`);
      if (cached) isShiftEnabled = cached === 'true';
    }
  } catch (err) {
    const cached = await AsyncStorage.getItem(`cached_enable_shift_management_${newShopId}`);
    if (cached) isShiftEnabled = cached === 'true';
  }
  await AsyncStorage.setItem('enable_shift_management', isShiftEnabled ? 'true' : 'false');

  if (isShiftEnabled) {
    let activeShiftOnServer = null;
    // B. Kiểm tra ca kíp đang mở trên server
    try {
      const shiftsRes = await fetch(`${currentUrl}/api/shops/${newShopId}/shifts?status=open&branch_id=${newShopId}&user_id=${userEmail}`, { headers });
      if (shiftsRes.ok) {
        const shiftsJson = await shiftsRes.json();
        if (shiftsJson.total > 0 && shiftsJson.data && shiftsJson.data.length > 0) {
          activeShiftOnServer = shiftsJson.data[0];
        }
      }
    } catch (err) {
      console.warn('Lỗi kiểm tra ca mở trên server khi chuyển chi nhánh:', err);
    }

    if (activeShiftOnServer) {
      // Dùng ca kíp có sẵn trên server
      activeShiftId = activeShiftOnServer.id;
      const loggedUserName = await AsyncStorage.getItem('user_name');
      await db.insert(schema.shop_shifts).values({
        id: activeShiftOnServer.id,
        opened_at: activeShiftOnServer.opened_at,
        status: 'open',
        opening_cash: parseFloat(activeShiftOnServer.opening_cash || '0'),
        actual_closing_cash: 0,
        employee_name: activeShiftOnServer.employee_name || loggedUserName || 'Nhân viên',
        sync_status: 'synced',
      }).onConflictDoNothing();
      console.log(`[Switch Branch] Đã đồng bộ ca mở từ server: ${activeShiftId}`);
    } else {
      // Không có ca kíp trên server (hoặc lỗi offline) -> Check xem SQLite có ca nào đang mở không
      const localOpenShifts = await db.select()
        .from(schema.shop_shifts)
        .where(eq(schema.shop_shifts.status, 'open'));
      
      if (localOpenShifts.length > 0) {
        activeShiftId = localOpenShifts[0].id;
        console.log(`[Switch Branch] Sử dụng ca mở sẵn có trong SQLite: ${activeShiftId}`);
      }
    }
  }

  if (activeShiftId) {
    await AsyncStorage.setItem('active_shift_id', activeShiftId);
  } else {
    await AsyncStorage.removeItem('active_shift_id');
  }
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

  const [isHeaderSyncing, setIsHeaderSyncing] = useState(false);
  const [isQRScannerVisible, setIsQRScannerVisible] = useState(false);

  const handleSyncPress = async () => {
    if (onPressSync) {
      onPressSync();
      return;
    }
    if (isHeaderSyncing) return;
    
    await loadSyncCounts();
    setIsSyncModalVisible(true);
  };

  const handleQRLoginSuccess = (host: string) => {
    showToast(`Đã đăng nhập thành công cho ${host}`, 'success');
  };

  const handleQRLoginError = () => {
    showToast('Không thể xác nhận đăng nhập web. Vui lòng thử lại!', 'error');
  };

  const handleLeftPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (showBack) {
      if (onPressBack) {
        onPressBack();
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.push('/(tabs)');
      }
    } else {
      onPressMenu?.();
    }
  };

 return (
 <View className="px-4 py-2.5 bg-white border-b border-slate-100 flex-row justify-between items-center relative z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
 
  {/* Nút Hamburger và Bộ Chọn Chi Nhánh Dropdown */}
  <View className="flex-row items-center flex-1 mr-4">
  {/* Nút Hamburger Left hoặc Quay lại */}
  <TouchableOpacity 
  activeOpacity={0.7}
  onPress={handleLeftPress}
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

  {/* Sync + QR Login + Chuông thông báo Right */}
  <View className="flex-row items-center gap-2">

  {/* Sync status dot button */}
  <SyncDotButton
    shopId={activeBranchId}
    forceStatus={syncStatus}
    onPress={handleSyncPress}
    isSyncing={isSyncing || isHeaderSyncing}
    pendingCount={pendingCount}
  />

  {/* QR Login button */}
  <TouchableOpacity
    activeOpacity={0.7}
    style={{
      padding: 7,
      backgroundColor: '#f8fafc',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIsQRScannerVisible(true);
    }}
    accessibilityLabel="Quét mã QR đăng nhập web"
  >
    <Ionicons name="qr-code-outline" size={22} color="#64748b" />
  </TouchableOpacity>

  {/* Chuông thông báo — dot đỏ nằm bên ngoài button */}
  <View style={{ position: 'relative' }}>
    <TouchableOpacity
      activeOpacity={0.7}
      style={{
        padding: 7,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push('/notifications');
      }}
    >
      <Ionicons name="notifications-outline" size={22} color="#64748b" />
    </TouchableOpacity>
    {unreadCount > 0 && (
      <View
        style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: '#ef4444',
          borderWidth: 1.5,
          borderColor: 'white',
          zIndex: 10,
        }}
      />
    )}
  </View>
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

 {/* Modal Chi Tiết Đồng Bộ Cục Bộ */}
  <RNModal
    visible={isSyncModalVisible}
    transparent={true}
    animationType="fade"
    onRequestClose={() => setIsSyncModalVisible(false)}
  >
    <View className="flex-1 justify-center items-center px-6">
      <TouchableWithoutFeedback onPress={() => setIsSyncModalVisible(false)}>
        <View className="absolute inset-0 bg-black/60" />
      </TouchableWithoutFeedback>
      <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 max-h-[80%] relative z-50">
        <View className="items-center mb-4">
          <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
            <Ionicons name="sync-outline" size={24} color="#fa5908" />
          </View>
          <Text className="text-base font-bold text-slate-800 text-center">Đồng bộ dữ liệu cục bộ</Text>
          <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
            Các mục dữ liệu được lưu tạm cục bộ trên máy và chờ đẩy lên máy chủ ERP.
          </Text>
        </View>

        {/* Bảng chi tiết các bảng */}
        <View className="bg-slate-50 p-4 rounded-2xl border mb-5" style={{ borderColor: '#f1f5f9' }}>
          <View className="flex-row justify-between items-center py-2">
            <View className="flex-row items-center">
              <Ionicons name="cart-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Đơn hàng chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.orders > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.orders}
            </Text>
          </View>

          <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
            <View className="flex-row items-center">
              <Ionicons name="wallet-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Phiếu thu/chi chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.cashbook > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.cashbook}
            </Text>
          </View>

          <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
            <View className="flex-row items-center">
              <Ionicons name="lock-closed-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Ca làm việc chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.shifts > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.shifts}
            </Text>
          </View>

          <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
            <View className="flex-row items-center">
              <Ionicons name="cube-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Phiếu kho chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.movements > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.movements}
            </Text>
          </View>

          <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
            <View className="flex-row items-center">
              <Ionicons name="folder-open-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Danh mục chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.categories > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.categories}
            </Text>
          </View>

          <View className="flex-row justify-between items-center py-2 border-t border-slate-200/50">
            <View className="flex-row items-center">
              <Ionicons name="pricetag-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
              <Text className="text-xxs text-slate-700 font-semibold">Sản phẩm chờ đồng bộ:</Text>
            </View>
            <Text className={`text-xs font-bold ${syncCounts.products > 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {syncCounts.products}
            </Text>
          </View>
        </View>

        {/* Nút bấm */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
            onPress={() => setIsSyncModalVisible(false)}
            disabled={isHeaderSyncing}
          >
            <Text className="text-slate-500 font-semibold text-xs">Đóng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
            onPress={async () => {
              setIsSyncModalVisible(false);
              setIsHeaderSyncing(true);
              try {
                const shopId = await AsyncStorage.getItem('active_shop_id');
                if (shopId) {
                  // Reset failed cashbook items to pending
                  await db.update(schema.cashbook)
                    .set({ sync_status: 'pending' })
                    .where(and(
                      eq(schema.cashbook.sync_status, 'failed'),
                      eq(schema.cashbook.branch_id, shopId)
                    ));
                  
                  // Clear retry counters
                  SyncManager.clearAllCashbookRetries();

                  await KeepAliveManager.triggerSyncIfNeeded(true);
                  showToast('Đồng bộ dữ liệu hoàn tất!', 'success');
                }
              } catch (err) {
                console.warn('Lỗi đồng bộ thủ công từ Header Modal:', err);
                showToast('Đồng bộ dữ liệu thất bại!', 'error');
              } finally {
                setIsHeaderSyncing(false);
              }
            }}
            disabled={isHeaderSyncing || (syncCounts.orders === 0 && syncCounts.cashbook === 0 && syncCounts.shifts === 0 && syncCounts.movements === 0 && syncCounts.categories === 0 && syncCounts.products === 0)}
            style={{ 
              backgroundColor: '#fa5908',
              opacity: (syncCounts.orders === 0 && syncCounts.cashbook === 0 && syncCounts.shifts === 0 && syncCounts.movements === 0 && syncCounts.categories === 0 && syncCounts.products === 0) ? 0.5 : 1
            }}
          >
            {isHeaderSyncing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-xs">Đồng bộ ngay</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
   </RNModal>

   {/* QR Login Scanner Modal */}
   <QRLoginModal
     visible={isQRScannerVisible}
     onClose={() => setIsQRScannerVisible(false)}
     onSuccess={handleQRLoginSuccess}
     onError={handleQRLoginError}
   />

   {renderToast()}
 </View>
  );
 }
