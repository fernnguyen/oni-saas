import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, gt, desc } from 'drizzle-orm';
import { formatDate, formatCurrency } from '../lib/utils/format';
import { Header } from '../components/layout/Header';
import { usePermissions } from '../lib/auth/PermissionsContext';
import { DebtCollectionModal } from '../components/ui/DebtCollectionModal';
import { KeepAliveManager } from '../lib/sync/KeepAliveManager';

export default function DebtScreen() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canViewDebt = hasPermission('debt.view') || hasPermission('customers.view');
  const canManageCashbook = hasPermission('cashbook.manage');

  const [debtPartners, setDebtPartners] = useState<any[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const loadDebtData = async () => {
    try {
      setIsLoading(true);

      // Tải danh sách khách hàng có dư nợ > 0 từ SQLite
      const results = await db.select().from(schema.customers).where(gt(schema.customers.debt_amount, 0));

      // Tính tổng công nợ cần thu
      const sum = results.reduce((acc: number, cur: any) => acc + (cur.debt_amount || 0), 0);
      setTotalDebt(sum);

      // Tính toán số ngày nợ (debt age) từ metadata hoặc created_at nếu có
      const processed = results.map((row: any) => {
        let importedDebtDays = 0;
        try {
          if (row.metadata) {
            const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
            if (meta && meta.debt_days) {
              importedDebtDays = parseInt(String(meta.debt_days), 10) || 0;
            }
          }
        } catch (e) {}

        // Tính số ngày nợ tạm thời dựa trên created_at
        let debtDays = 0;
        const rawDate = row.createdAt || row.created_at;
        if (rawDate) {
          const baseDate = new Date(rawDate);
          if (!isNaN(baseDate.getTime())) {
            if (importedDebtDays > 0) {
              baseDate.setDate(baseDate.getDate() - importedDebtDays);
            }
            const diffTime = Math.max(0, Date.now() - baseDate.getTime());
            debtDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          }
        }
        
        return {
          ...row,
          debtDays,
        };
      });

      setDebtPartners(processed);
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu công nợ:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (canViewDebt) {
        loadDebtData();
      }
    }, [canViewDebt])
  );

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await KeepAliveManager.triggerSyncIfNeeded(true);
      await loadDebtData();
    } catch (e) {
      console.warn('Sync manually failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Bộ lọc tìm kiếm và sắp xếp local giống web
  const filteredPartners = debtPartners
    .filter((item) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (item.name || '').toLowerCase().includes(s) ||
        (item.phone || '').toLowerCase().includes(s) ||
        (item.customer_code || '').toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const valA = a.debt_amount || 0;
      const valB = b.debt_amount || 0;
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

  if (!canViewDebt) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50 justify-center items-center px-6">
        <Ionicons name="lock-closed-outline" size={48} color="#ef4444" />
        <Text className="text-slate-800 font-bold text-base mt-4 text-center">Không có quyền truy cập</Text>
        <Text className="text-slate-400 text-xs text-center mt-2">
          Bạn không có quyền xem báo cáo Công nợ. Vui lòng liên hệ quản trị viên.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 bg-orange-500 px-6 py-2.5 rounded-xl"
          style={{ backgroundColor: '#fa5908' }}
        >
          <Text className="text-white font-bold text-xs">Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      <Header 
        title="Quản lý công nợ" 
        onPressMenu={() => router.push('/(tabs)')} 
        showBack={true} 
        syncStatus="synced"
      />

      <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
        
        {/* Card Dư Nợ Tổng Quan */}
        <View className="bg-red-50 border border-red-100 rounded-3xl p-5 shadow-sm mb-4">
          <Text className="text-xxs font-bold text-red-700 uppercase tracking-wider">Tổng công nợ cần thu</Text>
          <Text className="text-2xl font-bold text-red-650 mt-1">{formatCurrency(totalDebt)}</Text>
          <Text className="text-[10px] font-semibold text-slate-400 mt-2">
            Có {filteredPartners.length} khách hàng đang phát sinh nợ
          </Text>
        </View>

        {/* Tìm kiếm & Sắp xếp */}
        <View className="flex-row items-center mb-4 gap-2">
          {/* Thanh Tìm Kiếm */}
          <View className="flex-1 flex-row items-center bg-white border border-slate-200 px-3.5 py-2.5 rounded-2xl shadow-xs">
            <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
            <TextInput
              placeholder="Tìm theo tên hoặc số điện thoại..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-slate-800 text-xs font-semibold p-0"
              value={search}
              onChangeText={setSearch}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Nút Sắp xếp */}
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xs justify-center items-center h-[42px] w-[42px]"
          >
            <Ionicons 
              name={sortOrder === 'desc' ? "trending-down-outline" : "trending-up-outline"} 
              size={18} 
              color="#fa5908" 
            />
          </TouchableOpacity>

          {/* Nút Đồng bộ / Tải lại */}
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={handleManualSync}
            disabled={isSyncing}
            className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xs justify-center items-center h-[42px] w-[42px]"
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fa5908" style={{ transform: [{ scale: 0.8 }] }} />
            ) : (
              <Ionicons name="sync-outline" size={18} color="#fa5908" />
            )}
          </TouchableOpacity>
        </View>

        {/* Danh sách đối tác nợ */}
        <View className="mb-3">
          <Text className="text-xxs font-semibold text-slate-500 px-1">Danh sách nợ cần thu</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color="#fa5908" className="py-10" />
        ) : filteredPartners.length === 0 ? (
          <View className="bg-white border border-slate-100 rounded-3xl p-10 items-center justify-center">
            <Ionicons name="checkmark-circle-outline" size={48} color="#cbd5e1" />
            <Text className="text-xxs font-semibold text-slate-400 mt-3 text-center">
              Không có công nợ nào cần xử lý.
            </Text>
          </View>
        ) : (
          filteredPartners.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.9}
              onPress={() => {
                if (canManageCashbook) {
                  setSelectedCustomer(item);
                  setIsModalVisible(true);
                } else {
                  router.push({
                    pathname: '/(tabs)/customers',
                    params: { customer_id: item.id }
                  });
                }
              }}
              className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs mb-3 flex-row justify-between items-center"
            >
              <View className="flex-1 mr-4">
                <Text className="text-xs font-bold text-slate-800">{item.name}</Text>
                <Text className="text-xxs font-medium text-slate-400 mt-1">📞 {item.phone || '—'}</Text>
                
                {item.debtDays > 0 && (
                  <View className="flex-row items-center mt-2.5">
                    <Text className={`text-micro font-semibold ${item.debtDays > 30 ? 'text-rose-600' : 'text-slate-500'}`}>
                      ⏳ Nợ {item.debtDays} ngày
                    </Text>
                  </View>
                )}
              </View>

              <View className="items-end">
                <Text className="font-bold text-sm text-red-600">
                  {formatCurrency(item.debt_amount || 0)}
                </Text>
                
                {canManageCashbook && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCustomer(item);
                      setIsModalVisible(true);
                    }}
                    className="mt-2 bg-orange-500 px-3.5 py-1.5 rounded-xl active:scale-95"
                    style={{ backgroundColor: '#fa5908' }}
                  >
                    <Text className="text-white font-bold text-[10px]">Thu nợ</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}

        <View className="h-20" />
      </ScrollView>

      <DebtCollectionModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setSelectedCustomer(null);
        }}
        customer={selectedCustomer}
        onSuccess={() => {
          setIsModalVisible(false);
          setSelectedCustomer(null);
          loadDebtData(); // Reload debt data
        }}
      />
    </SafeAreaView>
  );
}
