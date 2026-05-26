import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, Platform, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';

export default function PosScreen() {
  // State quản trị POS từ SQLite
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeVertical, setActiveVertical] = useState('retail'); // retail, billiards
  const [cart, setCart] = useState<{ [key: string]: { name: string; price: number; quantity: number } }>({});
  const [activeTable, setActiveTable] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');

  // Hỗ trợ Tìm kiếm Nhanh & Phân trang Lazy Load cho 800+ sản phẩm
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Trạng thái Quản lý Giỏ hàng & Thanh toán Chi tiết
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Tiền mặt');
  
  // Các tính năng nâng cao: Chọn khách hàng, Giảm giá, Ghi chú, Chia hóa đơn (Split payment) & QR Code
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [paymentRows, setPaymentRows] = useState<{ id: string; method: 'Tiền mặt' | 'Chuyển khoản' | 'Thẻ ATM' | 'Ví MoMo' | 'Ghi nợ'; amount: number }[]>([
    { id: '1', method: 'Tiền mặt', amount: 0 }
  ]);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrPayload, setQrPayload] = useState<{ amount: number; orderNo: string } | null>(null);
  
  // Ticker đếm giờ cho các bàn Bi-a đang hoạt động
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tự động đồng bộ số tiền thanh toán mặc định khi giỏ hàng hoặc giảm giá thay đổi
  useEffect(() => {
    const finalTotal = Math.max(0, getCartTotal() - discountAmount);
    setPaymentRows([
      { id: '1', method: 'Tiền mặt', amount: finalTotal }
    ]);
  }, [cart, discountAmount]);

  // Tải dữ liệu thực tế mỗi lần màn hình được Focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadPosData = async () => {
        try {
          if (isMounted) setIsLoading(true);
          let prods = [];
          let cats = [];
          let resources = [];
          let customers = [];
          let hasPending = false;

          if (Platform.OS === 'web') {
            const headers = await getApiHeaders();
            const url = getApiBaseUrl();
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            
            const prodRes = await fetch(`${url}/api/shops/${shopId}/products?limit=2000&nocache=true`, { headers });
            const catRes = await fetch(`${url}/api/shops/${shopId}/categories?limit=500`, { headers });
            const tableRes = await fetch(`${url}/api/shops/${shopId}/location-resources?limit=500`, { headers });
            const custRes = await fetch(`${url}/api/shops/${shopId}/customers?limit=1000`, { headers });
            
            if (prodRes.ok) prods = (await prodRes.json()).data || [];
            if (catRes.ok) cats = (await catRes.json()).data || [];
            if (tableRes.ok) resources = (await tableRes.json()).data || [];
            if (custRes.ok) customers = (await custRes.json()).data || [];
          } else {
            prods = await db.select().from(schema.products);
            cats = await db.select().from(schema.categories);
            resources = await db.select().from(schema.location_resources);
            customers = await db.select().from(schema.customers);

            // Kiểm tra xem có đơn hàng nào chờ sync không để đổi badge trạng thái đồng bộ
            const pendingOrdersCount = await db
              .select()
              .from(schema.orders)
              .where(eq(schema.orders.sync_status, 'pending'));
            hasPending = pendingOrdersCount.length > 0;
          }

          if (isMounted) {
            setProductsList(prods);
            setCategoriesList(cats);
            setTables(resources);
            setCustomersList(customers);
            setSyncStatus(hasPending ? 'pending' : 'synced');
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Lỗi khi tải dữ liệu POS:', error);
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
  const handlePayCart = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: 'Tiền mặt' | 'Chuyển khoản' | 'Thẻ ATM' | 'Ví MoMo' | 'Ghi nợ'; amount: number }[]
  ) => {
    try {
      const originalTotal = getCartTotal();
      const finalTotal = Math.max(0, originalTotal - discount);
      const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);

      // Lưu trữ phương thức thanh toán dưới dạng JSON string để hỗ trợ Split-Payment
      const paymentMethodString = JSON.stringify(payments.map(p => ({ method: p.method, amount: p.amount })));

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const orderId = `ORD-R-${Date.now()}`;
      const orderNo = `HD-R-${Date.now().toString().substring(9)}`;
      const nowStr = new Date().toISOString();

      // 1. Insert order SQLite với thông tin khách hàng, giảm giá, ghi chú và phương thức thanh toán
      await db.insert(schema.orders).values({
        id: orderId,
        order_no: orderNo,
        status: 'completed',
        customer_id: customer ? customer.id : null,
        customer_name: customer ? customer.name : 'Khách mua lẻ',
        total_amount: finalTotal,
        paid_amount: paidSum,
        payment_method: paymentMethodString,
        created_at: nowStr,
        shift_id: shiftId,
        sync_status: 'pending',
        note: note,
        discount_amount: discount,
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

      // 3. Reset các trạng thái giỏ hàng
      setCart({});
      setDiscountAmount(0);
      setOrderNote('');
      setSelectedCustomer(null);
      setSyncStatus('pending');

      // Tải lại danh sách sản phẩm để phản ánh kho mới
      const updatedProds = await db.select().from(schema.products);
      setProductsList(updatedProds);

      // Đẩy đơn hàng offline ngầm lên server
      SyncManager.pushOfflineOrders(shopId);

      // 4. Nếu có phương thức thanh toán Chuyển khoản, kích hoạt hiển thị QR Code
      const hasTransfer = payments.some(p => p.method === 'Chuyển khoản' && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = payments.filter(p => p.method === 'Chuyển khoản').reduce((sum, p) => sum + p.amount, 0);
        setQrPayload({ amount: transferAmount, orderNo: orderNo });
        setIsQrModalOpen(true);
      } else {
        Alert.alert('Thanh toán thành công', `Hóa đơn lẻ ${orderNo} đã lưu offline và đang được đồng bộ lên máy chủ.`);
      }
    } catch (err) {
      console.error('Lỗi khi thanh toán đơn lẻ SQLite:', err);
      Alert.alert('Lỗi lưu trữ', 'Không thể ghi hóa đơn bán lẻ vào SQLite.');
    }
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

  // Lọc sản phẩm theo danh mục và từ khóa tìm kiếm nhanh
  const filteredProducts = productsList.filter(p => {
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const matchesSearch = !productSearchQuery.trim() || 
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Sản phẩm hiển thị thực tế (Lazy-load phân trang)
  const displayedProducts = filteredProducts.slice(0, displayLimit);

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
          
          {/* Tìm kiếm nhanh */}
          <View className="mb-3.5 flex-row items-center bg-white border border-slate-200 rounded-2xl px-3.5 py-1 shadow-sm">
            <Ionicons name="search-outline" size={16} color="#94a3b8" />
            <TextInput
              className="flex-1 ml-2 text-xs text-slate-850 py-2"
              placeholder="Tìm theo tên, SKU hoặc mã vạch..."
              placeholderTextColor="#94a3b8"
              value={productSearchQuery}
              onChangeText={(text) => {
                setProductSearchQuery(text);
                setDisplayLimit(20);
              }}
              style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
            />
            {productSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setProductSearchQuery(''); setDisplayLimit(20); }}>
                <Ionicons name="close-circle" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>

          {/* Lọc danh mục sản phẩm */}
          <View className="mb-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                className={`mr-2.5 px-3.5 py-2 rounded-xl border ${
                  selectedCategoryId === 'all'
                    ? 'bg-orange-50 border-orange-500'
                    : 'bg-white border-slate-200'
                }`}
                onPress={() => {
                  setSelectedCategoryId('all');
                  setDisplayLimit(20);
                }}
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
                  onPress={() => {
                    setSelectedCategoryId(cat.id);
                    setDisplayLimit(20);
                  }}
                >
                  <Text className={`text-[10px] font-black uppercase ${selectedCategoryId === cat.id ? 'text-orange-500' : 'text-slate-500'}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Grid sản phẩm với Infinite Scroll */}
          <ScrollView 
            className="flex-1" 
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              // Kích hoạt load tiếp khi cuộn cách đáy 250px
              const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 250;
              if (isCloseToBottom && displayLimit < filteredProducts.length) {
                setDisplayLimit(prev => prev + 20);
              }
            }}
            scrollEventThrottle={400}
          >
            {filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-2">
                <Ionicons name="basket-outline" size={40} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-bold mt-2">Không tìm thấy sản phẩm nào.</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between pb-28">
                {displayedProducts.map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    className="w-[48%] mb-4 p-3 rounded-[24px] border bg-white border-slate-200 shadow-sm justify-between active:scale-[0.98] active:bg-slate-50"
                    onPress={() => addToCart(p)}
                  >
                    <View className="w-full h-28 bg-slate-50 border border-slate-100 rounded-2xl mb-3 overflow-hidden justify-center items-center">
                      {p.image_url ? (
                        <Image
                          source={{ 
                            uri: p.image_url.startsWith('http') 
                              ? p.image_url 
                              : `${getApiBaseUrl()}${p.image_url.startsWith('/') ? '' : '/'}${p.image_url}` 
                          }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="items-center justify-center bg-gradient-to-br from-orange-500 to-amber-500 w-full h-full relative">
                          {/* Đốm sáng hiệu ứng sang trọng */}
                          <View className="absolute w-12 h-12 bg-white/20 rounded-full -top-4 -left-4" />
                          <View className="absolute w-8 h-8 bg-white/10 rounded-full -bottom-2 -right-2" />
                          <Text className="text-white font-black text-lg tracking-widest">ONI</Text>
                          <Text className="text-white/80 text-[7px] font-bold uppercase tracking-wider mt-0.5">ERP System</Text>
                        </View>
                      )}
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
                      
                      <View className="bg-orange-100 p-1.5 rounded-xl">
                        <Ionicons name="add" size={12} color="#fa5908" />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                
                {/* Hiển thị spinner khi có thêm sản phẩm đang tải */}
                {displayLimit < filteredProducts.length && (
                  <View className="w-full py-4 items-center justify-center flex-row">
                    <ActivityIndicator size="small" color="#fa5908" />
                    <Text className="text-[10px] text-slate-400 font-bold ml-2">Đang tải thêm sản phẩm...</Text>
                  </View>
                )}
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
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-200 flex-row justify-between items-center shadow-2xl pb-6">
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
            className="bg-orange-500 active:bg-orange-600 px-6 py-3.5 rounded-2xl shadow-lg flex-row items-center"
            onPress={() => setIsCartModalOpen(true)}
          >
            <Text className="text-white font-bold text-xs uppercase tracking-wider mr-1.5">Thanh toán ngay</Text>
            <Ionicons name="arrow-forward" size={14} color="white" />
          </TouchableOpacity>
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

      {/* 7. MODAL GIỎ HÀNG & THANH TOÁN CHI TIẾT (Interactive Checkout Bottom Sheet) */}
      <Modal
        visible={isCartModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCartModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="h-[90%] rounded-t-[32px] p-6 bg-white shadow-2xl justify-between">
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="wallet-outline" size={22} color="#fa5908" />
                <Text className="text-base font-bold text-slate-800 ml-2">
                  Thanh toán đơn hàng ({getCartCount()} sản phẩm)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsCartModalOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Thân Modal */}
            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              {/* 1. KHÁCH HÀNG */}
              <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khách hàng</Text>
                  {selectedCustomer ? (
                    <TouchableOpacity 
                      className="flex-row items-center" 
                      onPress={() => {
                        setSelectedCustomer(null);
                        setCustomerSearchQuery('');
                      }}
                    >
                      <Text className="text-xs font-bold text-rose-500 mr-1">{selectedCustomer.name}</Text>
                      <Ionicons name="close-circle" size={14} color="#f43f5e" />
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-xs font-bold text-slate-600">Khách mua lẻ</Text>
                  )}
                </View>

                {/* Input tìm kiếm khách hàng */}
                <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Ionicons name="search-outline" size={14} color="#94a3b8" />
                  <TextInput
                    className="flex-1 ml-2 text-xs text-slate-800 py-1"
                    placeholder="Tìm khách hàng theo tên hoặc số điện thoại..."
                    placeholderTextColor="#cbd5e1"
                    value={customerSearchQuery}
                    onChangeText={setCustomerSearchQuery}
                    style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                  />
                  {customerSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                      <Ionicons name="close" size={14} color="#cbd5e1" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Danh sách gợi ý khách hàng */}
                {customerSearchQuery.trim().length > 0 && (
                  <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden shadow-lg z-50">
                    <ScrollView nestedScrollEnabled={true}>
                      {customersList
                        .filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || c.phone.includes(customerSearchQuery))
                        .map(cust => (
                          <TouchableOpacity 
                            key={cust.id} 
                            className="p-3 border-b border-slate-100 flex-row justify-between items-center active:bg-slate-50"
                            onPress={() => {
                              setSelectedCustomer(cust);
                              setCustomerSearchQuery('');
                            }}
                          >
                            <View>
                              <Text className="text-xs font-bold text-slate-800">{cust.name}</Text>
                              <Text className="text-[10px] text-slate-400 mt-0.5">{cust.phone}</Text>
                            </View>
                            <View className="bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                              <Text className="text-[8px] font-bold text-orange-600 uppercase">{cust.customer_type || 'Member'}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 2. CHI TIẾT SẢN PHẨM */}
              <View className="bg-white border border-slate-200/60 rounded-2xl p-4 mb-4">
                {Object.entries(cart).map(([prodId, item], idx) => (
                  <View key={prodId} className={`flex-row justify-between items-center py-2.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View className="flex-1 mr-4">
                      <Text className="font-bold text-xs text-slate-800" numberOfLines={1}>{item.name}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">
                        {item.price.toLocaleString()}đ x {item.quantity} {productsList.find(pr => pr.id === prodId)?.unit || 'cái'}
                      </Text>
                    </View>
                    <Text className="font-black text-xs text-slate-800">
                      {(item.price * item.quantity).toLocaleString()}đ
                    </Text>
                  </View>
                ))}

                {/* Hàng Giảm giá - Có thể nhấp vào để sửa đổi trực tiếp */}
                <TouchableOpacity 
                  className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200 mt-2 active:opacity-60"
                  onPress={() => setIsEditingDiscount(prev => !prev)}
                >
                  <Text className="text-xs text-slate-450 font-bold">Giảm giá (Chạm để sửa):</Text>
                  {isEditingDiscount ? (
                    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-0.5">
                      <TextInput
                        className="text-right text-xs font-black text-slate-850 w-24 py-0.5"
                        keyboardType="numeric"
                        placeholder="Nhập tiền..."
                        placeholderTextColor="#cbd5e1"
                        value={discountAmount === 0 ? '' : discountAmount.toString()}
                        onChangeText={(val) => {
                          const amt = parseInt(val.replace(/[^0-9]/g, '')) || 0;
                          setDiscountAmount(amt);
                        }}
                        autoFocus={true}
                        style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                      />
                      <Text className="text-xs font-bold text-slate-400 ml-1">đ</Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-rose-500 font-extrabold">
                      -{discountAmount.toLocaleString()}đ
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Hàng Tổng cộng */}
                <View className="flex-row justify-between items-center py-2.5 border-t border-slate-200">
                  <Text className="text-xs text-slate-800 font-black">Tổng cộng:</Text>
                  <Text className="text-orange-500 font-black text-base">
                    {Math.max(0, getCartTotal() - discountAmount).toLocaleString()}đ
                  </Text>
                </View>
              </View>

              {/* 3. GHI CHÚ ĐƠN HÀNG */}
              <View className="bg-white border border-slate-200/60 rounded-2xl p-4 mb-4">

                {/* Ghi chú */}
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                  <Ionicons name="document-text-outline" size={14} color="#94a3b8" />
                  <TextInput
                    className="flex-1 ml-2 text-xs text-slate-800 py-1"
                    placeholder="Ghi chú đơn hàng..."
                    placeholderTextColor="#cbd5e1"
                    value={orderNote}
                    onChangeText={setOrderNote}
                    style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                  />
                </View>
              </View>

              {/* 4. CHIA PHƯƠNG THỨC THANH TOÁN (SPLIT PAYMENT) */}
              <View className="bg-white border border-slate-200/60 rounded-2xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PHƯƠNG THỨC THANH TOÁN</Text>
                  <TouchableOpacity 
                    className="flex-row items-center"
                    onPress={() => {
                      const finalTotal = Math.max(0, getCartTotal() - discountAmount);
                      const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);
                      const remaining = Math.max(0, finalTotal - paidSum);
                      setPaymentRows(prev => [
                        ...prev,
                        { id: Date.now().toString(), method: 'Chuyển khoản', amount: remaining }
                      ]);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={12} color="#fa5908" />
                    <Text className="text-xs font-extrabold text-orange-500 ml-1">+ Thêm</Text>
                  </TouchableOpacity>
                </View>

                {paymentRows.map((row, idx) => (
                  <View key={row.id} className="mb-3">
                    <View className="flex-row items-center justify-between">
                      {/* Chọn phương thức - Chạm để đổi nhanh giữa 5 loại phương thức */}
                      <TouchableOpacity 
                        className="w-[38%] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 flex-row justify-between items-center"
                        onPress={() => {
                          const methods = ['Tiền mặt', 'Chuyển khoản', 'Thẻ ATM', 'Ví MoMo', 'Ghi nợ'];
                          const curIdx = methods.indexOf(row.method);
                          const nextIdx = (curIdx + 1) % methods.length;
                          const nextMethod = methods[nextIdx];
                          setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, method: nextMethod as any } : r));
                        }}
                      >
                        <Text className="text-[11px] font-bold text-slate-700">{row.method}</Text>
                        <Ionicons name="swap-vertical" size={11} color="#fa5908" />
                      </TouchableOpacity>

                      {/* Số tiền */}
                      <View className="w-[50%] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-row items-center">
                        <TextInput
                          className="flex-1 text-right text-xs font-black text-slate-800"
                          keyboardType="numeric"
                          value={row.amount.toString()}
                          onChangeText={(val) => {
                            const amt = parseInt(val.replace(/[^0-9]/g, '')) || 0;
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, amount: amt } : r));
                          }}
                          style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                        />
                        <Text className="text-xs text-slate-400 ml-1.5">đ</Text>
                      </View>

                      {/* Nút xóa dòng */}
                      {paymentRows.length > 1 && (
                        <TouchableOpacity 
                          onPress={() => {
                            setPaymentRows(prev => prev.filter(r => r.id !== row.id));
                          }}
                          className="p-1 ml-1"
                        >
                          <Ionicons name="trash" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Dòng tiền sẽ được đưa vào quỹ tương ứng */}
                    <View className="w-full flex-row items-center bg-orange-50/50 border border-orange-100/60 px-3 py-1.5 rounded-xl mt-1.5">
                      <Ionicons name="arrow-forward" size={12} color="#fa5908" />
                      <Text className="text-[10px] text-orange-850 font-bold ml-1.5">
                        Dòng tiền đưa vào: <Text className="font-extrabold">{
                          row.method === 'Tiền mặt' ? 'Két tiền mặt tại quầy' :
                          row.method === 'Chuyển khoản' ? 'MB Bank - CONG TY TNHH ONI ERP' :
                          row.method === 'Thẻ ATM' ? 'Vietcombank - CONG TY TNHH ONI ERP' :
                          row.method === 'Ví MoMo' ? 'Ví doanh nghiệp MoMo' :
                          'Hệ thống ghi nợ (Công nợ phải thu)'
                        }</Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View className="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 mb-4 flex-row justify-between items-center">
                <Text className="text-xs text-emerald-800 font-extrabold">Số tiền nhận:</Text>
                <Text className="text-emerald-700 text-sm font-black">
                  {paymentRows.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}đ
                </Text>
              </View>
            </ScrollView>

            {/* Nút Hoàn tất */}
            <View className="flex-row justify-between items-center border-t border-slate-100 pt-4 bg-white">
              <TouchableOpacity 
                className="flex-1 bg-slate-100 border border-slate-200 py-4 rounded-2xl items-center mr-2 active:bg-slate-200"
                onPress={() => setIsCartModalOpen(false)}
              >
                <Text className="text-slate-700 font-bold text-xs uppercase tracking-wider">Hủy bỏ</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-[2] bg-orange-500 active:bg-orange-655 py-4 rounded-2xl shadow-xl flex-row justify-center items-center"
                onPress={() => {
                  const finalTotal = Math.max(0, getCartTotal() - discountAmount);
                  const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);
                  if (paidSum < finalTotal) {
                    Alert.alert('Cảnh báo', `Tổng tiền nhận (${paidSum.toLocaleString()}đ) chưa đủ thanh toán cho hóa đơn (${finalTotal.toLocaleString()}đ). Vui lòng điều chỉnh lại!`);
                    return;
                  }
                  setIsCartModalOpen(false);
                  handlePayCart(selectedCustomer, discountAmount, orderNote, paymentRows);
                }}
              >
                <Text className="text-white font-bold text-xs uppercase tracking-wider mr-1.5">Hoàn tất thanh toán</Text>
                <Ionicons name="checkmark-done" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 8. MODAL DYNAMIC QR CODE THANH TOÁN CHUYỂN KHOẢN (VietQR Generator Popup) */}
      <Modal
        visible={isQrModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsQrModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          {qrPayload && (
            <View className="w-full max-w-sm p-6 rounded-[32px] shadow-2xl bg-white border border-slate-100 items-center justify-between">
              
              {/* Header */}
              <View className="w-full flex-row justify-between items-center mb-4">
                <Text className="text-base font-bold text-slate-800">Quét mã QR Chuyển khoản</Text>
                <TouchableOpacity onPress={() => setIsQrModalOpen(false)} className="p-1">
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Bank Card Graphic */}
              <View className="w-full bg-gradient-to-r from-slate-900 to-slate-850 p-4 rounded-2xl mb-4 relative overflow-hidden shadow-md">
                <View className="absolute w-24 h-24 bg-white/5 rounded-full -top-10 -left-10" />
                <View className="absolute w-20 h-20 bg-white/5 rounded-full -bottom-10 -right-10" />
                <Text className="text-white/60 text-[8px] font-black uppercase tracking-widest">MB BANK INTERCONNECT</Text>
                <Text className="text-white text-xs font-bold mt-2">CONG TY TNHH ONI ERP</Text>
                <Text className="text-white/90 text-sm font-black mt-0.5 tracking-wider">8888 9999 6666</Text>
              </View>

              {/* QR Image Frame */}
              <View className="p-4 bg-slate-50 border border-slate-200 rounded-3xl mb-4 items-center justify-center relative shadow-inner">
                {/* Simulated VietQR QR Code */}
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`STK:888899996666|ND:${qrPayload.orderNo}|ST:${qrPayload.amount}`)}` }}
                  className="w-48 h-48 rounded-xl"
                  resizeMode="contain"
                />
                
                {/* App Brand Tag */}
                <View className="absolute bg-orange-500 px-3 py-1 rounded-full border-2 border-white -bottom-2.5">
                  <Text className="text-white text-[8px] font-black tracking-widest uppercase">ONI PAY</Text>
                </View>
              </View>

              {/* Details List */}
              <View className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-5">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-[10px] text-slate-400 font-bold uppercase">Số tiền thanh toán:</Text>
                  <Text className="text-orange-500 text-xs font-black">{qrPayload.amount.toLocaleString()}đ</Text>
                </View>

                <View className="flex-row justify-between">
                  <Text className="text-[10px] text-slate-400 font-bold uppercase">Nội dung CK:</Text>
                  <Text className="text-slate-800 text-xs font-black">{qrPayload.orderNo}</Text>
                </View>
              </View>

              {/* Confirm Button */}
              <TouchableOpacity 
                className="w-full bg-orange-500 active:bg-orange-655 py-4 rounded-2xl items-center shadow-lg shadow-orange-500/10 flex-row justify-center"
                onPress={() => {
                  setIsQrModalOpen(false);
                  Alert.alert('Thành công', `Đơn hàng ${qrPayload.orderNo} đã hoàn tất thanh toán chuyển khoản và đồng bộ.`);
                }}
              >
                <Ionicons name="checkmark-circle" size={16} color="white" />
                <Text className="text-white font-bold text-xs uppercase tracking-wider ml-1.5">Xác nhận Đã nhận tiền</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
