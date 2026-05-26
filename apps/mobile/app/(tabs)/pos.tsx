import React, { useState, useEffect } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mẫu sản phẩm bán lẻ (Retail Products)
const SAMPLE_PRODUCTS = [
  { id: '1', name: 'Cà phê Phin Sữa Đá', price: 29000, category: 'Đồ uống', image: '☕', stock: 99 },
  { id: '2', name: 'Trà Đào Cam Sả', price: 35000, category: 'Đồ uống', image: '🍹', stock: 50 },
  { id: '3', name: 'Bánh Mì Pate Thịt', price: 25000, category: 'Đồ ăn', image: '🥖', stock: 30 },
  { id: '4', name: 'Combo Ăn Sáng Cao Cấp', price: 49000, category: 'Combo', image: '🍳', stock: 15 },
  { id: '5', name: 'Nước Suối Tinh Khiết', price: 10000, category: 'Đồ uống', image: '💧', stock: 200 },
];

// Mẫu bàn Bi-a / Bàn ăn (Location Resources)
const INITIAL_TABLES = [
  { id: '1', name: 'Bàn Bi-a 01 (Vip)', type: 'vip', status: 'playing', startTime: Date.now() - 3600000 * 1.5, rate: 80000 }, // Chơi được 1.5 tiếng
  { id: '2', name: 'Bàn Bi-a 02', type: 'standard', status: 'playing', startTime: Date.now() - 3600000 * 0.5, rate: 60000 }, // Chơi được 30 phút
  { id: '3', name: 'Bàn Bi-a 03', type: 'standard', status: 'idle', startTime: null, rate: 60000 },
  { id: '4', name: 'Bàn Bi-a 04', type: 'standard', status: 'idle', startTime: null, rate: 60000 },
  { id: '5', name: 'Bàn Bi-a 05 (Vip)', type: 'vip', status: 'idle', startTime: null, rate: 80000 },
  { id: '6', name: 'Bàn Bi-a 06', type: 'standard', status: 'idle', startTime: null, rate: 60000 },
];

export default function PosScreen() {
  const isDark = false; // Luôn hiển thị giao diện Sáng theo yêu cầu thương hiệu

  // State quản trị POS
  const [activeVertical, setActiveVertical] = useState('retail'); // retail, fnb, billiards
  const [cart, setCart] = useState<{ [key: string]: { name: string; price: number; quantity: number } }>({});
  const [tables, setTables] = useState(INITIAL_TABLES);
  const [activeTable, setActiveTable] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  // Ticker đếm giờ cho các bàn Bi-a đang hoạt động
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tính tiền giờ lẻ của bàn đang hoạt động
  const calculateBilling = (table: any) => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0 };
    const diffMs = Date.now() - table.startTime;
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const cost = Math.floor((totalMinutes / 60) * table.rate);
    return { hours, minutes, cost };
  };

  // Thêm vào giỏ hàng
  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          name: product.name,
          price: product.price,
          quantity: existing ? existing.quantity + 1 : 1
        }
      };
    });
  };

  // Tính tổng giỏ hàng
  const getCartTotal = () => {
    return Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };
  const getCartCount = () => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  };

  // Giả lập quét mã vạch
  const handleSimulateScan = () => {
    const randomProduct = SAMPLE_PRODUCTS[Math.floor(Math.random() * SAMPLE_PRODUCTS.length)];
    addToCart(randomProduct);
    setIsScannerOpen(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      {/* 1. TOPBAR */}
      <View className="px-4 py-3 flex-row justify-between items-center border-b bg-white border-slate-200 shadow-sm">
        <View>
          <Text className="text-lg font-bold text-slate-855">ONI POS 360</Text>
          <View className="flex-row items-center mt-0.5">
            <Text className="text-xs text-slate-505 mr-2 font-bold">Cơ sở chính</Text>
            <View className="flex-row items-center bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
              <View className="w-1.5 h-1.5 bg-emerald-600 rounded-full mr-1.5" />
              <Text className="text-[9px] text-emerald-700 font-extrabold">Đã đồng bộ</Text>
            </View>
          </View>
        </View>

        {/* Nút quét mã vạch */}
        <TouchableOpacity 
          className="bg-orange-500 active:bg-orange-600 p-2.5 rounded-2xl flex-row items-center shadow-md"
          onPress={() => setIsScannerOpen(true)}
        >
          <Ionicons name="barcode-outline" size={18} color="white" />
          <Text className="text-white text-xs font-bold ml-1.5 uppercase tracking-wider">Quét mã</Text>
        </TouchableOpacity>
      </View>

      {/* 2. CHỌN PHÂN HỆ NGÀNH HÀNG (DYN SELECTOR) */}
      <View className="py-3.5 px-4 bg-slate-50">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity 
            className={`mr-3 px-4.5 py-3 rounded-2xl flex-row items-center border-2 ${
              activeVertical === 'retail' 
                ? 'bg-orange-500 border-orange-500 shadow-md' 
                : 'bg-white border-slate-200'
            }`}
            onPress={() => setActiveVertical('retail')}
          >
            <Text className="text-base mr-2">🛒</Text>
            <Text className={`font-bold text-xs uppercase tracking-wider ${activeVertical === 'retail' ? 'text-white' : 'text-slate-700'}`}>
              Bán lẻ (Retail)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`mr-3 px-4.5 py-3 rounded-2xl flex-row items-center border-2 ${
              activeVertical === 'billiards' 
                ? 'bg-orange-500 border-orange-500 shadow-md' 
                : 'bg-white border-slate-200'
            }`}
            onPress={() => setActiveVertical('billiards')}
          >
            <Text className="text-base mr-2">🎱</Text>
            <Text className={`font-bold text-xs uppercase tracking-wider ${activeVertical === 'billiards' ? 'text-white' : 'text-slate-700'}`}>
              Bàn Bi-a (Time-based)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3. NỘI DUNG CHI TIẾT TÙY BIẾN THEO VERTICAL */}
      {activeVertical === 'retail' ? (
        // 🛒 GIAO DIỆN BÁN LẺ (PRODUCT GRID)
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">
            Danh mục sản phẩm
          </Text>
          <View className="flex-row flex-wrap justify-between pb-24">
            {SAMPLE_PRODUCTS.map(p => (
              <View 
                key={p.id} 
                className="w-[48%] mb-4 p-3 rounded-[24px] border bg-white border-slate-200 shadow-sm justify-between"
              >
                <View className="items-center py-4 bg-slate-50 border border-slate-100 rounded-2xl mb-3">
                  <Text className="text-4xl">{p.image}</Text>
                </View>
                <Text className="font-bold text-sm text-slate-900" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">{p.category}</Text>
                
                <View className="flex-row justify-between items-center mt-3">
                  <Text className="text-orange-500 font-bold text-sm">
                    {p.price.toLocaleString()}đ
                  </Text>
                  
                  <TouchableOpacity 
                    className="bg-orange-500 active:bg-orange-655 p-2.5 rounded-xl shadow-md"
                    onPress={() => addToCart(p)}
                  >
                    <Ionicons name="add" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        // 🎱 GIAO DIỆN PHÒNG BÀN (TABLE MAP / TIME-BASED BILLING)
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">
            Sơ đồ bàn đang hoạt động
          </Text>
          <View className="flex-row flex-wrap justify-between pb-24">
            {tables.map(t => {
              const isActive = t.status === 'playing';
              const billing = calculateBilling(t);

              return (
                <TouchableOpacity 
                  key={t.id}
                  className={`w-[48%] mb-4 p-4 rounded-[28px] border-2 ${
                    isActive 
                      ? 'border-orange-500 bg-orange-50/70 shadow-md' 
                      : 'bg-white border-slate-200'
                  } shadow-sm`}
                  onPress={() => isActive && setActiveTable(t)}
                >
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-2xl">🎱</Text>
                    <View className={`px-2 py-0.5 rounded-full border ${
                      isActive 
                        ? 'bg-orange-500 border-orange-600' 
                        : 'bg-slate-100 border-slate-200'
                    }`}>
                      <Text className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-slate-500'}`}>
                        {isActive ? 'Đang chơi' : 'Trống'}
                      </Text>
                    </View>
                  </View>
                  
                  <Text className="font-bold text-sm text-slate-800">
                    {t.name}
                  </Text>
                  
                  {isActive ? (
                    <View className="mt-2.5 bg-orange-100/60 border border-orange-200/80 p-2 rounded-xl">
                      <Text className="text-xs text-orange-600 font-bold flex-row items-center">
                        <Ionicons name="time-outline" size={12} /> {billing.hours}h {billing.minutes}m
                      </Text>
                      <Text className="text-xs text-orange-600 font-bold mt-0.5">
                        {billing.cost.toLocaleString()}đ
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-[10px] text-slate-400 font-bold mt-2">
                      Đơn giá: {t.rate.toLocaleString()}đ/h
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* 4. THANH GIỎ HÀNG TÓM TẮT TRƯỢT DƯỚI (BOTTOM CART BAR) */}
      {getCartCount() > 0 && (
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-200 flex-row justify-between items-center shadow-2xl">
          <View className="flex-row items-center">
            <View className="bg-orange-100 p-2.5 rounded-2xl mr-3 relative">
              <Ionicons name="cart" size={20} color="#fa5908" />
              <View className="absolute -top-1 -right-1 bg-orange-500 w-5 h-5 rounded-full items-center justify-center">
                <Text className="text-[10px] text-white font-bold">{getCartCount()}</Text>
              </View>
            </View>
            <View>
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tổng cộng</Text>
              <Text className="text-orange-500 font-bold text-lg">{getCartTotal().toLocaleString()}đ</Text>
            </View>
          </View>

          <TouchableOpacity 
            className="bg-orange-500 active:bg-orange-655 px-6 py-3.5 rounded-2xl shadow-md"
            onPress={() => {
              alert('Thanh toán thành công! Hóa đơn đã được lưu offline.');
              setCart({});
            }}
          >
            <Text className="text-white font-bold text-xs uppercase tracking-wider">Thanh toán</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. SIMULATED BARCODE SCAN DRAWER (BOTTOM SHEET MODAL) */}
      <Modal
        visible={isScannerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsScannerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="h-[45%] rounded-t-[32px] p-6 justify-between bg-white">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Ionicons name="scan-outline" size={20} color="#fa5908" />
                <Text className="text-base font-bold text-slate-800 ml-2">
                  Quét mã vạch Bottom Sheet
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsScannerOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="flex-1 bg-slate-50 border-2 border-dashed border-orange-400 rounded-3xl my-4 items-center justify-center relative overflow-hidden">
              <View className="w-[80%] h-0.5 bg-orange-500 absolute" />
              <Ionicons name="camera" size={32} color="#cbd5e1" />
              <Text className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-wider">Đang quét mã...</Text>
            </View>

            <TouchableOpacity 
              className="bg-orange-500 active:bg-orange-655 py-4 rounded-2xl items-center shadow-lg"
              onPress={handleSimulateScan}
            >
              <Text className="text-white font-bold text-sm uppercase tracking-wider">Giả lập quét mã thành công (Beep!)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 6. MODAL XEM CHI TIẾT BÀN BI-A */}
      <Modal
        visible={!!activeTable}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActiveTable(null)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          {activeTable && (
            <View className="w-full max-w-md p-6 rounded-3xl shadow-2xl bg-white border border-slate-100">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-bold text-slate-800">{activeTable.name}</Text>
                <TouchableOpacity onPress={() => setActiveTable(null)} className="p-1">
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View className="bg-orange-50 border border-orange-200/80 p-4 rounded-2xl mb-5">
                <Text className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Tạm tính tiền giờ:</Text>
                <Text className="text-orange-500 text-3xl font-bold mt-1">
                  {calculateBilling(activeTable).cost.toLocaleString()}đ
                </Text>
                <Text className="text-[10px] text-slate-550 mt-3 font-bold flex-row items-center">
                  <Ionicons name="play-outline" /> Bắt đầu lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                </Text>
              </View>

              <TouchableOpacity 
                className="bg-orange-500 active:bg-orange-655 py-4 rounded-2xl items-center shadow-lg"
                onPress={() => {
                  alert(`Đã trả bàn & in hóa đơn tạm tính: ${calculateBilling(activeTable).cost.toLocaleString()}đ`);
                  setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, status: 'idle', startTime: null } : t));
                  setActiveTable(null);
                }}
              >
                <Text className="text-white font-bold text-base uppercase tracking-wider">Trả bàn & In hóa đơn</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
