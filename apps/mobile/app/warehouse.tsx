import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator, TouchableWithoutFeedback, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
import * as Haptics from 'expo-haptics';

const REASONS = [
  { value: 'Kiểm kê định kỳ', label: 'Kiểm kê định kỳ' },
  { value: 'Hao hụt thất thoát', label: 'Hao hụt thất thoát' },
  { value: 'Hư hỏng hàng hóa', label: 'Hư hỏng hàng hóa' },
  { value: 'Khác', label: 'Lý do khác' },
];

export default function WarehouseScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Barcode scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Form states điều chỉnh tồn kho
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [actualQtyInput, setActualQtyInput] = useState('');
  const [reason, setReason] = useState('Kiểm kê định kỳ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReasonSelector, setShowReasonSelector] = useState(false);

  // Sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');

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

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      let localProds: any[] = [];

      if (Platform.OS !== 'web') {
        if (searchQuery.trim()) {
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
          localProds = await db.select().from(schema.products);
        }
      } else {
        // Mock data
        localProds = [
          { id: 'p1', name: 'Cà phê Phin Sữa Đá', sku: 'CF001', barcode: '11111', stock_qty: 15, sell_price: 29000, unit: 'Ly' },
          { id: 'p2', name: 'Trà Đào Cam Sả', sku: 'TR002', barcode: '22222', stock_qty: 11, sell_price: 39000, unit: 'Ly' },
          { id: 'p3', name: 'Bánh Mì Pate Thịt', sku: 'BM003', barcode: '33333', stock_qty: 6, sell_price: 25000, unit: 'Cái' },
        ];
        if (searchQuery.trim()) {
          localProds = localProds.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.barcode.includes(searchQuery) ||
            p.sku.includes(searchQuery)
          );
        }
      }

      setProducts(localProds);

      // 4. Cập nhật syncStatus dựa trên xem có dòng nào pending không
      let hasPending = false;
      if (Platform.OS !== 'web') {
        const pendingMovements = await db
          .select()
          .from(schema.stockMovements)
          .where(eq(schema.stockMovements.sync_status, 'pending'));
        hasPending = pendingMovements.length > 0;
      }
      setSyncStatus(hasPending ? 'pending' : 'synced');
    } catch (error) {
      console.error('Lỗi tải sản phẩm:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [searchQuery])
  );

  const handleScanBarcode = (barcode: string) => {
    setIsScannerOpen(false);
    setSearchQuery(barcode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleOpenAdjust = (prod: any) => {
    setSelectedProduct(prod);
    setActualQtyInput(String(prod.stock_qty));
    setReason('Kiểm kê định kỳ');
    setShowAdjustModal(true);
  };

  const handleSaveAdjustment = async () => {
    const actual = parseInt(actualQtyInput, 10);
    if (isNaN(actual) || actual < 0) {
      Alert.alert('Lỗi', 'Số lượng đếm thực tế phải là một số lớn hơn hoặc bằng 0.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const movementId = `sm-local-${Date.now()}`;
      const nowStr = new Date().toISOString();

      const expected = selectedProduct.stock_qty || 0;
      const delta = actual - expected;

      // 1. Lưu phiếu điều chỉnh stock_movements vào SQLite
      if (Platform.OS !== 'web') {
        await db.insert(schema.stockMovements).values({
          id: movementId,
          branch_id: shopId,
          type: 'adjustment',
          product_id: selectedProduct.id,
          sku: selectedProduct.sku || null,
          variant_id: null,
          qty: delta, // Lưu chênh lệch (+/-)
          unit_cost: 0,
          reference_no: null,
          employee_id: userEmail,
          reason,
          workflow_status: 'completed',
          created_at: nowStr,
          sync_status: 'pending',
        });

        // 2. Cập nhật tồn kho sản phẩm trực tiếp trong bảng products SQLite cục bộ
        await db
          .update(schema.products)
          .set({ stock_qty: actual })
          .where(eq(schema.products.id, selectedProduct.id));
      }

      setShowAdjustModal(false);
      setSelectedProduct(null);
      showToast('Đã lưu phiếu kiểm kho ngoại tuyến và cập nhật tồn kho di động thành công!', 'success');
      
      // Load lại sản phẩm
      await loadProducts();

      // Gọi đồng bộ nền ngay
      KeepAliveManager.triggerSyncIfNeeded(false);
    } catch (err: any) {
      showToast(`Lỗi lưu điều chỉnh kho: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header 
        title="Kiểm kho sản phẩm" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onPressSync={handleManualSync}
      />

      {/* Tìm kiếm & Quét Barcode */}
      <View className="px-4 pt-3 flex-row items-center gap-2 mb-3">
        <View className="flex-1 flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1">
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo tên, SKU, Barcode..."
            placeholderTextColor="#94a3b8"
            className="flex-1 text-xs text-slate-800 ml-2 py-2"
            style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity 
          onPress={() => setIsScannerOpen(true)}
          className="bg-orange-500 p-3.5 rounded-xl justify-center items-center"
          style={{ backgroundColor: '#fa5908' }}
        >
          <Ionicons name="scan" size={16} color="white" />
        </TouchableOpacity>
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
                title="Kiểm kho"
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
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl p-6 relative">
            
            {/* Header modal */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-base font-bold text-slate-800">Kiểm kê & Điều chỉnh tồn kho</Text>
              <TouchableOpacity onPress={() => setShowAdjustModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
                <View className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                  <Text className="text-xs font-semibold text-slate-800">{selectedProduct.name}</Text>
                  <Text className="text-xxs text-slate-400 font-semibold mt-1">Tồn kho hiện tại trên máy: {selectedProduct.stock_qty} {selectedProduct.unit}</Text>
                </View>

                {/* Số lượng thực tế đếm được */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Số lượng thực tế *</Text>
                  <View className="relative flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                    <TextInput
                      value={actualQtyInput}
                      onChangeText={setActualQtyInput}
                      keyboardType="numeric"
                      className="flex-1 text-center text-lg font-bold text-slate-800"
                      placeholder="0"
                      style={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
                    />
                    <Text className="text-sm font-semibold text-slate-400 ml-2">{selectedProduct.unit || 'đv'}</Text>
                  </View>
                </View>

                {/* Độ lệch chênh lệch */}
                {actualQtyInput !== '' && (
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

                {/* Lý do */}
                <View className="mb-4">
                  <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Lý do điều chỉnh *</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowReasonSelector(true)}
                    className="flex-row justify-between items-center border border-slate-200 rounded-xl px-4 py-3 bg-slate-50"
                  >
                    <Text className="text-xs font-semibold text-slate-800">
                      {REASONS.find(r => r.value === reason)?.label || 'Chọn lý do'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#64748b" />
                  </TouchableOpacity>
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
                    onPress={handleSaveAdjustment}
                    disabled={isSubmitting}
                    style={{ backgroundColor: '#fa5908' }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                        <Text className="text-white font-semibold text-xs ml-1.5">Xác nhận điều chỉnh</Text>
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
                  <Text className="text-base font-bold text-slate-800">Chọn lý do điều chỉnh</Text>
                  <TouchableOpacity onPress={() => setShowReasonSelector(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {REASONS.map(r => (
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
