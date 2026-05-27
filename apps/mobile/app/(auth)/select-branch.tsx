import React, { useState, useEffect } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, saveApiBaseUrl, getApiHeaders, loadApiBaseUrl } from '../../lib/api/config';
import { SyncManager } from '../../lib/sync/SyncManager';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';

interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

export default function SelectBranchScreen() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [tenantId, setTenantId] = useState('');

  // Cấu hình linh hoạt URL API
  const [showConfig, setShowConfig] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 1. Tải danh sách chi nhánh thực tế từ Next.js REST API
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setIsLoading(true);
        const currentUrl = await loadApiBaseUrl();
        setApiUrlInput(currentUrl);

        const headers = await getApiHeaders();
        
        // A. Lấy tenant_id của user hiện tại qua API
        const meRes = await fetch(`${currentUrl}/api/tenants/me`, { headers });
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

        // B. Lấy danh sách shops hoạt động của Tenant qua API
        const shopsRes = await fetch(`${currentUrl}/api/shops?tenant_id=${tId}`, { headers });
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
        }));

        setBranches(mappedBranches);
        if (mappedBranches.length > 0) {
          // Mặc định chọn chi nhánh hoạt động đầu tiên tìm thấy
          const firstActive = mappedBranches.find((b: any) => b.isActive);
          setSelectedBranchId(firstActive ? firstActive.id : mappedBranches[0].id);
        }
        setShowConfig(false); // Ẩn card cấu hình nếu tải dữ liệu thành công
      } catch (error: any) {
        console.error('Lỗi khi tải chi nhánh thực tế:', error);
        setShowConfig(true); // Hiển thị card cấu hình khi lỗi mạng xảy ra
        Alert.alert(
          'Lỗi kết nối máy chủ',
          `Không thể kết nối đến máy chủ REST API.\n\nChi tiết: ${error.message || 'Lỗi mạng'}\n\nHướng dẫn: Vui lòng kiểm tra cổng dịch vụ Next.js (có thể là 3001) hoặc cấu hình IP LAN máy tính bên dưới.`
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
      // Lưu lại thông tin chi nhánh vào AsyncStorage
      await AsyncStorage.setItem('active_shop_id', branch.id);
      await AsyncStorage.setItem('active_shop_name', branch.name);

      // Kích hoạt Sync toàn phần tải dữ liệu từ Cloud về ghi SQLite offline
      const syncSuccess = await SyncManager.pullFullDatabase(
        branch.id,
        tenantId,
        (progress) => {
          setSyncProgress(progress);
        }
      );

      if (!syncSuccess) {
        Alert.alert(
          'Đồng bộ thất bại',
          'Tải danh mục đầu phiên thất bại. Vui lòng kiểm tra cấu hình địa chỉ API Next.js.'
        );
        setIsSyncing(false);
        return;
      }

      // Tạo một ca làm việc di động mặc định trong SQLite nội địa
      const nowStr = new Date().toISOString();
      const shiftId = `shift-${branch.id}-${Date.now()}`;
      await AsyncStorage.setItem('active_shift_id', shiftId);

      await db.insert(schema.shop_shifts).values({
        id: shiftId,
        opened_at: nowStr,
        status: 'open',
        opening_cash: 0,
        actual_closing_cash: 0,
        employee_name: 'Thu ngân viên chính',
        sync_status: 'pending', // Ca mở ngoại tuyến chờ đồng bộ
      }).onConflictDoNothing();

      setIsSyncing(false);
      // Chuyển sang Trang Tổng quan tab
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Lỗi khi khởi chạy ca làm việc:', err);
      Alert.alert('Lỗi mở ca', `Không thể mở ca làm việc di động: ${err.message}`);
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 justify-between px-6 py-8">
      
      {/* 1. HEADER SECTION */}
      <View className="mt-4">
        <View className="flex-row justify-between items-center mb-6">
          <TouchableOpacity 
            className="flex-row items-center"
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color="#64748b" />
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider ml-1">Quay lại</Text>
          </TouchableOpacity>

          {/* Nút bật tắt cấu hình API thủ công */}
          <TouchableOpacity 
            className="bg-slate-100 p-2 rounded-xl border border-slate-200"
            onPress={() => setShowConfig(!showConfig)}
          >
            <Ionicons name="settings-outline" size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        <Text className="text-xl font-bold text-slate-800">Chọn chi nhánh làm việc</Text>
        <Text className="text-xs text-slate-450 mt-1 font-semibold leading-relaxed">
          Vui lòng chọn cơ sở kinh doanh để tải dữ liệu SQLite ngoại tuyến đầu ca làm việc.
        </Text>
      </View>

      {/* 2. API SERVER CONFIGURATION ACCORDION/CARD */}
      {showConfig && (
        <View className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm mt-4">
          <View className="flex-row items-center mb-2">
            <Ionicons name="settings" size={16} color="#fa5908" />
            <Text className="text-xs font-extrabold text-slate-800 ml-1.5 uppercase">Cấu hình Địa chỉ REST API</Text>
          </View>
          <Text className="text-[10px] text-slate-400 font-bold mb-3 leading-relaxed">
            Nếu chạy cổng khác (như 3001) hoặc Expo Go trên thiết bị thật, hãy nhập IP LAN của máy tính chạy webapp (ví dụ: http://192.168.1.5:3001) thay cho localhost.
          </Text>
          <View className="flex-row">
            <TextInput
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="http://localhost:3000"
              placeholderTextColor="#94a3b8"
              className="flex-1 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 mr-2"
              autoCapitalize="none"
              keyboardType="url"
              style={{ outlineStyle: 'none' } as any}
            />
            <TouchableOpacity 
              className="bg-orange-500 px-4 py-2 rounded-xl justify-center shadow-sm"
              onPress={handleSaveApiUrl}
            >
              <Text className="text-white text-xs font-black">Lưu & Thử lại</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 3. BRANCH LIST OR LOADING CONTAINER */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-500 font-bold mt-3">Đang kết nối API tìm chi nhánh...</Text>
        </View>
      ) : branches.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <Ionicons name="storefront-outline" size={48} color="#cbd5e1" />
          <Text className="text-xs text-slate-450 font-bold mt-3 text-center">Không tìm thấy chi nhánh hoạt động nào.</Text>
          <TouchableOpacity 
            className="mt-4 bg-orange-500 px-4 py-2 rounded-xl"
            onPress={() => setRefreshTrigger(p => p + 1)}
          >
            <Text className="text-white text-xs font-bold">Thử lại</Text>
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
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-row items-center">
                    <View className={`p-2 rounded-xl mr-3 ${
                      isSelected ? 'bg-orange-100' : 'bg-slate-100'
                    }`}>
                      <Ionicons 
                        name="storefront" 
                        size={18} 
                        color={isSelected ? '#fa5908' : '#64748b'} 
                      />
                    </View>
                    <View>
                      <Text className={`text-xs font-bold ${
                        isSelected ? 'text-orange-500' : 'text-slate-800'
                      }`}>
                        {branch.name}
                      </Text>
                      <Text className="text-[9px] text-slate-455 font-bold mt-0.5">
                        SĐT: {branch.phone}
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
                      <Text className="text-[8px] font-extrabold text-slate-500">TẠM KHÓA</Text>
                    </View>
                  )}
                </View>

                <Text className="text-[10px] text-slate-400 font-bold leading-relaxed ml-11">
                  📍 {branch.address}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 4. FOOTER ACTIONS & SYNC PROGRESS BAR */}
      <View className="w-full" style={{ alignSelf: 'stretch' }}>
        {isSyncing ? (
          <View className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-2 items-center w-full" style={{ alignSelf: 'stretch' }}>
            <ActivityIndicator size="small" color="#fa5908" className="mb-2" />
            <Text className="text-slate-700 font-bold text-xs">Đang nạp dữ liệu SQLite: {Math.round(syncProgress * 100)}%</Text>
            <View style={{ alignSelf: 'stretch', height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
              <View style={{ height: '100%', backgroundColor: '#fa5908', width: `${Math.min(100, Math.max(0, syncProgress * 100))}%` }} />
            </View>
          </View>
        ) : (
          <TouchableOpacity 
            className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg shadow-orange-500/20 flex-row justify-center w-full"
            style={{ alignSelf: 'stretch' }}
            onPress={handleStartSession}
            disabled={isLoading || branches.length === 0}
          >
            <Text className="text-white font-extrabold text-sm mr-1.5">Bắt đầu ca làm việc</Text>
            <Ionicons name="play" size={16} color="white" />
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}
