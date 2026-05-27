import React, { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform, Animated } from 'react-native';
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

  // Premium Toast Notification state
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ message, type });
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
      type === 'error' ? Haptics.NotificationFeedbackType.Error :
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
    ]).start(() => setToastMsg(null));
  };

  // State quản lý POS
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavReady, setIsNavReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNavReady(true);
    }, 150); // Delay 150ms để React Navigation & NativeWind CSS Interop khởi tạo context đầy đủ
    return () => clearTimeout(timer);
  }, []);

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

  // States cho nghiệp vụ phòng/bàn/sân nâng cao & CRM
  const [checkInTab, setCheckInTab] = useState<'info' | 'guests'>('info');
  const [roomRentalType, setRoomRentalType] = useState<'hourly' | 'daily'>('hourly');
  const [roomGuestCount, setRoomGuestCount] = useState<number>(1);
  const [tableCarts, setTableCarts] = useState<{ [tableId: string]: { [prodId: string]: { name: string; price: number; quantity: number } } }>({});
  const [cartOwnerTable, setCartOwnerTable] = useState<any | null>(null);
  const [tableCustomers, setTableCustomers] = useState<{ [tableId: string]: any }>({});
  
  // Tự động lưu và khôi phục khách hàng được gán cho từng phòng bàn
  useEffect(() => {
    if (!isNavReady) return;
    const saveTableCustomers = async () => {
      try {
        await AsyncStorage.setItem('temp_table_customers', JSON.stringify(tableCustomers));
      } catch (err) {
        console.error('Không thể lưu khách hàng phòng bàn:', err);
      }
    };
    saveTableCustomers();
  }, [tableCustomers, isNavReady]);

  useEffect(() => {
    if (!isNavReady) return;
    const loadTableCustomers = async () => {
      try {
        const saved = await AsyncStorage.getItem('temp_table_customers');
        if (saved) {
          setTableCustomers(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Không thể nạp khách hàng phòng bàn:', err);
      }
    };
    loadTableCustomers();
  }, [isNavReady]);

  // Tự động lưu và khôi phục giỏ hàng gọi thêm của từng phòng bàn
  useEffect(() => {
    if (!isNavReady) return;
    const saveTableCarts = async () => {
      try {
        await AsyncStorage.setItem('temp_table_carts', JSON.stringify(tableCarts));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng phòng bàn:', err);
      }
    };
    saveTableCarts();
  }, [tableCarts, isNavReady]);

  useEffect(() => {
    if (!isNavReady) return;
    const loadTableCarts = async () => {
      try {
        const saved = await AsyncStorage.getItem('temp_table_carts');
        if (saved) {
          setTableCarts(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Không thể nạp giỏ hàng phòng bàn:', err);
      }
    };
    loadTableCarts();
  }, [isNavReady]);
  
  // Ticker đếm giờ cho bi-a
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    if (!isNavReady) return;
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isNavReady]);

  // Tự động đồng bộ số tiền thanh toán mặc định khi giỏ hàng hoặc giảm giá thay đổi
  useEffect(() => {
    if (!isNavReady) return;
    const finalTotal = Math.max(0, getCartTotal() - discountAmount);
    setPaymentRows([
      { id: '1', method: 'Tiền mặt', amount: finalTotal }
    ]);
  }, [cart, discountAmount, isNavReady]);

  // 1. Tải lại giỏ hàng và các thông tin tạm thời khi Mount component (Giữ giỏ hàng khi chuyển tab/reload)
  useEffect(() => {
    if (!isNavReady) return;
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
  }, [isNavReady]);

  // 2. Tự động lưu giỏ hàng khi thay đổi
  useEffect(() => {
    if (!isNavReady) return;
    const saveCartToStorage = async () => {
      try {
        await AsyncStorage.setItem('temp_cart', JSON.stringify(cart));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng tạm thời:', err);
      }
    };
    saveCartToStorage();
  }, [cart, isNavReady]);

  // 3. Tự động lưu giảm giá, ghi chú và khách hàng được chọn khi thay đổi
  useEffect(() => {
    if (!isNavReady) return;
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
  }, [discountAmount, orderNote, selectedCustomer, isNavReady]);

  // Tải dữ liệu thực tế SQLite/Cloud
  const loadPosData = async (isMounted = true) => {
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
              const isOccupied = table.status === 'occupied' || table.status === 'playing';
              return {
                id: table.id || table.resource_id,
                name: table.name || '',
                type: table.type || 'table',
                status: isOccupied ? 'occupied' : 'available',
                current_order_id: table.current_order_id || null,
                hourly_rate: isNaN(rate) ? 0 : rate,
                zone: table.zone || null,
                startTime: isOccupied ? Date.now() - 3600000 : null,
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
            { id: 't1', name: 'Bàn Bi-a 01', type: 'table', status: 'available', hourly_rate: 60000, zone: 'Khu A' },
            { id: 't2', name: 'Bàn Bi-a 02', type: 'table', status: 'occupied', hourly_rate: 60000, zone: 'Khu A', startTime: Date.now() - 45 * 60000 },
            { id: 't3', name: 'Bàn VIP 01', type: 'table', status: 'available', hourly_rate: 90000, zone: 'Phòng VIP' }
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

  // Tải dữ liệu thực tế SQLite/Cloud khi màn hình được Mount
  useEffect(() => {
    if (!isNavReady) return;
    let isMounted = true;
    loadPosData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [isNavReady]);

  // Kéo đồng bộ lại sơ đồ phòng bàn từ Cloud
  const handleRefresh = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsLoading(true);
    if (Platform.OS !== 'web') {
      try {
        const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const activeTenantId = await AsyncStorage.getItem('active_tenant_id') || 'default-tenant';
        await SyncManager.pullFullDatabase(activeShopId, activeTenantId, () => {});
      } catch (syncErr) {
        console.warn('Lỗi đồng bộ SQLite đầu ca khi làm mới:', syncErr);
      }
    }
    await loadPosData(true);
  };

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

  // Gom nhóm phòng bàn theo khu vực/tầng
  const groupedZones = React.useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    for (const t of tables) {
      const zone = t.zone || 'Chưa phân vùng';
      if (!groups[zone]) {
        groups[zone] = [];
      }
      groups[zone].push(t);
    }
    return groups;
  }, [tables]);

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
    if (table.status === 'playing' || table.status === 'occupied') {
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
      let syncSucceeded = false;
      let orderId = `ORD-T-INPROG-${Date.now()}`;

      // 1. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng (cho cả Web lẫn Native SQLite)
      try {
        const currentUrl = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const headers = await getApiHeaders();
        
        // A. Tạo order in_progress trên Next.js Server
        const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'in_progress',
            customer_id: selectedCustomer?.id || '',
            customer_name: selectedCustomer?.name || 'Khách lẻ',
            branch_id: shopId,
            employee_id: 'mobile-cashier',
            subtotal: '0',
            total_amount: '0',
            paid_amount: '0',
            resource_id: selectedTableForOpen.id,
            metadata: JSON.stringify({
              resource_id: selectedTableForOpen.id,
              resource_name: selectedTableForOpen.name,
              check_in: new Date(nowTime).toISOString(),
              num_guests: roomGuestCount,
              rental_type: roomRentalType,
            })
          }),
        });

        if (orderRes.ok) {
          const createdOrder = await orderRes.json();
          orderId = createdOrder.id || createdOrder.order_id;

          // B. Cập nhật vị trí sang occupied
          const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForOpen.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'occupied',
              current_order_id: orderId,
              startTime: nowTime
            }),
          });
          if (patchRes.ok) {
            syncSucceeded = true;
          } else {
            const errBody = await patchRes.text().catch(() => '');
            console.warn(`[Open Table PATCH Failed] Status ${patchRes.status}:`, errBody);
          }
        } else {
          const errBody = await orderRes.text().catch(() => '');
          console.warn(`[Open Table POST Failed] Status ${orderRes.status}:`, errBody);
        }
      } catch (syncErr) {
        console.log('Mất mạng hoặc lỗi server, bỏ qua sync check-in trực tiếp:', syncErr);
      }

      // 2. Ghi đè vào DB Cục bộ hoặc State cục bộ
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForOpen.id ? { ...t, status: 'occupied', current_order_id: orderId, startTime: nowTime } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set({ 
            status: 'occupied', 
            current_order_id: orderId,
            startTime: nowTime 
          })
          .where(eq(schema.location_resources.id, selectedTableForOpen.id));
        
        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Gán thông tin khách hàng nhận phòng bàn
      if (selectedCustomer) {
        setTableCustomers(prev => ({
          ...prev,
          [selectedTableForOpen.id]: selectedCustomer
        }));
      }

      setIsTableOpenDialogVisible(false);
      setSelectedTableForOpen(null);
      // Reset các tab check-in
      setCheckInTab('info');

      // Hiển thị Toast thông báo thành công sang trọng giống WebUI
      if (syncSucceeded) {
        showToast(`Đã nhận ${shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : 'Bàn'} & Đồng bộ thành công!`, 'success');
      } else {
        showToast(`Nhận ${shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : 'Bàn'} ngoại tuyến thành công!`, 'info');
      }
    } catch (err) {
      console.error('Không thể mở bàn bi-a:', err);
      showToast('Có lỗi xảy ra khi nhận phòng!', 'error');
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
      const tableCartItems = tableCarts[selectedTableForPay.id] || {};
      const itemsCost = Object.values(tableCartItems).reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalAmount = billing.cost + itemsCost;

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      const orderId = `ORD-T-${Date.now()}`;
      const nowStr = new Date().toISOString();
      let syncSucceeded = false;

      // A. Lưu vào cơ sở dữ liệu SQLite cục bộ (Offline-First)
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? { ...t, status: 'available', startTime: null } : t));
      } else {
        await db.insert(schema.orders).values({
          id: orderId,
          order_no: `HD-${shopVertical === 'room' ? '🏩' : '🎱'}-${Date.now().toString().substring(9)}`,
          status: 'completed',
          customer_name: tableCustomers[selectedTableForPay.id]?.name || selectedCustomer?.name || 'Khách vãng lai',
          customer_id: tableCustomers[selectedTableForPay.id]?.id || selectedCustomer?.id || null,
          total_amount: totalAmount,
          paid_amount: totalAmount,
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

        // Thêm các món ăn/dịch vụ gọi kèm vào SQLite order_items
        for (const [prodId, item] of Object.entries(tableCartItems)) {
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-${prodId}`,
            order_id: orderId,
            product_id: prodId,
            product_name: item.name,
            qty: item.quantity,
            unit_price: item.price,
            line_total: item.price * item.quantity,
          });
        }

        await db
          .update(schema.location_resources)
          .set({ status: 'available', startTime: null })
          .where(eq(schema.location_resources.id, selectedTableForPay.id));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
        setSyncStatus('pending');
      }

      // B. Đồng bộ trực tiếp lên Cloud Next.js Server nếu đang có mạng
      try {
        const currentUrl = getApiBaseUrl();
        const headers = await getApiHeaders();

        const payload = {
          local_order_id: orderId,
          server_order_id: selectedTableForPay.current_order_id || '', // Cập nhật trực tiếp order in_progress hiện tại
          order: {
            status: 'completed',
            customer_id: tableCustomers[selectedTableForPay.id]?.id || selectedCustomer?.id || '',
            customer_name: tableCustomers[selectedTableForPay.id]?.name || selectedCustomer?.name || 'Khách lẻ',
            branch_id: shopId,
            employee_id: 'mobile-app',
            subtotal: totalAmount,
            discount_amount: 0,
            tax_amount: 0,
            total_amount: totalAmount,
            paid_amount: totalAmount,
            debt_amount: 0,
            note: `Thanh toán phòng/bàn từ di động.`,
            metadata: JSON.stringify({
              resource_id: selectedTableForPay.id,
              resource_name: selectedTableForPay.name,
              billing_cost: billing.cost,
              billing_duration: `${billing.hours}h ${billing.minutes}m`,
            })
          },
          items: [
            {
              product_id: 'billiard-time',
              product_name: `Tiền giờ - ${selectedTableForPay.name}`,
              qty: 1,
              unit_price: billing.cost,
              discount_amount: 0,
              line_total: billing.cost,
            },
            ...Object.entries(tableCartItems).map(([prodId, item]: [string, any]) => ({
              product_id: prodId,
              product_name: item.name,
              qty: item.quantity,
              unit_price: item.price,
              discount_amount: 0,
              line_total: item.price * item.quantity,
            }))
          ],
          payments: [
            {
              method: tablePayMethod === 'Chuyển khoản' ? 'bank_transfer' : 'cash',
              amount: totalAmount,
            }
          ],
          stock_movements: Object.entries(tableCartItems).map(([prodId, item]: [string, any]) => ({
            type: 'sale_out',
            product_id: prodId,
            qty: -item.quantity,
            branch_id: shopId,
          }))
        };

        const syncRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (syncRes.ok) {
          // B. Cập nhật vị trí sang available trên Server Cloud
          const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForPay.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'available',
              current_order_id: '',
              startTime: null
            }),
          });

          if (patchRes.ok) {
            syncSucceeded = true;
            // Cập nhật lại sync_status = synced trong SQLite cục bộ vì đã sync thành công ngay lập tức
            if (Platform.OS !== 'web') {
              await db
                .update(schema.orders)
                .set({ sync_status: 'synced' })
                .where(eq(schema.orders.id, orderId));
              
              const pendingOrdersCount = await db
                .select()
                .from(schema.orders)
                .where(eq(schema.orders.sync_status, 'pending'));
              setSyncStatus(pendingOrdersCount.length > 0 ? 'pending' : 'synced');
            }
          } else {
            const errBody = await patchRes.text().catch(() => '');
            console.warn(`[Pay Table PATCH Failed] Status ${patchRes.status}:`, errBody);
          }
        } else {
          const errBody = await syncRes.text().catch(() => '');
          console.warn(`[Pay Table Sync Failed] Status ${syncRes.status}:`, errBody);
        }
      } catch (syncErr) {
        console.log('Mất mạng hoặc lỗi server, bỏ qua sync checkout trực tiếp (sẽ sync sau):', syncErr);
      }

      // Xóa giỏ hàng của bàn và khách hàng phòng bàn sau khi thanh toán
      setTableCarts(prev => {
        const copy = { ...prev };
        delete copy[selectedTableForPay.id];
        return copy;
      });
      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[selectedTableForPay.id];
        return copy;
      });
      setSelectedCustomer(null);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setIsPayingTableLoading(false);
      setIsTablePayDialogVisible(false);
      setSelectedTableForPay(null);
      setActiveTable(null);

      // Hiển thị Toast thông báo kết quả sang trọng giống WebUI
      if (syncSucceeded) {
        showToast("Thanh toán & Giải phóng thành công!", "success");
      } else {
        showToast("Thanh toán ngoại tuyến thành công! Sẽ sync sau.", "info");
      }

      // Kích hoạt đồng bộ ngầm các hóa đơn cũ khác
      if (Platform.OS !== 'web') {
        SyncManager.pushOfflineOrders(shopId);
      }
    } catch (err) {
      console.error('Lỗi thanh toán bàn chơi:', err);
      setIsPayingTableLoading(false);
      showToast("Lỗi khi xử lý thanh toán!", "error");
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

  if (!isNavReady) {
    return <View style={{ flex: 1, backgroundColor: '#f8fafc' }} />;
  }

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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          {/* Skeleton.Text equivalent using raw inline styles */}
          <View style={{ width: '100%', marginBottom: 32 }}>
            {Array.from({ length: 4 }).map((_, idx) => (
              <View 
                key={idx} 
                style={{ 
                  width: idx === 3 ? '60%' : '100%', 
                  height: 16, 
                  borderRadius: 8, 
                  backgroundColor: '#e2e8f0', 
                  marginBottom: idx < 3 ? 12 : 0 
                }} 
              />
            ))}
          </View>
          {/* Skeleton blocks equivalent */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View 
                key={i} 
                style={{ 
                  width: '48%', 
                  height: 160, 
                  borderRadius: 12, 
                  backgroundColor: '#e2e8f0', 
                  marginBottom: 16 
                }} 
              />
            ))}
          </View>
        </View>
      ) : activeVertical === 'retail' ? (
        // 🛒 GIAO DIỆN BÁN LẺ
        <View className="flex-1 px-4 pt-2">
          
          {/* BANNER GỌI MÓN PHÒNG BAN CHUYÊN DỤNG */}
          {cartOwnerTable && (
            <View className="bg-orange-50 border border-orange-200 p-3.5 rounded-xl flex-row justify-between items-center mb-3">
              <View className="flex-row items-center flex-1 mr-4">
                <Ionicons name="fast-food" size={16} color="#fa5908" />
                <Text className="text-xs font-black text-slate-800 ml-2" numberOfLines={1}>
                  Đang chọn món cho: <Text className="text-orange-600 font-extrabold">{cartOwnerTable.name}</Text>
                </Text>
              </View>
              
              <View className="flex-row gap-2">
                <TouchableOpacity 
                  activeOpacity={0.7}
                  className="bg-slate-200 border border-slate-300 px-2.5 py-1 rounded-lg active:scale-95"
                  onPress={() => {
                    // Hủy chọn món
                    setCart({});
                    setCartOwnerTable(null);
                    setActiveVertical(shopVertical);
                  }}
                >
                  <Text className="text-[9px] font-black text-slate-600 uppercase">Hủy</Text>
                </TouchableOpacity>

                 <TouchableOpacity 
                  activeOpacity={0.7}
                  className="bg-orange-500 border border-orange-600 px-3 py-1 rounded-lg active:scale-95"
                  onPress={() => {
                    // Lưu món vào phòng/bàn
                    setTableCarts(prev => ({
                      ...prev,
                      [cartOwnerTable.id]: cart
                    }));
                    setCart({});
                    setCartOwnerTable(null);
                    setActiveVertical(shopVertical);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    showToast("Đã lưu món vào phòng/bàn thành công!", "success");
                  }}
                >
                  <Text className="text-[9px] font-black text-white uppercase">Lưu món</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Tìm kiếm nhanh */}
          <View className="mb-3 flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
          <View className="mb-3 flex-row items-center">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row flex-1">
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
            
            {/* Nút đồng bộ tải dữ liệu từ Next.js Cloud trực tiếp trên tab bán lẻ */}
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={handleRefresh}
              className="bg-white border border-slate-200 p-2 rounded-xl active:bg-slate-100 ml-2"
              style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
            >
              <Ionicons name="sync" size={14} color="#fa5908" />
            </TouchableOpacity>
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
                    className="w-[48%] mb-4 p-3 rounded-2xl border bg-white border-slate-100 justify-between active:scale-[0.98]" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
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
            <View className="pb-28">
              {Object.entries(groupedZones).map(([zoneName, zoneTables]) => (
                <View key={zoneName} className="mb-6">
                  {/* Tiêu đề Khu vực/Tầng */}
                  <View className="flex-row items-center justify-between mb-3 px-1">
                    <Text className="text-xs font-black text-slate-700">
                      🏢 {zoneName}
                    </Text>
                    <Text className="text-[10px] text-slate-400 font-bold">
                      {zoneTables.length} {shopVertical === 'cafe' ? 'vị trí' : shopVertical === 'court' ? 'sân' : shopVertical === 'room' ? 'phòng' : 'bàn'}
                    </Text>
                  </View>
                  
                  {/* Grid phòng bàn trong Khu vực */}
                  <View className="flex-row flex-wrap justify-between">
                    {zoneTables.map(t => {
                      const isActive = t.status === 'playing' || t.status === 'occupied';
                      const billing = calculateBilling(t);
                      const cartItemsCount = tableCarts[t.id] ? Object.values(tableCarts[t.id]).reduce((sum, item) => sum + item.quantity, 0) : 0;
                      const guestName = tableCustomers[t.id]?.name || t.customerName || 'Khách lẻ';

                      return (
                        <TouchableOpacity 
                          key={t.id}
                          activeOpacity={0.85}
                          className={`w-[48%] mb-4 rounded-2xl border ${
                            isActive 
                              ? '' 
                              : 'bg-white border-slate-200'
                          } justify-between overflow-hidden`}
                          style={[
                            {
                              shadowColor: '#000000',
                              shadowOffset: { width: 0, height: 1.5 },
                              shadowOpacity: 0.06,
                              shadowRadius: 2.5,
                              elevation: 2,
                            },
                            isActive ? {
                              borderColor: 'rgba(244, 63, 94, 0.25)', // border-rose-300 mờ sang trọng
                              backgroundColor: 'rgba(255, 241, 242, 0.65)', // bg-rose-50 mờ cực dịu mắt
                            } : {}
                          ]}
                          onPress={() => handleTablePress(t)}
                        >
                          {/* Stripe màu trên cùng */}
                          <View className={`h-1 w-full ${isActive ? 'bg-rose-500' : 'bg-emerald-500'}`} />

                          <View className="p-3.5 flex-1 justify-between">
                            {/* Tiêu đề vị trí */}
                            <Text className="font-extrabold text-xs text-slate-800 mb-1.5">
                              {t.name}
                            </Text>

                            {/* Chi tiết chỉ số */}
                            <View className="mb-2">
                              <View className="flex-row items-center mb-0.5">
                                <Ionicons name="person-outline" size={10} color="#94a3b8" />
                                <Text className="text-[9px] text-slate-455 font-bold ml-1">
                                  {t.capacity || '4'} người
                                </Text>
                              </View>

                              <View className="flex-row items-center mb-0.5">
                                <Ionicons name="time-outline" size={10} color="#94a3b8" />
                                <Text className="text-[9px] text-slate-455 font-bold ml-1">
                                  {formatCurrency(t.hourly_rate)}/h
                                </Text>
                              </View>

                              {shopVertical === 'room' && (
                                <View className="flex-row items-center">
                                  <Ionicons name="moon-outline" size={10} color="#94a3b8" />
                                  <Text className="text-[9px] text-slate-455 font-bold ml-1">
                                    {formatCurrency(t.hourly_rate * 3 || 200000)}/đêm
                                  </Text>
                                </View>
                              )}
                            </View>

                            {/* Tiện ích tags */}
                            <View className="flex-row flex-wrap gap-1 mb-2.5">
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-bold text-slate-400">Điều hòa</Text>
                              </View>
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-bold text-slate-400">WiFi</Text>
                              </View>
                              <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                                <Text className="text-[7.5px] font-black text-slate-400">+4</Text>
                              </View>
                            </View>

                            {/* Chi tiết tạm tính nếu đang hoạt động */}
                            {isActive && (
                              <View 
                                className="border p-2 rounded-lg mb-2"
                                style={{
                                  backgroundColor: 'rgba(244, 63, 94, 0.05)', // bg-rose-50 mờ nhạt
                                  borderColor: 'rgba(244, 63, 94, 0.15)', // border-rose-200 mờ nhạt
                                }}
                              >
                                <Text className="text-[8.5px] text-rose-700 font-black">
                                  ⏱️ Đã dùng: {billing.hours}h {billing.minutes}m
                                </Text>
                                <Text className="text-[9px] text-rose-700 font-black mt-0.5">
                                  💵 Tiền giờ: {formatCurrency(billing.cost)}
                                </Text>
                                {cartItemsCount > 0 && (
                                  <Text 
                                    className="text-[8px] text-slate-550 font-black mt-0.5 pt-0.5 border-t"
                                    style={{ borderTopColor: 'rgba(244, 63, 94, 0.15)' }}
                                  >
                                    🍴 Đã gọi: {cartItemsCount} món
                                  </Text>
                                )}
                              </View>
                            )}

                            {/* Nút Trạng thái ở đáy card */}
                            <View className={`w-full py-2 rounded-lg items-center justify-center border ${
                              isActive ? 'bg-rose-100/30 border-rose-200' : 'bg-slate-50 border-slate-200'
                            }`}>
                              <Text className={`text-[10px] font-black ${
                                isActive ? 'text-rose-600' : 'text-emerald-600'
                              }`} numberOfLines={1}>
                                {isActive ? guestName : 'Trống'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Nút refresh thủ công để kéo dữ liệu SQLite */}
              <View className="items-center justify-center mt-4 mb-20 px-2">
                <TouchableOpacity 
                  activeOpacity={0.8}
                  className="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-xl flex-row items-center justify-center  w-full"
                  onPress={handleRefresh}
                >
                  <Ionicons name="refresh-circle-outline" size={20} color="#fa5908" />
                  <Text className="text-xs font-black text-slate-700 ml-2">Đồng bộ lại sơ đồ {shopVertical === 'room' ? 'phòng nghỉ' : shopVertical === 'court' ? 'sân chơi' : shopVertical === 'cafe' ? 'bàn cafe' : 'bàn bi-a'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* 4. THANH GIỎ HÀNG BÁN LẺ DƯỚI CÙNG - Giảm góc bo về rounded-t-2xl */}
      {getCartCount() > 0 && activeVertical === 'retail' && (
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-100 flex-row justify-between items-center pb-6 rounded-t-2xl" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
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
             onPress={() => {
              if (cartOwnerTable) {
                // Lưu vào bàn/phòng và quay lại sơ đồ
                setTableCarts(prev => ({
                  ...prev,
                  [cartOwnerTable.id]: cart
                }));
                setCart({});
                setCartOwnerTable(null);
                setActiveVertical(shopVertical);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                showToast("Đã lưu món vào phòng/bàn thành công!", "success");
              } else {
                setIsCartModalOpen(true);
              }
            }}
            icon={<Ionicons name={cartOwnerTable ? "save" : "arrow-forward"} size={12} color="white" />}
            iconPosition="right"
            title={cartOwnerTable ? "Lưu vào phòng/bàn" : "Thanh toán"}
            className="rounded-xl px-4"
          />
        </View>
      )}

      {/* CÁC DIALOG XÁC NHẬN SANG TRỌNG - RÚT GỌN CARD BO TRÒN rounded-2xl */}
      {/* 5.5. MODAL MỞ BÀN / CHECK-IN PHÒNG KHÁCH SẠN */}
      <Modal
        visible={isTableOpenDialogVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTableOpenDialogVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          <View className="h-[75%] rounded-t-2xl p-6 bg-white justify-between" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
              <View className="flex-row items-center">
                <Ionicons name="enter-outline" size={20} color="#fa5908" />
                <Text className="text-sm font-black text-slate-800 ml-2">
                  {selectedTableForOpen 
                    ? `Nhận ${shopVertical === 'cafe' ? 'Bàn' : shopVertical === 'court' ? 'Sân' : shopVertical === 'room' ? 'Phòng' : 'Bàn'} - ${selectedTableForOpen.name}`
                    : 'Nhận vị trí mới'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsTableOpenDialogVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* TAB SELECTOR (Crash-Proof Style without shadow-sm/border-opacity) */}
            {shopVertical === 'room' && (
              <View className="flex-row bg-slate-100 p-1 rounded-xl my-4">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCheckInTab('info')}
                  className={`flex-1 py-2 items-center justify-center rounded-lg ${
                    checkInTab === 'info' ? 'bg-white border border-slate-200' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-black ${checkInTab === 'info' ? 'text-slate-800' : 'text-slate-500'}`}>
                    Thông tin nhận
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCheckInTab('guests')}
                  className={`flex-1 py-2 items-center justify-center rounded-lg ${
                    checkInTab === 'guests' ? 'bg-white border border-slate-200' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-black ${checkInTab === 'guests' ? 'text-slate-800' : 'text-slate-500'}`}>
                    Khách lưu trú
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView className="flex-1 my-2" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {checkInTab === 'info' || shopVertical !== 'room' ? (
                <View>
                  {/* Bảng giá giờ */}
                  {selectedTableForOpen && (
                    <View className="bg-orange-50 border border-orange-100 p-4 rounded-2xl mb-4">
                      <Text className="text-[10px] text-orange-700 font-extrabold uppercase">Hình thức hoạt động:</Text>
                      <Text className="text-orange-950 font-black text-sm mt-1">
                        Tính phí theo thời gian sử dụng
                      </Text>
                      <Text className="text-[10px] text-slate-500 mt-2 font-semibold">
                        💵 Đơn giá: {formatCurrency(selectedTableForOpen.hourly_rate)}/{shopVertical === 'room' ? 'ngày' : 'giờ'}
                      </Text>
                    </View>
                  )}

                  {/* CHỌN KHÁCH HÀNG CRM (Premium component replicated) */}
                  <Text className="text-[10px] text-slate-400 font-extrabold uppercase mb-2">Thông tin Khách hàng (CRM):</Text>
                  <View className="mb-4">
                    {selectedCustomer ? (
                      <View className="flex-row justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        <View className="flex-1 mr-4">
                          <Text className="text-xs font-black text-slate-800">{selectedCustomer.name}</Text>
                          <Text className="text-[10px] text-slate-500 font-bold mt-0.5">📞 {selectedCustomer.phone}</Text>
                          {selectedCustomer.address ? (
                            <Text className="text-[9.5px] text-slate-400 font-semibold mt-1">📍 {selectedCustomer.address}</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity 
                          activeOpacity={0.7}
                          className="bg-rose-50 p-2 rounded-xl border border-rose-200 items-center justify-center active:scale-95"
                          onPress={() => {
                            setSelectedCustomer(null);
                            setCustomerSearchQuery('');
                          }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <Ionicons name="search-outline" size={14} color="#94a3b8" />
                        <TextInput
                          className="flex-1 ml-2 text-xs text-slate-850 py-0.5"
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
                    )}

                    {/* Danh sách gợi ý */}
                    {customerSearchQuery.trim().length > 0 && (
                      <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
                        <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
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

                  {/* THÔNG TIN LOẠI THUÊ & SỐ KHÁCH (Dành riêng cho khách sạn) */}
                  {shopVertical === 'room' && (
                    <View className="flex-row gap-4 mt-2">
                      <View className="flex-1">
                        <Text className="text-[10px] text-slate-400 font-extrabold uppercase mb-1.5">Hình thức thuê:</Text>
                        <View className="flex-row bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <TouchableOpacity 
                            onPress={() => setRoomRentalType('hourly')}
                            className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'hourly' ? 'bg-white' : ''}`}
                          >
                            <Text className="text-[10px] font-black text-slate-700">Theo giờ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => setRoomRentalType('daily')}
                            className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'daily' ? 'bg-white' : ''}`}
                          >
                            <Text className="text-[10px] font-black text-slate-700">Theo ngày</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View className="flex-1">
                        <Text className="text-[10px] text-slate-400 font-extrabold uppercase mb-1.5">Số khách:</Text>
                        <View className="flex-row bg-white border border-slate-200 rounded-lg px-2 items-center">
                          <TextInput
                            className="flex-1 text-center text-xs font-bold text-slate-800 py-1.5"
                            keyboardType="numeric"
                            value={roomGuestCount.toString()}
                            onChangeText={(val) => setRoomGuestCount(parseInt(val) || 1)}
                            style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  {/* TAB KHÁCH LƯU TRÚ (Danh sách khách ở cùng phòng) */}
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-xs font-black text-slate-800">
                      👥 Thành viên lưu trú ({roomGuestCount} khách)
                    </Text>
                  </View>

                  <Text className="text-[9.5px] text-slate-455 font-bold leading-relaxed mb-4">
                    Thêm thông tin CMND/CCCD hoặc hộ chiếu của khách lưu trú để đồng bộ dữ liệu khai báo tạm trú lên cơ quan chức năng.
                  </Text>

                  {/* Mẫu danh sách khách */}
                  {Array.from({ length: Math.min(5, roomGuestCount) }).map((_, index) => (
                    <View key={index} className="bg-white border border-slate-200 p-3 rounded-lg mb-3">
                      <Text className="text-[9px] font-extrabold text-orange-600 mb-2">Khách lưu trú #{index + 1}:</Text>
                      <View className="flex-row gap-2">
                        <TextInput
                          className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 font-semibold"
                          placeholder="Họ và tên..."
                          placeholderTextColor="#cbd5e1"
                          style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                        />
                        <TextInput
                          className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 font-semibold"
                          placeholder="Số CMND/CCCD..."
                          placeholderTextColor="#cbd5e1"
                          style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Actions Footer */}
            <View className="flex-row gap-3 border-t border-slate-100 pt-4 bg-white">
              <Button
                variant="outline"
                title="Hủy bỏ"
                onPress={() => setIsTableOpenDialogVisible(false)}
                className="flex-1 py-3 rounded-xl"
              />

              <Button
                variant="primary"
                title={shopVertical === 'room' ? 'Nhận phòng' : 'Bắt đầu sử dụng'}
                onPress={handleConfirmOpenTable}
                className="flex-[2] py-3 rounded-xl"
              />
            </View>
          </View>
        </View>
      </Modal>

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
            ? (() => {
                const billing = calculateBilling(selectedTableForPay);
                const tableCartItems = tableCarts[selectedTableForPay.id] || {};
                const itemsCost = Object.values(tableCartItems).reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const total = billing.cost + itemsCost;
                
                let desc = `Xác nhận hoàn tất phiên cho "${selectedTableForPay.name}" với hình thức [${tablePayMethod}]?\n\n`;
                if (itemsCost > 0) {
                  desc += `• Tiền giờ sử dụng: ${formatCurrency(billing.cost)}\n`;
                  desc += `• Tiền món ăn/dịch vụ: ${formatCurrency(itemsCost)}\n`;
                  desc += `👉 Tổng cộng thanh toán: ${formatCurrency(total)}`;
                } else {
                  desc += `👉 Tổng cộng thanh toán: ${formatCurrency(total)}`;
                }
                return desc;
              })()
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
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
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

      {/* 6. MODAL XEM CHI TIẾT PHÒNG/BÀN ĐANG HOẠT ĐỘNG */}
      <Modal
        visible={!!activeTable}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveTable(null)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          {activeTable && (
            <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center">
                  <Ionicons name="time" size={18} color="#fa5908" />
                  <Text className="text-base font-black text-slate-800 ml-2">
                    {activeTable.name} ({
                      shopVertical === 'cafe' ? 'Có khách' :
                      shopVertical === 'court' ? 'Sân đang đá' :
                      shopVertical === 'room' ? 'Phòng đang ở' :
                      'Bàn đang chơi'
                    })
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setActiveTable(null)} className="p-1">
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Tình trạng tiền giờ */}
              <View className="bg-orange-50 border  p-4 rounded-xl mb-4">
                <View className="flex-row justify-between items-center">
                  <Text className="text-[9px] text-slate-455 uppercase tracking-widest font-black">Phí dịch vụ giờ lẻ:</Text>
                  <Badge variant="primary" label={formatCurrency(activeTable.hourly_rate) + '/' + (shopVertical === 'room' ? 'ngày' : 'giờ')} size="sm" />
                </View>
                <Text className="text-orange-500 text-3xl font-black mt-1.5">
                  {formatCurrency(calculateBilling(activeTable).cost)}
                </Text>
                <Text className="text-[9.5px] text-slate-500 mt-3 font-semibold leading-relaxed">
                  ⏱️ Nhận lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                </Text>
              </View>

              {/* CHI TIẾT MÓN / DỊCH VỤ ĐÃ GỌI KÈM */}
              {tableCarts[activeTable.id] && Object.keys(tableCarts[activeTable.id]).length > 0 ? (
                <View className="mb-4">
                  <Text className="text-[10px] text-slate-400 font-extrabold uppercase mb-2">Món ăn / Dịch vụ đã gọi:</Text>
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-32 overflow-hidden">
                    <ScrollView nestedScrollEnabled={true}>
                      {Object.entries(tableCarts[activeTable.id]).map(([pId, item]) => (
                        <View key={pId} className="flex-row justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                          <Text className="text-xs font-semibold text-slate-700 flex-1 mr-2" numberOfLines={1}>{item.name}</Text>
                          <Text className="text-[10px] text-slate-500 font-bold mr-3">x{item.quantity}</Text>
                          <Text className="text-xs font-black text-slate-800">{formatCurrency(item.price * item.quantity)}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              ) : null}

              {/* MENU CHỨC NĂNG PHỤ TRỢ (Như Web) */}
              <Text className="text-[10px] text-slate-400 font-extrabold uppercase mb-2">Thao tác nghiệp vụ:</Text>
              <View className="flex-row flex-wrap gap-2.5 mb-5 justify-between">
                {/* 1. Gọi món / dịch vụ */}
                <TouchableOpacity 
                  activeOpacity={0.8}
                  className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                  onPress={() => {
                    // Đồng bộ giỏ hàng và khóa bàn
                    setCart(tableCarts[activeTable.id] || {});
                    setCartOwnerTable(activeTable);
                    setActiveVertical('retail'); // Switch to product catalog
                    setActiveTable(null); // Close this modal
                  }}
                >
                  <Ionicons name="fast-food-outline" size={16} color="#fa5908" />
                  <Text className="text-[10px] font-black text-slate-700 ml-2">Gọi món / Dịch vụ</Text>
                </TouchableOpacity>

                {/* 2. Đổi phòng/bàn */}
                <TouchableOpacity 
                  activeOpacity={0.8}
                  className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                  onPress={() => {
                    const label = shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : shopVertical === 'cafe' ? 'Bàn' : 'Bàn';
                    alert(`Chức năng Đổi ${label} đang đồng bộ với Cloud.`);
                  }}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#0284c7" />
                  <Text className="text-[10px] font-black text-slate-700 ml-2">Đổi {shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : shopVertical === 'cafe' ? 'Bàn' : 'Bàn'}</Text>
                </TouchableOpacity>

                {/* 3. Gộp phòng/bàn */}
                <TouchableOpacity 
                  activeOpacity={0.8}
                  className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
                  onPress={() => {
                    const label = shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : shopVertical === 'cafe' ? 'Bàn' : 'Bàn';
                    alert(`Chức năng Gộp ${label} đang đồng bộ với Cloud.`);
                  }}
                >
                  <Ionicons name="git-merge-outline" size={16} color="#059669" />
                  <Text className="text-[10px] font-black text-slate-700 ml-2">Gộp {shopVertical === 'room' ? 'Phòng' : shopVertical === 'court' ? 'Sân' : shopVertical === 'cafe' ? 'Bàn' : 'Bàn'}</Text>
                </TouchableOpacity>

                 {/* 4. Hủy đơn / Trả phòng trống */}
                 <TouchableOpacity 
                   activeOpacity={0.8}
                   className="w-[47%] bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex-row items-center active:bg-rose-100"
                   onPress={async () => {
                     try {
                       const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
                       let syncSucceeded = false;

                       // 1. Đồng bộ cục bộ (Offline-First)
                       if (Platform.OS === 'web') {
                         setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, status: 'available', startTime: null } : t));
                       } else {
                         await db
                           .update(schema.location_resources)
                           .set({ status: 'available', startTime: null })
                           .where(eq(schema.location_resources.id, activeTable.id));
                         const updated = await db.select().from(schema.location_resources);
                         setTables(updated);
                       }

                       // 2. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng
                       try {
                         const currentUrl = getApiBaseUrl();
                         const headers = await getApiHeaders();

                         // A. Hủy order in_progress trên Next.js Server
                         if (activeTable.current_order_id) {
                           await fetch(`${currentUrl}/api/shops/${shopId}/orders/${activeTable.current_order_id}/cancel`, {
                             method: 'POST',
                             headers: { ...headers, 'Content-Type': 'application/json' },
                             body: JSON.stringify({ reason: 'Hủy từ di động' })
                           });
                         }

                         // B. Patch trạng thái bàn về available
                         const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
                           method: 'PATCH',
                           headers: { ...headers, 'Content-Type': 'application/json' },
                           body: JSON.stringify({
                             status: 'available',
                             current_order_id: '',
                             startTime: null
                           }),
                         });
                         if (patchRes.ok) {
                           syncSucceeded = true;
                         }
                       } catch (syncErr) {
                         console.log('Mất mạng hoặc lỗi server, bỏ qua hủy trực tiếp:', syncErr);
                       }

                       // Dọn dẹp tableCart
                       setTableCarts(prev => {
                         const copy = { ...prev };
                         delete copy[activeTable.id];
                         return copy;
                       });

                       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                       setActiveTable(null);

                       if (syncSucceeded) {
                         showToast("Hủy đơn & Giải phóng phòng/bàn thành công!", "success");
                       } else {
                         showToast("Giải phóng phòng/bàn ngoại tuyến thành công!", "info");
                       }
                     } catch (err) {
                       console.error('Không thể hủy ca hoạt động:', err);
                       showToast("Có lỗi xảy ra khi hủy ca!", "error");
                     }
                   }}
                 >
                  <Ionicons name="close-circle-outline" size={16} color="#e11d48" />
                  <Text className="text-[10px] font-black text-rose-700 ml-2">Hủy / Trả trống</Text>
                </TouchableOpacity>
              </View>

              {/* Hàng nút thanh toán chính */}
              <View className="flex-row justify-between gap-3 border-t border-slate-100 pt-4">
                <Button 
                  variant="outline"
                  title="Thanh toán CK"
                  onPress={() => triggerPayTable('Chuyển khoản')}
                  className="flex-1 py-3 rounded-xl"
                />

                <Button 
                  variant="primary"
                  title="Thanh toán TM"
                  onPress={() => triggerPayTable('Tiền mặt')}
                  className="flex-1 py-3 rounded-xl"
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
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          <View className="h-[90%] rounded-t-2xl p-6 bg-white justify-between" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
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
              <View className="bg-slate-50 border  rounded-xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Khách hàng</Text>
                  {!selectedCustomer && (
                    <Text className="text-xs font-bold text-slate-600">Khách lẻ</Text>
                  )}
                </View>

                {selectedCustomer ? (
                  <View className="bg-white border border-slate-200 rounded-xl p-3.5 flex-row justify-between items-center" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
                    <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
                  <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 }}>
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
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
              <View className="bg-white border border-slate-100 rounded-xl p-4 mb-4" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
                            className="absolute left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1.5 py-1 z-50"
                            style={{ 
                              top: '100%', 
                              elevation: 10,
                              shadowColor: '#000000',
                              shadowOffset: { width: 0, height: 6 },
                              shadowOpacity: 0.1,
                              shadowRadius: 10,
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
                    <View className="w-full flex-row items-center  border border-orange-100 px-3 py-1 rounded-xl mt-1.5">
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

              <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4 flex-row justify-between items-center" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
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
        <View className="flex-1 justify-center items-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          {qrPayload && (
            <View className="w-full max-w-sm p-6 rounded-2xl bg-white border border-slate-100 items-center" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
              
              {/* Header */}
              <View className="w-full flex-row justify-between items-center mb-4">
                <Text className="text-sm font-black text-slate-800 uppercase tracking-wide">Dynamic QR Code</Text>
                <TouchableOpacity onPress={() => setIsQrModalOpen(false)} className="p-1">
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* MB Bank Card Graphic */}
              <View className="w-full bg-slate-900 p-4 rounded-xl mb-4 relative overflow-hidden" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
                <View className="absolute w-24 h-24  rounded-full -top-10 -left-10" />
                <Text className=" text-[7px] font-black uppercase tracking-widest">MB BANK INTERCONNECT</Text>
                <Text className="text-white text-xs font-extrabold mt-2">CONG TY TNHH ONI ERP</Text>
                <Text className=" text-sm font-black mt-0.5 tracking-wider">8888 9999 6666</Text>
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
                className="w-full py-3.5 rounded-xl" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
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
