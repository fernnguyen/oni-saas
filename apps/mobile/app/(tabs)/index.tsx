import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

// Mẫu dữ liệu doanh thu hàng ngày cho biểu đồ (Đồng bộ hình ảnh webapp)
const DAILY_CHART_DATA = [
  { day: '05-01', amount: 150000, height: 12, isPeak: false },
  { day: '05-02', amount: 180000, height: 15, isPeak: false },
  { day: '05-03', amount: 120000, height: 10, isPeak: false },
  { day: '05-04', amount: 140000, height: 11, isPeak: false },
  { day: '05-05', amount: 160000, height: 13, isPeak: false },
  { day: '05-06', amount: 150000, height: 12, isPeak: false },
  { day: '05-07', amount: 130000, height: 11, isPeak: false },
  { day: '05-08', amount: 170000, height: 14, isPeak: false },
  { day: '05-09', amount: 180000, height: 15, isPeak: false },
  { day: '05-10', amount: 140000, height: 11, isPeak: false },
  { day: '05-11', amount: 150000, height: 12, isPeak: false },
  { day: '05-12', amount: 160000, height: 13, isPeak: false },
  { day: '05-13', amount: 175000, height: 14, isPeak: false },
  { day: '05-14', amount: 190000, height: 16, isPeak: false },
  { day: '05-15', amount: 180000, height: 15, isPeak: false },
  { day: '05-16', amount: 200000, height: 17, isPeak: false },
  { day: '05-17', amount: 220000, height: 19, isPeak: false },
  { day: '05-18', amount: 250000, height: 21, isPeak: false },
  { day: '05-19', amount: 230000, height: 20, isPeak: false },
  { day: '05-20', amount: 240000, height: 21, isPeak: false },
  { day: '05-21', amount: 290000, height: 25, isPeak: false },
  { day: '05-22', amount: 350000, height: 32, isPeak: false },
  { day: '05-23', amount: 280000, height: 24, isPeak: false },
  { day: '05-24', amount: 1100000, height: 95, isPeak: true }, 
  { day: '05-25', amount: 560000, height: 48, isPeak: false },
  { day: '05-26', amount: 215000, height: 18, isPeak: false },
];

export default function DashboardScreen() {
  const router = useRouter();
  const [selectedTimeRange, setSelectedTimeRange] = useState('30days'); // today, 7days, 30days

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* 1. HEADER & FILTER TABS (ĐỒNG BỘ WEBAPP) */}
      <View className="px-4 py-3 border-b bg-white border-slate-200 shadow-sm flex-row justify-between items-center">
        <View>
          <Text className="text-sm font-bold text-slate-800 uppercase tracking-wide">Chỉ số báo cáo chính</Text>
          <Text className="text-[9px] text-slate-400 font-semibold mt-0.5">Thời gian thực tế đầu ca làm việc</Text>
        </View>

        {/* Nút lọc khoảng thời gian xịn như webapp */}
        <View className="flex-row bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <TouchableOpacity 
            className={`px-2.5 py-1.5 rounded-lg ${selectedTimeRange === 'today' ? 'bg-white shadow-sm' : ''}`}
            onPress={() => setSelectedTimeRange('today')}
          >
            <Text className={`text-[8px] font-bold uppercase ${selectedTimeRange === 'today' ? 'text-indigo-600' : 'text-slate-500'}`}>Hôm nay</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className={`px-2.5 py-1.5 rounded-lg ${selectedTimeRange === '7days' ? 'bg-white shadow-sm' : ''}`}
            onPress={() => setSelectedTimeRange('7days')}
          >
            <Text className={`text-[8px] font-bold uppercase ${selectedTimeRange === '7days' ? 'text-indigo-600' : 'text-slate-500'}`}>7 ngày</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className={`px-2.5 py-1.5 rounded-lg ${selectedTimeRange === '30days' ? 'bg-white shadow-sm' : ''}`}
            onPress={() => setSelectedTimeRange('30days')}
          >
            <Text className={`text-[8px] font-bold uppercase ${selectedTimeRange === '30days' ? 'text-indigo-600' : 'text-slate-500'}`}>30 ngày</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
        
        {/* 2. BỐ CỤC 4 CARD KPI CÓ VIỀN TRÊN MỊN MÀNG ĐỒNG BỘ 100% WEBAPP */}
        <View className="flex-row flex-wrap justify-between mb-4">
          
          {/* Card 1: Doanh thu hôm nay (Viền trên Cam thương hiệu) */}
          <View className="w-[48%] mb-4 p-3.5 rounded-2xl bg-white border-t-[5px] border-t-orange-500 border border-slate-200 shadow-sm justify-between">
            <View className="flex-row justify-between items-center">
              <Text className="text-[9px] font-bold text-slate-400">Doanh thu hôm nay</Text>
              <View className="bg-orange-50 p-1 rounded-full">
                <Ionicons name="logo-usd" size={12} color="#fa5908" />
              </View>
            </View>
            <View className="mt-3.5">
              <Text className="text-slate-800 font-bold text-base">2.447.500 đ</Text>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[8px] text-slate-400 font-semibold">17 đơn thành công</Text>
                <View className="bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                  <Text className="text-[7px] text-emerald-600 font-bold">+5.4%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card 2: Doanh thu tháng này (Viền trên Ngọc lục bảo) */}
          <View className="w-[48%] mb-4 p-3.5 rounded-2xl bg-white border-t-[5px] border-t-emerald-500 border border-slate-200 shadow-sm justify-between">
            <View className="flex-row justify-between items-center">
              <Text className="text-[9px] font-bold text-slate-400">Doanh thu tháng này</Text>
              <View className="bg-emerald-50 p-1 rounded-full">
                <Ionicons name="analytics" size={12} color="#10b981" />
              </View>
            </View>
            <View className="mt-3.5">
              <Text className="text-slate-800 font-bold text-base">4.773.000 đ</Text>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[8px] text-slate-400 font-semibold">31 đơn tích lũy</Text>
                <View className="bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                  <Text className="text-[7px] text-emerald-600 font-bold">+12.8%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card 3: Giá trị đơn trung bình AOV (Viền trên Tím/Violet) */}
          <View className="w-[48%] mb-4 p-3.5 rounded-2xl bg-white border-t-[5px] border-t-purple-500 border border-slate-200 shadow-sm justify-between">
            <View className="flex-row justify-between items-center">
              <Text className="text-[9px] font-bold text-slate-400">Giá trị TB (AOV)</Text>
              <View className="bg-purple-50 p-1 rounded-full">
                <Ionicons name="receipt" size={12} color="#a855f7" />
              </View>
            </View>
            <View className="mt-3.5">
              <Text className="text-slate-800 font-bold text-base">153.968 đ</Text>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[8px] text-slate-400 font-semibold">Trung bình tháng</Text>
                <View className="bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                  <Text className="text-[7px] text-emerald-600 font-bold">+4.2%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card 4: Hoàn tiền & Trả hàng (Viền trên Hồng cánh sen) */}
          <View className="w-[48%] mb-4 p-3.5 rounded-2xl bg-white border-t-[5px] border-t-pink-500 border border-slate-200 shadow-sm justify-between">
            <View className="flex-row justify-between items-center">
              <Text className="text-[9px] font-bold text-slate-400">Trả hàng & hoàn tiền</Text>
              <View className="bg-pink-50 p-1 rounded-full">
                <Ionicons name="refresh-circle-outline" size={12} color="#ec4899" />
              </View>
            </View>
            <View className="mt-3.5">
              <Text className="text-slate-800 font-bold text-base">0 đ</Text>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[8px] text-slate-400 font-semibold">0 phiếu trả lại</Text>
                <View className="bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200">
                  <Text className="text-[7px] text-slate-500 font-bold">0.0%</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 3. BIỂU ĐỒ XU HƯỚNG DOANH THU ĐỒNG BỘ 100% WEBAPP */}
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text className="text-xs font-bold text-slate-800">Xu hướng doanh thu</Text>
              <Text className="text-[9px] text-slate-400 font-semibold mt-0.5">Biểu đồ thống kê chi tiết biến động doanh số hàng ngày</Text>
            </View>
            
            {/* Chú thích biểu đồ */}
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-indigo-500 mr-1" />
              <Text className="text-[8px] text-slate-500 font-semibold">Doanh thu ngày</Text>
            </View>
          </View>

          {/* Vùng vẽ biểu đồ cột siêu mịn mượt bằng Tailwind */}
          <View className="h-44 justify-end pt-4 pb-2">
            
            {/* Vùng cột biểu đồ */}
            <View className="flex-1 flex-row items-end justify-between px-1 relative">
              <View className="absolute left-0 right-0 top-0 border-t border-slate-100/60 w-full" />
              <View className="absolute left-0 right-0 top-[33%] border-t border-slate-100/60 w-full" />
              <View className="absolute left-0 right-0 top-[66%] border-t border-slate-100/60 w-full" />

              {DAILY_CHART_DATA.map((col, idx) => (
                <View key={idx} className="flex-1 items-center mx-[1.5px] h-full justify-end">
                  <View 
                    className={`w-full rounded-t-[3px] ${
                      col.isPeak 
                        ? 'bg-indigo-655 shadow-md' 
                        : 'bg-indigo-500'
                    }`} 
                    style={{ height: `${col.height}%` as any }} 
                  />
                </View>
              ))}
            </View>

            {/* Trục hoành và Label thời gian */}
            <View className="h-0.5 w-full bg-indigo-500 mt-1" />
            <View className="flex-row justify-between mt-2 px-1">
              <Text className="text-[8px] text-slate-400 font-semibold">2026-04-26</Text>
              <Text className="text-[8px] text-slate-400 font-semibold">2026-05-11</Text>
              <Text className="text-[8px] text-slate-400 font-semibold">2026-05-25</Text>
            </View>
          </View>
        </View>

        {/* 4. SẢN PHẨM BÁN CHẠY */}
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">
          Top sản phẩm & dịch vụ bán chạy
        </Text>
        <View className="p-4 rounded-3xl border bg-white border-slate-200 shadow-sm mb-4">
          <View className="mb-3.5">
            <View className="flex-row justify-between items-center mb-1.5">
              <View className="flex-row items-center">
                <Text className="text-base mr-2">☕</Text>
                <Text className="text-xs font-semibold text-slate-800">Cà phê Phin Sữa Đá</Text>
              </View>
              <Text className="text-xs font-bold text-slate-700">48 cốc</Text>
            </View>
            <View className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <View className="h-full bg-orange-500 rounded-full" style={{ width: '90%' as any }} />
            </View>
          </View>

          <View className="mb-3.5">
            <View className="flex-row justify-between items-center mb-1.5">
              <View className="flex-row items-center">
                <Text className="text-base mr-2">🍹</Text>
                <Text className="text-xs font-semibold text-slate-800">Trà Đào Cam Sả</Text>
              </View>
              <Text className="text-xs font-bold text-slate-700">35 cốc</Text>
            </View>
            <View className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <View className="h-full bg-orange-500 rounded-full" style={{ width: '65%' as any }} />
            </View>
          </View>

          <View>
            <View className="flex-row justify-between items-center mb-1.5">
              <View className="flex-row items-center">
                <Text className="text-base mr-2">🥖</Text>
                <Text className="text-xs font-semibold text-slate-800">Bánh Mì Pate Thịt</Text>
              </View>
              <Text className="text-xs font-bold text-slate-700">24 chiếc</Text>
            </View>
            <View className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <View className="h-full bg-orange-500 rounded-full" style={{ width: '45%' as any }} />
            </View>
          </View>
        </View>

        {/* 5. VÀO PHÂN HỆ BÁN HÀNG NHANH */}
        <TouchableOpacity 
          className="bg-orange-500 active:bg-orange-655 py-4 rounded-2xl items-center shadow-lg flex-row justify-center mb-8"
          onPress={() => router.push('/(tabs)/pos')}
        >
          <Ionicons name="calculator-outline" size={16} color="white" />
          <Text className="text-white font-bold text-xs uppercase tracking-widest ml-2">Mở bàn & Bán hàng POS ngay</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
