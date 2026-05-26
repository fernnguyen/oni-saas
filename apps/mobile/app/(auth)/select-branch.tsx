import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const SAMPLE_BRANCHES = [
  {
    id: 'b1',
    name: 'Hà Nội - Cơ sở chính',
    address: '102 Thái Hà, Quận Đống Đa, Hà Nội',
    phone: '024.7300.6886',
    isActive: true,
  },
  {
    id: 'b2',
    name: 'TP. Hồ Chí Minh - Chi nhánh Quận 1',
    address: '45 Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM',
    phone: '028.7300.9999',
    isActive: true,
  },
  {
    id: 'b3',
    name: 'Đà Nẵng - Chi nhánh Hải Châu',
    address: '88 Nguyễn Văn Linh, Quận Hải Châu, Đà Nẵng',
    phone: '0236.7300.1111',
    isActive: false, // Chi nhánh tạm khóa bảo trì
  }
];

export default function SelectBranchScreen() {
  const router = useRouter();
  const [selectedBranchId, setSelectedBranchId] = useState('b1');
  const [isLoading, setIsLoading] = useState(false);

  const handleStartSession = () => {
    const branch = SAMPLE_BRANCHES.find(b => b.id === selectedBranchId);
    if (!branch) return;
    
    if (!branch.isActive) {
      alert('Chi nhánh này đang tạm khóa để bảo trì dữ liệu, vui lòng chọn chi nhánh khác!');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // Đồng bộ thành công đầu phiên -> chuyển sang trang Tổng quan (Tabs Root)
      router.replace('/(tabs)');
    }, 1500);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 justify-between px-6 py-8">
      
      {/* 1. HEADER SECTION */}
      <View className="mt-4">
        <TouchableOpacity 
          className="flex-row items-center mb-6"
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="#64748b" />
          <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider ml-1">Quay lại</Text>
        </TouchableOpacity>

        <Text className="text-xl font-black text-slate-800">Chọn chi nhánh làm việc</Text>
        <Text className="text-xs text-slate-450 mt-1 font-semibold leading-relaxed">
          Vui lòng chọn cơ sở kinh doanh để tải cơ sở dữ liệu SQLite đầu phiên và mở ca làm việc di động.
        </Text>
      </View>

      {/* 2. BRANCH LIST */}
      <ScrollView className="flex-1 my-6" showsVerticalScrollIndicator={false}>
        {SAMPLE_BRANCHES.map(branch => {
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
              disabled={isLoading}
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
                    <Text className="text-[9px] text-slate-400 font-bold mt-0.5">
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

      {/* 3. FOOTER ACTIONS */}
      <View>
        <TouchableOpacity 
          className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg shadow-orange-500/20 flex-row justify-center"
          onPress={handleStartSession}
          disabled={isLoading}
        >
          {isLoading ? (
            <View className="flex-row items-center justify-center">
              <ActivityIndicator size="small" color="white" className="mr-2" />
              <Text className="text-white font-extrabold text-sm">Đang tải dữ liệu offline (Full Sync)...</Text>
            </View>
          ) : (
            <>
              <Text className="text-white font-extrabold text-sm mr-1.5">Bắt đầu ca làm việc</Text>
              <Ionicons name="play" size={16} color="white" />
            </>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}
