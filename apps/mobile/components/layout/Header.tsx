import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, Platform, Modal, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHeaders, loadApiBaseUrl } from '../../lib/api/config';
import { SyncManager } from '../../lib/sync/SyncManager';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import * as Haptics from 'expo-haptics';

// UI components
import { SyncBanner } from '../erp/SyncBanner';
import { Dialog } from '../ui/Dialog';

export interface HeaderProps {
  onPressMenu: () => void;
  syncStatus?: 'synced' | 'pending';
}

export function Header({ onPressMenu, syncStatus }: HeaderProps) {
  const [activeBranchName, setActiveBranchName] = useState('Tạp hóa Linh Ka');
  const [activeBranchId, setActiveBranchId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [branchList, setBranchList] = useState<any[]>([]);

  // States chọn chi nhánh dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSwitchConfirmVisible, setIsSwitchConfirmVisible] = useState(false);
  const [selectedBranchToSwitch, setSelectedBranchToSwitch] = useState<any>(null);
  const [isSwitchingLoading, setIsSwitchingLoading] = useState(false);

  // States thông báo giống Web UI
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'qr' | 'other'>('all');
  const [notifications, setNotifications] = useState<any[]>([
    {
      id: 'n1',
      title: 'Khách bàn B3 gửi món',
      description: 'Yêu cầu thanh toán 2 Cà phê cốt dừa qua mã QR',
      type: 'qr_order',
      status: 'unread',
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'n2',
      title: 'Mở bàn mới B8',
      description: 'Khách hàng quét QR check-in bàn B8',
      type: 'qr_session',
      status: 'unread',
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'n3',
      title: 'Cảnh báo hết hàng',
      description: 'Bia Heineken lon tại Kho chính còn dưới 5 sản phẩm',
      type: 'low_stock',
      status: 'read',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'n4',
      title: 'Sao lưu SQLite thành công',
      description: 'Hệ thống đã tự động sao lưu dữ liệu SQLite offline',
      type: 'system',
      status: 'read',
      createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    }
  ]);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  // Tải thông tin chi nhánh & shops hoạt động
  const loadHeaderData = async () => {
    try {
      const shopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
      const shopId = await AsyncStorage.getItem('active_shop_id') || '';
      const tId = await AsyncStorage.getItem('active_tenant_id') || 'default-tenant';
      
      setActiveBranchName(shopName);
      setActiveBranchId(shopId);
      setTenantId(tId);

      const currentUrl = await loadApiBaseUrl();
      const headers = await getApiHeaders();

      // Gọi API lấy shops
      const res = await fetch(`${currentUrl}/api/shops?tenant_id=${tId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const shops = data.shops || [];
        const mapped = shops.map((s: any) => ({
          id: s.id,
          name: s.name || 'Chi nhánh',
          address: s.address || 'Địa chỉ đang cập nhật',
          isActive: s.is_active !== false,
        }));
        setBranchList(mapped);
      } else {
        // Fallback offline
        setBranchList([
          { id: shopId, name: shopName, address: 'Cơ sở hiện tại (Offline)' }
        ]);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách chi nhánh trong Header:', err);
    }
  };

  useEffect(() => {
    loadHeaderData();
  }, []);

  const handleDropdownPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Tải lại dữ liệu shops trước khi mở dropdown phòng trường hợp có thay đổi
    loadHeaderData();
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleBranchSelect = (branch: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (branch.id === activeBranchId) {
      setIsDropdownOpen(false);
      return;
    }
    setSelectedBranchToSwitch(branch);
    setIsDropdownOpen(false);
    setIsSwitchConfirmVisible(true);
  };

  // Xác nhận chuyển chi nhánh thực tế & tải lại SQLite
  const handleConfirmSwitchBranch = async () => {
    if (!selectedBranchToSwitch) return;
    setIsSwitchingLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      
      const newShopId = selectedBranchToSwitch.id;
      const newShopName = selectedBranchToSwitch.name;

      if (Platform.OS !== 'web') {
        // 1. Đồng bộ cơ sở dữ liệu SQLite: tải toàn bộ sp, tồn kho, phòng bàn của chi nhánh mới
        const syncSuccess = await SyncManager.pullFullDatabase(newShopId, tenantId, () => {});
        
        if (!syncSuccess) {
          alert('Đồng bộ tải dữ liệu chi nhánh mới thất bại. Vui lòng thử lại sau khi có mạng!');
          setIsSwitchingLoading(false);
          setIsSwitchConfirmVisible(false);
          return;
        }

        // 2. Thiết lập ca làm việc di động mới trong SQLite cho chi nhánh mới
        const nowStr = new Date().toISOString();
        const shiftId = `shift-${newShopId}-${Date.now()}`;
        await AsyncStorage.setItem('active_shift_id', shiftId);

        await db.insert(schema.shop_shifts).values({
          id: shiftId,
          opened_at: nowStr,
          status: 'open',
          opening_cash: 0,
          actual_closing_cash: 0,
          employee_name: 'Thu ngân viên chính',
          sync_status: 'pending',
        }).onConflictDoNothing();
      }

      // 3. Ghi đè thông tin chi nhánh mới vào AsyncStorage
      await AsyncStorage.setItem('active_shop_id', newShopId);
      await AsyncStorage.setItem('active_shop_name', newShopName);

      setActiveBranchId(newShopId);
      setActiveBranchName(newShopName);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setIsSwitchingLoading(false);
      setIsSwitchConfirmVisible(false);
      setSelectedBranchToSwitch(null);

      // 4. Kích hoạt reload mượt mà bằng cách thay thế định tuyến
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Lỗi chuyển chi nhánh:', err);
      setIsSwitchingLoading(false);
      setIsSwitchConfirmVisible(false);
    }
  };

  return (
    <View className="px-4 py-2.5 bg-white border-b border-slate-100 flex-row justify-between items-center relative z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
      
      {/* Nút Hamburger và Bộ Chọn Chi Nhánh Dropdown */}
      <View className="flex-row items-center flex-1 mr-4">
        {/* Nút Hamburger Left */}
        <TouchableOpacity 
          activeOpacity={0.7}
          onPress={onPressMenu}
          className="p-2 bg-slate-50 border border-slate-100 rounded-xl mr-3"
        >
          <Ionicons name="menu-outline" size={20} color="#fa5908" />
        </TouchableOpacity>

        {/* Cấu trúc chọn chi nhánh dropdown - Đã loại bỏ Avatar/Logo, nhãn nhỏ hơn, tên to hơn */}
        <TouchableOpacity 
          activeOpacity={0.85}
          onPress={handleDropdownPress}
          className="flex-row items-center flex-1 max-w-[200px]"
        >
          <View className="flex-1 mr-1">
            <Text className="text-[6.5px] font-black text-slate-450 uppercase tracking-widest leading-none">CHI NHÁNH</Text>
            <Text className="text-sm font-black text-slate-800 mt-1 leading-tight" numberOfLines={1}>
              {activeBranchName}
            </Text>
          </View>
          
          <Ionicons 
            name={isDropdownOpen ? "chevron-up" : "chevron-down"} 
            size={13} 
            color="#64748b" 
            className="mt-2 ml-1"
          />
        </TouchableOpacity>
      </View>

      {/* SyncStatusBar và Chuông thông báo Right */}
      <View className="flex-row items-center gap-2">
        <SyncBanner forceStatus={syncStatus} onPressSync={() => {}} />
        
        <TouchableOpacity 
          activeOpacity={0.7}
          className="p-2 bg-slate-50 rounded-xl border border-slate-100 relative"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsNotificationOpen(true);
          }}
        >
          <Ionicons name="notifications-outline" size={15} color="#64748b" />
          {unreadCount > 0 && (
            <View className="absolute top-1.5 right-1.5 bg-red-500 w-1.5 h-1.5 rounded-full" />
          )}
        </TouchableOpacity>
      </View>

      {/* DROPDOWN MENU CHUYỂN CHI NHÁNH THẢ XUỐNG */}
      <Modal
        visible={isDropdownOpen}
        transparent={true}
        animationType="none"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsDropdownOpen(false)}>
          <View className="flex-1 bg-black/15 pt-20 px-6">
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View className="bg-white rounded-2xl border border-slate-150 p-4 w-[85%] max-w-sm mt-1 z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
                
                {/* Header Dropdown */}
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[9px] font-black text-slate-450 uppercase tracking-widest">CHUYỂN CHI NHÁNH</Text>
                  <View className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    <Text className="text-[7px] text-slate-500 font-extrabold">{branchList.length}/{branchList.length}</Text>
                  </View>
                </View>

                {/* Danh sách shops - Loại bỏ chữ cái đại diện, đổi bằng storefront icon */}
                <ScrollView className="max-h-60" showsVerticalScrollIndicator={false}>
                  {branchList.map((branch) => {
                    const isSelected = branch.id === activeBranchId;
                    return (
                      <TouchableOpacity
                        key={branch.id}
                        activeOpacity={0.8}
                        className={`p-3 my-1 rounded-xl flex-row justify-between items-center border ${
                          isSelected 
                            ? ' border-orange-200' 
                            : ' border-slate-100 active:bg-slate-50'
                        }`}
                        onPress={() => handleBranchSelect(branch)}
                      >
                        <View className="flex-row items-center flex-1 mr-2">
                          <View className={`w-7 h-7 rounded-lg items-center justify-center mr-3 border ${
                            isSelected 
                              ? 'bg-orange-500/10 border-orange-500/20' 
                              : 'bg-slate-50 border-slate-150'
                          }`}>
                            <Ionicons name="storefront-outline" size={13} color={isSelected ? '#fa5908' : '#64748b'} />
                          </View>
                          
                          <View className="flex-1">
                            <Text className={`text-xs font-black ${isSelected ? 'text-orange-500' : 'text-slate-800'}`}>
                              {branch.name}
                            </Text>
                            <Text className="text-[8px] text-slate-450 font-bold mt-0.5" numberOfLines={1}>
                              {branch.address}
                            </Text>
                          </View>
                        </View>

                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color="#fa5908" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* DROPDOWN MENU THÔNG BÁO THẢ XUỐNG - Giống hệt WebUI */}
      <Modal
        visible={isNotificationOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsNotificationOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsNotificationOpen(false)}>
          <View className="flex-1 bg-black/10 pt-20 px-6 items-end">
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View className="bg-white rounded-2xl border border-slate-150 p-4 w-[90%] max-w-sm mt-1 z-50" style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 }}>
                
                {/* Header */}
                <View className="flex-row justify-between items-center mb-3">
                  <View>
                    <Text className="text-[10px] font-black text-slate-450 uppercase tracking-widest">THÔNG BÁO</Text>
                    {unreadCount > 0 && (
                      <Text className="text-[8px] text-orange-500 font-bold mt-0.5">Bạn có {unreadCount} tin chưa đọc</Text>
                    )}
                  </View>
                  
                  {unreadCount > 0 && (
                    <TouchableOpacity 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
                      }}
                      className="bg-slate-50 border border-slate-150 px-2 py-1 rounded-lg active:bg-slate-100"
                    >
                      <Text className="text-[7.5px] text-slate-500 font-black">ĐỌC TẤT CẢ</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filter Tabs */}
                <View className="flex-row bg-slate-50 p-0.5 rounded-xl border border-slate-100 mb-3 gap-1">
                  {[
                    { key: 'all', label: 'Tất cả' },
                    { key: 'qr', label: 'Yêu cầu QR' },
                    { key: 'other', label: 'Cảnh báo' }
                  ].map(tab => {
                    const isActive = activeNotificationTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setActiveNotificationTab(tab.key as any);
                        }}
                        className={`flex-1 py-1.5 items-center justify-center rounded-lg ${
                          isActive 
                            ? 'bg-white border border-slate-200/50 shadow-sm' 
                            : 'active:bg-slate-100/60'
                        }`}
                      >
                        <Text className={`text-[9px] font-black uppercase ${isActive ? 'text-orange-500' : 'text-slate-500'}`}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Notification List */}
                <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
                  {notifications
                    .filter(n => {
                      if (activeNotificationTab === 'qr') return n.type === 'qr_order' || n.type === 'qr_session';
                      if (activeNotificationTab === 'other') return n.type !== 'qr_order' && n.type !== 'qr_session';
                      return true;
                    })
                    .map(n => {
                      const isUnread = n.status === 'unread';
                      
                      // Map colors & icons
                      let iconName = 'notifications-outline';
                      let iconBg = 'bg-blue-50';
                      let iconColor = '#3b82f6';
                      
                      if (n.type === 'qr_order') {
                        iconName = 'restaurant-outline';
                        iconBg = 'bg-orange-50';
                        iconColor = '#fa5908';
                      } else if (n.type === 'qr_session') {
                        iconName = 'enter-outline';
                        iconBg = 'bg-emerald-50';
                        iconColor = '#10b981';
                      } else if (n.type === 'low_stock') {
                        iconName = 'warning-outline';
                        iconBg = 'bg-amber-50';
                        iconColor = '#f59e0b';
                      } else if (n.type === 'system') {
                        iconName = 'cube-outline';
                        iconBg = 'bg-indigo-50';
                        iconColor = '#6366f1';
                      }

                      return (
                        <TouchableOpacity
                          key={n.id}
                          activeOpacity={0.8}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, status: 'read' } : item));
                          }}
                          className={`p-3 my-1 rounded-xl flex-row items-start border ${
                            isUnread 
                              ? ' border-orange-100' 
                              : ' border-slate-100'
                          }`}
                        >
                          <View className="flex-row items-center mr-2.5 mt-0.5">
                            {isUnread && (
                              <View className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-1.5" />
                            )}
                            <View className={`${iconBg} w-7 h-7 rounded-lg items-center justify-center`}>
                              <Ionicons name={iconName as any} size={12} color={iconColor} />
                            </View>
                          </View>

                          <View className="flex-1">
                            <View className="flex-row justify-between items-center">
                              <Text className={`text-[11px] font-black ${isUnread ? 'text-slate-800' : 'text-slate-500'}`}>
                                {n.title}
                              </Text>
                              <Text className="text-[7.5px] text-slate-400 font-bold">
                                {new Date(n.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                            <Text className={`text-[9px] mt-0.5 font-bold ${isUnread ? 'text-slate-660' : 'text-slate-450'}`} numberOfLines={2}>
                              {n.description}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  
                  {notifications.filter(n => {
                    if (activeNotificationTab === 'qr') return n.type === 'qr_order' || n.type === 'qr_session';
                    if (activeNotificationTab === 'other') return n.type !== 'qr_order' && n.type !== 'qr_session';
                    return true;
                  }).length === 0 && (
                    <View className="py-8 items-center justify-center">
                      <Ionicons name="notifications-off-outline" size={24} color="#cbd5e1" />
                      <Text className="text-[10px] text-slate-400 font-black mt-2">Hộp thư thông báo trống</Text>
                    </View>
                  )}
                </ScrollView>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Dialog Confirm chuyển đổi chi nhánh */}
      <Dialog
        visible={isSwitchConfirmVisible}
        onClose={() => {
          setIsSwitchConfirmVisible(false);
          setSelectedBranchToSwitch(null);
        }}
        onConfirm={handleConfirmSwitchBranch}
        loading={isSwitchingLoading}
        title="Chuyển đổi chi nhánh?"
        description={selectedBranchToSwitch ? `Bạn có chắc chắn muốn chuyển sang làm việc tại "${selectedBranchToSwitch.name}"?\nHệ thống sẽ kết thúc ca cũ và tự động tải lại dữ liệu SQLite offline mới đầu ca.` : ''}
        confirmLabel="Đồng ý chuyển"
        cancelLabel="Hủy"
        variant="default"
      />

    </View>
  );
}
