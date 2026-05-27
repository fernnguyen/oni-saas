import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import * as Haptics from 'expo-haptics';
import { formatCurrency, maskCurrencyInput, parseCurrencyToNumber } from '../../lib/utils/format';

// Import hệ thống component dùng chung
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DrawerMenu } from '../../components/erp/DrawerMenu';

export default function PosScreen() {
  // State quản lý POS
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeVertical, setActiveVertical] = useState('retail'); // retail, billiards
  const [shopVertical, setShopVertical] = useState<'retail' | 'billiards' | 'cafe' | 'court' | 'room'>('retail');
  const [cart, setCart] = useState<{ [key: string]: { name: string; price: number; quantity: number } }>({});
  const [activeTable, setActiveTable] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Tìm kiếm Nhanh & Phân trang Lazy Load
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Trạng thái Giỏ hàng & Thanh toán Chi tiết
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  
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
  const [openDropdownRowId, setOpenDropdownRowId] = useState<string | null>(null);

  // Hộp thoại xác nhận thay Alert.alert
  const [isTableOpenDialogVisible, setIsTableOpenDialogVisible] = useState(false);
  const [selectedTableForOpen, setSelectedTableForOpen] = useState<any>(null);

  const [isTablePayDialogVisible, setIsTablePayDialogVisible] = useState(false);
  const [selectedTableForPay, setSelectedTableForPay] = useState<any>(null);
  const [tablePayMethod, setTablePayMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Tiền mặt');
  const [isPayingTableLoading, setIsPayingTableLoading] = useState(false);

  const [isCheckoutConfirmVisible, setIsCheckoutConfirmVisible] = useState(false);
  const [isPayingCartLoading, setIsPayingCartLoading] = useState(false);

  const [isScanSuccessDialogVisible, setIsScanSuccessDialogVisible] = useState(false);
  const [scannedProductInfo, setScannedProductInfo] = useState<any>(null);
  
  // Ticker đếm giờ cho bi-a
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

  // 1. Tải lại giỏ hàng và các thông tin tạm thời khi Mount component (Giữ giỏ hàng khi chuyển tab/reload)
  useEffect(() => {
    const loadTempCart = async () => {
      try {
        const savedCart = await AsyncStorage.getItem('temp_cart');
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          if (Object.keys(parsed).length > 0) {
            setCart(parsed);
          }
        }
        const savedDiscount = await AsyncStorage.getItem('temp_discount');
        if (savedDiscount) {
          setDiscountAmount(parseInt(savedDiscount, 10) || 0);
        }
        const savedNote = await AsyncStorage.getItem('temp_note');
        if (savedNote) {
          setOrderNote(savedNote);
        }
        const savedCustomer = await AsyncStorage.getItem('temp_customer');
        if (savedCustomer) {
          setSelectedCustomer(JSON.parse(savedCustomer));
        }
      } catch (err) {
        console.error('Không thể tải lại giỏ hàng tạm thời từ AsyncStorage:', err);
      }
    };
    loadTempCart();
  }, []);

  // 2. Tự động lưu giỏ hàng khi thay đổi
  useEffect(() => {
    const saveCartToStorage = async () => {
      try {
        await AsyncStorage.setItem('temp_cart', JSON.stringify(cart));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng tạm thời:', err);
      }
    };
    saveCartToStorage();
  }, [cart]);

  // 3. Tự động lưu giảm giá, ghi chú và khách hàng được chọn khi thay đổi
  useEffect(() => {
    const saveCheckoutStates = async () => {
      try {
        await AsyncStorage.setItem('temp_discount', discountAmount.toString());
        await AsyncStorage.setItem('temp_note', orderNote);
        if (selectedCustomer) {
          await AsyncStorage.setItem('temp_customer', JSON.stringify(selectedCustomer));
        } else {
          await AsyncStorage.removeItem('temp_customer');
        }
      } catch (err) {
        console.error('Không thể lưu trạng thái thanh toán tạm thời:', err);
      }
    };
    saveCheckoutStates();
  }, [discountAmount, orderNote, selectedCustomer]);

  // Tải dữ liệu thực tế SQLite/Cloud khi màn hình được Mount
  useEffect(() => {
    let isMounted = true;
    const loadPosData = async () => {
      try {
        if (isMounted) setIsLoading(true);

        const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
        const nameLower = activeShopName.toLowerCase();
        
        let vertical: 'retail' | 'billiards' | 'cafe' | 'court' | 'room' = 'retail';
        if (nameLower.includes('bida') || nameLower.includes('billiard') || nameLower.includes('bi-a')) {
          vertical = 'billiards';
        } else if (nameLower.includes('cafe') || nameLower.includes('cà phê') || nameLower.includes('trà') || nameLower.includes('nhà hàng') || nameLower.includes('restaurant')) {
          vertical = 'cafe';
        } else if (nameLower.includes('sân') || nameLower.includes('court') || nameLower.includes('bóng') || nameLower.includes('cầu lông') || nameLower.includes('sport')) {
          vertical = 'court';
        } else if (nameLower.includes('phòng') || nameLower.includes('room') || nameLower.includes('hotel') || nameLower.includes('homestay') || nameLower.includes('motel') || nameLower.includes('karaoke')) {
          vertical = 'room';
        }
        
        if (isMounted) {
          // Tránh cập nhật state phân hệ ngay lập tức trong chu kỳ focus đầu tiên để không làm mất navigation context
          setTimeout(() => {
            if (isMounted) {
              setShopVertical(vertical);
              setActiveVertical(vertical);
            }
          }, 60);
        }

        let prods = [];
        let cats = [];
        let resources = [];
        let customers = [];
        let hasPending = false;

        if (Platform.OS === 'web') {
          // Tải dữ liệu thực tế từ REST API (Next.js) trên môi trường Web để tránh placeholder mock
          try {
            const currentUrl = getApiBaseUrl();
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            const headers = await getApiHeaders();

            // A. Tải danh mục sản phẩm
            const catRes = await fetch(`${currentUrl}/api/shops/${shopId}/categories?limit=500`, { headers });
            if (catRes.ok) {
              const catData = await catRes.json();
              cats = (catData.data || []).map((cat: any) => ({
                id: cat.id || cat.category_id,
                name: cat.name || '',
                parent_id: cat.parent_id || null,
                description: cat.description || null,
              }));
            }

            // B. Tải sản phẩm thực tế
            const prodRes = await fetch(`${currentUrl}/api/shops/${shopId}/products?limit=2000&nocache=true`, { headers });
            if (prodRes.ok) {
              const prodData = await prodRes.json();
              prods = (prodData.data || []).map((prod: any) => {
                const sellPrice = parseInt(prod.sell_price || '0', 10);
                const stockQty = parseInt(prod.stock_qty || '0', 10);
                return {
                  id: prod.id || prod.product_id,
                  name: prod.name || '',
                  sku: prod.sku || '',
                  barcode: prod.barcode || '',
                  category_id: prod.category_id || null,
                  unit: prod.unit || '',
                  sell_price: isNaN(sellPrice) ? 0 : sellPrice,
                  stock_qty: isNaN(stockQty) ? 0 : stockQty,
                  image_url: prod.image_url || null,
                  description: prod.description || null,
                };
              });
            }

            // C. Tải sơ đồ phòng bàn
            const tableRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources?limit=500`, { headers });
            if (tableRes.ok) {
              const tableData = await tableRes.json();
              resources = (tableData.data || []).map((table: any) => {
                const rate = parseInt(table.hourly_rate || '0', 10);
                return {
                  id: table.id || table.resource_id,
                  name: table.name || '',
                  type: table.type || 'table',
                  status: table.status || 'idle',
                  current_order_id: table.current_order_id || null,
                  hourly_rate: isNaN(rate) ? 0 : rate,
                  zone: table.zone || null,
                  startTime: table.status === 'playing' ? Date.now() - 3600000 : null,
                };
              });
            }

            // D. Tải danh sách khách hàng
            const custRes = await fetch(`${currentUrl}/api/shops/${shopId}/customers?limit=2000`, { headers });
            if (custRes.ok) {
              const custData = await custRes.json();
              customers = (custData.data || []).map((cust: any) => {
                const spent = parseInt(cust.total_spent || cust.prepaid_balance || '0', 10);
                const oCount = parseInt(cust.orders_count || '0', 10);
                return {
                  id: cust.id || cust.customer_id,
                  name: cust.name || '',
                  phone: cust.phone || '',
                  email: cust.email || null,
                  address: cust.address || null,
                  customer_code: cust.customer_code || null,
                  customer_type: cust.customer_type || 'Thành viên',
                  total_spent: isNaN(spent) ? 0 : spent,
                  orders_count: isNaN(oCount) ? 0 : oCount,
                  sync_status: 'synced',
                };
              });
            }
          } catch (fetchError) {
            console.warn('Lỗi khi tải dữ liệu thực tế từ REST API trên Web, sử dụng Mock làm dự phòng:', fetchError);
          }

          // Fallback sang Mock Data nếu không tải được gì
          if (prods.length === 0) {
            prods = [
              { id: 'p1', name: 'Cà phê Phin Sữa Đá', sell_price: 29000, stock_qty: 99, category_id: 'c1', unit: 'ly' },
              { id: 'p2', name: 'Trà Đào Cam Sả', sell_price: 39000, stock_qty: 45, category_id: 'c1', unit: 'ly' },
              { id: 'p3', name: 'Bánh Mì Pate Xá Xíu', sell_price: 25000, stock_qty: 20, category_id: 'c2', unit: 'cái' },
              { id: 'p4', name: 'Nước suối Aquafina', sell_price: 15000, stock_qty: 150, category_id: 'c3', unit: 'chai' }
            ];
          }
          if (cats.length === 0) {
            cats = [
              { id: 'c1', name: 'Đồ uống' },
              { id: 'c2', name: 'Thức ăn' },
              { id: 'c3', name: 'Tiện ích' }
            ];
          }
          if (resources.length === 0) {
            resources = [
              { id: 't1', name: 'Bàn Bi-a 01', type: 'table', status: 'idle', hourly_rate: 60000, zone: 'Khu A' },
              { id: 't2', name: 'Bàn Bi-a 02', type: 'table', status: 'playing', hourly_rate: 60000, zone: 'Khu A', startTime: Date.now() - 45 * 60000 },
              { id: 't3', name: 'Bàn VIP 01', type: 'table', status: 'idle', hourly_rate: 90000, zone: 'Phòng VIP' }
            ];
          }
          if (customers.length === 0) {
            customers = [
              { id: 'cust1', name: 'Nguyễn Văn Minh', phone: '0901234567', customer_type: 'VIP' },
              { id: 'cust2', name: 'Trần Thị Hằng', phone: '0987654321', customer_type: 'Thân thiết' }
            ];
          }
        } else {
          // SQLite Native
          prods = await db.select().from(schema.products);
          cats = await db.select().from(schema.categories);
          resources = await db.select().from(schema.location_resources);
          customers = await db.select().from(schema.customers);

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
  }, []);

  // Tính tiền giờ bàn bi-a
  const calculateBilling = (table: any) => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0 };
    const diffMs = Date.now() - table.startTime;
    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const cost = Math.floor((totalMinutes / 60) * table.hourly_rate);
    return { hours, minutes, cost };
  };

  // Thêm vào giỏ
  const addToCart = (product: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  // Tính tổng
  const getCartTotal = () => {
    return Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };
  const getCartCount = () => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  };

  // Mở bàn
  const handleTablePress = (table: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (table.status === 'playing') {
      setActiveTable(table);
    } else {
      setSelectedTableForOpen(table);
      setIsTableOpenDialogVisible(true);
    }
  };

  // Mở bàn
  const handleConfirmOpenTable = async () => {
    if (!selectedTableForOpen) return;
    try {
      const nowTime = Date.now();
      
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForOpen.id ? { ...t, status: 'playing', startTime: nowTime } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set({ status: 'playing', startTime: nowTime })
          .where(eq(schema.location_resources.id, selectedTableForOpen.id));
        
        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }
      setIsTableOpenDialogVisible(false);
      setSelectedTableForOpen(null);
    } catch (err) {
      console.error('Không thể mở bàn bi-a:', err);
    }
  };

  // Bấm thanh toán
  const triggerPayTable = (method: 'Tiền mặt' | 'Chuyển khoản') => {
    if (!activeTable) return;
    setTablePayMethod(method);
    setSelectedTableForPay(activeTable);
    setIsTablePayDialogVisible(true);
  };

  // Xác nhận Thanh toán bàn bi-a
  const handlePayTableConfirm = async () => {
    if (!selectedTableForPay) return;
    setIsPayingTableLoading(true);
    try {
      const billing = calculateBilling(selectedTableForPay);
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const orderId = `ORD-T-${Date.now()}`;
      const nowStr = new Date().toISOString();

      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? { ...t, status: 'idle', startTime: null } : t));
      } else {
        await db.insert(schema.orders).values({
          id: orderId,
          order_no: `HD-🎱-${Date.now().toString().substring(9)}`,
          status: 'completed',
          customer_name: 'Khách bàn Bi-a',
          total_amount: billing.cost,
          paid_amount: billing.cost,
          payment_method: tablePayMethod,
          created_at: nowStr,
          shift_id: shiftId,
          sync_status: 'pending',
        });

        await db.insert(schema.order_items).values({
          id: `ORDI-${orderId}-time`,
          order_id: orderId,
          product_id: 'billiard-time',
          product_name: `Tiền giờ - ${selectedTableForPay.name}`,
          qty: 1,
          unit_price: billing.cost,
          line_total: billing.cost,
        });

        await db
          .update(schema.location_resources)
          .set({ status: 'idle', startTime: null })
          .where(eq(schema.location_resources.id, selectedTableForPay.id));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
        setSyncStatus('pending');

        SyncManager.pushOfflineOrders(shopId);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setIsPayingTableLoading(false);
      setIsTablePayDialogVisible(false);
      setSelectedTableForPay(null);
      setActiveTable(null);
    } catch (err) {
      console.error('Lỗi thanh toán bàn chơi:', err);
      setIsPayingTableLoading(false);
    }
  };

  // Thanh toán Bán lẻ
  const handlePayCart = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: 'Tiền mặt' | 'Chuyển khoản' | 'Thẻ ATM' | 'Ví MoMo' | 'Ghi nợ'; amount: number }[]
  ) => {
    setIsPayingCartLoading(true);
    try {
      const originalTotal = getCartTotal();
      const finalTotal = Math.max(0, originalTotal - discount);
      const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);

      const paymentMethodString = JSON.stringify(payments.map(p => ({ method: p.method, amount: p.amount })));

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const orderId = `ORD-R-${Date.now()}`;
      const orderNo = `HD-R-${Date.now().toString().substring(9)}`;
      const nowStr = new Date().toISOString();

      if (Platform.OS !== 'web') {
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

          const originalProd = productsList.find(p => p.id === prodId);
          if (originalProd) {
            const newStock = Math.max(0, originalProd.stock_qty - item.quantity);
            await db
              .update(schema.products)
              .set({ stock_qty: newStock })
              .where(eq(schema.products.id, prodId));
          }
        }

        const updatedProds = await db.select().from(schema.products);
        setProductsList(updatedProds);
        setSyncStatus('pending');

        SyncManager.pushOfflineOrders(shopId);
      }

      setCart({});
      setDiscountAmount(0);
      setOrderNote('');
      setSelectedCustomer(null);
      setIsCartModalOpen(false);
      setIsPayingCartLoading(false);
      setIsCheckoutConfirmVisible(false);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      const hasTransfer = payments.some(p => p.method === 'Chuyển khoản' && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = payments.filter(p => p.method === 'Chuyển khoản').reduce((sum, p) => sum + p.amount, 0);
        setQrPayload({ amount: transferAmount, orderNo: orderNo });
        setIsQrModalOpen(true);
      } else {
        alert(`Thanh toán đơn hàng ${orderNo} thành công và đang đồng bộ lên server.`);
      }
    } catch (err) {
      console.error('Lỗi khi thanh toán đơn lẻ SQLite:', err);
      setIsPayingCartLoading(false);
      setIsCheckoutConfirmVisible(false);
    }
  };

  // Quét mã giả lập
  const handleSimulateScan = () => {
    if (productsList.length === 0) {
      alert('Không có sản phẩm nào trong SQLite để quét.');
      setIsScannerOpen(false);
      return;
    }
    const randomProduct = productsList[Math.floor(Math.random() * productsList.length)];
    setScannedProductInfo(randomProduct);
    setIsScannerOpen(false);
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsScanSuccessDialogVisible(true);
  };

  const handleConfirmAddScanned = () => {
    if (scannedProductInfo) {
      addToCart(scannedProductInfo);
    }
    setIsScanSuccessDialogVisible(false);
    setScannedProductInfo(null);
  };

  // Lọc sp
  const filteredProducts = productsList.filter(p => {
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const matchesSearch = !productSearchQuery.trim() || 
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const displayedProducts = filteredProducts.slice(0, displayLimit);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* 1. SHARED HEADER - Thống nhất 100% */}
      <Header onPressMenu={() => setIsDrawerOpen(true)} syncStatus={syncStatus === 'synced' ? 'synced' : 'pending'} />

      {/* 2. CHỌN NGÀNH HÀNG/TAB DỌC - Giảm bo góc về rounded-xl, thay thế Emoji bằng Ionicons */}
      <View className="py-2.5 px-4 bg-slate-50 border-b border-slate-100">
        <View className="flex-row">
          <TouchableOpacity 
            activeOpacity={0.8}
            className={`mr-3 px-4 py-2 rounded-xl flex-row items-center border ${
              activeVertical === 'retail' 
                ? 'bg-orange-500 border-orange-500' 
                : 'bg-white border-slate-200'
            }`}
            style={activeVertical === 'retail' ? {
              shadowColor: '#fa5908',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 3,
              elevation: 2,
            } : undefined}
            onPress={() => setActiveVertical('retail')}
          >
            <Ionicons name="cart-outline" size={14} color={activeVertical === 'retail' ? 'white' : '#fa5908'} className="mr-1.5" />
            <Text className={`font-black text-[10px] uppercase tracking-wider ${activeVertical === 'retail' ? 'text-white' : 'text-slate-600'}`}>
              Bán lẻ & Món ăn
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.8}
            className={`px-4 py-2 rounded-xl flex-row items-center border ${
              activeVertical !== 'retail' 
                ? 'bg-orange-500 border-orange-500' 
                : 'bg-white border-slate-200'
            }`}
            style={activeVertical !== 'retail' ? {
              shadowColor: '#fa5908',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 3,
              elevation: 2,
            } : undefined}
            onPress={() => setActiveVertical(shopVertical !== 'retail' ? shopVertical : 'billiards')}
          >
            <Ionicons 
              name={
                shopVertical === 'cafe' ? 'cafe-outline' :
                shopVertical === 'court' ? 'football-outline' :
                shopVertical === 'room' ? 'bed-outline' :
                'play-circle-outline'
              } 
              size={14} 
              color={activeVertical !== 'retail' ? 'white' : '#fa5908'} 
              className="mr-1.5" 
            />
            <Text className={`font-black text-[10px] uppercase tracking-wider ${activeVertical !== 'retail' ? 'text-white' : 'text-slate-600'}`}>
              {
                shopVertical === 'cafe' ? 'Bàn Cafe' :
                shopVertical === 'court' ? 'Sơ đồ Sân' :
                shopVertical === 'room' ? 'Sơ đồ Phòng' :
                'Bàn Bi-a (Giờ)'
              }
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. CHI TIẾT NỘI DUNG */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center px-4">
          <Skeleton.Text lines={4} gap={12} height={16} className="mb-8" />
          <View className="flex-row flex-wrap justify-between w-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="48%" height={160} borderRadius={12} className="mb-4" />
            ))}
          </View>
        </View>
      ) : activeVertical === 'retail' ? (
        // 🛒 GIAO DIỆN BÁN LẺ
        <View className="flex-1 px-4 pt-2">
          
          {/* Tìm kiếm nhanh */}
          <View className="mb-3 flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1 shadow-sm">
            <Ionicons name="search-outline" size={14} color="#94a3b8" />
            <TextInput
              className="flex-1 ml-2 text-xs text-slate-800 py-1"
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
              <TouchableOpacity onPress={() => { setProductSearchQuery(''); setDisplayLimit(20); }} className="mr-2">
                <Ionicons name="close-circle" size={15} color="#cbd5e1" />
              </TouchableOpacity>
            )}
            <View className="w-[1px] h-4 bg-slate-200 mx-2" />
            <TouchableOpacity onPress={() => setIsScannerOpen(true)} className="p-1">
              <Ionicons name="scan-outline" size={16} color="#fa5908" />
            </TouchableOpacity>
          </View>

          {/* Lọc danh mục sản phẩm */}
          <View className="mb-3">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                activeOpacity={0.8}
                className={`mr-2 px-3 py-1.5 rounded-xl border ${
                  selectedCategoryId === 'all'
                    ? 'bg-orange-50 border-orange-400'
                    : 'bg-white border-slate-200'
                }`}
                onPress={() => {
                  setSelectedCategoryId('all');
                  setDisplayLimit(20);
                }}
              >
                <Text className={`text-[9px] font-black uppercase tracking-wider ${selectedCategoryId === 'all' ? 'text-orange-500' : 'text-slate-500'}`}>
                  Tất cả ({productsList.length})
                </Text>
              </TouchableOpacity>
              
              {categoriesList.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  className={`mr-2 px-3 py-1.5 rounded-xl border ${
                    selectedCategoryId === cat.id
                      ? 'bg-orange-50 border-orange-400'
                      : 'bg-white border-slate-200'
                  }`}
                  onPress={() => {
                    setSelectedCategoryId(cat.id);
                    setDisplayLimit(20);
                  }}
                >
                  <Text className={`text-[9px] font-black uppercase tracking-wider ${selectedCategoryId === cat.id ? 'text-orange-500' : 'text-slate-500'}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Grid sản phẩm */}
          <ScrollView 
            className="flex-1" 
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
              if (isCloseToBottom && displayLimit < filteredProducts.length) {
                setDisplayLimit(prev => prev + 20);
              }
            }}
            scrollEventThrottle={400}
          >
            {filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl mt-2">
                <Ionicons name="basket-outline" size={32} color="#cbd5e1" />
                <Text className="text-xs text-slate-400 font-bold mt-2">Không tìm thấy sản phẩm nào.</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap justify-between pb-28">
                {displayedProducts.map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    activeOpacity={0.85}
                    className="w-[48%] mb-4 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm justify-between active:scale-[0.98]"
                    onPress={() => addToCart(p)}
                  >
                    {/* Hình ảnh - Thay thế Emoji bằng Ionicons */}
                    <View className="w-full h-24 bg-slate-50 border border-slate-100 rounded-xl mb-2.5 overflow-hidden justify-center items-center">
                      {p.image_url ? (
                        <Image
                          source={{ uri: p.image_url }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="bg-slate-50 w-full h-full justify-center items-center">
                          <Ionicons name="image-outline" size={24} color="#fa5908" />
                        </View>
                      )}
                    </View>
                    
                    <Text className="font-black text-xs text-slate-900" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                      Kho: {p.stock_qty} | {p.unit || 'cái'}
                    </Text>
                    
                    <View className="flex-row justify-between items-center mt-2.5">
                      <Text className="text-orange-500 font-black text-xs">
                        {formatCurrency(p.sell_price)}
                      </Text>
                      
                      <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100">
                        <Ionicons name="add" size={11} color="#fa5908" />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // 🎱 PHÂN HỆ ĐẶC THÙ PHÒNG BÀN (BI-A / CAFE / SÂN / PHÒNG NGHỈ)
        <ScrollView className="flex-1 px-4 pt-3" showsVerticalScrollIndicator={false}>
          <Text className="text-[9px] font-black uppercase tracking-widest text-slate-450 mb-3 px-1">
            {
              shopVertical === 'cafe' ? 'Sơ đồ bàn Cafe hoạt động' :
              shopVertical === 'court' ? 'Sơ đồ sân thể thao / sân bóng' :
              shopVertical === 'room' ? 'Sơ đồ phòng homestay / khách sạn' :
              'Sơ đồ bàn bi-a ngoại tuyến'
            }
          </Text>
          
          {tables.length === 0 ? (
            <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl">
              <Ionicons name="football-outline" size={36} color="#cbd5e1" />
              <Text className="text-xs text-slate-400 font-bold mt-2">Không tìm thấy bàn nào.</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between pb-28">
              {tables.map(t => {
                const isActive = t.status === 'playing';
                const billing = calculateBilling(t);

                return (
                  <TouchableOpacity 
                    key={t.id}
                    activeOpacity={0.85}
                    className={`w-[48%] mb-4 p-4 rounded-2xl border-2 ${
                      isActive 
                        ? 'border-orange-500 bg-orange-50' 
                        : 'bg-white border-slate-200'
                    } justify-between`}
                    style={{
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1.5 },
                      shadowOpacity: 0.06,
                      shadowRadius: 2.5,
                      elevation: 2,
                    }}
                    onPress={() => handleTablePress(t)}
                  >
                    <View className="flex-row justify-between items-center mb-3">
                      <Ionicons 
                        name={
                          shopVertical === 'cafe' ? 'cafe-outline' :
                          shopVertical === 'court' ? 'football-outline' :
                          shopVertical === 'room' ? 'bed-outline' :
                          'radio-button-on-outline'
                        } 
                        size={20} 
                        color="#fa5908" 
                      />
                      <Badge 
                        variant={isActive ? 'primary' : 'secondary'} 
                        label={
                          isActive 
                            ? (shopVertical === 'cafe' ? 'Có khách' : shopVertical === 'court' ? 'Đang đá' : shopVertical === 'room' ? 'Đang ở' : 'Đang chơi') 
                            : (shopVertical === 'cafe' ? 'Bàn trống' : shopVertical === 'court' ? 'Sân trống' : shopVertical === 'room' ? 'Phòng trống' : 'Bàn trống')
                        } 
                        size="sm" 
                      />
                    </View>
                    
                    <Text className="font-extrabold text-xs text-slate-800">
                      {t.name}
                    </Text>
                    
                    {isActive ? (
                      <View className="mt-2.5 bg-orange-100 border border-orange-200 p-2 rounded-lg">
                        <Text className="text-[10px] text-orange-700 font-black">
                          ⏱️ {billing.hours}h {billing.minutes}m
                        </Text>
                        <Text className="text-xs text-orange-700 font-black mt-0.5">
                          {formatCurrency(billing.cost)}
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-[8px] text-slate-455 font-bold mt-2 leading-relaxed">
                        Giá: {formatCurrency(t.hourly_rate)}/{shopVertical === 'room' ? 'ngày' : 'h'} • {t.zone || 'Khu A'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* 4. THANH GIỎ HÀNG BÁN LẺ DƯỚI CÙNG - Giảm góc bo về rounded-t-2xl */}
      {getCartCount() > 0 && activeVertical === 'retail' && (
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-100 flex-row justify-between items-center shadow-2xl pb-6 rounded-t-2xl">
          <View className="flex-row items-center">
            <View className="bg-orange-50 p-2.5 rounded-xl mr-3 relative border border-orange-100">
              <Ionicons name="cart" size={18} color="#fa5908" />
              <View className="absolute -top-1 -right-1 items-center justify-center border border-white" style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fa5908' }}>
                <Text className="text-[8px] text-white font-black text-center leading-none">{getCartCount()}</Text>
              </View>
            </View>
            <View>
              <Text className="text-[8px] font-black text-slate-455 uppercase tracking-widest">Tổng cộng</Text>
              <Text className="text-orange-500 font-black text-base">{formatCurrency(getCartTotal())}</Text>
            </View>
          </View>

          <Button 
            variant="primary"
            size="md"
            onPress={() => setIsCartModalOpen(true)}
            icon={<Ionicons name="arrow-forward" size={12} color="white" />}
            iconPosition="right"
            title="Thanh toán"
            className="rounded-xl px-4"
          />
        </View>
      )}

      {/* CÁC DIALOG XÁC NHẬN SANG TRỌNG - RÚT GỌN CARD BO TRÒN rounded-2xl */}
      <Dialog
        visible={isTableOpenDialogVisible}
        onClose={() => setIsTableOpenDialogVisible(false)}
        onConfirm={handleConfirmOpenTable}
        title={
          shopVertical === 'cafe' ? 'Mở bàn Cafe' :
          shopVertical === 'court' ? 'Nhận Sân Thể Thao' :
          shopVertical === 'room' ? 'Nhận Phòng Nghỉ' :
          'Mở bàn chơi'
        }
        description={
          selectedTableForOpen 
            ? `Bạn có chắc muốn bắt đầu ca sử dụng cho "${selectedTableForOpen.name}"?\n(Đơn giá: ${formatCurrency(selectedTableForOpen.hourly_rate)}/${shopVertical === 'room' ? 'ngày' : 'giờ'})` 
            : ''
        }
        confirmLabel={
          shopVertical === 'cafe' ? 'Mở bàn ngay' :
          shopVertical === 'court' ? 'Bắt đầu ngay' :
          shopVertical === 'room' ? 'Nhận phòng' :
          'Bắt đầu ngay'
        }
        cancelLabel="Hủy"
        variant="default"
      />

      <Dialog
        visible={isTablePayDialogVisible}
        onClose={() => setIsTablePayDialogVisible(false)}
        onConfirm={handlePayTableConfirm}
        loading={isPayingTableLoading}
        title={
          shopVertical === 'cafe' ? 'Trả bàn & Thanh toán' :
          shopVertical === 'court' ? 'Thanh toán tiền sân' :
          shopVertical === 'room' ? 'Trả phòng Homestay' :
          'Thanh toán bàn chơi'
        }
        description={
          selectedTableForPay 
            ? `Xác nhận hoàn tất phiên cho "${selectedTableForPay.name}" với hình thức [${tablePayMethod}]?\n` +
              (shopVertical === 'cafe' ? `Tổng tiền bàn & món: ${formatCurrency(calculateBilling(selectedTableForPay).cost)}` :
               shopVertical === 'court' ? `Tổng tiền sân: ${formatCurrency(calculateBilling(selectedTableForPay).cost)}` :
               shopVertical === 'room' ? `Tổng tiền phòng: ${formatCurrency(calculateBilling(selectedTableForPay).cost)}` :
               `Tổng tiền giờ: ${formatCurrency(calculateBilling(selectedTableForPay).cost)}`)
            : ''
        }
        confirmLabel="Hoàn tất & In Bill"
        cancelLabel="Quay lại"
        variant="success"
      />

      <Dialog
        visible={isScanSuccessDialogVisible}
        onClose={() => setIsScanSuccessDialogVisible(false)}
        onConfirm={handleConfirmAddScanned}
        title="Quét mã thành công"
        description={scannedProductInfo ? `Phát hiện sản phẩm: "${scannedProductInfo.name}"\nĐơn giá: ${formatCurrency(scannedProductInfo.sell_price)}` : ''}
        confirmLabel="Thêm vào giỏ"
        cancelLabel="Hủy bỏ"
        variant="success"
      />

      {/* Hộp thoại xác nhận thanh toán đã được di chuyển vào bên trong Checkout Modal để xử lý z-index */}

      {/* 5. CAMERA SCAN BARCODE POPUP */}
      <Modal
        visible={isScannerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsScannerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="h-[45%] rounded-t-2xl p-6 justify-between bg-white">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Ionicons name="scan-outline" size={20} color="#fa5908" />
                <Text className="text-base font-black text-slate-800 ml-2">
                  Quét mã vạch sản phẩm
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsScannerOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="flex-1 bg-slate-50 border-2 border-dashed border-orange-400 rounded-xl my-4 items-center justify-center relative overflow-hidden">
              <View className="w-[80%] h-0.5 bg-orange-500 absolute" />
              <Ionicons name="camera" size={32} color="#cbd5e1" />
              <Text className="text-[9px] text-slate-455 mt-2 font-black uppercase tracking-wider">Đang quét mã...</Text>
            </View>

            <Button
              variant="primary"
              title="Giả lập quét mã vạch"
              onPress={handleSimulateScan}
              className="py-3.5 rounded-xl"
            />
          </View>
        </View>
      </Modal>

      {/* 6. MODAL XEM CHI TIẾT BÀN BI-A ĐANG HOẠT ĐỘNG */}
      <Modal
        visible={!!activeTable}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActiveTable(null)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          {activeTable && (
            <View className="w-full max-w-md p-6 rounded-2xl shadow-2xl bg-white border border-slate-100">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-base font-black text-slate-800">{activeTable.name}</Text>
                <TouchableOpacity onPress={() => setActiveTable(null)} className="p-1">
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View className="bg-orange-50 border border-orange-200/80 p-4 rounded-xl mb-5">
                <Text className="text-[9px] text-slate-455 uppercase tracking-widest font-black">Tạm tính tiền giờ:</Text>
                <Text className="text-orange-500 text-3xl font-black mt-1">
                  {formatCurrency(calculateBilling(activeTable).cost)}
                </Text>
                <Text className="text-[9px] text-slate-500 mt-3 font-bold">
                  ⏱️ Chơi lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Button 
                  variant="outline"
                  title="Thanh toán CK/QR"
                  onPress={() => triggerPayTable('Chuyển khoản')}
                  className="flex-1 py-3.5 rounded-xl"
                />

                <Button 
                  variant="primary"
                  title="Tiền mặt"
                  onPress={() => triggerPayTable('Tiền mặt')}
                  className="flex-1 py-3.5 rounded-xl"
                />
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* 7. MODAL GIỎ HÀNG & THANH TOÁN CHI TIẾT */}
      <Modal
        visible={isCartModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCartModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="h-[90%] rounded-t-2xl p-6 bg-white shadow-2xl justify-between">
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="wallet-outline" size={20} color="#fa5908" />
                <Text className="text-sm font-black text-slate-800 ml-2">
                  Thanh toán đơn hàng ({getCartCount()} món)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsCartModalOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Thân Modal */}
            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              {/* 1. KHÁCH HÀNG (CRM) */}
              <View className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Khách hàng</Text>
                  {!selectedCustomer && (
                    <Text className="text-xs font-bold text-slate-600">Khách lẻ</Text>
                  )}
                </View>

                {selectedCustomer ? (
                  <View className="bg-white border border-slate-200 rounded-xl p-3.5 flex-row justify-between items-center shadow-sm">
                    <View className="flex-1 mr-4">
                      <Text className="text-xs font-black text-slate-800">{selectedCustomer.name}</Text>
                      <Text className="text-[10px] text-slate-500 font-bold mt-1">📞 {selectedCustomer.phone}</Text>
                      {selectedCustomer.address ? (
                        <Text className="text-[9.5px] text-slate-400 font-semibold mt-1">📍 {selectedCustomer.address}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity 
                      activeOpacity={0.7}
                      className="bg-rose-50 p-2 rounded-xl border border-rose-100 items-center justify-center active:scale-95"
                      onPress={() => {
                        setSelectedCustomer(null);
                        setCustomerSearchQuery('');
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Input tìm kiếm khách hàng */}
                    <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                      <Ionicons name="search-outline" size={14} color="#94a3b8" />
                      <TextInput
                        className="flex-1 ml-2 text-xs text-slate-800 py-1"
                        placeholder="Tìm khách hàng theo tên hoặc SĐT..."
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
                  </>
                )}

                {/* Danh sách gợi ý */}
                {customerSearchQuery.trim().length > 0 && (
                  <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden shadow-lg z-50">
                    <ScrollView nestedScrollEnabled={true}>
                      {customersList
                        .filter(c => {
                          const nameStr = (c.name || '').toLowerCase();
                          const phoneStr = (c.phone || '');
                          const queryStr = customerSearchQuery.toLowerCase();
                          return nameStr.includes(queryStr) || phoneStr.includes(queryStr);
                        })
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
                            <Badge variant="primary" label={cust.customer_type || 'Thành viên'} size="sm" />
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 2. CHI TIẾT SẢN PHẨM */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4 shadow-sm">
                {Object.entries(cart).map(([prodId, item], idx) => (
                  <View key={prodId} className={`flex-row justify-between items-center py-2.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View className="flex-1 mr-4">
                      <Text className="font-extrabold text-xs text-slate-800" numberOfLines={1}>{item.name}</Text>
                      <Text className="text-[10px] text-slate-500 font-bold mt-0.5">
                        {formatCurrency(item.price)} x {item.quantity} {productsList.find(pr => pr.id === prodId)?.unit || 'cái'}
                      </Text>
                    </View>
                    <Text className="font-black text-xs text-slate-850">
                      {formatCurrency(item.price * item.quantity)}
                    </Text>
                  </View>
                ))}

                {/* Hàng Giảm giá */}
                <TouchableOpacity 
                  className="flex-row justify-between items-center py-2.5 border-t border-dashed border-slate-200 mt-2 active:opacity-60"
                  onPress={() => setIsEditingDiscount(prev => !prev)}
                >
                  <Text className="text-xs text-slate-450 font-bold">Giảm giá (Chạm để sửa):</Text>
                  {isEditingDiscount ? (
                    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-0.5">
                      <TextInput
                        className="text-right text-xs font-black text-slate-800 w-28 py-0.5"
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#cbd5e1"
                        value={discountAmount === 0 ? '' : maskCurrencyInput(discountAmount.toString())}
                        onChangeText={(val) => {
                          const masked = maskCurrencyInput(val);
                          const amt = parseCurrencyToNumber(masked);
                          setDiscountAmount(amt);
                        }}
                        autoFocus={true}
                        style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                      />
                    </View>
                  ) : (
                    <Text className="text-xs text-rose-500 font-black">
                      -{formatCurrency(discountAmount)}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Hàng Tổng cộng */}
                <View className="flex-row justify-between items-center py-2.5 border-t border-slate-200">
                  <Text className="text-xs text-slate-800 font-black">Tổng cộng:</Text>
                  <Text className="text-orange-500 font-black text-base">
                    {formatCurrency(Math.max(0, getCartTotal() - discountAmount))}
                  </Text>
                </View>
              </View>

              {/* 3. GHI CHÚ ĐƠN HÀNG */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4 shadow-sm">
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Ionicons name="document-text-outline" size={14} color="#94a3b8" />
                  <TextInput
                    className="flex-1 ml-2 text-xs text-slate-800 py-1"
                    placeholder="Ghi chú đơn hàng ngoại tuyến..."
                    placeholderTextColor="#cbd5e1"
                    value={orderNote}
                    onChangeText={setOrderNote}
                    style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                  />
                </View>
              </View>

              {/* 4. CHIA PHƯƠNG THỨC THANH TOÁN (SPLIT PAYMENT) */}
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4 shadow-sm">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[9px] font-black text-slate-455 uppercase tracking-widest">PHƯƠNG THỨC THANH TOÁN</Text>
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
                    <Ionicons name="add-circle-outline" size={13} color="#fa5908" />
                    <Text className="text-xs font-black text-orange-500 ml-1">+ Thêm</Text>
                  </TouchableOpacity>
                </View>

                {paymentRows.map((row, idx) => (
                  <View key={row.id} className="mb-3.5" style={{ zIndex: openDropdownRowId === row.id ? 100 : 1 }}>
                    <View className="flex-row items-center justify-between">
                      {/* Chọn phương thức - Dropdown list */}
                      <View style={{ width: '38%', position: 'relative', zIndex: openDropdownRowId === row.id ? 100 : 1 }}>
                        <TouchableOpacity 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 flex-row justify-between items-center"
                          onPress={() => {
                            setOpenDropdownRowId(openDropdownRowId === row.id ? null : row.id);
                          }}
                        >
                          <Text className="text-[11px] font-black text-slate-700">{row.method}</Text>
                          <Ionicons name="chevron-down" size={11} color="#fa5908" />
                        </TouchableOpacity>

                        {/* Dropdown list absolute overlay (ẩn các phương thức đã được chọn) */}
                        {openDropdownRowId === row.id && (
                          <View 
                            className="absolute left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1.5 shadow-xl py-1 z-50"
                            style={{ 
                              top: '100%', 
                              elevation: 10,
                              shadowColor: '#000000',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.1,
                              shadowRadius: 5,
                            }}
                          >
                            {['Tiền mặt', 'Chuyển khoản', 'Thẻ ATM', 'Ví MoMo', 'Ghi nợ']
                              .filter(m => m === row.method || !paymentRows.some(r => r.method === m))
                              .map(m => (
                                <TouchableOpacity
                                  key={m}
                                  className="px-3 py-2 border-b border-slate-50 active:bg-slate-50"
                                  onPress={() => {
                                    setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, method: m as any } : r));
                                    setOpenDropdownRowId(null);
                                  }}
                                >
                                  <Text className={`text-[10px] ${m === row.method ? 'font-black text-orange-500' : 'font-bold text-slate-700'}`}>
                                    {m}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </View>
                        )}
                      </View>

                      {/* Số tiền với nút tự điền tiền còn lại */}
                      <View className="w-[52%] bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex-row items-center">
                        <TextInput
                          className="flex-1 text-right text-xs font-black text-slate-800"
                          keyboardType="numeric"
                          value={row.amount === 0 ? '' : maskCurrencyInput(row.amount.toString())}
                          onChangeText={(val) => {
                            const masked = maskCurrencyInput(val);
                            const amt = parseCurrencyToNumber(masked);
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, amount: amt } : r));
                          }}
                          style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                        />
                        <TouchableOpacity 
                          activeOpacity={0.7}
                          className="bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md ml-1.5 active:scale-95"
                          onPress={() => {
                            const finalTotal = Math.max(0, getCartTotal() - discountAmount);
                            const paidSumOfOthers = paymentRows.filter((_, i) => i !== idx).reduce((sum, p) => sum + p.amount, 0);
                            const remaining = Math.max(0, finalTotal - paidSumOfOthers);
                            setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, amount: remaining } : r));
                          }}
                        >
                          <Text className="text-[8px] font-black text-orange-600 uppercase">Còn lại</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Nút xóa */}
                      {paymentRows.length > 1 && (
                        <TouchableOpacity 
                          onPress={() => {
                            setPaymentRows(prev => prev.filter(r => r.id !== row.id));
                            if (openDropdownRowId === row.id) setOpenDropdownRowId(null);
                          }}
                          className="p-1 ml-1"
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Dòng tiền chi tiết */}
                    <View className="w-full flex-row items-center bg-orange-50/40 border border-orange-100 px-3 py-1 rounded-xl mt-1.5">
                      <Ionicons name="chevron-forward-circle-outline" size={11} color="#fa5908" />
                      <Text className="text-[9px] text-slate-500 font-bold ml-1.5">
                        Dẫn vào: <Text className="font-extrabold text-orange-700">{
                          row.method === 'Tiền mặt' ? 'Két tiền tại quầy' :
                          row.method === 'Chuyển khoản' ? 'MB Bank (ONI ERP)' :
                          row.method === 'Thẻ ATM' ? 'Vietcombank (POS)' :
                          row.method === 'Ví MoMo' ? 'Ví Doanh nghiệp MoMo' :
                          'Sổ công nợ phải thu'
                        }</Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4 flex-row justify-between items-center shadow-sm">
                <Text className="text-xs text-emerald-800 font-black uppercase">Khách trả:</Text>
                <Text className="text-emerald-700 text-sm font-black">
                  {formatCurrency(paymentRows.reduce((sum, p) => sum + p.amount, 0))}
                </Text>
              </View>
            </ScrollView>

            {/* Thanh nút Hoàn tất */}
            <View className="flex-row justify-between items-center border-t border-slate-100 pt-4 bg-white gap-3">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={() => setIsCartModalOpen(false)}
                className="flex-1 py-3.5 rounded-xl"
              />

              <Button
                variant="primary"
                title="Thanh toán"
                icon={<Ionicons name="checkmark-done" size={14} color="white" />}
                iconPosition="right"
                onPress={() => {
                  const finalTotal = Math.max(0, getCartTotal() - discountAmount);
                  const paidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);
                  if (paidSum < finalTotal) {
                    alert(`Tổng tiền khách trả (${formatCurrency(paidSum)}) chưa đủ hóa đơn (${formatCurrency(finalTotal)}).`);
                    return;
                  }
                  setIsCheckoutConfirmVisible(true);
                }}
                className="flex-[2] py-3.5 rounded-xl"
              />
            </View>

            {/* HỘP THOẠI XÁC NHẬN THANH TOÁN (z-index fix: Tọa lạc tuyệt đối bên trong Modal) */}
            <Dialog
              visible={isCheckoutConfirmVisible}
              onClose={() => setIsCheckoutConfirmVisible(false)}
              onConfirm={async () => {
                await handlePayCart(selectedCustomer, discountAmount, orderNote, paymentRows);
              }}
              loading={isPayingCartLoading}
              title="Xác nhận Thanh toán"
              description={`Bạn có chắc chắn muốn hoàn tất hóa đơn này?\nTổng thanh toán: ${formatCurrency(Math.max(0, getCartTotal() - discountAmount))}`}
              confirmLabel="Xác nhận & Lưu"
              cancelLabel="Quay lại"
              variant="success"
            />
          </View>
        </View>
      </Modal>

      {/* ========================================================== */}
      {/* 8. MODAL DYNAMIC QR CODE THANH TOÁN CHUYỂN KHOẢN */}
      {/* ========================================================== */}
      <Modal
        visible={isQrModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsQrModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          {qrPayload && (
            <View className="w-full max-w-sm p-6 rounded-2xl shadow-2xl bg-white border border-slate-100 items-center">
              
              {/* Header */}
              <View className="w-full flex-row justify-between items-center mb-4">
                <Text className="text-sm font-black text-slate-800 uppercase tracking-wide">Dynamic QR Code</Text>
                <TouchableOpacity onPress={() => setIsQrModalOpen(false)} className="p-1">
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* MB Bank Card Graphic */}
              <View className="w-full bg-slate-900 p-4 rounded-xl mb-4 relative overflow-hidden shadow-sm">
                <View className="absolute w-24 h-24 bg-white/5 rounded-full -top-10 -left-10" />
                <Text className="text-white/40 text-[7px] font-black uppercase tracking-widest">MB BANK INTERCONNECT</Text>
                <Text className="text-white text-xs font-extrabold mt-2">CONG TY TNHH ONI ERP</Text>
                <Text className="text-white/90 text-sm font-black mt-0.5 tracking-wider">8888 9999 6666</Text>
              </View>

              {/* QR Image Frame */}
              <View className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-4 items-center justify-center relative">
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`STK:888899996666|ND:${qrPayload.orderNo}|ST:${qrPayload.amount}`)}` }}
                  className="w-48 h-48 rounded-xl"
                  resizeMode="contain"
                />
                
                <View className="absolute bg-orange-500 px-3 py-1 rounded-full border-2 border-white -bottom-2.5" style={{ backgroundColor: '#fa5908' }}>
                  <Text className="text-white text-[7px] font-black tracking-widest uppercase">VietQR ONIPay</Text>
                </View>
              </View>

              {/* Details */}
              <View className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-[9px] text-slate-400 font-bold uppercase">Số tiền thanh toán:</Text>
                  <Text className="text-orange-500 text-xs font-black">{formatCurrency(qrPayload.amount)}</Text>
                </View>

                <View className="flex-row justify-between">
                  <Text className="text-[9px] text-slate-400 font-bold uppercase">Nội dung chuyển:</Text>
                  <Text className="text-slate-800 text-xs font-black">{qrPayload.orderNo}</Text>
                </View>
              </View>

              {/* Confirm */}
              <Button
                variant="primary"
                title="Xác nhận đã nhận tiền"
                icon={<Ionicons name="checkmark-circle" size={14} color="white" />}
                onPress={() => {
                  setIsQrModalOpen(false);
                  alert(`Đơn hàng ${qrPayload.orderNo} chuyển khoản đã được hệ thống duyệt thành công!`);
                }}
                className="w-full py-3.5 rounded-xl shadow-sm"
              />
            </View>
          )}
        </View>
      </Modal>

      {/* Drawer Hamburger Sidebar */}
      <DrawerMenu 
        visible={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        branchName="Chi nhánh chính"
      />
    </SafeAreaView>
  );
}
