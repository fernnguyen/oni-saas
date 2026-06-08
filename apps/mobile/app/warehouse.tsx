import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
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
      Alert.alert('Thành công', 'Đã lưu phiếu kiểm kho ngoại tuyến và cập nhật số lượng tồn kho di động.');
      
      // Load lại sản phẩm
      await loadProducts();

      // Gọi đồng bộ nền ngay
      KeepAliveManager.triggerSyncIfNeeded(false);
    } catch (err: any) {
      Alert.alert('Lỗi', `Lỗi lưu điều chỉnh kho: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header title="Kiểm kho sản phẩm" onPressMenu={() => router.push('/(tabs)')} showBack={true} />

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
          <View className="bg-white rounded-t-3xl p-6">
            
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
                  <View className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 12,
                        fontSize: 13,
                        border: 'none',
                        backgroundColor: 'transparent',
                        outline: 'none',
                      }}
                    >
                      <option value="Kiểm kê định kỳ">Kiểm kê định kỳ</option>
                      <option value="Hao hụt thất thoát">Hao hụt thất thoát</option>
                      <option value="Hư hỏng hàng hóa">Hư hỏng hàng hóa</option>
                      <option value="Khác">Lý do khác</option>
                    </select>
                  </View>
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
          </View>
        </View>
      </Modal>

      {/* Barcode scanner modal */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanBarcode}
      />
    </SafeAreaView>
  );
}
