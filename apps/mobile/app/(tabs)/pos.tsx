import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';

export default function PosScreen() {
  // State quản trị POS từ SQLite
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeVertical, setActiveVertical] = useState('retail'); // retail, billiards
  const [cart, setCart] = useState<{ [key: string]: { name: string; price: number; quantity: number } }>({});
  const [activeTable, setActiveTable] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  
  // Ticker đếm giờ cho các bàn Bi-a đang hoạt động
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tải dữ liệu thực tế mỗi lần màn hình được Focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadPosData = async () => {
        try {
          if (isMounted) setIsLoading(true);
          const prods = await db.select().from(schema.products);
          const cats = await db.select().from(schema.categories);
          const resources = await db.select().from(schema.location_resources);

          // Kiểm tra xem có đơn hàng nào chờ sync không để đổi badge trạng thái đồng bộ
          const pendingOrdersCount = await db
            .select()
            .from(schema.orders)
            .where(eq(schema.orders.sync_status, 'pending'));

          if (isMounted) {
            setProductsList(prods);
            setCategoriesList(cats);
            setTables(resources);
            setSyncStatus(pendingOrdersCount.length > 0 ? 'pending' : 'synced');
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Lỗi khi tải dữ liệu SQLite POS:', error);
          if (isMounted) setIsLoading(false);
        }
      };

      loadPosData();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  // Tính tiền giờ lẻ của bàn đang hoạt động
  const calculateBilling = (table: any) => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0 };
    const diffMs = Date.now() - table.startTime;
    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000)); // Tối thiểu 1 phút
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const cost = Math.floor((totalMinutes / 60) * table.hourly_rate);
    return { hours, minutes, cost };
  };

  // Thêm vào giỏ hàng bán lẻ
  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          name: product.name,
          price: product.sell_price,
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

  // Xử lý click Bàn Bi-a
  const handleTablePress = (table: any) => {
    if (table.status === 'playing') {
      setActiveTable(table);
    } else {
      // Mở bàn trống
      Alert.alert(
        'Mở bàn tính giờ',
        `Bạn có muốn bắt đầu mở tính giờ cho "${table.name}"?\n(Đơn giá: ${table.hourly_rate.toLocaleString()}đ/h)`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Mở bàn ngay',
            onPress: async () => {
              try {
                const nowTime = Date.now();
                await db
                  .update(schema.location_resources)
                  .set({ status: 'playing', startTime: nowTime })
                  .where(eq(schema.location_resources.id, table.id));
                
                // Tải lại sơ đồ bàn
                const updated = await db.select().from(schema.location_resources);
                setTables(updated);
              } catch (err) {
                console.error('Không thể cập nhật bàn bi-a SQLite:', err);
              }
            }
          }
        ]
      );
    }
  };

  // Thanh toán bàn chơi Bi-a
  const handlePayTable = (paymentMethod: 'Tiền mặt' | 'Chuyển khoản') => {
    if (!activeTable) return;
    
    Alert.alert(
      'Thanh toán bàn',
      `Xác nhận thanh toán ${activeTable.name} bằng hình thức [${paymentMethod}]?`,
      [
        { text: 'Quay lại', style: 'cancel' },
        {
          text: 'Xác nhận & In bill',
          onPress: async () => {
            try {
              const billing = calculateBilling(activeTable);
              const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
              const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
              const orderId = `ORD-T-${Date.now()}`;
              const nowStr = new Date().toISOString();

              // 1. Tạo đơn hàng SQLite
              await db.insert(schema.orders).values({
                id: orderId,
                order_no: `HD-🎱-${Date.now().toString().substring(9)}`,
                status: 'completed',
                customer_name: 'Khách bàn Bi-a',
                total_amount: billing.cost,
                paid_amount: billing.cost,
                payment_method: paymentMethod,
                created_at: nowStr,
                shift_id: shiftId,
                sync_status: 'pending',
              });

              // 2. Tạo chi tiết đơn hàng
              await db.insert(schema.order_items).values({
                id: `ORDI-${orderId}-time`,
                order_id: orderId,
                product_id: 'billiard-time',
                product_name: `Tiền giờ - ${activeTable.name}`,
                qty: 1,
                unit_price: billing.cost,
                line_total: billing.cost,
              });

              // 3. Đưa bàn bi-a về trống
              await db
                .update(schema.location_resources)
                .set({ status: 'idle', startTime: null })
                .where(eq(schema.location_resources.id, activeTable.id));

              Alert.alert('Thành công', `Đã thanh toán bàn chơi. Hóa đơn ngoại tuyến ${orderId} đang được tải lên đám mây.`);
              
              // Load lại bàn
              const updated = await db.select().from(schema.location_resources);
              setTables(updated);
              setActiveTable(null);
              setSyncStatus('pending');

              // Trigger sync ngầm
              SyncManager.pushOfflineOrders(shopId);
            } catch (err) {
              console.error('Lỗi thanh toán bàn chơi:', err);
              Alert.alert('Lỗi', 'Không thể lưu hóa đơn bàn chơi.');
            }
          }
        }
      ]
    );
  };

  // Thanh toán Giỏ hàng Bán lẻ
  const handlePayCart = (paymentMethod: 'Tiền mặt' | 'Chuyển khoản') => {
    Alert.alert(
      'Thanh toán bán lẻ',
      `Thanh toán hóa đơn trị giá ${getCartTotal().toLocaleString()}đ bằng [${paymentMethod}]?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận thanh toán',
          onPress: async () => {
            try {
              const totalAmount = getCartTotal();
              const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
              const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
              const orderId = `ORD-R-${Date.now()}`;
              const nowStr = new Date().toISOString();

              // 1. Insert order SQLite
              await db.insert(schema.orders).values({
                id: orderId,
                order_no: `HD-R-${Date.now().toString().substring(9)}`,
                status: 'completed',
                customer_name: 'Khách mua lẻ',
                total_amount: totalAmount,
                paid_amount: totalAmount,
                payment_method: paymentMethod,
                created_at: nowStr,
                shift_id: shiftId,
                sync_status: 'pending',
              });

              // 2. Insert order items & trừ kho offline
              for (const [prodId, item] of Object.entries(cart)) {
                await db.insert(schema.order_items).values({
                  id: `ORDI-${orderId}-${prodId}`,
                  order_id: orderId,
                  product_id: prodId,
                  product_name: item.name,
                  qty: item.quantity,
                  unit_price: item.price,
                  line_total: item.price * item.quantity,
                });

                // Cập nhật stock offline của sản phẩm
                const originalProd = productsList.find(p => p.id === prodId);
                if (originalProd) {
                  const newStock = Math.max(0, originalProd.stock_qty - item.quantity);
                  await db
                    .update(schema.products)
                    .set({ stock_qty: newStock })
                    .where(eq(schema.products.id, prodId));
                }
              }

              Alert.alert('Thanh toán thành công', `Hóa đơn lẻ ${orderId} đã lưu offline và đang được tải lên đám mây.`);
              setCart({});
              setSyncStatus('pending');

              // Tải lại danh sách sản phẩm để phản ánh kho mới
              const updatedProds = await db.select().from(schema.products);
              setProductsList(updatedProds);

              // Đẩy đơn hàng offline ngầm lên server
              SyncManager.pushOfflineOrders(shopId);
            } catch (err) {
              console.error('Lỗi khi thanh toán đơn lẻ SQLite:', err);
              Alert.alert('Lỗi lưu trữ', 'Không thể ghi hóa đơn bán lẻ vào SQLite.');
            }
          }
        }
      ]
    );
  };

  // Giả lập quét mã vạch thành công từ danh sách sản phẩm thực tế
  const handleSimulateScan = () => {
    if (productsList.length === 0) {
      Alert.alert('Lỗi', 'Không có sản phẩm nào trong SQLite để quét.');
      setIsScannerOpen(false);
      return;
    }
    const randomProduct = productsList[Math.floor(Math.random() * productsList.length)];
    addToCart(randomProduct);
    setIsScannerOpen(false);
  };

  // Lọc sản phẩm theo danh mục đang chọn
  const filteredProducts = selectedCategoryId === 'all'
    ? productsList
    : productsList.filter(p => p.category_id === selectedCategoryId);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* 1. TOPBAR */}
      <View className="px-4 py-3 flex-row justify-between items-center border-b bg-white border-slate-200 shadow-sm">
        <View>
          <Text className="text-lg font-bold text-slate-800">ONI POS 360</Text>
          <View className="flex-row items-center mt-0.5">
            <Text className="text-xs text-slate-500 mr-2 font-bold">Bán hàng ngoại tuyến</Text>
            
            <View className={`flex-row items-center px-2 py-0.5 rounded-full border ${
              syncStatus === 'synced' 
                ? 'bg-emerald-50 border-emerald-300' 
                : 'bg-amber-50 border-amber-300'
            }`}>
              <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                syncStatus === 'synced' ? 'bg-emerald-600' : 'bg-amber-500'
              }`} />
              <Text className={`text-[9px] font-extrabold uppercase ${
                syncStatus === 'synced' ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {syncStatus === 'synced' ? 'Đã đồng bộ' : 'Chờ đồng bộ...'}
              </Text>
            </View>
          </View>
        </View>

        {/* Nút quét mã vạch */}
        <TouchableOpacity 
          className="bg-orange-500 active:bg-orange-655 p-2.5 rounded-2xl flex-row items-center shadow-md"
          onPress={() => setIsScannerOpen(true)}
        >
          <Ionicons name="barcode-outline" size={18} color="white" />
          <Text className="text-white text-xs font-bold ml-1.5 uppercase tracking-wider">Quét mã</Text>
        </TouchableOpacity>
      </View>

      {/* 2. PHÂN HỆ NGÀNH HÀNG */}
      <View className="py-3 px-4 bg-slate-50">
        <View className="flex-row">
          <TouchableOpacity 
            className={`mr-3 px-4.5 py-3 rounded-2xl flex-row items-center border-2 ${
              activeVertical === 'retail' 
                ? 'bg-orange-500 border-orange-500 shadow-md shadow-orange-500/10' 
                : 'bg-white border-slate-200'
            }`}
            onPress={() => setActiveVertical('retail')}
          >
            <Text className="text-base mr-2">🛒</Text>
            <Text className={`font-bold text-xs uppercase tracking-wider ${activeVertical === 'retail' ? 'text-white' : 'text-slate-700'}`}>
              Bán lẻ & Cafe
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`px-4.5 py-3 rounded-2xl flex-row items-center border-2 ${
              activeVertical === 'billiards' 
                ? 'bg-orange-500 border-orange-500 shadow-md shadow-orange-500/10' 
                : 'bg-white border-slate-200'
            }`}
            onPress={() => setActiveVertical('billiards')}
          >
            <Text className="text-base mr-2">🎱</Text>
            <Text className={`font-bold text-xs uppercase tracking-wider ${activeVertical === 'billiards' ? 'text-white' : 'text-slate-700'}`}>
              Bàn Bi-a (Tính giờ)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. NỘI DUNG CHI TIẾT */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-450 font-bold mt-2">Đang tải dữ liệu SQLite...</Text>
        </View>
      ) : activeVertical === 'retail' ? (
        // 🛒 GIAO DIỆN BÁN LẺ VỚI LỌC DANH MỤC DYN
        <View className="flex-1 px-4">
          
          {/* Lọc danh mục sản phẩm */}
          <View className="mb-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                className={`mr-2.5 px-3.5 py-2 rounded-xl border ${
                  selectedCategoryId === 'all'
                    ? 'bg-orange-50 border-orange-500 text-orange-600'
                    : 'bg-white border-slate-200 text-slate-500'
                }`}
                onPress={() => setSelectedCategoryId('all')}
              >
                <Text className={`text-[10px] font-black uppercase ${selectedCategoryId === 'all' ? 'text-orange-500' : 'text-slate-500'}`}>
                  Tất cả ({productsList.length})
                </Text>
              </TouchableOpacity>
              
              {categoriesList.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  className={`mr-2.5 px-3.5 py-2 rounded-xl border ${
                    selectedCategoryId === cat.id
                      ? 'bg-orange-50 border-orange-500'
                      : 'bg-white border-slate-200'
                  }`}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <Text className={`text-[10px] font-black uppercase ${selectedCategoryId === cat.id ? 'text-orange-500' : 'text-slate-500'}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Grid sản phẩm */}
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-2">
                <Ionicons name="basket-outline" size={40} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-bold mt-2">Không tìm thấy sản phẩm nào.</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between pb-28">
                {filteredProducts.map(p => (
                  <View 
                    key={p.id} 
                    className="w-[48%] mb-4 p-3 rounded-[24px] border bg-white border-slate-200 shadow-sm justify-between"
                  >
                    <View className="items-center py-4 bg-slate-50 border border-slate-100 rounded-2xl mb-3">
                      <Text className="text-4xl">
                        {p.name.toLowerCase().includes('cà phê') ? '☕' : 
                         p.name.toLowerCase().includes('trà') ? '🍹' : 
                         p.name.toLowerCase().includes('bánh mì') ? '🥖' : 
                         p.name.toLowerCase().includes('nước') ? '💧' : '📦'}
                      </Text>
                    </View>
                    
                    <Text className="font-bold text-xs text-slate-900" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                      Kho: {p.stock_qty} | {p.unit || 'cái'}
                    </Text>
                    
                    <View className="flex-row justify-between items-center mt-3">
                      <Text className="text-orange-500 font-black text-xs">
                        {p.sell_price.toLocaleString()}đ
                      </Text>
                      
                      <TouchableOpacity 
                        className="bg-orange-500 active:bg-orange-655 p-2 rounded-xl shadow-md"
                        onPress={() => addToCart(p)}
                      >
                        <Ionicons name="add" size={14} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // 🎱 SƠ ĐỒ PHÒNG BÀN (TABLE MAP)
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">
            Sơ đồ bàn bi-a ngoại tuyến
          </Text>
          
          {tables.length === 0 ? (
            <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl">
              <Ionicons name="football-outline" size={40} color="#cbd5e1" />
              <Text className="text-xs text-slate-450 font-bold mt-2">Không tìm thấy bàn nào.</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between pb-28">
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
                    onPress={() => handleTablePress(t)}
                  >
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className="text-2xl">🎱</Text>
                      <View className={`px-2 py-0.5 rounded-full border ${
                        isActive 
                          ? 'bg-orange-500 border-orange-655' 
                          : 'bg-slate-100 border-slate-200'
                      }`}>
                        <Text className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-slate-500'}`}>
                          {isActive ? 'Đang chơi' : 'Bàn trống'}
                        </Text>
                      </View>
                    </View>
                    
                    <Text className="font-bold text-xs text-slate-800">
                      {t.name}
                    </Text>
                    
                    {isActive ? (
                      <View className="mt-2.5 bg-orange-100/60 border border-orange-200/80 p-2 rounded-xl">
                        <Text className="text-xs text-orange-600 font-bold">
                          ⏱️ {billing.hours}h {billing.minutes}m
                        </Text>
                        <Text className="text-xs text-orange-600 font-bold mt-0.5">
                          {billing.cost.toLocaleString()}đ
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-[9px] text-slate-400 font-bold mt-2 leading-relaxed">
                        Giá: {t.hourly_rate.toLocaleString()}đ/h • {t.zone || 'Khu A'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* 4. THANH GIỎ HÀNG BÁN LẺ DƯỚI CÙNG */}
      {getCartCount() > 0 && activeVertical === 'retail' && (
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

          <View className="flex-row">
            <TouchableOpacity 
              className="bg-indigo-50 px-3.5 py-3.5 rounded-2xl border border-indigo-200 mr-2"
              onPress={() => handlePayCart('Chuyển khoản')}
            >
              <Text className="text-indigo-600 font-bold text-xs uppercase tracking-wider">Banking</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="bg-orange-500 active:bg-orange-655 px-5 py-3.5 rounded-2xl shadow-md"
              onPress={() => handlePayCart('Tiền mặt')}
            >
              <Text className="text-white font-bold text-xs uppercase tracking-wider">Tiền mặt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 5. CAMERA SCAN BARCODE BOTTOM SHEET */}
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
                  Quét mã vạch sản phẩm
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
              <Text className="text-white font-bold text-sm uppercase tracking-wider">Giả lập quét mã vạch sản phẩm</Text>
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
                <Text className="text-[10px] text-slate-500 mt-3 font-bold">
                  ⏱️ Bắt đầu lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                </Text>
              </View>

              <View className="flex-row justify-between">
                <TouchableOpacity 
                  className="flex-1 bg-slate-100 py-4 rounded-2xl items-center mr-1.5 border border-slate-200 active:bg-slate-200"
                  onPress={() => handlePayTable('Chuyển khoản')}
                >
                  <Text className="text-slate-700 font-bold text-xs uppercase tracking-wider">Mã QR / CK</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  className="flex-1 bg-orange-500 active:bg-orange-655 py-4 rounded-2xl items-center ml-1.5 shadow-lg shadow-orange-500/10"
                  onPress={() => handlePayTable('Tiền mặt')}
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">Tiền mặt</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
