import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  FlatList,
  Pressable,
  Image,
  Animated,
  Linking,
  Alert
} from 'react-native';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useRouter, useLocalSearchParams} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db, expoDb} from '../lib/db/client';
import * as schema from '../lib/db/schema';
import {eq, like, or, and, desc} from 'drizzle-orm';
import {getApiBaseUrl, getApiHeaders} from '../lib/api/config';
import {Header} from '../components/layout/Header';
import {DrawerMenu} from '../components/erp/DrawerMenu';
import {formatCurrency} from '../lib/utils/format';
import {SyncManager} from '../lib/sync/SyncManager';
import {usePermissions} from '../lib/auth/PermissionsContext';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { isSystemTimeChargeProduct, isTimeChargeProduct } from '@oni/core';

const ITEM_CLASS_LABELS: Record<string, string> = {
  commercial: 'Hàng thương mại',
  supply: 'Vật tư & Tiêu hao',
  fixed_asset: 'Tài sản & Thiết bị',
};

export default function ProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restore_edit_id?: string }>();
  const { hasPermission } = usePermissions();
  const hasPricingPermission = hasPermission(['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage']);

  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [branchName, setBranchName] = useState('Chi nhánh chính');

  // State toast thông báo
  const [toastMsg, setToastMsg] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // State thêm/sửa sản phẩm
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null); // null = Thêm mới, else = Sửa
  
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodUnit, setProdUnit] = useState('');
  const [prodSellPrice, setProdSellPrice] = useState('');
  const [prodCostPrice, setProdCostPrice] = useState('');
  const [prodWeight, setProdWeight] = useState('');
  const [prodItemClass, setProdItemClass] = useState('commercial');
  const [prodActive, setProdActive] = useState('TRUE'); // 'TRUE' | 'FALSE'
  const [prodDescription, setProdDescription] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [selectedLocalImageUri, setSelectedLocalImageUri] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showInlineCategoryForm, setShowInlineCategoryForm] = useState(false);

  // Trạng thái cấp quyền camera và thư viện ảnh
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<string>('undetermined');
  const [libraryPermissionStatus, setLibraryPermissionStatus] = useState<string>('undetermined');

  const checkPermissions = async () => {
    try {
      const cameraRes = await ImagePicker.getCameraPermissionsAsync();
      setCameraPermissionStatus(cameraRes.status);

      const libraryRes = await ImagePicker.getMediaLibraryPermissionsAsync();
      setLibraryPermissionStatus(libraryRes.status);
    } catch (err) {
      console.warn('Lỗi kiểm tra quyền camera/thư viện:', err);
    }
  };

  useEffect(() => {
    if (isFormModalOpen) {
      checkPermissions();
    }
  }, [isFormModalOpen]);

  // State Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({
      visible: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, visible: false }));
      }
    });
  };

  // Chọn ảnh từ thư viện máy
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setLibraryPermissionStatus(status);
      if (status !== 'granted') {
        showToast('Cần quyền truy cập thư viện ảnh để thay đổi hình ảnh!', 'error');
        Alert.alert(
          'Quyền truy cập Thư viện ảnh',
          'Ứng dụng cần quyền truy cập Thư viện ảnh để chọn ảnh sản phẩm từ thiết bị của bạn. Vui lòng cấp quyền trong Cài đặt.',
          [
            { text: 'Hủy', style: 'cancel' },
            { 
              text: 'Mở Cài đặt', 
              onPress: async () => {
                await saveRestorePath();
                Linking.openSettings().catch(() => {});
              } 
            }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setSelectedLocalImageUri(uri);
        setProdImageUrl(uri);
      }
    } catch (err) {
      console.warn('Lỗi chọn ảnh thư viện:', err);
    }
  };

  // Chụp ảnh từ camera
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setCameraPermissionStatus(status);
      if (status !== 'granted') {
        showToast('Cần quyền truy cập camera để chụp ảnh sản phẩm!', 'error');
        Alert.alert(
          'Quyền truy cập Camera',
          'Ứng dụng cần quyền truy cập Camera để chụp ảnh sản phẩm từ thiết bị của bạn. Vui lòng cấp quyền trong Cài đặt.',
          [
            { text: 'Hủy', style: 'cancel' },
            { 
              text: 'Mở Cài đặt', 
              onPress: async () => {
                await saveRestorePath();
                Linking.openSettings().catch(() => {});
              } 
            }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setSelectedLocalImageUri(uri);
        setProdImageUrl(uri);
      }
    } catch (err) {
      console.warn('Lỗi chụp ảnh:', err);
    }
  };
  
  const [isSaving, setIsSaving] = useState(false);

  // State Thêm nhanh Danh mục
  const [newCatName, setNewCatName] = useState('');
  const [newCatDescription, setNewCatDescription] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Phân trang
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // Hiển thị Toast thông báo
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

  // Tải danh mục từ SQLite
  const loadCategories = async () => {
    try {
      if (Platform.OS === 'web') {
        const headers = await getApiHeaders();
        const url = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const res = await fetch(`${url}/api/shops/${shopId}/categories?limit=500`, { headers });
        if (res.ok) {
          const resJson = await res.json();
          setCategoriesList(resJson.data || []);
        }
      } else {
        const cats = await db.select().from(schema.categories);
        setCategoriesList(cats || []);
      }
    } catch (err) {
      console.warn('Lỗi tải danh mục SQLite:', err);
    }
  };

  // Tải danh sách sản phẩm từ SQLite hoặc Cloud
  const loadProductsData = async (pageNumber = 1, shouldAppend = false) => {
    try {
      if (pageNumber === 1) {
        setIsLoading(true);
      } else {
        setIsMoreLoading(true);
      }

      const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Chi nhánh chính';
      setBranchName(activeShopName);

      const limit = 20;
      const offset = (pageNumber - 1) * limit;

      let data: any[] = [];
      if (Platform.OS === 'web') {
        const headers = await getApiHeaders();
        const url = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        
        let apiQuery = `page=${pageNumber}&limit=${limit}`;
        if (searchQuery) apiQuery += `&search=${encodeURIComponent(searchQuery)}`;
        if (selectedCategoryFilter !== 'all') apiQuery += `&category_id=${encodeURIComponent(selectedCategoryFilter)}`;

        const res = await fetch(`${url}/api/shops/${shopId}/products?${apiQuery}`, { headers });
        if (res.ok) {
          const resJson = await res.json();
          data = resJson.data || [];
        }
      } else {
        // Drizzle SQLite
        let conditions = [];
        if (searchQuery) {
          conditions.push(
            or(
              like(schema.products.name, `%${searchQuery}%`),
              like(schema.products.sku, `%${searchQuery}%`),
              like(schema.products.barcode, `%${searchQuery}%`)
            )
          );
        }
        if (selectedCategoryFilter !== 'all') {
          conditions.push(eq(schema.products.category_id, selectedCategoryFilter));
        }

        let baseQuery = db.select().from(schema.products);
        if (conditions.length > 0) {
          baseQuery = baseQuery.where(and(...conditions));
        }

        // Ưu tiên hiển thị sản phẩm offline (pending) lên trước, sau đó sắp xếp theo ID sản phẩm giảm dần
        data = await baseQuery.orderBy(desc(schema.products.sync_status), desc(schema.products.id)).limit(limit).offset(offset);
      }

      data = data.filter((p: any) => !isTimeChargeProduct(p.product_id || p.id, p.name) && !isSystemTimeChargeProduct(p.product_id || p.id, p.sku, p.name));

      if (shouldAppend) {
        setProductsList(prev => {
          const seenIds = new Set(prev.map(p => p.id));
          const uniqueNewData = data.filter(p => !seenIds.has(p.id));
          return [...prev, ...uniqueNewData];
        });
      } else {
        setProductsList(data);
      }

      setHasMore(data.length === limit);
      setPage(pageNumber);
      setIsLoading(false);
      setIsMoreLoading(false);
    } catch (err) {
      console.error('Lỗi tải danh sách sản phẩm:', err);
      setIsLoading(false);
      setIsMoreLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      loadProductsData(1, false);
    }, [searchQuery, selectedCategoryFilter])
  );

  const loadMore = () => {
    if (!hasMore || isMoreLoading || isLoading) return;
    loadProductsData(page + 1, true);
  };

  // Đồng bộ 2 chiều (push offline + pull cloud)
  const handleActiveSync = async () => {
    try {
      setIsSyncing(true);
      setSyncProgress(10);
      showToast('Đang đẩy danh mục & sản phẩm ngoại tuyến lên cloud...', 'info');
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

      // 1. Chỉ đẩy Danh mục pending
      await SyncManager.pushOfflineCategories(shopId);
      setSyncProgress(30);

      // 2. Chỉ đẩy Sản phẩm pending
      await SyncManager.pushOfflineProducts(shopId);
      setSyncProgress(60);

      // 3. Kéo dữ liệu mới nhất (chỉ Danh mục + Sản phẩm)
      showToast('Đang tải dữ liệu mới nhất từ cloud...', 'info');
      
      if (Platform.OS === 'web') {
        setSyncProgress(100);
        showToast('Đồng bộ dữ liệu thành công!', 'success');
        await loadCategories();
        await loadProductsData(1, false);
      } else {
        const success = await SyncManager.pullProductsAndCategories(shopId, (p) => {
          setSyncProgress(Math.round(60 + p * 40));
        });

        if (success) {
          showToast('Đồng bộ dữ liệu thành công!', 'success');
          await loadCategories();
          await loadProductsData(1, false);
        } else {
          showToast('Đồng bộ thất bại, vui lòng kiểm tra lại mạng!', 'error');
        }
      }
    } catch (err: any) {
      console.error('Lỗi đồng bộ sản phẩm:', err);
      showToast('Không thể đồng bộ: ' + (err.message || 'Lỗi mạng'), 'error');
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  // Mở Form thêm mới
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setProdName('');
    setProdSku('');
    setProdBarcode('');
    setProdCategoryId('');
    setProdUnit('');
    setProdSellPrice('0');
    setProdCostPrice('0');
    setProdWeight('');
    setProdItemClass('commercial');
    setProdActive('TRUE');
    setProdDescription('');
    setProdImageUrl('');
    setSelectedLocalImageUri(null);
    setShowUrlInput(false);
    setShowInlineCategoryForm(false);
    setIsFormModalOpen(true);
  };

  // Mở Form chỉnh sửa
  const handleOpenEdit = (product: any) => {
    setEditingProduct(product);
    setProdName(product.name || '');
    setProdSku(product.sku || '');
    setProdBarcode(product.barcode || '');
    setProdCategoryId(product.category_id || '');
    setProdUnit(product.unit || '');
    setProdSellPrice(product.sell_price ? Number(product.sell_price).toLocaleString('vi-VN') : '0');
    setProdCostPrice(hasPricingPermission && product.cost_price ? Number(product.cost_price).toLocaleString('vi-VN') : '0');
    setProdWeight(product.weight ? String(product.weight) : '');
    setProdItemClass(product.item_class || 'commercial');
    setProdActive(product.active || 'TRUE');
    setProdDescription(product.description || '');
    setProdImageUrl(product.image_url || '');
    setSelectedLocalImageUri(null);
    setShowUrlInput(false);
    setShowInlineCategoryForm(false);
    setIsFormModalOpen(true);
  };

  const loadAndOpenProduct = async (productId: string) => {
    try {
      if (Platform.OS === 'web') {
        const headers = await getApiHeaders();
        const url = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const res = await fetch(`${url}/api/shops/${shopId}/products/${productId}`, { headers });
        if (res.ok) {
          const prod = await res.json();
          if (prod) {
            handleOpenEdit(prod);
          }
        }
      } else {
        const prods = await db.select().from(schema.products).where(eq(schema.products.id, productId));
        if (prods.length > 0) {
          handleOpenEdit(prods[0]);
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải thông tin sản phẩm khôi phục:', err);
    }
  };

  const saveRestorePath = async () => {
    try {
      const path = editingProduct 
        ? `/products?restore_edit_id=${editingProduct.id}` 
        : `/products?restore_edit_id=new`;
      await AsyncStorage.setItem('pending_restore_path', path);
    } catch (err) {
      console.warn('Lỗi lưu đường dẫn khôi phục:', err);
    }
  };

  useEffect(() => {
    if (params.restore_edit_id) {
      const restoreId = params.restore_edit_id;
      // Dọn dẹp query param trong url
      router.setParams({ restore_edit_id: undefined } as any);

      if (restoreId === 'new') {
        handleOpenCreate();
      } else {
        loadAndOpenProduct(restoreId);
      }
    }
  }, [params.restore_edit_id]);

  // Lưu sản phẩm (Offline-first + Background cloud sync)
  const handleSaveProduct = async () => {
    if (!prodName.trim()) {
      showToast('Vui lòng nhập Tên sản phẩm!', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const sellVal = parseInt(prodSellPrice.replace(/\D/g, ''), 10) || 0;
      const costVal = hasPricingPermission 
        ? (parseInt(prodCostPrice.replace(/\D/g, ''), 10) || 0)
        : (editingProduct?.cost_price || 0);
      const weightVal = prodWeight.trim() ? parseInt(prodWeight.replace(/\D/g, ''), 10) : null;
      
      const isNew = !editingProduct;
      const prodId = isNew ? `PROD-TEMP-${Date.now()}` : editingProduct.id;
      const skuVal = prodSku.trim() || `SKU-${Date.now().toString().substring(8)}`;

      // 1. Lưu SQLite cục bộ tức thì
      if (Platform.OS !== 'web') {
        const productValues = {
          id: prodId,
          name: prodName,
          sku: skuVal,
          barcode: prodBarcode || skuVal,
          category_id: prodCategoryId || null,
          unit: prodUnit || null,
          sell_price: sellVal,
          cost_price: costVal,
          description: prodDescription || null,
          image_url: prodImageUrl || null,
          product_type: editingProduct?.product_type || 'simple',
          parent_id: editingProduct?.parent_id || null,
          variant_options: editingProduct?.variant_options || null,
          modifier_groups: editingProduct?.modifier_groups || null,
          active: prodActive,
          weight: weightVal,
          item_class: prodItemClass,
          sync_status: 'pending', // đánh dấu để đồng bộ lên cloud
        };

        if (isNew) {
          await db.insert(schema.products).values(productValues);
        } else {
          await db.update(schema.products)
            .set(productValues)
            .where(eq(schema.products.id, prodId));
        }
      }

      // Reload UI offline nhanh
      await loadProductsData(1, false);
      setIsFormModalOpen(false);
      showToast('Đã lưu sản phẩm ngoại tuyến thành công.', 'success');

      // 2. Đồng bộ ngầm lên Cloud
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();

      const payload = {
        name: prodName,
        sku: skuVal,
        barcode: prodBarcode || skuVal,
        category_id: prodCategoryId || '',
        unit: prodUnit || '',
        sell_price: String(sellVal),
        cost_price: String(costVal),
        active: prodActive,
        description: prodDescription || '',
        product_type: editingProduct?.product_type || 'simple',
        parent_id: editingProduct?.parent_id || '',
        weight: weightVal ? String(weightVal) : '',
        item_class: prodItemClass,
        image_url: prodImageUrl || '',
      };

      const cloudUrl = isNew 
        ? `${url}/api/shops/${shopId}/products` 
        : `${url}/api/shops/${shopId}/products/${prodId}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(cloudUrl, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const resJson = await response.json().catch(() => ({}));
        const serverId = resJson.product_id || resJson.id || prodId;

        // Bổ sung: Tải ảnh cục bộ lên S3 nếu có
        let finalImageUrl = prodImageUrl;
        if (selectedLocalImageUri && serverId) {
          try {
            const uploadUrlRes = await fetch(`${url}/api/shops/${shopId}/products/${serverId}/upload-url`, { headers });
            if (uploadUrlRes.ok) {
              const { uploadUrl, publicUrl } = await uploadUrlRes.json();
              
              const imgRes = await fetch(selectedLocalImageUri);
              const blob = await imgRes.blob();

              const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                body: blob,
                headers: {
                  'Content-Type': 'image/jpeg',
                }
              });

              if (uploadRes.ok) {
                finalImageUrl = publicUrl;
                await fetch(`${url}/api/shops/${shopId}/products/${serverId}`, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ image_url: publicUrl })
                });
              }
            }
          } catch (imgErr) {
            console.warn('Lỗi trong tiến trình upload ảnh:', imgErr);
          }
        }

        if (Platform.OS !== 'web' && isNew && serverId !== prodId) {
          // Xóa record tạm, chèn record chuẩn từ server
          await db.delete(schema.products).where(eq(schema.products.id, prodId));
          await db.insert(schema.products).values({
            id: serverId,
            name: prodName,
            sku: skuVal,
            barcode: prodBarcode || skuVal,
            category_id: prodCategoryId || null,
            unit: prodUnit || null,
            sell_price: sellVal,
            cost_price: costVal,
            stock_qty: 0,
            image_url: finalImageUrl || null,
            description: prodDescription || null,
            product_type: 'simple',
            active: prodActive,
            weight: weightVal,
            item_class: prodItemClass,
            sync_status: 'synced',
          }).onConflictDoNothing();
        } else if (Platform.OS !== 'web') {
          await db.update(schema.products)
            .set({ 
              sync_status: 'synced',
              image_url: finalImageUrl || null
            })
            .where(eq(schema.products.id, prodId));
        }

        await loadProductsData(1, false);
        console.log(`Đồng bộ sản phẩm #${prodName} thành công!`);
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ sản phẩm mới:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Tạo nhanh danh mục (Offline-first + Background cloud sync)
  const handleSaveCategory = async () => {
    if (!newCatName.trim()) {
      showToast('Vui lòng nhập Tên danh mục!', 'error');
      return;
    }

    setIsSavingCategory(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const catId = `CAT-TEMP-${Date.now()}`;

      // 1. Lưu SQLite cục bộ
      if (Platform.OS !== 'web') {
        await db.insert(schema.categories).values({
          id: catId,
          name: newCatName,
          description: newCatDescription || null,
          sync_status: 'pending',
        });
      }

      // Reload UI categories cục bộ lập tức
      await loadCategories();
      setProdCategoryId(catId);
      setShowInlineCategoryForm(false);

      // Reset form
      setNewCatName('');
      setNewCatDescription('');
      showToast('Đã tạo danh mục ngoại tuyến thành công.', 'success');

      // 2. Gửi API đồng bộ
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();

      const response = await fetch(`${url}/api/shops/${shopId}/categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newCatName,
          description: newCatDescription || '',
        }),
      });

      if (response.ok) {
        const resJson = await response.json().catch(() => ({}));
        const serverId = resJson.category_id || resJson.id;

        if (Platform.OS !== 'web' && serverId && serverId !== catId) {
          // Thay thế ID tạm sang ID từ server
          // Cập nhật category_id của sản phẩm tạm đang chọn sang ID server luôn
          if (prodCategoryId === catId) {
            setProdCategoryId(serverId);
          }
          await db.update(schema.products)
            .set({ category_id: serverId })
            .where(eq(schema.products.category_id, catId));

          await db.delete(schema.categories).where(eq(schema.categories.id, catId));
          await db.insert(schema.categories).values({
            id: serverId,
            name: newCatName,
            description: newCatDescription || null,
            sync_status: 'synced',
          }).onConflictDoNothing();
        }

        await loadCategories();
        console.log(`Đồng bộ danh mục #${newCatName} thành công!`);
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ danh mục mới:', err);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const renderProductItem = ({ item: product }: { item: any }) => {
    const isPending = product.sync_status === 'pending';
    const isInactive = product.active === 'FALSE';
    
    // Tìm tên danh mục
    const cat = categoriesList.find(c => c.id === product.category_id || c.category_id === product.category_id);
    const catName = cat ? cat.name : 'Chưa phân loại';

    // Dot style color logic
    let dotColor = 'bg-emerald-500'; // Đã đồng bộ (Green)
    if (isPending) {
      if (isSyncing) {
        dotColor = 'bg-amber-500'; // Đang đồng bộ (Yellow)
      } else {
        dotColor = 'bg-rose-500'; // Offline / Lỗi (Red)
      }
    }

    return (
      <TouchableOpacity 
        key={product.id} 
        className="p-4 bg-white border border-slate-200 rounded-3xl shadow-sm mb-3.5"
        onPress={() => handleOpenEdit(product)}
      >
        {/* Hàng trên: Ảnh và Thông tin cơ bản */}
        <View className="flex-row items-center mb-3">
          {product.image_url ? (
            <Image 
              source={{ uri: product.image_url }} 
              className="w-12 h-12 rounded-2xl mr-3 bg-slate-50 border border-slate-100"
            />
          ) : (
            <View className="w-12 h-12 rounded-2xl items-center justify-center border mr-3 bg-orange-50 border-orange-200">
              <MaterialCommunityIcons name="tag-outline" size={20} color="#fa5908" />
            </View>
          )}

          <View className="flex-1">
            <View className="flex-row items-center flex-wrap gap-1.5">
              {/* Dot trạng thái đồng bộ trước tên sản phẩm */}
              <View className={`w-2 h-2 rounded-full ${dotColor}`} />

              <Text className={`font-semibold text-xs ${isInactive ? 'text-slate-400 line-through' : 'text-slate-855'}`}>
                {product.name}
              </Text>
              
              <View className="px-1.5 py-0.5 rounded-md border bg-slate-50 border-slate-200">
                <Text className="text-micro font-medium text-slate-500">
                  {catName}
                </Text>
              </View>
            </View>
            
            <Text className="text-xxs text-slate-400 font-semibold mt-1">
              SKU: {product.sku || '—'} | ĐVT: {product.unit || '—'}
            </Text>
          </View>
        </View>

        {/* Đường ngăn cách nhẹ */}
        <View className="h-[1px] bg-slate-100 mb-3" />

        {/* Hàng dưới: Định tuyến kho và Giá bán */}
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center">
            <View className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 mr-2">
              <Text className="text-micro font-medium text-blue-600">
                {ITEM_CLASS_LABELS[product.item_class] || 'Hàng thương mại'}
              </Text>
            </View>
            {isInactive && (
              <View className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200">
                <Text className="text-micro font-medium text-red-600">Ngừng bán</Text>
              </View>
            )}
          </View>

          <Text className="text-orange-600 font-bold text-xs">
            {product.sell_price ? Number(product.sell_price).toLocaleString('vi-VN') : '0'} đ
          </Text>
        </View>
      </TouchableOpacity>
    );
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* Toast thông báo ngoài màn hình chính */}
      {!isFormModalOpen && renderToast()}

      {/* Header */}
      <Header 
        title="Quản lý sản phẩm" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
      />

      {/* Drawer */}
      <DrawerMenu visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      {/* Tìm kiếm & Đồng bộ chủ động */}
      <View className="p-4 bg-white border-b border-slate-200">
        <View className="flex-row items-center mb-3">
          <View className="flex-1 flex-row items-center bg-slate-100 border border-slate-200 px-3.5 rounded-xl h-11">
            <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
            <TextInput
              placeholder="Tìm theo tên sản phẩm, SKU, Barcode..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-slate-800 text-xs font-semibold p-0"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            className="bg-slate-100 border border-slate-200 rounded-xl justify-center items-center h-11 w-11 ml-2.5"
            onPress={handleActiveSync}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.8 }] }} />
            ) : (
              <Ionicons name="sync-outline" size={16} color="#fa5908" />
            )}
          </TouchableOpacity>
        </View>

        {/* Sync Progress Bar */}
        {isSyncing && (
          <View className="h-1 w-full bg-slate-100 rounded-full mb-3 overflow-hidden">
            <View style={{ width: `${syncProgress}%` }} className="h-full bg-orange-500" />
          </View>
        )}

        {/* Lọc theo danh mục */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            className="mr-2 px-4 py-2 rounded-xl border"
            style={selectedCategoryFilter === 'all' ? {
              backgroundColor: '#fa5908',
              borderColor: '#fa5908',
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                },
                android: {
                  elevation: 1.5,
                },
              }),
            } : {
              backgroundColor: '#f1f5f9',
              borderColor: '#e2e8f0',
            }}
            onPress={() => setSelectedCategoryFilter('all')}
          >
            <Text className={`text-tiny font-semibold ${selectedCategoryFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>
              Tất cả danh mục
            </Text>
          </TouchableOpacity>

          {categoriesList.map(cat => {
            const catId = cat.id || cat.category_id;
            return (
              <TouchableOpacity
                key={catId}
                className="mr-2 px-4 py-2 rounded-xl border"
                style={selectedCategoryFilter === catId ? {
                  backgroundColor: '#fa5908',
                  borderColor: '#fa5908',
                  ...Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                    },
                    android: {
                      elevation: 1.5,
                    },
                  }),
                } : {
                  backgroundColor: '#f1f5f9',
                  borderColor: '#e2e8f0',
                }}
                onPress={() => setSelectedCategoryFilter(catId)}
              >
                <Text className={`text-tiny font-semibold ${selectedCategoryFilter === catId ? 'text-white' : 'text-slate-600'}`}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Danh sách */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-400 font-medium mt-2">Đang tải sản phẩm...</Text>
        </View>
      ) : (
        <FlatList
          data={productsList}
          keyExtractor={(item, index) => item.id || index.toString()}
          renderItem={renderProductItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-2">
              <Ionicons name="pricetags-outline" size={48} color="#cbd5e1" />
              <Text className="text-slate-400 font-medium text-xs mt-3">Không tìm thấy sản phẩm nào</Text>
            </View>
          }
          ListFooterComponent={
            isMoreLoading ? (
              <View className="py-4 justify-center items-center">
                <ActivityIndicator size="small" color="#fa5908" />
              </View>
            ) : (
              <View className="h-24" />
            )
          }
        />
      )}

      {/* Floating Action Button (Thêm mới) */}
      <TouchableOpacity 
        className="absolute bottom-6 right-6 w-12 h-12 bg-orange-500 active:bg-orange-600 rounded-2xl items-center justify-center shadow-lg shadow-orange-500/20"
        onPress={handleOpenCreate}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>

      {/* Modal Form Thêm/Sửa sản phẩm */}
      <Modal
        visible={isFormModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFormModalOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setIsFormModalOpen(false)}
          />
          <View className="h-[85%] rounded-t-[32px] p-6 justify-between bg-white relative">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
              <Text className="text-lg font-bold text-slate-800">
                {editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
              </Text>
              <TouchableOpacity onPress={() => setIsFormModalOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
              {/* Ảnh sản phẩm và Tải ảnh */}
              <View className="items-center mb-6 mt-2" style={{ overflow: 'visible' }}>
                <View className="relative" style={{ overflow: 'visible' }}>
                  {prodImageUrl ? (
                    <View className="relative" style={{ overflow: 'visible' }}>
                      <Image 
                        source={{ uri: prodImageUrl }} 
                        className="w-24 h-24 rounded-3xl bg-slate-50 border border-slate-200"
                      />
                      <TouchableOpacity 
                        className="absolute -top-2.5 -right-2.5 bg-rose-500 w-7 h-7 rounded-full items-center justify-center border border-white shadow-sm z-10"
                        onPress={() => {
                          showConfirm(
                            'Xóa ảnh sản phẩm',
                            'Bạn có chắc chắn muốn xóa ảnh của sản phẩm này?',
                            () => {
                              setProdImageUrl('');
                              setSelectedLocalImageUri(null);
                            }
                          );
                        }}
                      >
                        <Ionicons name="close" size={14} color="white" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="w-24 h-24 rounded-3xl bg-orange-50 border border-orange-200 items-center justify-center">
                      <MaterialCommunityIcons name="tag-outline" size={36} color="#fa5908" />
                    </View>
                  )}
                  {selectedLocalImageUri && (
                    <View className="absolute -top-2.5 -left-2.5 bg-amber-500 rounded-full px-2 py-0.5 border border-white z-10">
                      <Text className="text-[8px] font-bold text-white">Chờ sync</Text>
                    </View>
                  )}
                </View>

                {/* Nút thay đổi hình ảnh */}
                <View className="flex-row mt-3.5 gap-2">
                  <TouchableOpacity 
                    className="flex-row items-center bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl active:bg-slate-200"
                    onPress={handleTakePhoto}
                  >
                    <Ionicons name="camera-outline" size={14} color="#64748b" className="mr-1" />
                    <Text className="text-xxs font-bold text-slate-600">Chụp ảnh</Text>
                    {cameraPermissionStatus === 'denied' && (
                      <Ionicons name="alert-circle" size={12} color="#d97706" style={{ marginLeft: 3 }} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    className="flex-row items-center bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl active:bg-slate-200"
                    onPress={handlePickImage}
                  >
                    <Ionicons name="image-outline" size={14} color="#64748b" className="mr-1" />
                    <Text className="text-xxs font-bold text-slate-600">Chọn ảnh</Text>
                    {libraryPermissionStatus === 'denied' && (
                      <Ionicons name="alert-circle" size={12} color="#d97706" style={{ marginLeft: 3 }} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    className="flex-row items-center bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl active:bg-slate-200"
                    onPress={() => setShowUrlInput(!showUrlInput)}
                  >
                    <Ionicons name="link-outline" size={14} color="#64748b" className="mr-1" />
                    <Text className="text-xxs font-bold text-slate-600">URL ảnh</Text>
                  </TouchableOpacity>
                </View>

                {/* Nhập URL ảnh */}
                {showUrlInput && (
                  <View className="w-full mt-3.5 bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                    <Text className="text-xxs font-bold text-slate-500 mb-1.5">Đường dẫn hình ảnh (URL):</Text>
                    <TextInput
                      placeholder="https://image-url.com/prod.webp"
                      placeholderTextColor="#cbd5e1"
                      className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                      value={prodImageUrl}
                      onChangeText={(val) => {
                        setProdImageUrl(val);
                        setSelectedLocalImageUri(null); // Xóa ảnh chụp/chọn nếu gõ URL thủ công
                      }}
                      style={{
                        paddingVertical: 0,
                        textAlignVertical: 'center',
                        lineHeight: undefined,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                      }}
                    />
                  </View>
                )}
              </View>

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Tên sản phẩm <Text className="text-red-500">*</Text></Text>
              <TextInput
                placeholder="Ví dụ: Áo thun Polo"
                placeholderTextColor="#cbd5e1"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={prodName}
                onChangeText={setProdName}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Mã SKU</Text>
              <TextInput
                placeholder="Tự động sinh"
                placeholderTextColor="#cbd5e1"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={prodSku}
                onChangeText={setProdSku}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Mã vạch (Barcode)</Text>
              <TextInput
                placeholder="Mã vạch gốc"
                placeholderTextColor="#cbd5e1"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={prodBarcode}
                onChangeText={setProdBarcode}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              {/* Lựa chọn danh mục */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-xs text-slate-500 font-semibold">Danh mục</Text>
                  <TouchableOpacity onPress={() => setShowInlineCategoryForm(!showInlineCategoryForm)}>
                    <Text className="text-xs font-bold text-orange-500">
                      {showInlineCategoryForm ? 'Đóng' : '+ Tạo danh mục'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Form tạo nhanh danh mục inline */}
                {showInlineCategoryForm && (
                  <View className="bg-orange-50/50 border border-orange-200 p-4 rounded-2xl mb-3">
                    <Text className="text-xxs font-bold text-slate-700 mb-2">Tạo nhanh danh mục mới:</Text>
                    <TextInput
                      placeholder="Tên danh mục (ví dụ: Đồ uống...)"
                      placeholderTextColor="#cbd5e1"
                      className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mb-2"
                      value={newCatName}
                      onChangeText={setNewCatName}
                      style={{
                        paddingVertical: 0,
                        textAlignVertical: 'center',
                        lineHeight: undefined,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                      }}
                    />
                    <TextInput
                      placeholder="Mô tả danh mục (tùy chọn)"
                      placeholderTextColor="#cbd5e1"
                      className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mb-3"
                      value={newCatDescription}
                      onChangeText={setNewCatDescription}
                      style={{
                        paddingVertical: 0,
                        textAlignVertical: 'center',
                        lineHeight: undefined,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                      }}
                    />
                    <View className="flex-row justify-end gap-2">
                      <TouchableOpacity
                        className="px-3 py-1.5 bg-slate-100 rounded-lg"
                        onPress={() => {
                          setShowInlineCategoryForm(false);
                          setNewCatName('');
                          setNewCatDescription('');
                        }}
                      >
                        <Text className="text-xxs font-semibold text-slate-500">Hủy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="px-3 py-1.5 bg-orange-500 rounded-lg flex-row justify-center items-center"
                        onPress={handleSaveCategory}
                        disabled={isSavingCategory}
                      >
                        {isSavingCategory && <ActivityIndicator size="small" color="white" className="mr-1" style={{ transform: [{ scale: 0.7 }] }} />}
                        <Text className="text-white text-xxs font-bold">Lưu</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <View className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <View className="flex-row flex-wrap p-2 gap-2">
                    <TouchableOpacity
                      className="px-3 py-1.5 rounded-lg border"
                      style={prodCategoryId === '' ? {
                        backgroundColor: '#fff7ed',
                        borderColor: '#fa5908',
                      } : {
                        backgroundColor: '#ffffff',
                        borderColor: '#cbd5e1',
                      }}
                      onPress={() => setProdCategoryId('')}
                    >
                      <Text className={`text-xxs font-bold ${prodCategoryId === '' ? 'text-orange-500' : 'text-slate-500'}`}>
                        Chưa phân loại
                      </Text>
                    </TouchableOpacity>
                    {categoriesList.map(c => {
                      const cId = c.id || c.category_id;
                      return (
                        <TouchableOpacity
                          key={cId}
                          className="px-3 py-1.5 rounded-lg border"
                          style={prodCategoryId === cId ? {
                            backgroundColor: '#fff7ed',
                            borderColor: '#fa5908',
                          } : {
                            backgroundColor: '#ffffff',
                            borderColor: '#cbd5e1',
                          }}
                          onPress={() => setProdCategoryId(cId)}
                        >
                          <Text className={`text-xxs font-bold ${prodCategoryId === cId ? 'text-orange-500' : 'text-slate-500'}`}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View className="flex-row justify-between gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-xs text-slate-500 font-semibold mb-1.5">Đơn vị tính</Text>
                  <TextInput
                    placeholder="Ly, Cái, Hộp..."
                    placeholderTextColor="#cbd5e1"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800"
                    value={prodUnit}
                    onChangeText={setProdUnit}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-slate-500 font-semibold mb-1.5">Trọng lượng (g)</Text>
                  <TextInput
                    placeholder="gam"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="number-pad"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800"
                    value={prodWeight}
                    onChangeText={setProdWeight}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>
              </View>

              {hasPricingPermission ? (
                <View className="flex-row justify-between gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-xs text-slate-500 font-semibold mb-1.5">Giá bán (đ)</Text>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      keyboardType="number-pad"
                      className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 text-right font-bold"
                      value={prodSellPrice}
                      onChangeText={(val) => {
                        const num = val.replace(/\D/g, '');
                        setProdSellPrice(num ? Number(num).toLocaleString('vi-VN') : '');
                      }}
                      style={{
                        paddingVertical: 0,
                        textAlignVertical: 'center',
                        lineHeight: undefined,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-slate-500 font-semibold mb-1.5">Giá vốn (đ)</Text>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      keyboardType="number-pad"
                      className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 text-right font-bold"
                      value={prodCostPrice}
                      onChangeText={(val) => {
                        const num = val.replace(/\D/g, '');
                        setProdCostPrice(num ? Number(num).toLocaleString('vi-VN') : '');
                      }}
                      style={{
                        paddingVertical: 0,
                        textAlignVertical: 'center',
                        lineHeight: undefined,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View className="mb-4">
                  <Text className="text-xs text-slate-500 font-semibold mb-1.5">Giá bán (đ)</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="number-pad"
                    className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 text-right font-bold"
                    value={prodSellPrice}
                    onChangeText={(val) => {
                      const num = val.replace(/\D/g, '');
                      setProdSellPrice(num ? Number(num).toLocaleString('vi-VN') : '');
                    }}
                    style={{
                      paddingVertical: 0,
                      textAlignVertical: 'center',
                      lineHeight: undefined,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                    }}
                  />
                </View>
              )}

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Định tuyến kho (Item Class)</Text>
              <View className="flex-row justify-between mb-4 gap-2">
                {Object.entries(ITEM_CLASS_LABELS).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    className="flex-1 py-2.5 rounded-xl border-2 items-center justify-center px-1"
                    style={prodItemClass === key ? {
                      backgroundColor: '#fff7ed',
                      borderColor: '#fa5908',
                    } : {
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                    }}
                    onPress={() => setProdItemClass(key)}
                  >
                    <Text className={`text-[10px] font-bold text-center ${
                      prodItemClass === key ? 'text-orange-500' : 'text-slate-500'
                    }`}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Trạng thái bán</Text>
              <View className="flex-row justify-between mb-4 gap-2">
                <TouchableOpacity
                  className="flex-1 py-2.5 rounded-xl border-2 items-center"
                  style={prodActive === 'TRUE' ? {
                    backgroundColor: '#fff7ed',
                    borderColor: '#fa5908',
                  } : {
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                  }}
                  onPress={() => setProdActive('TRUE')}
                >
                  <Text className={`text-tiny font-bold ${prodActive === 'TRUE' ? 'text-orange-500' : 'text-slate-500'}`}>
                    Cho phép bán
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 py-2.5 rounded-xl border-2 items-center"
                  style={prodActive === 'FALSE' ? {
                    backgroundColor: '#fff7ed',
                    borderColor: '#fa5908',
                  } : {
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                  }}
                  onPress={() => setProdActive('FALSE')}
                >
                  <Text className={`text-tiny font-bold ${prodActive === 'FALSE' ? 'text-orange-500' : 'text-slate-500'}`}>
                    Ngừng kinh doanh
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="text-xs text-slate-500 font-semibold mb-1.5">Mô tả sản phẩm</Text>
              <TextInput
                placeholder="Nhập mô tả sản phẩm..."
                placeholderTextColor="#cbd5e1"
                multiline={true}
                numberOfLines={3}
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 min-h-[80px]"
                value={prodDescription}
                onChangeText={setProdDescription}
                style={{
                  paddingVertical: 8,
                  textAlignVertical: 'top',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />
            </ScrollView>

            {/* Action buttons */}
            <View className="flex-row justify-between gap-3 border-t border-slate-100 pt-3">
              <TouchableOpacity
                className="flex-1 py-3.5 bg-slate-100 active:bg-slate-200 rounded-2xl items-center"
                onPress={() => setIsFormModalOpen(false)}
              >
                <Text className="font-bold text-slate-600 text-sm">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3.5 bg-orange-500 active:bg-orange-600 rounded-2xl items-center flex-row justify-center"
                onPress={() => {
                  showConfirm(
                    editingProduct ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm mới',
                    editingProduct 
                      ? 'Bạn có chắc chắn muốn lưu các thay đổi cho sản phẩm này?' 
                      : 'Bạn có chắc chắn muốn tạo sản phẩm mới này?',
                    handleSaveProduct
                  );
                }}
                disabled={isSaving}
              >
                {isSaving && <ActivityIndicator size="small" color="white" className="mr-2" />}
                <Text className="font-bold text-white text-sm">
                  {isSaving ? 'Đang lưu...' : 'Lưu sản phẩm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Custom confirm dialog overlay inside the form modal context to avoid nested native modal bugs */}
          {confirmDialog.visible && (
            <View className="absolute inset-0 bg-black/60 justify-center items-center px-6 z-[99999]">
              <View className="w-full bg-white rounded-3xl p-6 shadow-2xl max-w-sm">
                <Text className="text-base font-bold text-slate-800 mb-2">{confirmDialog.title}</Text>
                <Text className="text-xs text-slate-500 mb-6 leading-relaxed">{confirmDialog.message}</Text>
                <View className="flex-row justify-end gap-3">
                  <TouchableOpacity
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50"
                    onPress={() => setConfirmDialog(prev => ({ ...prev, visible: false }))}
                  >
                    <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-4 py-2.5 rounded-xl bg-orange-500"
                    style={{ backgroundColor: '#fa5908' }}
                    onPress={confirmDialog.onConfirm}
                  >
                    <Text className="text-white font-semibold text-xs">Xác nhận</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Toast thông báo bên trong Form Modal */}
          {isFormModalOpen && renderToast()}
        </View>
      </Modal>

      {/* Sleek Custom Confirm Dialog Modal (Fallback for non-form contexts) */}
      <Modal
        visible={confirmDialog.visible && !isFormModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setConfirmDialog(prev => ({ ...prev, visible: false }))}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className="w-full bg-white rounded-3xl p-6 shadow-2xl max-w-sm">
            <Text className="text-base font-bold text-slate-800 mb-2">{confirmDialog.title}</Text>
            <Text className="text-xs text-slate-500 mb-6 leading-relaxed">{confirmDialog.message}</Text>
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50"
                onPress={() => setConfirmDialog(prev => ({ ...prev, visible: false }))}
              >
                <Text className="text-slate-500 font-semibold text-xs">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2.5 rounded-xl bg-orange-500"
                style={{ backgroundColor: '#fa5908' }}
                onPress={confirmDialog.onConfirm}
              >
                <Text className="text-white font-semibold text-xs">Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
