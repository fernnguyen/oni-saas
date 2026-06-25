import React, {useState, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator, Pressable, Linking} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, router} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db, switchDatabaseScope} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {supabase} from '../../lib/supabase';
import * as Haptics from 'expo-haptics';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import {formatCurrency} from '../../lib/utils/format';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';


// Import các UI dùng chung
import {Header} from '../../components/layout/Header';
import {Switch} from '../../components/ui/Switch';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Badge} from '../../components/ui/Badge';
import {DrawerMenu} from '../../components/erp/DrawerMenu';

export default function SettingsScreen() {

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
 const [mobileShiftEnabled, setMobileShiftEnabled] = useState(false);
 const [biometricsEnabled, setBiometricsEnabled] = useState(false);
 const [showBiometricPasswordModal, setShowBiometricPasswordModal] = useState(false);
 const [biometricPassword, setBiometricPassword] = useState('');
 const [isVerifyingBiometricPass, setIsVerifyingBiometricPass] = useState(false);
 const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
 const [isShiftOpen, setIsShiftOpen] = useState(false);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);

 // 0. Thông tin tài khoản
 const [userName, setUserName] = useState('Nhân viên thu ngân');
 const [userEmail, setUserEmail] = useState('offline-sales@oni.vn');
 const [userRoleName, setUserRoleName] = useState('Nhân viên');

 // Trạng thái Dialog phản hồi xác nhận
 const [isPrintTestSuccessVisible, setIsPrintTestSuccessVisible] = useState(false);
 const [isSyncSuccessVisible, setIsSyncSuccessVisible] = useState(false);
 const [isSyncErrorVisible, setIsSyncErrorVisible] = useState(false);
 const [isDeltaSyncSuccessVisible, setIsDeltaSyncSuccessVisible] = useState(false);
 const [deltaSyncResult, setDeltaSyncResult] = useState({success: 0, failed: 0});

 // States chốt ca làm việc
 const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
 const [logoutAfterClose, setLogoutAfterClose] = useState(false);
 const [actualClosingCashInput, setActualClosingCashInput] = useState('0');
 const [closingShiftNote, setClosingShiftNote] = useState('');
 const [openingCashVal, setOpeningCashVal] = useState(0);
 const [expectedClosingCashVal, setExpectedClosingCashVal] = useState(0);
 const [isClosingShift, setIsClosingShift] = useState(false);

 // Tải thống kê
 const loadSettingsData = async () => {
 try {
 const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Cơ sở chính';
 setBranchName(activeShopName);

 // Lấy thông tin người dùng từ Supabase hoặc AsyncStorage
 try {
   const { data: { user } } = await supabase.auth.getUser();
   if (user) {
     setUserEmail(user.email || '');
     setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Nhân viên thu ngân');
   } else {
     const savedEmail = await AsyncStorage.getItem('saved_email');
     if (savedEmail) {
       setUserEmail(savedEmail);
       setUserName(savedEmail.split('@')[0]);
     }
   }
 } catch (e) {
   console.warn('Lỗi lấy thông tin user từ Supabase, thử fallback:', e);
   const savedEmail = await AsyncStorage.getItem('saved_email');
   if (savedEmail) {
     setUserEmail(savedEmail);
     setUserName(savedEmail.split('@')[0]);
   }
 }

  const savedRole = await AsyncStorage.getItem('active_user_role_name') || 'Nhân viên';
  setUserRoleName(savedRole);

  const isShiftEnabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
  setMobileShiftEnabled(isShiftEnabled);

  const activeShiftId = await AsyncStorage.getItem('active_shift_id');
  setIsShiftOpen(!!activeShiftId);

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

  // Lấy cấu hình sinh trắc học
  try {
    const secureStoreAvailable = await SecureStore.isAvailableAsync();
    if (secureStoreAvailable) {
       const savedBiometricCreds = await SecureStore.getItemAsync('biometric_credentials');
       const isEnrolled = await LocalAuthentication.isEnrolledAsync();
       // Switch is ON only if credentials exist AND biometrics are enrolled/permitted in OS
       setBiometricsEnabled(!!savedBiometricCreds && isEnrolled);
    }
  } catch (e) {
    console.warn('Lỗi lấy thông tin sinh trắc học:', e);
  }
} catch (err) {
 console.error('Lỗi khi tải số liệu cài đặt SQLite:', err);
}
};

  const handleToggleMobileShift = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMobileShiftEnabled(val);
    await AsyncStorage.setItem('enable_shift_management', val ? 'true' : 'false');
    if (!val) {
      await AsyncStorage.removeItem('active_shift_id');
      Alert.alert('Quản lý ca', 'Đã tắt chế độ Quản lý ca POS.');
    } else {
      Alert.alert(
        'Đã bật Quản lý ca',
        'Hệ thống di động sẽ bắt đầu yêu cầu mở ca và bàn giao két khi bạn thanh toán tại POS hoặc khi đăng nhập lại.'
      );
    }
  };
  // 4. Cài đặt Sinh trắc học
  const handleToggleBiometrics = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    if (!val) {
      // Tắt sinh trắc học
      try {
        const secureStoreAvailable = await SecureStore.isAvailableAsync();
        if (secureStoreAvailable) {
          await SecureStore.deleteItemAsync('biometric_credentials');
        }
        await AsyncStorage.setItem('biometrics_declined', 'true');
        setBiometricsEnabled(false);
        Alert.alert('Sinh trắc học', 'Đã tắt đăng nhập bằng sinh trắc học và xóa dữ liệu đã lưu.');
      } catch (err) {
        Alert.alert('Lỗi', 'Không thể tắt sinh trắc học.');
      }
    } else {
      // Bật sinh trắc học — use refresh_token from current session
      try {
        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasPhysicalHardware = supportedTypes && supportedTypes.length > 0;
        if (!hasPhysicalHardware) {
          Alert.alert('Không khả dụng', 'Thiết bị của bạn không hỗ trợ tính năng bảo mật sinh trắc học.');
          return;
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          Alert.alert(
            'Quyền sinh trắc học',
            'Thiết bị chưa đăng ký Face ID/Vân tay hoặc quyền truy cập Face ID đã bị từ chối cho ứng dụng này. Vui lòng cho phép quyền truy cập hoặc đăng ký thiết lập sinh trắc học trong Cài đặt hệ thống.',
            [
              { text: 'Hủy', style: 'cancel' },
              { 
                text: 'Mở Cài đặt', 
                onPress: async () => {
                  try {
                    await AsyncStorage.setItem('pending_restore_path', '/(tabs)/settings');
                    await Linking.openSettings();
                  } catch (e) {
                    Alert.alert('Lỗi', 'Không thể mở Cài đặt hệ thống.');
                  }
                } 
              }
            ]
          );
          return;
        }

        setIsEnablingBiometric(true);

        // Get current session refresh_token
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.refresh_token) {
          Alert.alert('Lỗi', 'Không tìm thấy phiên đăng nhập hiện tại. Vui lòng đăng nhập lại.');
          setIsEnablingBiometric(false);
          return;
        }

        // Authenticate with biometrics
        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Xác thực sinh trắc học để liên kết thiết bị',
          disableDeviceFallback: true,
        });

        if (authResult.success) {
          const tenantCode = await AsyncStorage.getItem('active_tenant_code') || 'default';
          let emailToStore = userEmail;
          if (!emailToStore) {
            emailToStore = await AsyncStorage.getItem('saved_email') || '';
          }
          const secureStoreAvailable = await SecureStore.isAvailableAsync();
          if (secureStoreAvailable) {
            await SecureStore.setItemAsync(
              'biometric_credentials',
              JSON.stringify({ tenant: tenantCode, email: emailToStore, refresh_token: sessionData.session.refresh_token })
            );
          }
          await AsyncStorage.removeItem('biometrics_declined');
          setBiometricsEnabled(true);
          Alert.alert('Thành công', 'Đã bật đăng nhập bằng sinh trắc học (Face ID/Vân tay) thành công!');
        } else {
          Alert.alert('Thất bại', 'Xác thực vân tay/Face ID không thành công.');
        }

        setIsEnablingBiometric(false);
      } catch (err) {
        console.error('Lỗi khi bật sinh trắc học:', err);
        Alert.alert('Lỗi', 'Không thể khởi động cài đặt sinh trắc học.');
        setIsEnablingBiometric(false);
      }
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
        setIsLogoutModalOpen(true);
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
      console.error('Lỗi khi tính toán chốt ca:', err);
      setIsLogoutModalOpen(true);
    }
  };

  // Xác nhận đóng ca và kết ca hoàn chỉnh
  // Đăng xuất không đóng ca (Chỉ Thoát)
  const handleLogoutOnly = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      setIsLogoutModalOpen(false);
      
      // Xóa các session lưu trữ
      await AsyncStorage.removeItem('active_shift_id');
      await AsyncStorage.removeItem('active_shop_id');
      await AsyncStorage.removeItem('active_shop_name');
      await AsyncStorage.removeItem('active_tenant_id');
      await AsyncStorage.removeItem('temp_cart');
      await AsyncStorage.removeItem('temp_discount');
      await AsyncStorage.removeItem('temp_note');
      await AsyncStorage.removeItem('temp_customer');

      // Clear biometric credentials and cached role/permission data on logout
      try {
        const secureStoreAvailable = await SecureStore.isAvailableAsync();
        if (secureStoreAvailable) {
          await SecureStore.deleteItemAsync('biometric_credentials');
        }
      } catch (e) {}
      await AsyncStorage.removeItem('active_user_permissions');
      await AsyncStorage.removeItem('active_user_role_code');
      await AsyncStorage.removeItem('active_user_role_name');
      await AsyncStorage.removeItem('active_shop_industry');

      switchDatabaseScope(null);
      await supabase.auth.signOut();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/(auth)/login');
    } catch (err: any) {
      console.error('Lỗi khi đăng xuất:', err);
    }
  };

  // Đóng ca & Đăng xuất (Đóng ca và thoát)
  const handleCloseShiftAndLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      setIsLogoutModalOpen(false);
      const shopId = await AsyncStorage.getItem('active_shop_id');
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      const nowStr = new Date().toISOString();

      if (activeShiftId && Platform.OS !== 'web') {
        // Cập nhật SQLite
        await db
          .update(schema.shop_shifts)
          .set({
            closed_at: nowStr,
            status: 'closed',
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
              }),
            });
          } catch (err) {
            console.warn('Lỗi đồng bộ đóng ca lên server:', err);
          }
        }
      }

      if (shopId && Platform.OS !== 'web') {
        try {
          await SyncManager.pushOfflineShifts(shopId);
          await SyncManager.pushOfflineOrders(shopId);
        } catch (syncErr) {
          console.warn('Lỗi push offline chốt ca:', syncErr);
        }
      }

      // Xóa session
      await AsyncStorage.removeItem('active_shift_id');
      await AsyncStorage.removeItem('active_shop_id');
      await AsyncStorage.removeItem('active_shop_name');
      await AsyncStorage.removeItem('active_tenant_id');
      await AsyncStorage.removeItem('temp_cart');
      await AsyncStorage.removeItem('temp_discount');
      await AsyncStorage.removeItem('temp_note');
      await AsyncStorage.removeItem('temp_customer');

      // Clear biometric credentials and cached role/permission data on logout
      try {
        const secureStoreAvailable = await SecureStore.isAvailableAsync();
        if (secureStoreAvailable) {
          await SecureStore.deleteItemAsync('biometric_credentials');
        }
      } catch (e) {}
      await AsyncStorage.removeItem('active_user_permissions');
      await AsyncStorage.removeItem('active_user_role_code');
      await AsyncStorage.removeItem('active_user_role_name');
      await AsyncStorage.removeItem('active_shop_industry');

      switchDatabaseScope(null);
      await supabase.auth.signOut();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/(auth)/login');
    } catch (err: any) {
      console.error('Lỗi khi đóng ca & đăng xuất:', err);
    }
  };

  // Xác nhận đóng ca làm việc và GIỮ phiên đăng nhập (Chốt ca -> quay lại màn hình chọn chi nhánh)
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
            console.warn('Lỗi đồng bộ đóng ca lên server:', err);
          }
        }
      }

      // Đẩy offline
      if (shopId && Platform.OS !== 'web') {
        try {
          await SyncManager.pushOfflineShifts(shopId);
          await SyncManager.pushOfflineOrders(shopId);
        } catch (syncErr) {
          console.warn('Lỗi push offline chốt ca:', syncErr);
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
      Alert.alert('Đã kết ca', 'Đã đóng ca làm việc thành công.');
      // Load lại cấu hình settings
      await loadSettingsData();
      
      if (logoutAfterClose) {
        // Đăng xuất hoàn toàn
        await AsyncStorage.removeItem('active_shop_id');
        await AsyncStorage.removeItem('active_shop_name');
        await AsyncStorage.removeItem('active_tenant_id');
        switchDatabaseScope(null);
        await supabase.auth.signOut();
        router.replace('/(auth)/login');
      } else {
        // Quay về chọn chi nhánh để có thể mở ca mới
        router.replace('/(auth)/select-branch');
      }
    } catch (err: any) {
      console.error('Lỗi khi đóng ca:', err);
      Alert.alert('Lỗi', `Không thể đóng ca: ${err.message || err}`);
    } finally {
      setIsClosingShift(false);
    }
  };

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
  <Header onPressMenu={() => setIsDrawerOpen(true)} />

 <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
 
 {/* 2. THÔNG TIN THU NGÂN & CHI NHÁNH - Giảm góc bo về rounded-2xl */}
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 <View className="flex-row items-center justify-between">
 <View className="flex-row items-center">
 <View className="bg-orange-50 p-3 rounded-xl mr-3 border border-orange-100">
 <Ionicons name="person-outline" size={18} color="#fa5908" />
 </View>
  <View>
  <Text className="font-semibold text-xs text-slate-800">
  {userName}
  </Text>
  <Text className="text-[10px] text-slate-500 font-semibold mt-0.5">
  Vai trò: {userRoleName}
  </Text>
  <Text className="text-xxs text-slate-400 mt-0.5">
  {userEmail}
  </Text>
  </View>
 </View>
 
 {mobileShiftEnabled && isShiftOpen && (
    <Badge variant="primary" label="ON-SHIFT" size="sm" showDot={true} />
  )}
 </View>

  <View className="border-t border-slate-100 my-4 pt-4 flex-row justify-between items-center">
  <View className="flex-1 mr-2">
  <Text className="text-xxs text-slate-400 font-medium">Chi nhánh hoạt động</Text>
  <Text className="text-xs font-semibold mt-0.5 text-slate-700">
  {branchName}
  </Text>
  </View>
  
  <View className="flex-row gap-2">
  <Button
  variant="outline"
  size="sm"
  title="Đăng xuất"
  onPress={() => setIsLogoutModalOpen(true)}
  className="rounded-xl px-3 py-2"
  />
  {mobileShiftEnabled && isShiftOpen && (
     <Button
     variant="danger"
     size="sm"
     title="Đóng ca"
     onPress={() => {
       setLogoutAfterClose(false);
       handleTriggerCloseShift();
     }}
     className="rounded-xl px-3 py-2"
     />
   )}
  </View>
  </View>
 </View>

 {/* 3. CÀI ĐẶT MÁY IN NHIỆT K80 - Giảm bo về rounded-2xl */}
  <Text className="text-xxs font-semibold text-slate-500 mb-3 px-1">
  Cấu hình máy in hóa đơn (K80 / K57)
  </Text>
  <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
  {/* Kết nối tabs */}
  <View className="flex-row bg-slate-50 p-1 rounded-xl mb-4 border border-slate-200">
  <TouchableOpacity 
  activeOpacity={0.7}
  className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
  style={printerConnType === 'bluetooth' ? {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  } : undefined}
  onPress={() => setPrinterConnType('bluetooth')}
  >
  <Ionicons name="bluetooth" size={13} color={printerConnType === 'bluetooth' ? '#fa5908' : '#94a3b8'} />
  <Text className={`text-xxs font-semibold ml-1.5 ${
  printerConnType === 'bluetooth' ? 'text-slate-800' : 'text-slate-400'
 }`}>
  Bluetooth (BLE)
  </Text>
  </TouchableOpacity>
  
  <TouchableOpacity 
  activeOpacity={0.7}
  className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
  style={printerConnType === 'lan' ? {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  } : undefined}
  onPress={() => setPrinterConnType('lan')}
  >
  <Ionicons name="wifi" size={13} color={printerConnType === 'lan' ? '#fa5908' : '#94a3b8'} />
  <Text className={`text-xxs font-semibold ml-1.5 ${
  printerConnType === 'lan' ? 'text-slate-800' : 'text-slate-400'
 }`}>
  LAN / Wifi (IP)
  </Text>
  </TouchableOpacity>
  </View>

  {/* Form cấu hình */}
  {printerConnType === 'bluetooth' ? (
  <View className="mb-4">
  <Text className="text-xxs text-slate-500 font-semibold mb-2">Chọn thiết bị Bluetooth</Text>
  <View className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80">
  <View className="flex-row items-center">
  <Ionicons name="print-outline" size={16} color="#fa5908" />
  <Text className="text-xs font-semibold ml-2 text-slate-800">
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
  <Text className={`text-xxs font-semibold ${
  isPrinterConnected ? 'text-emerald-700' : 'text-white'
 }`}>
  {isPrinterConnected ? 'Đã kết nối' : 'Kết nối'}
  </Text>
  </TouchableOpacity>
  </View>
  </View>
  ) : (
  <View className="mb-4">
  <Text className="text-xxs text-slate-500 font-semibold mb-2">Thông tin địa chỉ IP máy in LAN</Text>
  <View className="flex-row justify-between items-center mb-3">
  <TextInput
  value={printerIp}
  onChangeText={setPrinterIp}
  placeholder="E.g. 192.168.1.200"
  placeholderTextColor="#94a3b8"
  className="flex-1 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mr-2"
  style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? {outlineStyle: 'none'} as any : {})
  }}
  />
  <TextInput
  value={printerPort}
  onChangeText={setPrinterPort}
  placeholder="9100"
  placeholderTextColor="#94a3b8"
  className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-center text-slate-850"
  style={{
    width: 70,
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? {outlineStyle: 'none'} as any : {})
  }}
  />
  </View>
  
  <View className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80">
  <View className="flex-row items-center">
  <Ionicons name="wifi-outline" size={16} color="#fa5908" />
  <Text className="text-xs font-semibold ml-2 text-slate-800">
  Máy in LAN ({printerIp}:{printerPort})
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
  <Text className={`text-xxs font-semibold ${
  isPrinterConnected ? 'text-emerald-700' : 'text-white'
 }`}>
  {isPrinterConnected ? 'Đã kết nối' : 'Kết nối'}
  </Text>
  </TouchableOpacity>
  </View>
  </View>
  )}

  {/* Nút in thử */}
  <Button
  variant="primary"
  title={isTestingPrint ? 'Đang in phiếu test...' : 'In hóa đơn test (K80)'}
  icon={<Ionicons name="document-text-outline" size={13} color="white" />}
  disabled={isTestingPrint}
  onPress={handlePrintTest}
  className="py-3.5 rounded-xl"
  />
  </View>

 {/* 4. ĐỒNG BỘ - Giảm bo về rounded-2xl */}
 <Text className="text-xxs font-semibold text-slate-500 mb-3 px-1">
 Chiến lược đồng bộ offline (Offline-First)
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
 
 <View className="mb-4">
 <View className="flex-row justify-between py-1.5 items-center border-b border-slate-100 pb-2">
 <Text className="text-xxs text-slate-500 font-semibold">Số liệu bộ nhớ máy:</Text>
 <Text className="text-xxs font-semibold text-[#fa5908]">
 {productCount} SP | {resourceCount} Bàn | {customerCount} KH
 </Text>
 </View>
 
 <View className="flex-row justify-between py-2 items-center border-b border-slate-100">
 <Text className="text-xxs text-slate-500 font-semibold">Full Sync gần nhất:</Text>
 <Text className="text-xxs font-medium text-slate-600">{lastFullSync}</Text>
 </View>
 <View className="flex-row justify-between py-2 items-center border-b border-slate-100">
 <Text className="text-xxs text-slate-500 font-semibold">Delta Sync gần nhất:</Text>
 <Text className="text-xxs font-medium text-slate-600">{lastDeltaSync}</Text>
 </View>

 <View className="mt-3.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
 <Text className="text-xxs font-medium text-slate-500 leading-relaxed text-center">
 💡 Trạng thái: {syncStatusText}
 </Text>
 </View>
 </View>

 {syncProgress !== null && (
 <View className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
 <View className="flex-row justify-between mb-1.5">
 <Text className="text-xxs font-semibold text-slate-700">Đang đồng bộ dữ liệu...</Text>
 <Text className="text-xxs text-orange-500 font-semibold">{syncProgress}%</Text>
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
 <Text className="text-xxs font-semibold text-slate-500 mb-3 px-1">
 Tùy chọn hệ thống
 </Text>
 <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-10">
 
 <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
 <View className="flex-1 mr-4">
 <Text className="font-medium text-slate-800">
 Tự động sync sau thanh toán
 </Text>
 <Text className="text-xxs text-slate-400 font-medium mt-0.5">Giảm thiểu tối đa độ trễ dữ liệu</Text>
 </View>
 <Switch
 value={autoSyncOnPrint}
 onValueChange={setAutoSyncOnPrint}
 />
 </View>

 <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
  <View className="flex-1 mr-4">
  <Text className="text-xs font-medium text-slate-800">
  Bắt buộc quản lý ca POS
  </Text>
  <Text className="text-xxs text-slate-400 font-medium mt-0.5">Yêu cầu mở ca và bàn giao két khi bán hàng</Text>
  </View>
  <Switch
  value={mobileShiftEnabled}
  onValueChange={handleToggleMobileShift}
  />
  </View>

  <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
 <View className="flex-1 mr-4">
 <Text className="text-xs font-medium text-slate-800">
 Phản hồi âm thanh (Beep!)
 </Text>
 <Text className="text-xxs text-slate-400 font-medium mt-0.5">Phát tiếng Beep khi quét barcode thành công</Text>
 </View>
 <Switch
 value={soundFeedback}
 onValueChange={setSoundFeedback}
 />
 </View>

  <View className="flex-row justify-between items-center py-3">
 <View className="flex-1 mr-4">
 <Text className="text-xs font-medium text-slate-800">
 Đăng nhập bằng Sinh trắc học
 </Text>
 <Text className="text-xxs text-slate-400 font-medium mt-0.5">Sử dụng Vân tay / Face ID để đăng nhập nhanh</Text>
 </View>
 <Switch
 value={biometricsEnabled}
 onValueChange={handleToggleBiometrics}
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
 description="Đồng bộ toàn phần tải dữ liệu từ Cloud hoàn tất 100%! Dữ liệu hệ thống đã được làm mới."
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
   onConfirm={(mobileShiftEnabled && isShiftOpen) ? () => {
     setIsLogoutModalOpen(false);
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

   {/* Modal Nhập Mật khẩu kích hoạt Sinh trắc học */}
   <Modal
     visible={showBiometricPasswordModal}
     animationType="fade"
     transparent={true}
     onRequestClose={() => setShowBiometricPasswordModal(false)}
   >
     <View className="flex-1 justify-center items-center px-6">
       <Pressable
         className="absolute inset-0 bg-black/60"
         onPress={() => setShowBiometricPasswordModal(false)}
       />
       <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-[340px]">
         <View className="items-center mb-4">
           <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
             <Ionicons name="finger-print" size={24} color="#fa5908" />
           </View>
           <Text className="text-base font-bold text-slate-800 text-center">Xác nhận mật khẩu</Text>
           <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
             Vui lòng nhập mật khẩu tài khoản của bạn để kích hoạt đăng nhập nhanh bằng sinh trắc học.
           </Text>
         </View>

         <TextInput
           value={biometricPassword}
           onChangeText={setBiometricPassword}
           placeholder="Mật khẩu tài khoản"
           placeholderTextColor="#cbd5e1"
           secureTextEntry={true}
           autoCapitalize="none"
           className="bg-slate-50 border rounded-xl px-4 py-3 text-xs text-slate-800 mb-6 text-center"
           style={{
             borderColor: '#cbd5e1',
             fontSize: 14,
             fontWeight: '500',
             ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
           }}
         />

         <View className="flex-row gap-3">
           <TouchableOpacity
             className="flex-1 py-3 rounded-xl border bg-slate-50 items-center justify-center"
             style={{ borderColor: '#cbd5e1' }}
             onPress={() => setShowBiometricPasswordModal(false)}
             disabled={isVerifyingBiometricPass}
           >
             <Text className="text-slate-500 font-semibold text-xs">Hủy bỏ</Text>
           </TouchableOpacity>
           <TouchableOpacity
             className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
             onPress={handleConfirmBiometricPassword}
             disabled={isVerifyingBiometricPass}
           >
             {isVerifyingBiometricPass ? (
               <ActivityIndicator size="small" color="white" />
             ) : (
               <Text className="text-white font-semibold text-xs">Xác nhận</Text>
             )}
           </TouchableOpacity>
         </View>
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
