import React, {useState, useEffect} from 'react';
import {Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Platform, Pressable} from 'react-native';
import {useRouter} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApiBaseUrl, saveApiBaseUrl, getApiHeaders, loadApiBaseUrl} from '../../lib/api/config';
import {SyncManager} from '../../lib/sync/SyncManager';
import {db, switchDatabaseScope} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {supabase} from '../../lib/supabase';
import {eq} from 'drizzle-orm';

interface Branch {
 id: string;
 name: string;
 address: string;
 phone: string;
 isActive: boolean;
 industry_type: string;
}

export default function SelectBranchScreen() {
 const router = useRouter();

 const navigateToTabs = async (shopId: string) => {
   try {
     // 1. Xóa thời gian sync cũ để KeepAliveManager biết cần sync lại khi vào tabs
     await AsyncStorage.removeItem('last_keep_alive_sync_time');
     
     // 2. Đồng bộ quyền hạn & vai trò của chi nhánh mới ngay lập tức
     const currentUrl = await loadApiBaseUrl();
     const headers = await getApiHeaders();
     const res = await fetch(`${currentUrl}/api/shops/${shopId}/permissions`, { headers });
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
     console.warn('[SelectBranch] Lỗi tải quyền hạn khi chuyển hướng:', err);
   } finally {
     router.replace('/(tabs)');
   }
 };
 const [branches, setBranches] = useState<Branch[]>([]);
 const [selectedBranchId, setSelectedBranchId] = useState<string>('');
 const [isLoading, setIsLoading] = useState(true);
 const [isSyncing, setIsSyncing] = useState(false);
 const [syncProgress, setSyncProgress] = useState(0);
 const [tenantId, setTenantId] = useState('');
 const [isOffline, setIsOffline] = useState(false);

 // States quản lý ca làm việc (Shift Management)
 const [showShiftModal, setShowShiftModal] = useState(false);
 const [openingCashInput, setOpeningCashInput] = useState('0');
 const [isShiftLoading, setIsShiftLoading] = useState(false);

 // Cấu hình linh hoạt URL API
 const [showConfig, setShowConfig] = useState(false);
 const [apiUrlInput, setApiUrlInput] = useState('');
 const [refreshTrigger, setRefreshTrigger] = useState(0);

 const handleBackPress = () => {
   Alert.alert(
     'Đăng xuất',
     'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này và quay lại màn hình đăng nhập?',
     [
       {
         text: 'Hủy',
         style: 'cancel',
       },
       {
         text: 'Đăng xuất',
         style: 'destructive',
         onPress: async () => {
           try {
             setIsLoading(true);
             await supabase.auth.signOut();
             await AsyncStorage.removeItem('active_tenant_code');
             await AsyncStorage.removeItem('active_tenant_id');
             await AsyncStorage.removeItem('active_shop_id');
             await AsyncStorage.removeItem('active_shop_name');
             router.replace('/(auth)/login');
           } catch (err) {
             console.error('Lỗi khi đăng xuất:', err);
             router.replace('/(auth)/login');
           } finally {
             setIsLoading(false);
           }
         },
       },
     ],
     { cancelable: true }
   );
 };

  // 1. Tải danh sách chi nhánh thực tế từ Next.js REST API
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setIsLoading(true);
        setIsOffline(false);
        const currentUrl = await loadApiBaseUrl();
        setApiUrlInput(currentUrl);

        const headers = await getApiHeaders();
        
        // A. Lấy tenant_id của user hiện tại qua API
        const meRes = await fetch(`${currentUrl}/api/tenants/me`, {headers});
        if (!meRes.ok) {
          throw new Error(`Không thể xác thực Tenant. Mã lỗi: ${meRes.status}`);
        }
        const meData = await meRes.json();
        const tId = meData.tenant_id;
        
        if (!tId) {
          throw new Error('Tài khoản này chưa được liên kết với bất kỳ Gian hàng (Tenant) nào.');
        }
        setTenantId(tId);
        await AsyncStorage.setItem('active_tenant_id', tId);
        switchDatabaseScope(tId);

        // B. Lấy danh sách shops hoạt động của Tenant qua API
        const shopsRes = await fetch(`${currentUrl}/api/shops?tenant_id=${tId}`, {headers});
        if (!shopsRes.ok) {
          throw new Error(`Không thể tải danh sách chi nhánh. Mã lỗi: ${shopsRes.status}`);
        }
        const shopsData = await shopsRes.json();
        const rawShops = shopsData.shops || [];

        const mappedBranches = rawShops.map((shop: any) => ({
          id: shop.id,
          name: shop.name || 'Chi nhánh chưa đặt tên',
          address: shop.address || 'Địa chỉ đang cập nhật',
          phone: shop.phone || 'SĐT đang cập nhật',
          isActive: shop.is_active !== false,
          industry_type: shop.industry_type || 'retail',
        }));

        setBranches(mappedBranches);
        // Lưu cache danh sách chi nhánh
        await AsyncStorage.setItem(`cached_branches_${tId}`, JSON.stringify(mappedBranches));

        if (mappedBranches.length > 0) {
          // Mặc định chọn chi nhánh hoạt động đầu tiên tìm thấy
          const firstActive = mappedBranches.find((b: any) => b.isActive);
          setSelectedBranchId(firstActive ? firstActive.id : mappedBranches[0].id);
        }
        setShowConfig(false); // Ẩn card cấu hình nếu tải dữ liệu thành công
      } catch (error: any) {
        console.error('Lỗi khi tải chi nhánh thực tế:', error);
        
        // Thử khôi phục từ cache
        try {
          const cachedTId = await AsyncStorage.getItem('active_tenant_id');
          if (cachedTId) {
            setTenantId(cachedTId);
            switchDatabaseScope(cachedTId);
            const cachedBranchesStr = await AsyncStorage.getItem(`cached_branches_${cachedTId}`);
            if (cachedBranchesStr) {
              const parsedBranches = JSON.parse(cachedBranchesStr);
              if (Array.isArray(parsedBranches) && parsedBranches.length > 0) {
                setBranches(parsedBranches);
                const firstActive = parsedBranches.find((b: any) => b.isActive);
                setSelectedBranchId(firstActive ? firstActive.id : parsedBranches[0].id);
                setIsOffline(true);
                setShowConfig(false);
                return; // Kết thúc sớm và không hiện Alert lỗi kết nối
              }
            }
          }
        } catch (cacheErr) {
          console.error('Không thể đọc dữ liệu chi nhánh từ cache:', cacheErr);
        }

        setShowConfig(true); // Hiển thị card cấu hình khi lỗi mạng xảy ra và không có cache
        Alert.alert(
          'Lỗi kết nối máy chủ',
          `Không thể kết nối đến máy chủ REST API và không tìm thấy dữ liệu đã lưu.\n\nChi tiết: ${error.message || 'Lỗi mạng'}\n\nHướng dẫn: Vui lòng kết nối mạng để tải thông tin chi nhánh lần đầu.`
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranches();
  }, [refreshTrigger]);

 // Lưu địa chỉ API và tải lại
 const handleSaveApiUrl = async () => {
 if (!apiUrlInput) return;
 await saveApiBaseUrl(apiUrlInput);
 Alert.alert('Đã lưu cấu hình', `Đã đổi địa chỉ REST API thành: ${apiUrlInput}`);
 setRefreshTrigger(prev => prev + 1);
};

  // Hỗ trợ bắt đầu ca làm việc ngoại tuyến (offline startup bypass)
  const handleStartSessionOffline = async (branch: Branch, tId: string) => {
    setIsSyncing(true);
    try {
      // Đảm bảo CSDL được chuyển đúng vùng tenant
      switchDatabaseScope(tId);

      // Xóa active_shift_id cũ trước khi kiểm tra ca mới
      await AsyncStorage.removeItem('active_shift_id');

      // Tải cấu hình ca từ cache AsyncStorage cho chi nhánh này
      const cachedShiftSettings = await AsyncStorage.getItem(`cached_enable_shift_management_${branch.id}`);
      const isShiftEnabled = cachedShiftSettings === 'true';

      // Lưu cấu hình Quản lý ca vào AsyncStorage
      await AsyncStorage.setItem('enable_shift_management', isShiftEnabled ? 'true' : 'false');

      if (isShiftEnabled) {
        // Kiểm tra xem trong SQLite local shop_shifts có ca nào đang mở
        const localShifts = await db.select()
          .from(schema.shop_shifts)
          .where(eq(schema.shop_shifts.status, 'open'));

        if (localShifts.length > 0) {
          const activeShift = localShifts[0];
          await AsyncStorage.setItem('active_shift_id', activeShift.id);
          setIsSyncing(false);
          await navigateToTabs(branch.id);
        } else {
          setIsSyncing(false);
          setOpeningCashInput('0');
          setShowShiftModal(true);
        }
      } else {
        await AsyncStorage.removeItem('active_shift_id');
        setIsSyncing(false);
        await navigateToTabs(branch.id);
      }
    } catch (err: any) {
      console.error('Lỗi khởi chạy ca làm việc ngoại tuyến:', err);
      Alert.alert('Lỗi mở ca ngoại tuyến', `Không thể mở ca ngoại tuyến: ${err.message}`);
      setIsSyncing(false);
    }
  };

  // 2. Kích hoạt ca làm việc di động và tải dữ liệu Offline về SQLite cục bộ
  const handleStartSession = async () => {
    const branch = branches.find(b => b.id === selectedBranchId);
    if (!branch) {
      Alert.alert('Thông báo', 'Vui lòng chọn một chi nhánh hợp lệ!');
      return;
    }
    
    if (!branch.isActive) {
      Alert.alert('Thông báo', 'Chi nhánh này đang tạm khóa để bảo trì dữ liệu, vui lòng chọn chi nhánh khác!');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0.1);

    try {
      // Đảm bảo CSDL được chuyển đúng vùng tenant trước khi pull và ghi dữ liệu
      switchDatabaseScope(tenantId);

      // Nếu thay đổi sang chi nhánh khác, hãy xóa sạch giỏ hàng tạm của chi nhánh cũ để tránh lệch dữ liệu
      const oldShopId = await AsyncStorage.getItem('active_shop_id');
      if (oldShopId !== branch.id) {
        await AsyncStorage.removeItem('temp_cart');
        await AsyncStorage.removeItem('temp_discount');
        await AsyncStorage.removeItem('temp_note');
        await AsyncStorage.removeItem('temp_customer');
        await AsyncStorage.removeItem('temp_table_carts');
        await AsyncStorage.removeItem('temp_table_customers');
      }

      // Lưu lại thông tin chi nhánh vào AsyncStorage
      await AsyncStorage.setItem('active_shop_id', branch.id);
      await AsyncStorage.setItem('active_shop_name', branch.name);
      await AsyncStorage.setItem('active_shop_industry', branch.industry_type);

      // Kích hoạt Sync toàn phần tải dữ liệu từ Cloud về ghi SQLite offline
      const syncSuccess = await SyncManager.pullFullDatabase(
        branch.id,
        tenantId,
        (progress) => {
          setSyncProgress(progress);
        }
      );

      if (!syncSuccess) {
        // Kiểm tra xem SQLite cục bộ đã có dữ liệu sản phẩm chưa
        const localProducts = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
        const hasLocalData = localProducts.length > 0;

        if (hasLocalData) {
          setIsSyncing(false);
          Alert.alert(
            'Đồng bộ không thành công',
            'Không thể kết nối máy chủ để đồng bộ dữ liệu mới. Bạn có muốn sử dụng dữ liệu ngoại tuyến hiện có trên máy để bán hàng không?',
            [
              {
                text: 'Hủy',
                style: 'cancel',
              },
              {
                text: 'Tiếp tục (Ngoại tuyến)',
                onPress: () => handleStartSessionOffline(branch, tenantId),
              }
            ]
          );
          return;
        } else {
          Alert.alert(
            'Đồng bộ thất bại',
            'Tải danh mục đầu phiên thất bại và thiết bị chưa có dữ liệu lưu trữ từ trước. Vui lòng kiểm tra kết nối mạng và thử lại.'
          );
          setIsSyncing(false);
          return;
        }
      }

      // Xóa active_shift_id cũ trước khi kiểm tra ca mới
      await AsyncStorage.removeItem('active_shift_id');

      // Kiểm tra Cài đặt Quản lý ca (Settings) từ server
      const currentUrl = await loadApiBaseUrl();
      const headers = await getApiHeaders();
      
      let isShiftEnabled = false;
      try {
        const settingsRes = await fetch(`${currentUrl}/api/shops/${branch.id}/settings`, { headers });
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json();
          isShiftEnabled = settingsJson.enable_shift_management ?? false;
          // Lưu cache cài đặt ca
          await AsyncStorage.setItem(`cached_enable_shift_management_${branch.id}`, isShiftEnabled ? 'true' : 'false');
        } else {
          const cached = await AsyncStorage.getItem(`cached_enable_shift_management_${branch.id}`);
          if (cached) isShiftEnabled = cached === 'true';
        }
      } catch (err) {
        console.warn('Lỗi khi tải cài đặt ca từ server, thử đọc từ cache:', err);
        const cached = await AsyncStorage.getItem(`cached_enable_shift_management_${branch.id}`);
        if (cached) isShiftEnabled = cached === 'true';
      }

      // Lưu cấu hình Quản lý ca vào AsyncStorage để POS/Checkout sử dụng offline
      await AsyncStorage.setItem('enable_shift_management', isShiftEnabled ? 'true' : 'false');

      if (isShiftEnabled) {
        let activeShiftOnServer = null;
        try {
          const userEmail = await AsyncStorage.getItem('saved_email') || '';
          const shiftsRes = await fetch(`${currentUrl}/api/shops/${branch.id}/shifts?status=open&branch_id=${branch.id}&user_id=${userEmail}`, { headers });
          if (shiftsRes.ok) {
            const shiftsJson = await shiftsRes.json();
            if (shiftsJson.total > 0 && shiftsJson.data && shiftsJson.data.length > 0) {
              activeShiftOnServer = shiftsJson.data[0];
            }
          }
        } catch (err) {
          console.warn('Lỗi kiểm tra ca mở trên server:', err);
        }

        if (activeShiftOnServer) {
          // Đã có ca mở trên server -> dùng luôn ca này
          await AsyncStorage.setItem('active_shift_id', activeShiftOnServer.id);
          
          // Lưu ca vào SQLite cục bộ
          await db.insert(schema.shop_shifts).values({
            id: activeShiftOnServer.id,
            opened_at: activeShiftOnServer.opened_at,
            status: 'open',
            opening_cash: parseFloat(activeShiftOnServer.opening_cash || '0'),
            actual_closing_cash: 0,
            employee_name: activeShiftOnServer.employee_name || 'Thu ngân',
            sync_status: 'synced',
          }).onConflictDoNothing();

          setIsSyncing(false);
          await navigateToTabs(branch.id);
        } else {
          // Chưa có ca mở -> Hiện modal nhập tiền đầu ca
          setIsSyncing(false);
          setOpeningCashInput('0');
          setShowShiftModal(true);
        }
      } else {
        // Không bật ca kíp -> Bỏ qua ca
        await AsyncStorage.removeItem('active_shift_id');
        setIsSyncing(false);
        await navigateToTabs(branch.id);
      }
    } catch (err: any) {
      console.error('Lỗi khi khởi chạy ca làm việc:', err);
      Alert.alert('Lỗi mở ca', `Không thể mở ca làm việc di động: ${err.message}`);
      setIsSyncing(false);
    }
  };

  const handleSkipShift = async () => {
    setShowShiftModal(false);
    await navigateToTabs(selectedBranchId);
  };

  const handleConfirmShift = async () => {
    const branch = branches.find(b => b.id === selectedBranchId);
    if (!branch) return;
    setIsShiftLoading(true);
    try {
      const currentUrl = await loadApiBaseUrl();
      const headers = await getApiHeaders();
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const cash = parseInt(openingCashInput.replace(/\D/g, ''), 10) || 0;
      const nowStr = new Date().toISOString();

      let shiftId = `shift-${branch.id}-${Date.now()}`;
      let syncStatus = 'pending';

      // 1. Gửi POST lên server nếu có mạng
      try {
        const res = await fetch(`${currentUrl}/api/shops/${branch.id}/shifts`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: branch.id,
            opening_cash: cash,
          }),
        });
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.id) {
            shiftId = resJson.id;
            syncStatus = 'synced';
          }
        }
      } catch (err) {
        console.warn('Không thể gửi ca mở lên server, dùng SQLite offline:', err);
      }

      // 2. Lưu vào SQLite cục bộ
      await db.insert(schema.shop_shifts).values({
        id: shiftId,
        opened_at: nowStr,
        status: 'open',
        opening_cash: cash,
        actual_closing_cash: 0,
        employee_name: userEmail.split('@')[0],
        sync_status: syncStatus,
      }).onConflictDoNothing();

      setShowShiftModal(false);
      await navigateToTabs(branch.id);
    } catch (err: any) {
      console.error('Lỗi khi mở ca làm việc:', err);
      Alert.alert('Lỗi', `Không thể mở ca làm việc: ${err.message || err}`);
    } finally {
      setIsShiftLoading(false);
    }
  };

 return (
 <SafeAreaView className="flex-1 bg-slate-50 justify-between px-6 py-8">
 
 {/* 1. HEADER SECTION */}
 <View className="mt-4">
 <View className="flex-row justify-between items-center mb-6">
 <TouchableOpacity 
 className="flex-row items-center"
 onPress={handleBackPress}
 >
 <Ionicons name="arrow-back" size={20} color="#64748b" />
 <Text className="text-slate-500 text-xs font-medium ml-1">Quay lại</Text>
 </TouchableOpacity>

 {/* Nút bật tắt cấu hình API thủ công */}
 <TouchableOpacity 
 className="bg-slate-100 p-2 rounded-xl border border-slate-200"
 onPress={() => setShowConfig(!showConfig)}
 >
 <Ionicons name="settings-outline" size={16} color="#475569" />
 </TouchableOpacity>
 </View>

  <Text className="text-xl font-medium text-slate-800">Chọn chi nhánh làm việc</Text>
  <Text className="text-xs text-slate-450 mt-1 font-semibold leading-relaxed">
  Vui lòng chọn cơ sở kinh doanh để tải dữ liệu SQLite ngoại tuyến đầu ca làm việc.
  </Text>
  {isOffline && (
    <View className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mt-3.5 flex-row items-center">
      <Ionicons name="cloud-offline" size={18} color="#d97706" />
      <Text className="text-xs font-semibold text-amber-800 ml-2 flex-1">
        Chế độ ngoại tuyến: Sử dụng dữ liệu chi nhánh đã lưu trước đó.
      </Text>
    </View>
  )}
  </View>

 {/* 2. API SERVER CONFIGURATION ACCORDION/CARD */}
 {showConfig && (
 <View className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm mt-4">
 <View className="flex-row items-center mb-2">
 <Ionicons name="settings" size={16} color="#fa5908" />
 <Text className="text-xs font-medium text-slate-800 ml-1.5">Cấu hình Địa chỉ REST API</Text>
 </View>
  <Text className="text-tiny text-slate-400 font-medium mb-3 leading-relaxed">
  Mặc định là https://oni.vn. Bạn có thể cấu hình tên miền đám mây hoặc máy chủ cục bộ riêng của doanh nghiệp (ví dụ: http://192.168.1.5:3001).
  </Text>
  <View className="flex-row">
  <TextInput
  value={apiUrlInput}
  onChangeText={setApiUrlInput}
  placeholder="https://oni.vn"
  placeholderTextColor="#94a3b8"
  className="flex-1 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-800 mr-2"
  autoCapitalize="none"
  keyboardType="url"
  style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
  }}
  />
 <TouchableOpacity 
 className="bg-orange-500 px-4 py-2 rounded-xl justify-center shadow-sm"
 onPress={handleSaveApiUrl}
 >
 <Text className="text-white text-xs font-semibold">Lưu & Thử lại</Text>
 </TouchableOpacity>
 </View>
 </View>
 )}

 {/* 3. BRANCH LIST OR LOADING CONTAINER */}
 {isLoading ? (
 <View className="flex-1 justify-center items-center">
 <ActivityIndicator size="large" color="#fa5908" />
 <Text className="text-xs text-slate-500 font-medium mt-3">Đang kết nối API tìm chi nhánh...</Text>
 </View>
 ) : branches.length === 0 ? (
 <View className="flex-1 justify-center items-center">
 <Ionicons name="storefront-outline" size={48} color="#cbd5e1" />
 <Text className="text-xs text-slate-450 font-medium mt-3 text-center">Không tìm thấy chi nhánh hoạt động nào.</Text>
 <TouchableOpacity 
 className="mt-4 bg-orange-500 px-4 py-2 rounded-xl"
 onPress={() => setRefreshTrigger(p => p + 1)}
 >
 <Text className="text-white text-xs font-medium">Thử lại</Text>
 </TouchableOpacity>
 </View>
 ) : (
 <ScrollView className="flex-1 my-6" showsVerticalScrollIndicator={false}>
 {branches.map(branch => {
 const isSelected = selectedBranchId === branch.id;
 const isActive = branch.isActive;

 return (
 <TouchableOpacity
 key={branch.id}
 className={`mb-4 p-4 rounded-3xl border-2 shadow-sm ${
 !isActive 
 ? 'bg-slate-100/50 border-slate-200 opacity-60'
 : (isSelected 
 ? 'bg-orange-50/40 border-orange-500' 
 : 'bg-white border-slate-200')
}`}
 onPress={() => isActive && setSelectedBranchId(branch.id)}
 disabled={isSyncing}
 >
  <View className="flex-row justify-between items-start">
  <View className="flex-row items-center flex-1 mr-4">
  <View className={`p-2 rounded-xl mr-3 ${
  isSelected ? 'bg-orange-100' : 'bg-slate-100'
  }`}>
  <Ionicons 
  name="storefront" 
  size={18} 
  color={isSelected ? '#fa5908' : '#64748b'} 
  />
  </View>
  <View className="flex-1">
  <Text className={`text-xs font-medium ${
  isSelected ? 'text-orange-500' : 'text-slate-800'
  }`}>
  {branch.name}
  </Text>
  <Text className="text-xs text-slate-455 mt-0.5">
  {branch.address}
  </Text>
  </View>
  </View>

  {isActive ? (
  isSelected && (
  <View className="bg-orange-500 w-5 h-5 rounded-full items-center justify-center">
  <Ionicons name="checkmark" size={12} color="white" />
  </View>
  )
  ) : (
  <View className="bg-slate-200 px-2 py-0.5 rounded-lg">
  <Text className="text-xxs font-medium text-slate-500">TẠM KHÓA</Text>
  </View>
  )}
  </View>
 </TouchableOpacity>
 );
})}
 </ScrollView>
 )}

 {/* 4. FOOTER ACTIONS & SYNC PROGRESS BAR */}
 <View className="w-full" style={{alignSelf: 'stretch'}}>
 {isSyncing ? (
 <View className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-2 items-center w-full" style={{alignSelf: 'stretch'}}>
 <ActivityIndicator size="small" color="#fa5908" className="mb-2" />
 <Text className="text-slate-700 font-medium text-xs">Đang nạp dữ liệu hệ thống: {Math.round(syncProgress * 100)}%</Text>
 <View style={{alignSelf: 'stretch', height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 8}}>
 <View style={{height: '100%', backgroundColor: '#fa5908', width: `${Math.min(100, Math.max(0, syncProgress * 100))}%`}} />
 </View>
 </View>
 ) : (
 <TouchableOpacity 
 className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg shadow-orange-500/20 flex-row justify-center w-full"
 style={{alignSelf: 'stretch'}}
 onPress={handleStartSession}
 disabled={isLoading || branches.length === 0}
 >
 <Text className="text-white font-medium text-sm mr-1.5">Bắt đầu ca làm việc</Text>
 <Ionicons name="play" size={16} color="white" />
 </TouchableOpacity>
 )}
 </View>

 <Modal
    visible={showShiftModal}
    animationType="fade"
    transparent={true}
    onRequestClose={() => setShowShiftModal(false)}
  >
    <View className="flex-1 justify-center items-center px-6">
      <Pressable
        className="absolute inset-0 bg-black/60"
        onPress={() => setShowShiftModal(false)}
      />
      <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 relative">
        <View className="items-center mb-4">
          <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
            <Ionicons name="wallet-outline" size={24} color="#fa5908" />
          </View>
          <Text className="text-base font-bold text-slate-800 text-center">Mở ca làm việc POS</Text>
          <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
            Hệ thống đang bật chế độ Quản lý ca. Bạn cần khai báo số tiền mặt hiện có trong két trước khi tiếp tục.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Số tiền mặt đầu ca
          </Text>
          <View className="relative flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
            <TextInput
              value={openingCashInput}
              onChangeText={(val) => {
                const num = val.replace(/\D/g, '');
                setOpeningCashInput(num ? Number(num).toLocaleString('vi-VN') : '0');
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
            <Text className="text-sm font-semibold text-slate-400 ml-2">đ</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 items-center"
            onPress={handleSkipShift}
            disabled={isShiftLoading}
          >
            <Text className="text-slate-500 font-semibold text-xs">Bỏ qua</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
            onPress={handleConfirmShift}
            disabled={isShiftLoading}
          >
            {isShiftLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-xs">Xác nhận</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>

 </SafeAreaView>
 );
}
