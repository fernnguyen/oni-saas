import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { supabase } from '../../lib/supabase';

// CustomSwitch thuần JavaScript/Tailwind
function CustomSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onValueChange(!value)}
      className={`w-11 h-6 rounded-full p-1 justify-center ${
        value ? 'bg-orange-500 items-end' : 'bg-slate-300 items-start'
      }`}
    >
      <View className="w-4 h-4 rounded-full bg-white shadow-md" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  // 1. Cấu hình máy in
  const [printerConnType, setPrinterConnType] = useState<'bluetooth' | 'lan'>('bluetooth');
  const [selectedBleDevice, setSelectedBleDevice] = useState('PRINTER-K80-BLE');
  const [printerIp, setPrinterIp] = useState('192.168.1.200');
  const [printerPort, setPrinterPort] = useState('9100');
  const [isPrinterConnected, setIsPrinterConnected] = useState(true);
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  // 2. Đồng bộ dữ liệu thực tế SQLite
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [lastFullSync, setLastFullSync] = useState('Chưa đồng bộ');
  const [lastDeltaSync, setLastDeltaSync] = useState('Chưa đồng bộ');
  const [syncStatusText, setSyncStatusText] = useState('Kết nối SQLite ổn định');
  const [branchName, setBranchName] = useState('Chi nhánh chính');

  // Thống kê số lượng bản ghi SQLite thực tế
  const [productCount, setProductCount] = useState(0);
  const [resourceCount, setResourceCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // 3. Cài đặt hệ thống khác
  const [autoSyncOnPrint, setAutoSyncOnPrint] = useState(true);
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Tải thống kê bản ghi SQLite khi màn hình được focus
  const loadSettingsData = async () => {
    try {
      const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Cơ sở chính';
      setBranchName(activeShopName);

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
      setSyncStatusText(`Cục bộ có: ${prods.length} sp, ${resources.length} bàn bi-a. Chờ tải lên: ${pendingOrders.length} đơn.`);
    } catch (err) {
      console.error('Lỗi khi tải số liệu cài đặt SQLite:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSettingsData();
    }, [])
  );

  // Giả lập in thử
  const handlePrintTest = () => {
    setIsTestingPrint(true);
    setTimeout(() => {
      setIsTestingPrint(false);
      Alert.alert('Thành công', 'Đã in phiếu test thành công trên máy in K80 Bluetooth!');
    }, 1200);
  };

  // Đồng bộ Toàn phần (Full Sync đầu phiên) thực tế
  const handleFullSync = async () => {
    try {
      setSyncProgress(0);
      const shopId = await AsyncStorage.getItem('active_shop_id');
      const tenantId = await AsyncStorage.getItem('active_tenant_id');

      if (!shopId || !tenantId) {
        Alert.alert('Lỗi đồng bộ', 'Không tìm thấy thông tin Chi nhánh/Tenant để đồng bộ.');
        setSyncProgress(null);
        return;
      }

      // Kích hoạt SyncManager tải toàn bộ danh mục sản phẩm, phòng bàn, khách hàng
      const success = await SyncManager.pullFullDatabase(shopId, tenantId, (progress) => {
        setSyncProgress(Math.round(progress * 100));
      });

      if (success) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
        setLastFullSync(timeStr);
        setLastDeltaSync(timeStr);
        
        await loadSettingsData();
        Alert.alert('Thành công', 'Đồng bộ toàn phần tải dữ liệu từ Cloud hoàn tất 100%!');
      } else {
        Alert.alert('Lỗi', 'Đồng bộ toàn phần thất bại. Hãy chắc chắn Server Next.js đang hoạt động.');
      }
    } catch (err) {
      console.error('Lỗi sync toàn phần:', err);
    } finally {
      setSyncProgress(null);
    }
  };

  // Đồng bộ Delta thực tế (Đẩy đơn hàng & ca pending lên Cloud)
  const handleDeltaSync = async () => {
    try {
      setSyncProgress(1); // Spinner spinner
      const shopId = await AsyncStorage.getItem('active_shop_id');
      if (!shopId) {
        Alert.alert('Lỗi đồng bộ', 'Không tìm thấy chi nhánh hoạt động để đồng bộ.');
        setSyncProgress(null);
        return;
      }

      // Đẩy tất cả hóa đơn pending và ca làm việc pending lên Cloud
      const uploadResults = await SyncManager.pushOfflineOrders(shopId);
      await SyncManager.pushOfflineShifts(shopId);

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      setLastDeltaSync(timeStr);

      await loadSettingsData();
      
      Alert.alert(
        'Đồng bộ hoàn tất',
        `Đồng bộ Delta thành công!\n\n- Đẩy thành công: ${uploadResults.successCount} hóa đơn ngoại tuyến.\n- Thất bại: ${uploadResults.failedCount} hóa đơn.`
      );
    } catch (err) {
      console.error('Lỗi đồng bộ Delta:', err);
    } finally {
      setSyncProgress(null);
    }
  };

  // Hiện thực Đóng ca thực tế + Đăng xuất an toàn
  const handleCloseShift = async () => {
    try {
      setIsLogoutModalOpen(false);
      const shopId = await AsyncStorage.getItem('active_shop_id');
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      
      if (activeShiftId) {
        // Cập nhật đóng ca trong SQLite offline
        const nowStr = new Date().toISOString();
        await db
          .update(schema.shop_shifts)
          .set({
            closed_at: nowStr,
            status: 'closed',
            sync_status: 'pending',
          })
          .where(eq(schema.shop_shifts.id, activeShiftId));
      }

      if (shopId) {
        // Đồng bộ ca và đơn hàng ngoại tuyến lên Cloud
        await SyncManager.pushOfflineShifts(shopId);
        await SyncManager.pushOfflineOrders(shopId);
      }

      // Xóa thông tin ca cũ để đăng xuất
      await AsyncStorage.removeItem('active_shift_id');
      await AsyncStorage.removeItem('active_shop_id');
      await AsyncStorage.removeItem('active_shop_name');
      await AsyncStorage.removeItem('active_tenant_id');

      // Đăng xuất nhẹ Supabase Auth
      await supabase.auth.signOut();

      Alert.alert(
        'Kết ca thành công',
        'Ca làm việc đã được đóng và gửi báo cáo đồng bộ. Bạn đã được đăng xuất an toàn.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/(auth)/login');
            }
          }
        ]
      );
    } catch (err: any) {
      console.error('Lỗi khi kết thúc ca làm việc:', err);
      Alert.alert('Lỗi kết ca', `Không thể hoàn tất kết thúc ca: ${err.message}`);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* 1. HEADER */}
      <View className="px-4 py-3 border-b bg-white border-slate-200 shadow-sm">
        <Text className="text-lg font-black text-slate-800">Cài đặt cấu hình</Text>
        <Text className="text-xs text-slate-500 mt-0.5 font-semibold">Thiết lập in ấn phần cứng và kiểm soát dữ liệu offline</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
        
        {/* 2. THÔNG TIN THU NGÂN & CA LÀM VIỆC */}
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="bg-orange-100 p-3 rounded-2xl mr-3">
                <Ionicons name="person" size={24} color="#fa5908" />
              </View>
              <View>
                <Text className="font-extrabold text-sm text-slate-800">
                  Thu ngân viên chính
                </Text>
                <Text className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                  Vai trò: Nhân viên thu ngân di động
                </Text>
              </View>
            </View>
            
            <View className="bg-orange-100 px-3 py-1.5 rounded-xl border border-orange-200">
              <Text className="text-[9px] text-[#fa5908] font-black uppercase tracking-wider">ON-SHIFT</Text>
            </View>
          </View>

          <View className="border-t border-slate-100 my-3.5 pt-3.5 flex-row justify-between items-center">
            <View>
              <Text className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Chi nhánh hoạt động</Text>
              <Text className="text-xs font-extrabold mt-0.5 text-slate-700">
                {branchName}
              </Text>
            </View>
            
            <TouchableOpacity 
              className="bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-xl active:bg-red-100"
              onPress={() => setIsLogoutModalOpen(true)}
            >
              <Text className="text-red-600 font-black text-[9px] uppercase tracking-wider">
                Kết ca / Đóng ca
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. CÀI ĐẶT MÁY IN NHIỆT K80 */}
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">
          Cấu hình máy in hóa đơn (K80 / K57)
        </Text>
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          {/* Kiểu kết nối tab */}
          <View className="flex-row bg-slate-100 p-1 rounded-2xl mb-4 border border-slate-200">
            <TouchableOpacity 
              className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center ${
                printerConnType === 'bluetooth' ? 'bg-white shadow-sm border border-slate-200' : ''
              }`}
              onPress={() => setPrinterConnType('bluetooth')}
            >
              <Ionicons name="bluetooth" size={14} color={printerConnType === 'bluetooth' ? '#fa5908' : '#94a3b8'} />
              <Text className={`text-[10px] font-black ml-1.5 uppercase tracking-wider ${
                printerConnType === 'bluetooth' ? 'text-slate-800' : 'text-slate-400'
              }`}>
                Bluetooth (BLE)
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center ${
                printerConnType === 'lan' ? 'bg-white shadow-sm border border-slate-200' : ''
              }`}
              onPress={() => setPrinterConnType('lan')}
            >
              <Ionicons name="wifi" size={14} color={printerConnType === 'lan' ? '#fa5908' : '#94a3b8'} />
              <Text className={`text-[10px] font-black ml-1.5 uppercase tracking-wider ${
                printerConnType === 'lan' ? 'text-slate-800' : 'text-slate-400'
              }`}>
                LAN / Wifi (IP)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form cấu hình tương ứng */}
          {printerConnType === 'bluetooth' ? (
            <View className="mb-4">
              <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Chọn thiết bị Bluetooth</Text>
              <View className="flex-row items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <View className="flex-row items-center">
                  <Ionicons name="print-outline" size={18} color="#fa5908" />
                  <Text className="text-xs font-black ml-2 text-slate-800">
                    {selectedBleDevice}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  className={`px-3 py-1.5 rounded-xl border ${
                    isPrinterConnected ? 'bg-emerald-50 border-emerald-300' : 'bg-orange-500 border-orange-650'
                  }`}
                  onPress={() => setIsPrinterConnected(!isPrinterConnected)}
                >
                  <Text className={`text-[9px] font-black uppercase tracking-wider ${
                    isPrinterConnected ? 'text-emerald-700' : 'text-white'
                  }`}>
                    {isPrinterConnected ? 'Đã kết nối' : 'Kết nối'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Thông tin địa chỉ IP máy in LAN</Text>
              <View className="flex-row justify-between items-center">
                <TextInput
                  value={printerIp}
                  onChangeText={setPrinterIp}
                  placeholder="E.g. 192.168.1.200"
                  placeholderTextColor="#94a3b8"
                  className="flex-1 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mr-2"
                  style={{ outlineStyle: 'none' } as any}
                />
                <TextInput
                  value={printerPort}
                  onChangeText={setPrinterPort}
                  placeholder="9100"
                  placeholderTextColor="#94a3b8"
                  className="w-20 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-center text-slate-800"
                  style={{ outlineStyle: 'none' } as any}
                />
              </View>
            </View>
          )}

          {/* Nút in thử test */}
          <TouchableOpacity 
            className={`py-3.5 rounded-2xl items-center flex-row justify-center border-2 ${
              isPrinterConnected ? 'bg-orange-500 border-orange-500 active:bg-orange-600 shadow-md' : 'bg-slate-100 border-slate-200'
            }`}
            onPress={handlePrintTest}
            disabled={!isPrinterConnected || isTestingPrint}
          >
            <Ionicons name="document-text" size={14} color={isPrinterConnected ? 'white' : '#94a3b8'} />
            <Text className={`font-black text-xs ml-1.5 uppercase tracking-wider ${isPrinterConnected ? 'text-white' : 'text-slate-400'}`}>
              {isTestingPrint ? 'Đang in phiếu test...' : 'In thử hóa đơn test (K80)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. ĐỒNG BỘ SQLITE CỰC BỘ CÓ THÔNG SỐ ROW COUNTS THẬT */}
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">
          Chiến lược đồng bộ SQLite (Offline-First)
        </Text>
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          
          <View className="mb-4">
            <View className="flex-row justify-between py-1 items-center border-b border-slate-100 pb-2">
              <Text className="text-[10px] text-slate-500 font-bold uppercase">SQLite Row Stats:</Text>
              <Text className="text-[10px] font-black text-slate-700">
                {productCount} SP | {resourceCount} Bàn chơi | {customerCount} KH
              </Text>
            </View>
            
            <View className="flex-row justify-between py-1.5 items-center border-b border-slate-100">
              <Text className="text-[10px] text-slate-500 font-bold uppercase">Sync Toàn phần gần nhất:</Text>
              <Text className="text-[10px] font-black text-slate-600">{lastFullSync}</Text>
            </View>
            <View className="flex-row justify-between py-1.5 items-center border-b border-slate-100">
              <Text className="text-[10px] text-slate-500 font-bold uppercase">Sync Delta gần nhất:</Text>
              <Text className="text-[10px] font-black text-slate-600">{lastDeltaSync}</Text>
            </View>

            <View className="mt-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <Text className="text-[10px] font-bold text-slate-650 leading-relaxed text-center">
                💡 Trạng thái: {syncStatusText}
              </Text>
            </View>
          </View>

          {/* Sync Progress Bar */}
          {syncProgress !== null && (
            <View className="mb-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Đang đồng bộ SQLite...</Text>
                <Text className="text-[10px] text-orange-500 font-black">{syncProgress}%</Text>
              </View>
              <View className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <View className="h-full bg-orange-500" style={{ width: `${syncProgress}%` }} />
              </View>
            </View>
          )}

          {/* Các nút kích hoạt sync */}
          <View className="flex-row">
            <TouchableOpacity 
              className="flex-1 bg-orange-500 active:bg-orange-655 py-3.5 rounded-2xl items-center mr-1.5 shadow-md flex-row justify-center border-2 border-orange-500"
              onPress={handleFullSync}
              disabled={syncProgress !== null}
            >
              <Ionicons name="sync" size={14} color="white" />
              <Text className="text-white font-black text-[9px] uppercase tracking-wider ml-1.5">Sync Toàn phần</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-1 bg-slate-100 active:bg-slate-200 py-3.5 rounded-2xl items-center ml-1.5 flex-row justify-center border-2 border-slate-200"
              onPress={handleDeltaSync}
              disabled={syncProgress !== null}
            >
              <Ionicons name="cloud-upload-outline" size={14} color="#475569" />
              <Text className="font-black text-[9px] uppercase tracking-wider ml-1.5 text-slate-700">Sync Delta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. CÀI ĐẶT HỆ THỐNG */}
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">
          Tùy chọn hệ thống
        </Text>
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-8">
          
          <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
            <View>
              <Text className="text-xs font-bold text-slate-800">
                Tự động sync sau khi thanh toán
              </Text>
              <Text className="text-[9px] text-slate-400 font-bold mt-0.5">Giảm thiểu tối đa độ trễ dữ liệu</Text>
            </View>
            <CustomSwitch
              value={autoSyncOnPrint}
              onValueChange={setAutoSyncOnPrint}
            />
          </View>

          <View className="flex-row justify-between items-center py-3">
            <View>
              <Text className="text-xs font-bold text-slate-800">
                Phản hồi âm thanh (Beep!)
              </Text>
              <Text className="text-[9px] text-slate-400 font-bold mt-0.5">Phát âm thanh khi quét mã vạch thành công</Text>
            </View>
            <CustomSwitch
              value={soundFeedback}
              onValueChange={setSoundFeedback}
            />
          </View>
        </View>
      </ScrollView>

      {/* 6. MODAL XÁC NHẬN ĐÓNG CA VÀ SYNC LÊN MÁY CHỦ CLOUD */}
      <Modal
        visible={isLogoutModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsLogoutModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className="w-full max-w-sm p-6 rounded-3xl shadow-2xl bg-white border border-slate-100">
            <View className="items-center mb-4">
              <View className="bg-red-50 p-3 rounded-full mb-3">
                <Ionicons name="warning" size={32} color="#ef4444" />
              </View>
              <Text className="text-base font-black text-slate-800">Xác nhận Kết ca & Đóng ca?</Text>
              <Text className="text-xs text-slate-450 mt-2 text-center font-bold leading-relaxed">
                Hệ thống sẽ tự động gửi và đồng bộ tất cả hóa đơn ngoại tuyến, đóng ca làm việc và đăng xuất an toàn khỏi ứng dụng.
              </Text>
            </View>

            <View className="flex-row justify-between mt-2.5">
              <TouchableOpacity 
                className="flex-1 bg-slate-100 py-3.5 rounded-2xl items-center mr-2 border border-slate-200 active:bg-slate-200"
                onPress={() => setIsLogoutModalOpen(false)}
              >
                <Text className="font-extrabold text-xs text-slate-600">Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-1 bg-red-500 active:bg-red-655 py-3.5 rounded-2xl items-center ml-2 shadow-md shadow-red-500/10"
                onPress={handleCloseShift}
              >
                <Text className="text-white font-extrabold text-xs">Đóng ca</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
