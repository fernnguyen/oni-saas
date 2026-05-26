import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// CustomSwitch thuần JavaScript/Tailwind siêu mượt và không bị lỗi NavigationContainer
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
  // 1. State cấu hình máy in
  const [printerConnType, setPrinterConnType] = useState<'bluetooth' | 'lan'>('bluetooth');
  const [selectedBleDevice, setSelectedBleDevice] = useState('PRINTER-K80-BLE');
  const [printerIp, setPrinterIp] = useState('192.168.1.200');
  const [printerPort, setPrinterPort] = useState('9100');
  const [isPrinterConnected, setIsPrinterConnected] = useState(true);
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  // 2. State đồng bộ SQLite cục bộ
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [lastFullSync, setLastFullSync] = useState('14:00 - 26/05/2026');
  const [lastDeltaSync, setLastDeltaSync] = useState('17:45 - 26/05/2026');
  const [syncStatusText, setSyncStatusText] = useState('Dữ liệu cục bộ khớp 100% với Cloud');

  // 3. Cài đặt hệ thống khác
  const [autoSyncOnPrint, setAutoSyncOnPrint] = useState(true);
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Giả lập In thử
  const handlePrintTest = () => {
    setIsTestingPrint(true);
    setTimeout(() => {
      setIsTestingPrint(false);
      alert('Đã in phiếu test thành công trên máy in K80!');
    }, 1200);
  };

  // Giả lập Đồng bộ Toàn phần (Session-start Sync)
  const handleFullSync = () => {
    setSyncProgress(0);
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev === null) return 0;
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setSyncProgress(null);
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
            setLastFullSync(timeStr);
            setLastDeltaSync(timeStr);
            setSyncStatusText('Đã cập nhật toàn bộ: 154 sản phẩm, 8 sơ đồ phòng bàn');
            alert('Đồng bộ toàn phần (Cấp độ 1) thành công!');
          }, 500);
          return 100;
        }
        return prev + 20;
      });
    }, 200);
  };

  // Giả lập Đồng bộ Delta
  const handleDeltaSync = () => {
    setSyncProgress(1); // Trạng thái spinner ngầm
    setTimeout(() => {
      setSyncProgress(null);
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      setLastDeltaSync(timeStr);
      setSyncStatusText('Đồng bộ Delta hoàn tất: 0 thay đổi mới từ Server');
      alert('Đồng bộ Delta (Cấp độ 2) thành công!');
    }, 1000);
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
                  Nguyễn Thu Ngân
                </Text>
                <Text className="text-[10px] text-slate-450 font-bold mt-0.5 uppercase tracking-wide">
                  Vai trò: Thu ngân viên chính
                </Text>
              </View>
            </View>
            
            <View className="bg-orange-100 px-3 py-1.5 rounded-xl border border-orange-200">
              <Text className="text-[9px] text-[#fa5908] font-black uppercase tracking-wider">Ca Chiều</Text>
            </View>
          </View>

          <View className="border-t border-slate-100 my-3.5 pt-3.5 flex-row justify-between items-center">
            <View>
              <Text className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Chi nhánh hoạt động</Text>
              <Text className="text-xs font-extrabold mt-0.5 text-slate-700">
                Hà Nội - Cơ sở chính
              </Text>
            </View>
            
            <TouchableOpacity 
              className="bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-xl active:bg-red-100"
              onPress={() => setIsLogoutModalOpen(true)}
            >
              <Text className="text-red-650 font-black text-[9px] uppercase tracking-wider">
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
                />
                <TextInput
                  value={printerPort}
                  onChangeText={setPrinterPort}
                  placeholder="9100"
                  placeholderTextColor="#94a3b8"
                  className="w-20 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-center text-slate-800"
                />
              </View>
            </View>
          )}

          {/* Nút in thử test */}
          <TouchableOpacity 
            className={`py-3.5 rounded-2xl items-center flex-row justify-center border-2 ${
              isPrinterConnected ? 'bg-orange-500 border-orange-500 active:bg-orange-600 shadow-md shadow-orange-500/10' : 'bg-slate-100 border-slate-200'
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

        {/* 4. ĐỒNG BỘ SQLITE CỤC BỘ */}
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">
          Chiến lược đồng bộ SQLite (Offline-First)
        </Text>
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          
          {/* Thông tin Sync status */}
          <View className="mb-4">
            <View className="flex-row justify-between py-1 items-center">
              <Text className="text-[10px] text-slate-500 font-bold uppercase">Bản ghi SQLite cục bộ:</Text>
              <Text className="text-[10px] font-black text-slate-700">v1.0.8 (Hạ tầng offline)</Text>
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
              <Text className="text-[10px] font-bold text-slate-600 leading-relaxed text-center">
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
              className="flex-1 bg-orange-500 active:bg-orange-600 py-3.5 rounded-2xl items-center mr-1.5 shadow-lg shadow-orange-500/15 flex-row justify-center border-2 border-orange-500"
              onPress={handleFullSync}
              disabled={syncProgress !== null}
            >
              <Ionicons name="sync-circle" size={16} color="white" />
              <Text className="text-white font-black text-[9px] uppercase tracking-wider ml-1">Sync Toàn phần</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-1 bg-slate-100 active:bg-slate-200 py-3.5 rounded-2xl items-center ml-1.5 flex-row justify-center border-2 border-slate-200"
              onPress={handleDeltaSync}
              disabled={syncProgress !== null}
            >
              <Ionicons name="cloud-download-outline" size={16} color="#475569" />
              <Text className="font-black text-[9px] uppercase tracking-wider ml-1 text-slate-700">Sync Delta</Text>
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
                Tự động sync sau khi in hóa đơn
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

      {/* 6. MODAL XÁC NHẬN ĐÓNG CA */}
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
              <Text className="text-base font-black text-slate-800">Xác nhận Kết thúc Ca?</Text>
              <Text className="text-xs text-slate-450 mt-2 text-center font-bold leading-relaxed">
                Hệ thống sẽ thực hiện đồng bộ tất cả hóa đơn offline đang chờ xử lý, sau đó in báo cáo doanh thu ca và đăng xuất thiết bị.
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
                onPress={() => {
                  setIsLogoutModalOpen(false);
                  alert('Đóng ca thành công! Báo cáo ca đã được gửi và in.');
                }}
              >
                <Text className="text-white font-extrabold text-xs">Đồng ý Kết ca</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
