import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, Text, TouchableOpacity, View, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
  branchName?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

export function DrawerMenu({ visible, onClose, branchName = 'Chi nhánh chính' }: DrawerMenuProps) {
  const router = useRouter();
  
  // Hoạt ảnh trượt ngang từ trái sang phải
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const handleNavigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    
    if (route.startsWith('/(tabs)')) {
      router.push(route as any);
    } else {
      alert(`Tính năng ${route} sẽ có mặt trong phiên bản cập nhật ERP lớn tiếp theo!`);
    }
  };

  const renderMenuItem = (icon: string, label: string, targetRoute: string, isComingSoon = false) => {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleNavigate(targetRoute)}
        className="flex-row items-center py-3 px-4 my-1 rounded-xl active:bg-orange-50/60"
      >
        <View className="bg-slate-50 p-2 rounded-lg mr-3 border border-slate-100">
          <Ionicons name={icon as any} size={16} color="#fa5908" />
        </View>
        <View className="flex-1">
          {/* Tăng kích cỡ chữ lớn hơn, in đậm sắc nét */}
          <Text className="font-black text-[13px] text-slate-800 tracking-wide">
            {label}
          </Text>
        </View>
        {isComingSoon ? (
          <View className="bg-amber-50 border border-amber-200 px-1 rounded-md">
            <Text className="text-[7px] text-amber-700 font-extrabold">COMING</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={11} color="#94a3b8" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View className="flex-1 flex-row">
        
        {/* Lớp nền tối mờ */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View 
            style={{ opacity: fadeAnim }}
            className="absolute inset-0 bg-black/50" 
          />
        </TouchableWithoutFeedback>

        {/* Thân Menu Trượt */}
        <Animated.View
          style={{
            transform: [{ translateX: slideAnim }],
            width: DRAWER_WIDTH,
          }}
          className="h-full bg-white shadow-2xl border-r border-slate-100 p-4 pt-12 justify-between"
        >
          <View>
            {/* Header Drawer */}
            <View className="flex-row items-center mb-6 px-1.5">
              <View className="bg-orange-500 w-10 h-10 rounded-xl items-center justify-center shadow-md mr-2.5 border border-orange-400" style={{ backgroundColor: '#fa5908' }}>
                <Text className="text-white font-black text-xl italic lowercase">o</Text>
              </View>
              <View>
                <Text className="text-[13px] font-black text-slate-800 tracking-widest uppercase">ONI miniERP</Text>
                <Text className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider" numberOfLines={1}>
                  {branchName}
                </Text>
              </View>
            </View>

            <View className="h-0.5 w-full bg-slate-100 my-3" />

            {/* Danh sách phân hệ ERP */}
            <Text className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1.5">
              Phân hệ quản trị
            </Text>
            
            {renderMenuItem('analytics', 'Báo cáo tổng quan', '/(tabs)')}
            {renderMenuItem('calculator', 'Bán hàng nhanh POS', '/(tabs)/pos')}
            {renderMenuItem('receipt', 'Lịch sử hóa đơn', '/(tabs)/orders')}
            {renderMenuItem('cube-outline', 'Quản lý Kho hàng', 'Kho hàng', true)}
            {renderMenuItem('wallet-outline', 'Sổ quỹ thu chi (Cashbook)', 'Sổ quỹ', true)}
            {renderMenuItem('people-outline', 'Quản lý Khách hàng', '/(tabs)/customers')}
            {renderMenuItem('settings-outline', 'Cài đặt hệ thống', '/(tabs)/settings')}
          </View>

          {/* Footer Drawer */}
          <View className="mb-4">
            <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex-row items-center">
              <View className="bg-orange-100 w-7 h-7 rounded-full items-center justify-center mr-2.5">
                <Ionicons name="person-outline" size={13} color="#fa5908" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-[9px] text-slate-700">Staff Thu Ngân</Text>
                <Text className="text-[7px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">Mobile Cashier</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={onClose}
              className="mt-3 flex-row items-center justify-center border border-slate-200 py-2.5 rounded-lg active:bg-slate-50"
            >
              <Ionicons name="close" size={12} color="#64748b" />
              <Text className="text-slate-500 font-bold text-[9px] uppercase tracking-wider ml-1.5">Đóng Menu</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}
