import React, { useState, useCallback, useEffect } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, like, or } from 'drizzle-orm';
import { formatCurrency } from '../lib/utils/format';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { BarcodeScannerModal } from '../components/ui/BarcodeScannerModal';
import { KeepAliveManager } from '../lib/sync/KeepAliveManager';
import { PermissionsProvider, usePermissions } from '../lib/auth/PermissionsContext';
import * as Haptics from 'expo-haptics';
import { getApiBaseUrl, getApiHeaders } from '../lib/api/config';

const REASONS_MAP: Record<string, { value: string; label: string }[]> = {
  adjustment: [
    { value: 'Kiểm kê định kỳ', label: 'Kiểm kê định kỳ' },
    { value: 'Hao hụt thất thoát', label: 'Hao hụt thất thoát' },
    { value: 'Hư hỏng hàng hóa', label: 'Hư hỏng hàng hóa' },
    { value: 'Khác', label: 'Lý do khác' },
  ],
  purchase_in: [
    { value: 'Nhập hàng mới từ nhà cung cấp', label: 'Nhập hàng mới từ NCC' },
    { value: 'Nhập hàng bổ sung tồn kho', label: 'Nhập hàng bổ sung' },
    { value: 'Khác', label: 'Lý do khác' },
  ],
  transfer_out: [
    { value: 'Xuất chuyển kho sang chi nhánh khác', label: 'Chuyển sang chi nhánh khác' },
    { value: 'Xuất chuyển kho lưu trữ/dự phòng', label: 'Chuyển kho lưu trữ/dự phòng' },
    { value: 'Khác', label: 'Lý do khác' },
  ],
  transfer_in: [
    { value: 'Nhận hàng chuyển từ chi nhánh khác', label: 'Nhận chuyển từ chi nhánh khác' },
    { value: 'Khác', label: 'Lý do khác' },
  ],
  return_in: [
    { value: 'Khách hàng đổi trả sản phẩm', label: 'Khách hàng đổi trả' },
    { value: 'Khách hàng trả hàng lỗi', label: 'Khách trả hàng lỗi' },
    { value: 'Khác', label: 'Lý do khác' },
  ],
};

function WarehouseContent() {
  const { hasPermission } = usePermissions();
  const hasPricingPermission = hasPermission(['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage']);

  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Barcode scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Form states giao dịch kho
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [movementType, setMovementType] = useState<'adjustment' | 'purchase_in' | 'transfer_out' | 'transfer_in' | 'return_in'>('adjustment');
  const [actualQtyInput, setActualQtyInput] = useState('');
  const [qtyInput, setQtyInput] = useState('1');
  const [costInput, setCostInput] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [reason, setReason] = useState('Kiểm kê định kỳ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReasonSelector, setShowReasonSelector] = useState(false);

  // Warehouse states
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);
  const [showToWarehouseSelector, setShowToWarehouseSelector] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  // Sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [isRefreshingProduct, setIsRefreshingProduct] = useState(false);

  // Toast states
  const [toastMsg, setToastMsg] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({message, type});
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success :
      type === 'error' ? Haptics.NotificationFeedbackType.Error :
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    
    Animated.sequence([
      Animated.timing(toastOpacity, {toValue: 1, duration: 250, useNativeDriver: true}),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {toValue: 0, duration: 250, useNativeDriver: true})
    ]).start(() => setToastMsg(null));
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    showToast('Đang tiến hành đồng bộ dữ liệu...', 'info');
    try {
      await KeepAliveManager.triggerSyncIfNeeded(true);
      await loadProducts();
      showToast('Đồng bộ dữ liệu kho hàng thành công!', 'success');
    } catch (err) {
      showToast('Đồng bộ thất bại, vui lòng thử lại!', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshSingleProduct = async () => {
    if (!selectedProduct) return;
    setIsRefreshingProduct(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/products/${selectedProduct.id}`, { headers });
      if (res.ok) {
        const cloudProd = await res.json();
        const latestQty = parseInt(cloudProd.stock_qty || '0', 10);
        
        // Cập nhật SQLite nội địa để đồng bộ luôn
        if (Platform.OS !== 'web') {
          await db.update(schema.products)
            .set({ stock_qty: latestQty })
            .where(eq(schema.products.id, selectedProduct.id));
        }

        // Cập nhật selectedProduct
        setSelectedProduct((prev: any) => prev ? { ...prev, stock_qty: latestQty } : null);
        
        // Load lại danh sách sản phẩm để cập nhật màn hình chính
        await loadProducts();
        
        showToast(`Đã cập nhật tồn kho mới nhất từ máy chủ (${latestQty} ${selectedProduct.unit || 'đv'})!`, 'success');
      } else {
        showToast('Không thể kết nối máy chủ để lấy tồn kho mới nhất.', 'error');
      }
    } catch (err) {
      showToast('Lỗi khi tải lại tồn kho sản phẩm.', 'error');
    } finally {
      setIsRefreshingProduct(false);
    }
  };

  const renderToast = () => {
    if (!toastMsg) return null;
    return (
      <Animated.View 
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 60 : 30,
          left: 20,
          right: 20,
          zIndex: 999999,
          opacity: toastOpacity,
          transform: [
            {
              translateY: toastOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })
            }
          ],
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 4},
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 999
        }}
        className={`flex-row items-center px-4 py-3.5 rounded-2xl border ${
          toastMsg.type === 'success' ? 'bg-emerald-500 border-emerald-600' :
          toastMsg.type === 'error' ? 'bg-rose-500 border-rose-600' :
          'bg-blue-600 border-blue-700'
        }`}
      >
        <Ionicons 
          name={
            toastMsg.type === 'success' ? 'checkmark-circle' :
            toastMsg.type === 'error' ? 'alert-circle' :
            'information-circle'
          } 
          size={18} 
          color="white" 
        />
        <Text className="flex-1 ml-2.5 text-white font-medium text-xs">
          {toastMsg.message}
        </Text>
      </Animated.View>
    );
  };

  const loadWarehouses = async () => {
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      // Load from cache first
      const cached = await AsyncStorage.getItem(`cached_warehouses_${shopId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setWarehouses(parsed);
        const saleWh = parsed.find((w: any) => w.code === 'sale') || parsed[0];
        if (saleWh) {
          setSelectedWarehouseId(saleWh.id || saleWh.warehouse_id);
          const otherWh = parsed.find((w: any) => (w.id || w.warehouse_id) !== (saleWh.id || saleWh.warehouse_id)) || parsed[0];
          if (otherWh) {
            setToWarehouseId(otherWh.id || otherWh.warehouse_id);
          }
        }
      }

      // Fetch from API
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/warehouses?limit=100`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        setWarehouses(list);
        await AsyncStorage.setItem(`cached_warehouses_${shopId}`, JSON.stringify(list));
        
        if (list.length > 0) {
          const saleWh = list.find((w: any) => w.code === 'sale') || list[0];
          if (saleWh) {
            setSelectedWarehouseId(prev => prev || saleWh.id || saleWh.warehouse_id);
            const otherWh = list.find((w: any) => (w.id || w.warehouse_id) !== (saleWh.id || saleWh.warehouse_id)) || list[0];
            if (otherWh) {
              setToWarehouseId(prev => prev || otherWh.id || otherWh.warehouse_id);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách kho:', err);
    }
  };

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      let localProds: any[] = [];
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

      // 1. NẾU CÓ TÌM KIẾM -> Ưu tiên Online trước, sau đó fallback Offline
      if (searchQuery.trim()) {
        let fetchSearchSuccess = false;
        let searchedProducts: any[] = [];
        try {
          const headers = await getApiHeaders();
          const url = getApiBaseUrl();
          // Tìm kiếm sản phẩm online (tối đa 100 dòng)
          const res = await fetch(`${url}/api/shops/${shopId}/products?limit=100&page=1&search=${encodeURIComponent(searchQuery.trim())}`, { headers });
          if (res.ok) {
            const resJson = await res.json();
            const cloudProducts = resJson.data || [];
            searchedProducts = cloudProducts.map((p: any) => {
              const sellPrice = parseInt(p.sell_price || '0', 10);
              const stockQty = parseInt(p.stock_qty || '0', 10);
              return {
                id: p.id || p.product_id,
                name: p.name || '',
                sku: p.sku || '',
                barcode: p.barcode || '',
                category_id: p.category_id || null,
                unit: p.unit || '',
                sell_price: isNaN(sellPrice) ? 0 : sellPrice,
                stock_qty: isNaN(stockQty) ? 0 : stockQty,
                image_url: p.image_url || null,
                description: p.description || null,
              };
            });
            fetchSearchSuccess = true;

            // Đồng bộ bộ nhớ đệm cache SQLite cục bộ
            if (Platform.OS !== 'web') {
              for (const prod of searchedProducts) {
                await db.insert(schema.products).values({
                  id: prod.id,
                  name: prod.name,
                  sku: prod.sku,
                  barcode: prod.barcode,
                  category_id: prod.category_id,
                  unit: prod.unit,
                  sell_price: prod.sell_price,
                  stock_qty: prod.stock_qty,
                  image_url: prod.image_url,
                  description: prod.description,
                }).onConflictDoUpdate({
                  target: schema.products.id,
                  set: {
                    name: prod.name,
                    sku: prod.sku,
                    barcode: prod.barcode,
                    category_id: prod.category_id,
                    unit: prod.unit,
                    sell_price: prod.sell_price,
                    stock_qty: prod.stock_qty,
                    image_url: prod.image_url,
                    description: prod.description,
                  }
                });
              }
            }
          }
        } catch (err) {
          console.warn('Lỗi tìm kiếm sản phẩm online, tự động chuyển về tìm kiếm offline SQLite:', err);
        }

        if (fetchSearchSuccess) {
          localProds = searchedProducts;
        } else {
          // Tìm kiếm offline fallback từ SQLite
          if (Platform.OS !== 'web') {
            const q = `%${searchQuery.trim()}%`;
            localProds = await db
              .select()
              .from(schema.products)
              .where(
                or(
                  like(schema.products.name, q),
                  like(schema.products.sku, q),
                  like(schema.products.barcode, q)
                )
              );
          } else {
            localProds = [
              { id: 'p1', name: 'Cà phê Phin Sữa Đá', sku: 'CF001', barcode: '11111', stock_qty: 15, sell_price: 29000, unit: 'Ly' },
              { id: 'p2', name: 'Trà Đào Cam Sả', sku: 'TR002', barcode: '22222', stock_qty: 11, sell_price: 39000, unit: 'Ly' },
              { id: 'p3', name: 'Bánh Mì Pate Thịt', sku: 'BM003', barcode: '33333', stock_qty: 6, sell_price: 25000, unit: 'Cái' },
            ].filter(p => 
              p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
              p.barcode.includes(searchQuery) ||
              p.sku.includes(searchQuery)
            );
          }
        }
      } 
      // 2. KHÔNG TÌM KIẾM -> Offline First
      else {
        if (Platform.OS !== 'web') {
          localProds = await db.select().from(schema.products);
        } else {
          localProds = [
            { id: 'p1', name: 'Cà phê Phin Sữa Đá', sku: 'CF001', barcode: '11111', stock_qty: 15, sell_price: 29000, unit: 'Ly' },
            { id: 'p2', name: 'Trà Đào Cam Sả', sku: 'TR002', barcode: '22222', stock_qty: 11, sell_price: 39000, unit: 'Ly' },
            { id: 'p3', name: 'Bánh Mì Pate Thịt', sku: 'BM003', barcode: '33333', stock_qty: 6, sell_price: 25000, unit: 'Cái' },
          ];
        }
      }

      setProducts(localProds);

      // Cập nhật syncStatus dựa trên xem có dòng nào pending không
      let hasPending = false;
      let pCount = 0;
      if (Platform.OS !== 'web') {
        const pendingMovements = await db
          .select()
          .from(schema.stockMovements)
          .where(eq(schema.stockMovements.sync_status, 'pending'));
        hasPending = pendingMovements.length > 0;
        pCount = pendingMovements.length;
      }
      setSyncStatus(hasPending ? 'pending' : 'synced');
      setPendingCount(pCount);
    } catch (error) {
      console.error('Lỗi tải sản phẩm:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Kích hoạt load lại sản phẩm khi màn hình được focus
  useFocusEffect(
    useCallback(() => {
      loadProducts();
      loadWarehouses();
    }, [])
  );

  // Debounce tìm kiếm (Tránh spam API liên tục khi gõ phím)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadProducts();
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleScanBarcode = (barcode: string) => {
    setIsScannerOpen(false);
    setSearchQuery(barcode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleOpenAdjust = (prod: any) => {
    setSelectedProduct(prod);
    setMovementType('adjustment');
    setActualQtyInput(String(prod.stock_qty || 0));
    setQtyInput('1');
    setCostInput('');
    setReferenceNo('');
    setReason('Kiểm kê định kỳ');
    setNoteInput('');
    
    if (warehouses.length > 0) {
      const saleWh = warehouses.find((w: any) => w.code === 'sale') || warehouses[0];
      setSelectedWarehouseId(saleWh.id || saleWh.warehouse_id);
      const otherWh = warehouses.find((w: any) => (w.id || w.warehouse_id) !== (saleWh.id || saleWh.warehouse_id)) || warehouses[0];
      if (otherWh) {
        setToWarehouseId(otherWh.id || otherWh.warehouse_id);
      }
    }
    
    setShowAdjustModal(true);
  };

  const handleTypeChange = (type: typeof movementType) => {
    setMovementType(type);
    const defaultReason = REASONS_MAP[type]?.[0]?.value || 'Khác';
    setReason(defaultReason);
    if (type === 'adjustment') {
      setActualQtyInput(String(selectedProduct?.stock_qty || 0));
    } else {
      setQtyInput('1');
    }
  };

  const handleSaveMovement = async () => {
    let delta = 0;
    let newStockQty = selectedProduct.stock_qty || 0;
    const currentStock = selectedProduct.stock_qty || 0;

    if (movementType === 'adjustment') {
      const actual = parseInt(actualQtyInput, 10);
      if (isNaN(actual) || actual < 0) {
        Alert.alert('Lỗi', 'Số lượng đếm thực tế phải là một số lớn hơn hoặc bằng 0.');
        return;
      }
      delta = actual - currentStock;
      newStockQty = actual;
    } else {
      const qtyVal = parseInt(qtyInput, 10);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        Alert.alert('Lỗi', 'Số lượng giao dịch phải là một số nguyên lớn hơn 0.');
        return;
      }
      
      if (movementType === 'purchase_in') {
        delta = qtyVal;
        newStockQty = currentStock + qtyVal;
      } else if (movementType === 'transfer_out') {
        delta = -qtyVal;
        newStockQty = currentStock - qtyVal;
      } else if (movementType === 'transfer_in') {
        delta = qtyVal;
        newStockQty = currentStock + qtyVal;
      } else if (movementType === 'return_in') {
        delta = qtyVal;
        newStockQty = currentStock + qtyVal;
      }
    }

    // Validate warehouses
    if (['transfer_out', 'transfer_in'].includes(movementType)) {
      if (!selectedWarehouseId) {
        Alert.alert('Lỗi', 'Vui lòng chọn kho nguồn.');
        return;
      }
      if (!toWarehouseId) {
        Alert.alert('Lỗi', 'Vui lòng chọn kho đích.');
        return;
      }
      if (selectedWarehouseId === toWarehouseId) {
        Alert.alert('Lỗi', 'Kho nguồn và kho đích không được trùng nhau.');
        return;
      }
    } else {
      if (!selectedWarehouseId) {
        Alert.alert('Lỗi', 'Vui lòng chọn kho hàng.');
        return;
      }
    }

    // Validate pricing if purchase_in & user has permission
    let unitCostVal = 0;
    if (movementType === 'purchase_in' && hasPricingPermission) {
      unitCostVal = parseInt(costInput || '0', 10);
      if (isNaN(unitCostVal) || unitCostVal < 0) {
        Alert.alert('Lỗi', 'Đơn giá mua/giá vốn phải là một số lớn hơn hoặc bằng 0.');
        return;
      }
    }

    // Tên hiển thị loại giao dịch tiếng Việt
    const actionNames: Record<string, string> = {
      adjustment: 'Kiểm kê (Điều chỉnh)',
      purchase_in: 'Nhập kho',
      transfer_out: 'Xuất chuyển kho',
      transfer_in: 'Nhập chuyển kho',
      return_in: 'Khách trả hàng',
    };

    let confirmMsg = `Bạn có chắc chắn muốn thực hiện giao dịch sau?\n\n`;
    confirmMsg += `• Sản phẩm: ${selectedProduct.name}\n`;
    confirmMsg += `• Loại tác vụ: ${actionNames[movementType]}\n`;
    
    if (movementType === 'adjustment') {
      confirmMsg += `• Tồn kho cũ: ${currentStock} ${selectedProduct.unit || 'đv'}\n`;
      confirmMsg += `• Tồn kho mới: ${newStockQty} ${selectedProduct.unit || 'đv'}\n`;
      confirmMsg += `• Chênh lệch: ${delta >= 0 ? '+' : ''}${delta} ${selectedProduct.unit || 'đv'}\n`;
    } else {
      confirmMsg += `• Số lượng: ${qtyInput} ${selectedProduct.unit || 'đv'}\n`;
      confirmMsg += `• Tồn kho trước: ${currentStock} ${selectedProduct.unit || 'đv'}\n`;
      confirmMsg += `• Tồn kho sau: ${newStockQty} ${selectedProduct.unit || 'đv'}\n`;
    }

    const sourceWhName = warehouses.find((w: any) => (w.id || w.warehouse_id) === selectedWarehouseId)?.name || 'Không xác định';
    const destWhName = warehouses.find((w: any) => (w.id || w.warehouse_id) === toWarehouseId)?.name || 'Không xác định';

    if (['transfer_out', 'transfer_in'].includes(movementType)) {
      confirmMsg += `• Kho nguồn: ${sourceWhName}\n`;
      confirmMsg += `• Kho đích: ${destWhName}\n`;
    } else {
      confirmMsg += `• Kho hàng: ${sourceWhName}\n`;
    }

    if (movementType === 'purchase_in' && hasPricingPermission) {
      confirmMsg += `• Đơn giá mua: ${formatCurrency(unitCostVal)}\n`;
      confirmMsg += `• Tổng giá trị: ${formatCurrency(unitCostVal * parseInt(qtyInput || '0', 10))}\n`;
    }

    const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
    confirmMsg += `• Người thực hiện: ${userEmail}\n`;

    if (referenceNo) {
      confirmMsg += `• Mã chứng từ: ${referenceNo}\n`;
    }
    
    confirmMsg += `• Lý do: ${reason}\n`;
    if (noteInput.trim()) {
      confirmMsg += `• Ghi chú: ${noteInput.trim()}\n`;
    }

    Alert.alert(
      'Xác nhận giao dịch kho',
      confirmMsg,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          style: 'default',
          onPress: () => submitMovement(delta, newStockQty, unitCostVal)
        }
      ]
    );
  };

  const submitMovement = async (delta: number, newStockQty: number, unitCostVal: number) => {
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const movementId = `sm-local-${Date.now()}`;
      const nowStr = new Date().toISOString();

      let baseReason = reason || 'Giao dịch kho từ di động';
      if (noteInput.trim()) {
        baseReason = `${baseReason} - ${noteInput.trim()}`;
      }
      const finalReason = `${baseReason} [Mobile]`;

      // 1. Lưu phiếu giao dịch stock_movements vào SQLite
      if (Platform.OS !== 'web') {
        await db.insert(schema.stockMovements).values({
          id: movementId,
          branch_id: shopId,
          type: movementType,
          product_id: selectedProduct.id,
          sku: selectedProduct.sku || null,
          variant_id: null,
          qty: delta, // Delta có dấu âm/dương
          unit_cost: unitCostVal,
          reference_no: referenceNo || null,
          employee_id: userEmail,
          reason: finalReason,
          workflow_status: 'completed',
          created_at: nowStr,
          sync_status: 'pending',
          warehouse_id: selectedWarehouseId || null,
          to_warehouse_id: ['transfer_out', 'transfer_in'].includes(movementType) ? (toWarehouseId || null) : null,
        });

        // 2. Cập nhật tồn kho sản phẩm trực tiếp trong bảng products SQLite cục bộ
        await db
          .update(schema.products)
          .set({ stock_qty: newStockQty })
          .where(eq(schema.products.id, selectedProduct.id));
      }

      setShowAdjustModal(false);
      setSelectedProduct(null);
      showToast('Đã lưu phiếu kho ngoại tuyến và cập nhật tồn kho di động thành công!', 'success');
      
      // Gọi đồng bộ nền ngay và chờ hoàn tất để hiển thị trạng thái chuẩn xác nhất
      try {
        await KeepAliveManager.triggerSyncIfNeeded(false);
      } catch (syncErr) {
        console.warn('Lỗi đồng bộ tự động sau khi tạo phiếu kho:', syncErr);
      }

      // Load lại sản phẩm
      await loadProducts();
    } catch (err: any) {
      showToast(`Lỗi lưu phiếu kho: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header 
        title="Giao dịch kho sản phẩm" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onPressSync={handleManualSync}
        pendingCount={pendingCount}
        entityName="phiếu"
      />

      {/* Tìm kiếm & Quét Barcode */}
      <View className="px-4 pt-3 flex-row items-center gap-2 mb-3">
        <View className="flex-1 relative justify-center">
          <View style={{ position: 'absolute', left: 12, zIndex: 10, height: '100%', justifyContent: 'center' }}>
            <Ionicons name="search-outline" size={18} color="#94a3b8" />
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo tên, SKU, Barcode..."
            placeholderTextColor="#94a3b8"
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-800"
            style={{
              paddingVertical: 0,
              textAlignVertical: 'center',
              lineHeight: undefined,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
            }}
          />
          {searchQuery ? (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 12, zIndex: 10, height: '100%', justifyContent: 'center' }}
            >
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity 
          onPress={handleManualSync}
          disabled={isSyncing}
          className="bg-slate-100 border border-slate-200 p-3 rounded-xl justify-center items-center h-11 w-11"
          activeOpacity={0.7}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.8 }] }} />
          ) : (
            <Ionicons name="sync-outline" size={16} color="#fa5908" />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setIsScannerOpen(true)}
          className="bg-orange-500 rounded-xl justify-center items-center h-11 w-11"
          style={{ backgroundColor: '#fa5908' }}
        >
          <Ionicons name="scan" size={16} color="white" />
        </TouchableOpacity>
      </View>

      {/* Thông báo phiếu kho di động */}
      <View className="mx-4 mb-3 p-3 bg-orange-50 border border-orange-200 rounded-2xl flex-row items-start">
        <Ionicons name="information-circle-outline" size={16} color="#ea580c" style={{ marginTop: 2, marginRight: 8 }} />
        <Text className="flex-1 text-[11px] text-orange-800 leading-normal font-medium">
          Mục phiếu kho trên di động chỉ hỗ trợ sản phẩm đơn. Nếu cần lập phiếu kho nhiều sản phẩm hoặc quản lý lô hàng, vui lòng sử dụng phiên bản Web.
        </Text>
      </View>

      {/* Danh sách sản phẩm */}
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#fa5908" className="py-10" />
        ) : products.length === 0 ? (
          <View className="bg-white border border-slate-100 rounded-3xl p-10 items-center justify-center">
            <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
            <Text className="text-xxs font-semibold text-slate-455 mt-3 text-center">Không tìm thấy sản phẩm nào.</Text>
          </View>
        ) : (
          products.map(p => (
            <View key={p.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs mb-3 flex-row justify-between items-center">
              <View className="flex-1 mr-4">
                <Text className="text-xs font-semibold text-slate-850" numberOfLines={1}>{p.name}</Text>
                <Text className="text-xxs text-slate-400 font-semibold mt-1">SKU: {p.sku || '—'} | Barcode: {p.barcode || '—'}</Text>
                
                <View className="flex-row items-center mt-3">
                  <Text className="text-xxs font-semibold text-slate-500">Tồn kho:</Text>
                  <Text className={`text-xs font-bold ml-1.5 ${p.stock_qty <= 5 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {p.stock_qty} {p.unit || 'đơn vị'}
                  </Text>
                </View>
              </View>

              <Button
                variant="outline"
                size="sm"
                title="Giao dịch kho"
                onPress={() => handleOpenAdjust(p)}
                className="rounded-xl px-3 py-1.5"
              />
            </View>
          ))
        )}
        <View className="h-10" />
      </ScrollView>

      {/* Modal Điều Chỉnh Tồn Kho */}
      <Modal
        visible={showAdjustModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAdjustModal(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setShowAdjustModal(false)}
          />
          <View className="bg-white rounded-t-3xl p-6 relative max-h-[90%]">
            
            {/* Header modal */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-bold text-slate-800">Giao dịch kho hàng</Text>
              <TouchableOpacity onPress={() => setShowAdjustModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Segmented type selector */}
            <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4 gap-1">
              {[
                { type: 'adjustment', label: 'Kiểm kê', icon: 'calculator-outline', color: '#eab308' },
                { type: 'purchase_in', label: 'Nhập kho', icon: 'download-outline', color: '#3b82f6' },
                { type: 'transfer_out', label: 'Xuất chuyển', icon: 'arrow-forward-outline', color: '#f97316' },
                { type: 'transfer_in', label: 'Nhập chuyển', icon: 'arrow-back-outline', color: '#a855f7' },
                { type: 'return_in', label: 'Khách trả', icon: 'refresh-outline', color: '#ef4444' },
              ].map((item) => {
                const isActive = movementType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    onPress={() => handleTypeChange(item.type as any)}
                    className="flex-1 py-2 rounded-lg items-center justify-center"
                    style={isActive ? {
                      backgroundColor: 'white',
                      ...Platform.select({
                        ios: {
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 1,
                        },
                        android: {
                          elevation: 1,
                        },
                      })
                    } : undefined}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name={item.icon as any} 
                      size={14} 
                      color={isActive ? item.color : '#64748b'} 
                    />
                    <Text 
                      className={`text-[9px] font-semibold mt-0.5 ${isActive ? 'text-slate-850 font-bold' : 'text-slate-500'}`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
                 <View className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex-row justify-between items-center">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs font-semibold text-slate-800">{selectedProduct.name}</Text>
                    {movementType === 'adjustment' ? (
                      <Text className="text-xxs text-slate-400 font-semibold mt-1">Tồn kho hiện tại trên máy: {selectedProduct.stock_qty} {selectedProduct.unit || 'đv'}</Text>
                    ) : (
                      <Text className="text-xxs text-slate-400 font-semibold mt-1">
                        Tồn kho hiện tại: {selectedProduct.stock_qty} {selectedProduct.unit || 'đv'}
                        {(() => {
                          const val = parseInt(qtyInput, 10);
                          if (isNaN(val) || val <= 0) return '';
                          let nextQty = selectedProduct.stock_qty || 0;
                          if (movementType === 'purchase_in' || movementType === 'transfer_in' || movementType === 'return_in') {
                            nextQty += val;
                          } else if (movementType === 'transfer_out') {
                            nextQty -= val;
                          }
                          return ` ➔ Tồn dự kiến sau lưu: ${nextQty} ${selectedProduct.unit || 'đv'}`;
                        })()}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={handleRefreshSingleProduct}
                    disabled={isRefreshingProduct}
                    className="p-2 bg-white rounded-lg border border-slate-200 items-center justify-center shadow-xs"
                    activeOpacity={0.7}
                  >
                    {isRefreshingProduct ? (
                      <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="sync-outline" size={16} color="#fa5908" />
                    )}
                  </TouchableOpacity>
                </View>

                {movementType === 'adjustment' ? (
                  <View className="mb-4">
                    <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Số lượng thực tế *</Text>
                    <View className="relative justify-center">
                      <TextInput
                        value={actualQtyInput}
                        onChangeText={setActualQtyInput}
                        keyboardType="numeric"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-lg font-bold text-slate-800 pl-4 pr-12"
                        placeholder="0"
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                        }}
                      />
                      <View style={{ position: 'absolute', right: 16, height: '100%', justifyContent: 'center' }}>
                        <Text className="text-sm font-semibold text-slate-400" style={{ lineHeight: undefined }}>{selectedProduct.unit || 'đv'}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="mb-4">
                    <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      {movementType === 'purchase_in' ? 'Số lượng nhập *' :
                       movementType === 'transfer_out' ? 'Số lượng xuất chuyển *' :
                       movementType === 'transfer_in' ? 'Số lượng nhập chuyển *' :
                       'Số lượng khách trả *'}
                    </Text>
                    <View className="relative justify-center">
                      <TextInput
                        value={qtyInput}
                        onChangeText={setQtyInput}
                        keyboardType="numeric"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-lg font-bold text-slate-800 pl-4 pr-12"
                        placeholder="1"
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                        }}
                      />
                      <View style={{ position: 'absolute', right: 16, height: '100%', justifyContent: 'center' }}>
                        <Text className="text-sm font-semibold text-slate-400" style={{ lineHeight: undefined }}>{selectedProduct.unit || 'đv'}</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Chọn Kho Hàng / Kho Nguồn */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {['transfer_out', 'transfer_in'].includes(movementType) ? 'Kho nguồn *' : 'Kho hàng *'}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowWarehouseSelector(true)}
                    className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                  >
                    <Text className="text-xs font-semibold text-slate-800">
                      {warehouses.find((w: any) => (w.id || w.warehouse_id) === selectedWarehouseId)?.name || 'Chọn kho hàng'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Chọn Kho Đích (Chỉ khi Chuyển kho) */}
                {['transfer_out', 'transfer_in'].includes(movementType) && (
                  <View className="mb-4">
                    <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Kho đích *</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowToWarehouseSelector(true)}
                      className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                    >
                      <Text className="text-xs font-semibold text-slate-800">
                        {warehouses.find((w: any) => (w.id || w.warehouse_id) === toWarehouseId)?.name || 'Chọn kho đích'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Nhập đơn giá nếu có quyền (chỉ dành cho Nhập kho) */}
                {movementType === 'purchase_in' && hasPricingPermission && (
                  <View className="mb-4">
                    <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Đơn giá nhập (đ/đv) *</Text>
                    <View className="relative justify-center">
                      <TextInput
                        value={costInput}
                        onChangeText={setCostInput}
                        keyboardType="numeric"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-sm font-bold text-slate-800 px-4"
                        placeholder="0"
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                        }}
                      />
                    </View>
                    {costInput !== '' && !isNaN(parseInt(costInput, 10)) && (
                      <Text className="text-[10px] text-slate-400 font-semibold mt-1 text-right">
                        Thành tiền: {formatCurrency(parseInt(costInput, 10) * parseInt(qtyInput || '0', 10))}
                      </Text>
                    )}
                  </View>
                )}

                {/* Nhập mã chứng từ */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Mã chứng từ / Mã tham chiếu</Text>
                  <TextInput
                    value={referenceNo}
                    onChangeText={setReferenceNo}
                    placeholder="Ví dụ: PN001, PO-992,..."
                    placeholderTextColor="#cbd5e1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-850 font-semibold"
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>

                {/* Hiển thị chênh lệch (đối với kiểm kho) */}
                {movementType === 'adjustment' && actualQtyInput !== '' && (
                  <View className="mb-4 p-3 rounded-lg flex-row justify-between items-center bg-slate-50 border border-slate-100">
                    <Text className="text-xxs font-semibold text-slate-500">Chênh lệch điều chỉnh:</Text>
                    {(() => {
                      const diff = parseInt(actualQtyInput, 10) - (selectedProduct.stock_qty || 0);
                      if (isNaN(diff)) return <Text className="text-xxs text-slate-400 font-bold">—</Text>;
                      if (diff === 0) return <Text className="text-xxs text-slate-500 font-bold">Khớp (0)</Text>;
                      return (
                        <Text className={`text-xs font-bold ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </Text>
                      );
                    })()}
                  </View>
                )}

                {/* Cảnh báo âm kho khi xuất chuyển */}
                {movementType === 'transfer_out' && qtyInput !== '' && (
                  (() => {
                    const val = parseInt(qtyInput, 10);
                    if (!isNaN(val) && val > (selectedProduct.stock_qty || 0)) {
                      return (
                        <View className="mb-4 p-3 rounded-lg flex-row items-center bg-rose-50 border border-rose-100">
                          <Ionicons name="warning-outline" size={14} color="#e11d48" className="mr-1.5" />
                          <Text className="text-[10px] text-rose-600 font-semibold flex-1">
                            Cảnh báo: Số lượng xuất ({val}) lớn hơn tồn kho hiện tại ({selectedProduct.stock_qty || 0}).
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()
                )}

                {/* Lý do */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Lý do giao dịch *</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowReasonSelector(true)}
                    className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                  >
                    <Text className="text-xs font-semibold text-slate-800">
                      {reason}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Ghi chú */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Ghi chú / Chi tiết lý do</Text>
                  <TextInput
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="Nhập ghi chú chi tiết nếu có..."
                    placeholderTextColor="#cbd5e1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-850 font-semibold"
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>

                {/* Actions */}
                <View className="flex-row gap-3 mt-4">
                  <TouchableOpacity
                    className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-slate-50 items-center justify-center"
                    onPress={() => setShowAdjustModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="flex-1 py-3.5 rounded-xl bg-orange-500 items-center justify-center flex-row"
                    onPress={handleSaveMovement}
                    disabled={isSubmitting}
                    style={{ backgroundColor: '#fa5908' }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                        <Text className="text-white font-semibold text-xs ml-1.5">Xác nhận giao dịch</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Reason Selector Overlay */}
            {showReasonSelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn lý do giao dịch</Text>
                  <TouchableOpacity onPress={() => setShowReasonSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {(REASONS_MAP[movementType] || REASONS_MAP.adjustment).map(r => (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => {
                        setReason(r.value);
                        setShowReasonSelector(false);
                      }}
                      className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                    >
                      <Text className={`text-xs ${reason === r.value ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                        {r.label}
                      </Text>
                      {reason === r.value && (
                        <Ionicons name="checkmark" size={18} color="#fa5908" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Warehouse Selector Overlay */}
            {showWarehouseSelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn kho hàng</Text>
                  <TouchableOpacity onPress={() => setShowWarehouseSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {warehouses.map(w => {
                    const wId = w.id || w.warehouse_id;
                    const isSelected = selectedWarehouseId === wId;
                    return (
                      <TouchableOpacity
                        key={wId}
                        onPress={() => {
                          setSelectedWarehouseId(wId);
                          setShowWarehouseSelector(false);
                        }}
                        className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                      >
                        <Text className={`text-xs ${isSelected ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                          {w.name} {w.code ? `(${w.code})` : ''}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#fa5908" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Destination Warehouse Selector Overlay */}
            {showToWarehouseSelector && (
              <View className="absolute inset-0 bg-white rounded-t-3xl p-6 z-50">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-base font-bold text-slate-800">Chọn kho đích</Text>
                  <TouchableOpacity onPress={() => setShowToWarehouseSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {warehouses.map(w => {
                    const wId = w.id || w.warehouse_id;
                    const isSelected = toWarehouseId === wId;
                    return (
                      <TouchableOpacity
                        key={wId}
                        onPress={() => {
                          setToWarehouseId(wId);
                          setShowToWarehouseSelector(false);
                        }}
                        className="py-3.5 border-b border-slate-100 flex-row justify-between items-center"
                      >
                        <Text className={`text-xs ${isSelected ? 'font-bold text-orange-500' : 'text-slate-700'}`}>
                          {w.name} {w.code ? `(${w.code})` : ''}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#fa5908" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Barcode scanner modal */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanBarcode}
      />
      {renderToast()}
    </SafeAreaView>
  );
}

export default function WarehouseScreen() {
  return (
    <PermissionsProvider>
      <WarehouseContent />
    </PermissionsProvider>
  );
}
