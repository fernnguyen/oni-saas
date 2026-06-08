import React, {useState, useEffect, useCallback} from 'react';
import {Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Image, Platform, Animated, ActivityIndicator, Alert, Pressable} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {SyncManager} from '../../lib/sync/SyncManager';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import * as Haptics from 'expo-haptics';
import {formatCurrency, maskCurrencyInput, parseCurrencyToNumber} from '../../lib/utils/format';
import {calculateHourlyBilling} from '@oni/core';

// Import hệ thống component dùng chung
import {Header} from '../../components/layout/Header';
import {Button} from '../../components/ui/Button';
import {Dialog} from '../../components/ui/Dialog';
import {Badge} from '../../components/ui/Badge';
import {Skeleton} from '../../components/ui/Skeleton';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {BarcodeScannerModal} from '../../components/ui/BarcodeScannerModal';
import {ProductPreviewModal} from '../../components/pos/ProductPreviewModal';
import CartCheckoutModal from '../../components/pos/CartCheckoutModal';
import QRTransferModal from '../../components/pos/QRTransferModal';

export interface LodgingGuest {
 id?: string | number;
 name: string;
 id_type: string;
 id_number: string;
 idCard?: string;
 expiry_date?: string;
 nationality?: string;
 dob?: string;
 gender?: string;
 note?: string;
}

export type SelectedModifier = { option: string; price_adj: number };
export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variant_label?: string;
  modifiers?: SelectedModifier[];
  modifier_total?: number;
};


interface LodgingGuestsFormProps {
 guests: LodgingGuest[];
 onChangeGuests: (guests: LodgingGuest[]) => void;
 guestCount: number;
 onChangeGuestCount: (count: number) => void;
 onPressDateInput: (index: number, field: 'dob' | 'expiry_date', currentValue: string) => void;
}

export function LodgingGuestsForm({
 guests,
 onChangeGuests,
 guestCount,
 onChangeGuestCount,
 onPressDateInput,
}: LodgingGuestsFormProps) {
 const updateGuestField = (index: number, field: keyof LodgingGuest, value: any) => {
 const updated = [...guests];
 if (!updated[index]) {
 updated[index] = {name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''};
}
 updated[index] = {...updated[index], [field]: value};
 // Maintain idCard and id_number sync
 if (field === 'id_number') {
 updated[index].idCard = value;
} else if (field === 'idCard') {
 updated[index].id_number = value;
}
 onChangeGuests(updated);
};

 const idTypes = ['CCCD', 'CMND', 'Hộ chiếu'];
 
 const handleGenderPress = (index: number) => {
 if (Platform.OS === 'web') return;
 Alert.alert(
 "Chọn giới tính",
 "Vui lòng chọn giới tính khách lưu trú:",
 [
 {text: "Nam", onPress: () => updateGuestField(index, 'gender', 'Nam')},
 {text: "Nữ", onPress: () => updateGuestField(index, 'gender', 'Nữ')},
 {text: "Không xác định", onPress: () => updateGuestField(index, 'gender', 'Khác')},
 {text: "Hủy bỏ", style: "cancel"}
 ]
 );
};

 return (
 <View className="px-1 py-2">
 {guests.map((guest, index) => {
 return (
 <View key={index} className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 animate-fade-in">
 <View className="flex-row justify-between items-center mb-3">
 <Text className="text-sm font-semibold text-orange-600">Khách lưu trú #{index + 1}:</Text>
 {index > 0 && (
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 const updated = guests.filter((_, i) => i !== index);
 onChangeGuests(updated);
 onChangeGuestCount(updated.length);
}}
 className="p-2 bg-rose-50 rounded-xl border border-rose-100 items-center justify-center active:scale-95"
 >
 <Ionicons name="trash-outline" size={15} color="#f43f5e" />
 </TouchableOpacity>
 )}
 </View>

 {/* Field 1: Họ và tên */}
 <View className="mt-3">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Họ và tên:</Text>
 <TextInput
 className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 font-semibold h-[44px]"
 placeholder="Nhập họ và tên..."
 placeholderTextColor="#cbd5e1"
 value={guest.name || ''}
 onChangeText={(val) => updateGuestField(index, 'name', val)}
 style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
  }}
 />
 </View>

 {/* Field 2: Loại giấy tờ */}
 <View className="mt-3">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Loại giấy tờ:</Text>
 <View className="flex-row bg-slate-100 p-1 rounded-xl border border-slate-200 mt-1 h-[44px] items-center">
 {idTypes.map(type => {
 const isSelected = (guest.id_type || 'CCCD') === type;
 return (
 <TouchableOpacity
 key={type}
 activeOpacity={0.8}
 onPress={() => updateGuestField(index, 'id_type', type)}
 className={`flex-1 h-[36px] items-center justify-center rounded-lg ${
 isSelected ? 'bg-white' : 'bg-transparent'
}`}
 style={isSelected ? {shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1} : undefined}
 >
 <Text className={`text-xs font-semibold ${isSelected ? 'text-slate-850' : 'text-slate-500'}`}>
 {type}
 </Text>
 </TouchableOpacity>
 );
})}
 </View>
 </View>

 {/* Field 3: Số giấy tờ */}
 <View className="mt-3">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Số giấy tờ (CCCD/CMND/Hộ chiếu):</Text>
 <TextInput
 className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 font-semibold h-[44px]"
 placeholder="Nhập số giấy tờ..."
 placeholderTextColor="#cbd5e1"
 value={guest.id_number || guest.idCard || ''}
 onChangeText={(val) => updateGuestField(index, 'id_number', val)}
 style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
  }}
 />
 </View>

 {/* Field 4 & 5 Row: Ngày hết hạn & Quốc tịch */}
 <View className="flex-row gap-3 mt-3">
 <View className="flex-1">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Ngày hết hạn:</Text>
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => onPressDateInput(index, 'expiry_date', guest.expiry_date || '')}
 className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex-row justify-between items-center h-[44px]"
 >
 <Text className="text-xs text-slate-800 font-semibold">
 {guest.expiry_date || 'Chọn ngày...'}
 </Text>
 <Ionicons name="calendar-outline" size={15} color="#fa5908" />
 </TouchableOpacity>
 </View>
 <View className="flex-1">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Quốc tịch:</Text>
 <TextInput
  className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 font-semibold h-[44px]"
  placeholder="Quốc tịch..."
  placeholderTextColor="#cbd5e1"
  value={guest.nationality || 'Việt Nam'}
  onChangeText={(val) => updateGuestField(index, 'nationality', val)}
  style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
  }}
  />
 </View>
 </View>

 {/* Field 6 & 7 Row: Ngày sinh & Giới tính */}
 <View className="flex-row gap-3 mt-3">
 <View className="flex-1">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Ngày sinh:</Text>
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => onPressDateInput(index, 'dob', guest.dob || '')}
 className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex-row justify-between items-center h-[44px]"
 >
 <Text className="text-xs text-slate-800 font-semibold">
 {guest.dob || 'Chọn ngày...'}
 </Text>
 <Ionicons name="calendar-outline" size={15} color="#fa5908" />
 </TouchableOpacity>
 </View>
 <View className="flex-1">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Giới tính:</Text>
 {Platform.OS === 'web' ? (
 <View className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex-row justify-between items-center h-[44px] relative">
 <select
 value={guest.gender || ''}
 onChange={(e) => updateGuestField(index, 'gender', e.target.value)}
 className="w-full bg-transparent text-xs text-slate-800 font-semibold pr-6"
 style={{border: 'none', outline: 'none', height: '100%', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none'}}
 >
 <option value="">Chọn...</option>
 <option value="Nam">Nam</option>
 <option value="Nữ">Nữ</option>
 <option value="Khác">Không xác định</option>
 </select>
 <Ionicons name="chevron-down" size={12} color="#64748b" style={{position: 'absolute', right: 12, pointerEvents: 'none'}} />
 </View>
 ) : (
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => handleGenderPress(index)}
 className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex-row justify-between items-center h-[44px]"
 >
 <Text className="text-xs text-slate-800 font-semibold">
 {guest.gender === 'Nam' ? 'Nam' : guest.gender === 'Nữ' ? 'Nữ' : guest.gender === 'Khác' ? 'Không xác định' : 'Chọn...'}
 </Text>
 <Ionicons name="chevron-down" size={14} color="#64748b" />
 </TouchableOpacity>
 )}
 </View>
 </View>

 {/* Field 8: Ghi chú */}
 <View className="mt-3">
 <Text className="text-xs text-slate-500 font-medium mb-1.5">Ghi chú:</Text>
 <TextInput
 className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 font-semibold h-[44px]"
 placeholder="Ghi chú thêm..."
 placeholderTextColor="#cbd5e1"
 value={guest.note || ''}
 onChangeText={(val) => updateGuestField(index, 'note', val)}
 style={{
   paddingVertical: 0,
   textAlignVertical: 'center',
   lineHeight: undefined,
   ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
 }}
 />
 </View>
 </View>
 );
})}

 {/* Add Guest Button */}
 <TouchableOpacity 
 activeOpacity={0.8}
 onPress={() => {
 const updated = [...guests, {name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''}];
 onChangeGuests(updated);
 onChangeGuestCount(updated.length);
}}
 className="flex-row items-center justify-center bg-orange-50 border border-orange-100 py-3.5 rounded-xl mt-2 active:bg-orange-100"
 >
 <Ionicons name="add-circle" size={18} color="#fa5908" />
 <Text className="text-xs font-semibold text-orange-600 ml-2">Thêm khách lưu trú</Text>
 </TouchableOpacity>
 </View>
 );
}

export default function PosScreen() {

 // Premium Toast Notification state
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

 const renderToast = (isForModal: boolean = false) => {
 if (!toastMsg) return null;
 
 const isAnyModalVisible = isTableOpenDialogVisible || !!activeTable || isCartModalOpen || isQrModalOpen;
 if (!isForModal && isAnyModalVisible) return null;

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

 const renderDatePicker = () => {
 if (!isDatePickerOpen) return null;
 return (
 <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 999999, justifyContent: 'center', alignItems: 'center'}}>
 <View className="w-full max-w-[340px] bg-white rounded-3xl p-5 shadow-2xl items-center border border-slate-100 overflow-hidden">
 {/* Modal Title */}
 <Text className="text-xs font-semibold text-slate-400 mb-3">
 {pickerTargetField === 'dob' ? 'Chọn ngày sinh' : 'Chọn ngày hết hạn'}
 </Text>

 {/* Premium Header Display */}
 <View className="flex-row items-center justify-center bg-orange-50/50 rounded-2xl w-full py-3 mb-4 border border-orange-100/50">
 <Text className="text-orange-500 text-2xl font-semibold">
 {pickerDay.toString().padStart(2, '0')}
 </Text>
 <Text className="text-slate-300 text-xl font-medium mx-2">/</Text>
 <Text className="text-orange-500 text-2xl font-semibold">
 {pickerMonth.toString().padStart(2, '0')}
 </Text>
 <Text className="text-slate-300 text-xl font-medium mx-2">/</Text>
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => setDatePickerView(prev => prev === 'calendar' ? 'year' : 'calendar')}
 className="bg-orange-100 px-2 py-0.5 rounded-lg border border-orange-200"
 >
 <Text className="text-orange-600 text-xl font-semibold">
 {pickerYear} ⚙️
 </Text>
 </TouchableOpacity>
 </View>

 {datePickerView === 'calendar' ? (
 <View className="w-full">
 {/* Month Navigation */}
 <View className="flex-row justify-between items-center mb-3 w-full px-2">
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 if (pickerMonth === 1) {
 setPickerMonth(12);
 setPickerYear(y => y - 1);
} else {
 setPickerMonth(m => m - 1);
}
}}
 className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg"
 >
 <Ionicons name="chevron-back" size={16} color="#475569" />
 </TouchableOpacity>
 
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => setDatePickerView('year')}
 >
 <Text className="text-xs font-semibold text-slate-700">
 Tháng {pickerMonth.toString().padStart(2, '0')}, {pickerYear}
 </Text>
 </TouchableOpacity>

 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 if (pickerMonth === 12) {
 setPickerMonth(1);
 setPickerYear(y => y + 1);
} else {
 setPickerMonth(m => m + 1);
}
}}
 className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg"
 >
 <Ionicons name="chevron-forward" size={16} color="#475569" />
 </TouchableOpacity>
 </View>

 {/* Week Day Labels */}
 <View className="flex-row justify-start w-full mb-1">
 {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w, wi) => (
 <View key={wi} className="w-[14.28%] items-center justify-center py-1">
 <Text className="text-tiny text-slate-400 font-medium">{w}</Text>
 </View>
 ))}
 </View>

 {/* Days Grid */}
 <View className="flex-row flex-wrap justify-start w-full">
 {(() => {
 const firstDayIndex = new Date(pickerYear, pickerMonth - 1, 1).getDay();
 const firstDayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
 const daysInMonth = new Date(pickerYear, pickerMonth, 0).getDate();
 
 const cells = [];
 for (let i = 0; i < firstDayOffset; i++) {
 cells.push(
 <View key={`empty-${i}`} className="w-[14.28%] aspect-square items-center justify-center p-0.5" />
 );
}
 for (let d = 1; d <= daysInMonth; d++) {
 const isSelected = pickerDay === d;
 cells.push(
 <TouchableOpacity
 key={`day-${d}`}
 activeOpacity={0.8}
 onPress={() => setPickerDay(d)}
 className="w-[14.28%] aspect-square items-center justify-center p-0.5"
 >
 <View className={`w-full h-full items-center justify-center rounded-full ${
 isSelected ? 'bg-orange-500' : 'bg-transparent active:bg-slate-100'
}`}>
 <Text className={`text-xs font-medium ${
 isSelected ? 'text-white font-semibold' : 'text-slate-700'
}`}>
 {d}
 </Text>
 </View>
 </TouchableOpacity>
 );
}
 return cells;
})()}
 </View>
 </View>
 ) : (
 <View className="w-full">
 {/* Header for Year Picker */}
 <View className="flex-row justify-between items-center mb-3.5 px-2">
 <Text className="text-xs font-semibold text-slate-700">Chọn năm sinh/hạn giấy tờ:</Text>
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => setDatePickerView('calendar')}
 className="bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg"
 >
 <Text className="text-orange-600 text-tiny font-semibold">← Lịch</Text>
 </TouchableOpacity>
 </View>

 {/* Years Grid */}
 <View className="max-h-56 bg-slate-50 rounded-2xl border border-slate-100 p-2">
 <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
 <View className="flex-row flex-wrap justify-start">
 {(() => {
 const years = [];
 const currentYear = new Date().getFullYear();
 for (let y = currentYear + 15; y >= 1930; y--) {
 const isSelected = pickerYear === y;
 years.push(
 <TouchableOpacity
 key={y}
 activeOpacity={0.8}
 onPress={() => {
 setPickerYear(y);
 setDatePickerView('calendar');
}}
 className="w-[33.3%] p-1.5"
 >
 <View className={`py-2 rounded-xl items-center justify-center ${
 isSelected ? 'bg-orange-500' : 'bg-white border border-slate-200 active:bg-orange-50'
}`}>
 <Text className={`text-xs font-medium ${
 isSelected ? 'text-white font-semibold' : 'text-slate-700'
}`}>
 {y}
 </Text>
 </View>
 </TouchableOpacity>
 );
}
 return years;
})()}
 </View>
 </ScrollView>
 </View>
 </View>
 )}

 {/* Modal Actions */}
 <View className="flex-row gap-3 mt-4 border-t border-slate-100 pt-4 w-full">
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setIsDatePickerOpen(false)}
 className="flex-1 py-3 bg-slate-100 rounded-xl items-center justify-center border border-slate-200"
 >
 <Text className="text-slate-600 text-xs font-semibold">Hủy bỏ</Text>
 </TouchableOpacity>
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => {
 const formattedDate = `${pickerDay.toString().padStart(2, '0')}/${pickerMonth.toString().padStart(2, '0')}/${pickerYear}`;
 const updated = [...lodgingGuests];
 if (!updated[pickerTargetIndex]) {
 updated[pickerTargetIndex] = {name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''};
}
 updated[pickerTargetIndex] = {...updated[pickerTargetIndex], [pickerTargetField]: formattedDate};
 setLodgingGuests(updated);
 setIsDatePickerOpen(false);
}}
 className="flex-1 py-3 bg-orange-500 rounded-xl items-center justify-center shadow-lg shadow-orange-500/20"
 >
 <Text className="text-white text-xs font-semibold">Xác nhận</Text>
 </TouchableOpacity>
 </View>
 </View>
 </View>
 );
};

 // State quản lý POS
 const [productsList, setProductsList] = useState<any[]>([]);
 const [categoriesList, setCategoriesList] = useState<any[]>([]);
 const [customersList, setCustomersList] = useState<any[]>([]);
  const [paymentFundsList, setPaymentFundsList] = useState<any[]>([]);
 const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
 const [tables, setTables] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState(true);
 const [isNavReady, setIsNavReady] = useState(false);
 const [currentUserEmail, setCurrentUserEmail] = useState<string>('mobile-app');
 const [activeShopId, setActiveShopId] = useState<string>('');
 const [isOnline, setIsOnline] = useState<boolean>(true);
 const [apiAuthHeaders, setApiAuthHeaders] = useState<Record<string, string>>({});

 useEffect(() => {
  AsyncStorage.getItem('saved_email').then(email => {
    if (email) setCurrentUserEmail(email);
  }).catch(() => {});
  AsyncStorage.getItem('active_shop_id').then(id => {
    if (id) setActiveShopId(id);
  }).catch(() => {});
  // Load API headers (có auth token)
  getApiHeaders().then(h => setApiAuthHeaders(h as Record<string, string>)).catch(() => {});
  // Kiểm tra online trạng thái
  const checkOnline = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    } else {
      // Trên native: thử fetch ping nhẹ
      fetch(getApiBaseUrl() + '/api/ping', { method: 'HEAD' })
        .then(() => setIsOnline(true))
        .catch(() => setIsOnline(false));
    }
  };
  checkOnline();
  const interval = setInterval(checkOnline, 15000);
  return () => clearInterval(interval);
 }, []);

 useEffect(() => {
 const timer = setTimeout(() => {
 setIsNavReady(true);
}, 150); // Delay 150ms để React Navigation & NativeWind CSS Interop khởi tạo context đầy đủ
 return () => clearTimeout(timer);
}, []);

 const [activeVertical, setActiveVertical] = useState('retail'); // retail, billiards
 const [shopVertical, setShopVertical] = useState<string>('retail');
  const getFirstTabLabel = () => {
    switch (shopVertical) {
      case 'fnb':
        return 'Thực đơn & Gọi món';
      case 'lodging':
        return 'Dịch vụ & Tiện ích';
      case 'sports_court':
      case 'billiards':
        return 'Dịch vụ & Đồ uống';
      default:
        return 'Hàng hóa & Sản phẩm';
    }
  };
 const [cart, setCart] = useState<{[cartItemId: string]: CartItem}>({});
 const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
 const [previewProduct, setPreviewProduct] = useState<any>(null);
 const [previewQuantity, setPreviewQuantity] = useState<number>(1);
 const [selectedVariant, setSelectedVariant] = useState<any>(null);
 const [selectedModifiers, setSelectedModifiers] = useState<any[]>([]);
 const [activeTable, setActiveTable] = useState<any>(null);
 const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [isSavingCart, setIsSavingCart] = useState(false);
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
 const [paymentRows, setPaymentRows] = useState<{id: string; method: string; fund_id: string; amount: number}[]>([]);
 const [isQrModalOpen, setIsQrModalOpen] = useState(false);
 const [qrPayload, setQrPayload] = useState<{amount: number; orderNo: string; fund_id: string} | null>(null);
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
 const [isUpdatingGuestsLoading, setIsUpdatingGuestsLoading] = useState(false);

  // States quản lý ca làm việc (Shift Management)
  const [isShiftEnabled, setIsShiftEnabled] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [isShiftLoading, setIsShiftLoading] = useState(false);
  const [pendingCheckoutAction, setPendingCheckoutAction] = useState<(() => void) | null>(null);

  const handleCheckoutPress = async (action: () => void) => {
    const enabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
    const activeShiftId = await AsyncStorage.getItem('active_shift_id');
    if (enabled && !activeShiftId) {
      setPendingCheckoutAction(() => action);
      setOpeningCashInput('0');
      setIsShiftModalOpen(true);
    } else {
      action();
    }
  };

  const handleShiftOpenConfirm = async () => {
    setIsShiftLoading(true);
    try {
      const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = await getApiBaseUrl();
      const headers = await getApiHeaders();
      const userEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const cash = parseInt(openingCashInput.replace(/\D/g, ''), 10) || 0;
      const nowStr = new Date().toISOString();

      let shiftId = `shift-${activeShopId}-${Date.now()}`;
      let syncStatus = 'pending';

      try {
        const res = await fetch(`${currentUrl}/api/shops/${activeShopId}/shifts`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: activeShopId,
            opening_cash: cash,
          }),
        });
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.id) {
            shiftId = resJson.id;
            syncStatus = 'synced';
          }
        }
      } catch (err) {
        console.warn('Không thể gửi ca mở lên server:', err);
      }

      await db.insert(schema.shop_shifts).values({
        id: shiftId,
        opened_at: nowStr,
        status: 'open',
        opening_cash: cash,
        actual_closing_cash: 0,
        employee_name: userEmail.split('@')[0],
        sync_status: syncStatus,
      }).onConflictDoNothing();

      await AsyncStorage.setItem('active_shift_id', shiftId);
      setIsShiftModalOpen(false);

      if (pendingCheckoutAction) {
        pendingCheckoutAction();
        setPendingCheckoutAction(null);
      }
    } catch (err: any) {
      console.error('Lỗi khi mở ca làm việc:', err);
      Alert.alert('Lỗi', `Không thể mở ca làm việc: ${err.message || err}`);
    } finally {
      setIsShiftLoading(false);
    }
  };

 // Custom Date Picker Modal States
 const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
 const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(0);
 const [pickerTargetField, setPickerTargetField] = useState<'dob' | 'expiry_date'>('dob');
 const [pickerDay, setPickerDay] = useState<number>(27);
 const [pickerMonth, setPickerMonth] = useState<number>(5);
 const [pickerYear, setPickerYear] = useState<number>(2026);
 const [datePickerView, setDatePickerView] = useState<'calendar' | 'year'>('calendar');

 const [isScanSuccessDialogVisible, setIsScanSuccessDialogVisible] = useState(false);
 const [scannedProductInfo, setScannedProductInfo] = useState<any>(null);

 // States cho nghiệp vụ phòng/bàn/sân nâng cao & CRM
 const [checkInTab, setCheckInTab] = useState<'info' | 'guests'>('info');
 const [roomRentalType, setRoomRentalType] = useState<'hourly' | 'daily'>('hourly');
 const [roomGuestCount, setRoomGuestCount] = useState<number>(1);
 const [tableCarts, setTableCarts] = useState<{[tableId: string]: {[cartItemId: string]: CartItem}}>({});
 const [cartOwnerTable, setCartOwnerTable] = useState<any | null>(null);
 const [tableCustomers, setTableCustomers] = useState<{[tableId: string]: any}>({});

 const [activeTableTab, setActiveTableTab] = useState<'billing' | 'guests'>('billing');
 const [lodgingGuests, setLodgingGuests] = useState<LodgingGuest[]>([{name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''}]);
 const [isSyncingTableSession, setIsSyncingTableSession] = useState<boolean>(false);
 const [isOpeningTable, setIsOpeningTable] = useState<boolean>(false);

 // Tự động thay đổi kích thước danh sách khách lưu trú khi thay đổi số khách
 useEffect(() => {
 setLodgingGuests(prev => {
 const current = [...prev];
 if (current.length < roomGuestCount) {
 while (current.length < roomGuestCount) {
 current.push({
 name: '', 
 id_type: 'CCCD', 
 id_number: '', 
 idCard: '',
 expiry_date: '', 
 nationality: 'Việt Nam', 
 dob: '', 
 gender: '', 
 note: '' 
});
}
} else if (current.length > roomGuestCount) {
 return current.slice(0, roomGuestCount);
}
 return current;
});
}, [roomGuestCount]);
 
 // Tự động lưu khách hàng được gán cho từng phòng bàn
 useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveTableCustomers = async () => {
      try {
        await AsyncStorage.setItem('temp_table_customers', JSON.stringify(tableCustomers));
      } catch (err) {
        console.error('Không thể lưu khách hàng phòng bàn:', err);
      }
    };
    saveTableCustomers();
  }, [tableCustomers, isNavReady, isLoading]);

  // Tự động lưu giỏ hàng gọi thêm của từng phòng bàn
  useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveTableCarts = async () => {
      try {
        await AsyncStorage.setItem('temp_table_carts', JSON.stringify(tableCarts));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng phòng bàn:', err);
      }
    };
    saveTableCarts();
  }, [tableCarts, isNavReady, isLoading]);
 
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
    {id: '1', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: finalTotal}
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
    if (!isNavReady || isLoading) return;
    const saveCartToStorage = async () => {
      try {
        await AsyncStorage.setItem('temp_cart', JSON.stringify(cart));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng tạm thời:', err);
      }
    };
    saveCartToStorage();
  }, [cart, isNavReady, isLoading]);

 // 3. Tự động lưu giảm giá, ghi chú và khách hàng được chọn khi thay đổi
useEffect(() => {
    if (!isNavReady || isLoading) return;
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
  }, [discountAmount, orderNote, selectedCustomer, isNavReady, isLoading]);

  const loadPosData = async (isMounted = true) => {
  try {
  if (isMounted) setIsLoading(true);

  const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
  const activeShopIndustry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
  let vertical = activeShopIndustry;

  const enabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
  if (isMounted) setIsShiftEnabled(enabled);
  
  if (isMounted) {
  // Tránh cập nhật state phân hệ ngay lập tức trong chu kỳ focus đầu tiên để không làm mất navigation context
  setTimeout(() => {
  if (isMounted) {
  setShopVertical(vertical);
  setActiveVertical(vertical);
 }
 }, 60);
 }

  // Khôi phục tất cả trạng thái giỏ hàng, ghi chú, CRM tạm từ AsyncStorage của chi nhánh hiện tại
  const savedCart = await AsyncStorage.getItem('temp_cart');
  let parsedCart = {};
  if (savedCart) {
    try {
      const parsed = JSON.parse(savedCart);
      if (Object.keys(parsed).length > 0) parsedCart = parsed;
    } catch (e) {}
  }
  if (isMounted) setCart(parsedCart);

  const savedDiscount = await AsyncStorage.getItem('temp_discount');
  if (isMounted) setDiscountAmount(savedDiscount ? (parseInt(savedDiscount, 10) || 0) : 0);

  const savedNote = await AsyncStorage.getItem('temp_note');
  if (isMounted) setOrderNote(savedNote || '');

  const savedCustomer = await AsyncStorage.getItem('temp_customer');
  let parsedCustomer = null;
  if (savedCustomer) {
    try { parsedCustomer = JSON.parse(savedCustomer); } catch (e) {}
  }
  if (isMounted) setSelectedCustomer(parsedCustomer);

  const savedTableCustomers = await AsyncStorage.getItem('temp_table_customers');
  let parsedTableCustomers = {};
  if (savedTableCustomers) {
    try { parsedTableCustomers = JSON.parse(savedTableCustomers); } catch (e) {}
  }
  if (isMounted) setTableCustomers(parsedTableCustomers);

  const savedTableCarts = await AsyncStorage.getItem('temp_table_carts');
  let parsedTableCarts = {};
  if (savedTableCarts) {
    try { parsedTableCarts = JSON.parse(savedTableCarts); } catch (e) {}
  }
  if (isMounted) setTableCarts(parsedTableCarts);

 let prods = [];
 let cats = [];
 let resources = [];
 let customers = [];
  let funds: any[] = [];

 if (Platform.OS === 'web') {
 // Tải dữ liệu thực tế từ REST API (Next.js) trên môi trường Web để tránh placeholder mock
 try {
 const currentUrl = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const headers = await getApiHeaders();

 // A. Tải danh mục sản phẩm
 const catRes = await fetch(`${currentUrl}/api/shops/${shopId}/categories?limit=500`, {headers});
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
 const prodRes = await fetch(`${currentUrl}/api/shops/${shopId}/products?limit=2000&nocache=true`, {headers});
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
 product_type: prod.product_type || 'simple',
 parent_id: prod.parent_id || null,
 variant_options: typeof prod.variant_options === 'string' ? prod.variant_options : JSON.stringify(prod.variant_options || null),
 modifier_groups: typeof prod.modifier_groups === 'string' ? prod.modifier_groups : JSON.stringify(prod.modifier_groups || null),
};
});
}

 // C. Tải sơ đồ phòng bàn
 const tableRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources?limit=500`, {headers});
 if (tableRes.ok) {
 const tableData = await tableRes.json();
 resources = (tableData.data || []).map((table: any) => {
 const rate = parseInt(table.hourly_rate || '0', 10);
 const isOccupied = table.status === 'occupied' || table.status === 'playing';
 
 let checkInTime = null;
 if (isOccupied) {
 try {
 const metaObj = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
 if (metaObj.check_in) {
 checkInTime = new Date(metaObj.check_in).getTime();
}
} catch (e) {}
 if (!checkInTime) checkInTime = Date.now() - 3600000;
}

 return {
 id: table.id || table.resource_id,
 name: table.name || '',
 type: table.type || 'table',
 status: isOccupied ? 'occupied' : 'available',
 current_order_id: table.current_order_id || null,
 hourly_rate: isNaN(rate) ? 0 : rate,
 zone: table.zone || null,
 startTime: checkInTime,
 metadata: typeof table.metadata === 'object' ? JSON.stringify(table.metadata) : (table.metadata || '{}'),
};
});
}

 // D. Tải danh sách khách hàng
 const custRes = await fetch(`${currentUrl}/api/shops/${shopId}/customers?limit=2000`, {headers});
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
 {id: 'p1', name: 'Cà phê Phin Sữa Đá', sell_price: 29000, stock_qty: 99, category_id: 'c1', unit: 'ly'},
 {id: 'p2', name: 'Trà Đào Cam Sả', sell_price: 39000, stock_qty: 45, category_id: 'c1', unit: 'ly'},
 {id: 'p3', name: 'Bánh Mì Pate Xá Xíu', sell_price: 25000, stock_qty: 20, category_id: 'c2', unit: 'cái'},
 {id: 'p4', name: 'Nước suối Aquafina', sell_price: 15000, stock_qty: 150, category_id: 'c3', unit: 'chai'}
 ];
}
 if (cats.length === 0) {
 cats = [
 {id: 'c1', name: 'Đồ uống'},
 {id: 'c2', name: 'Thức ăn'},
 {id: 'c3', name: 'Tiện ích'}
 ];
}
 if (resources.length === 0) {
 resources = [
 {id: 't1', name: 'Bàn Bi-a 01', type: 'table', status: 'available', hourly_rate: 60000, zone: 'Khu A'},
 {id: 't2', name: 'Bàn Bi-a 02', type: 'table', status: 'occupied', hourly_rate: 60000, zone: 'Khu A', startTime: Date.now() - 45 * 60000},
 {id: 't3', name: 'Bàn VIP 01', type: 'table', status: 'available', hourly_rate: 90000, zone: 'Phòng VIP'}
 ];
}
 if (customers.length === 0) {
 customers = [
 {id: 'cust1', name: 'Nguyễn Văn Minh', phone: '0901234567', customer_type: 'VIP'},
 {id: 'cust2', name: 'Trần Thị Hằng', phone: '0987654321', customer_type: 'Thân thiết'}
 ];
}
} else {
 // SQLite Native
 prods = await db.select().from(schema.products);
 cats = await db.select().from(schema.categories);
 resources = await db.select().from(schema.location_resources);
 customers = await db.select().from(schema.customers);
      funds = await db.select().from(schema.paymentFunds);
}

 if (isMounted) {
 setProductsList(prods);
 setCategoriesList(cats);
 setTables(resources);
 setCustomersList(customers);
      setPaymentFundsList(funds);
 setIsLoading(false);
}
} catch (error) {
 console.error('Lỗi khi tải dữ liệu POS:', error);
 if (isMounted) setIsLoading(false);
}
};

 // Tải dữ liệu thực tế & trạng thái tạm khi màn hình POS nhận focus
  useFocusEffect(
    useCallback(() => {
      if (!isNavReady) return;
      let isMounted = true;
      loadPosData(isMounted);
      return () => {
        isMounted = false;
      };
    }, [isNavReady])
  );

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
 const calculateBilling = (table: any, customCheckoutTime?: Date) => {
 if (!table.startTime) return {hours: 0, minutes: 0, cost: 0, label: '0h 0p', details: ''};
 
 // Phân tích cấu hình metadata nâng cao
 let rmd: any = {};
 try {
 rmd = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
} catch (e) {
 console.warn('Không thể parse metadata của phòng bàn:', e);
}
 
 const rentalType = rmd.rental_type || 'hourly';
 
 if (rentalType === 'overnight') {
 const overnightRate = Number(rmd.overnight_rate) || Number(table.hourly_rate) || 0;
 return {
 hours: 0,
 minutes: 0,
 cost: overnightRate,
 label: 'Qua đêm',
 details: 'Trọn gói qua đêm'
};
}
 
 const hourlyRate = Number(table.hourly_rate) || 0;
 const checkInDate = new Date(table.startTime);
 const checkOutDate = customCheckoutTime || new Date();
 
 const pricingResult = calculateHourlyBilling({
 checkIn: checkInDate,
 checkOut: checkOutDate,
 standardRate: hourlyRate,
 config: rmd.advanced_pricing
});

 const diffMs = Math.max(0, checkOutDate.getTime() - checkInDate.getTime());
 const totalMinutes = Math.ceil(diffMs / 60000);
 const hours = Math.floor(totalMinutes / 60);
 const minutes = totalMinutes % 60;
 
 return {
 hours,
 minutes,
 cost: pricingResult.totalAmount,
 label: pricingResult.durationLabel,
 details: pricingResult.detailsLabel
};
};

 // Gom nhóm phòng bàn theo khu vực/tầng
 const groupedZones = React.useMemo(() => {
 const groups: {[key: string]: any[]} = {};
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
  setPreviewProduct(product);
  setPreviewQuantity(1);
  setSelectedVariant(null);
  setSelectedModifiers([]);
  setIsPreviewModalOpen(true);
 };

 const handleConfirmAddToCart = () => {
  if (!previewProduct) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  
  const variantLabel = selectedVariant ? selectedVariant.option : undefined;
  const modifierTotal = selectedModifiers.reduce((sum, m) => sum + (Number(m.price_adj) || 0), 0);
  const modifiersHash = selectedModifiers.map(m => m.option).sort().join(',');
  
  const cartItemId = `${previewProduct.id}_${variantLabel || 'none'}_${modifiersHash || 'none'}`;
  
  setCart(prev => {
   const existing = prev[cartItemId];
   return {
    ...prev,
    [cartItemId]: {
     productId: previewProduct.id,
     name: previewProduct.name,
     price: previewProduct.sell_price,
     quantity: existing ? existing.quantity + previewQuantity : previewQuantity,
     variant_label: variantLabel,
     modifiers: selectedModifiers,
     modifier_total: modifierTotal
    }
   };
  });
  setIsPreviewModalOpen(false);
 };

 const removeFromCart = (cartItemId: string) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setCart(prev => {
   const newCart = { ...prev };
   delete newCart[cartItemId];
   return newCart;
  });
 };

 const updateCartItemQuantity = (cartItemId: string, newQty: number) => {
  if (newQty < 1) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setCart(prev => {
   const existing = prev[cartItemId];
   if (!existing) return prev;
   return {
    ...prev,
    [cartItemId]: {
     ...existing,
     quantity: newQty
    }
   };
  });
 };

 // Tính tổng
 const getCartTotal = () => {
  return Object.values(cart).reduce((sum, item) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0);
 };
 const getCartCount = () => {
  return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
 };

 // Các hàm tiện ích đồng bộ hóa thời gian thực trực tuyến cho phòng/bàn
 const fetchActiveTableSessionOnline = async (tableId: string, orderId: string | null) => {
 try {
 const currentUrl = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const headers = await getApiHeaders();
 
 // A. Tải chi tiết vị trí (room) từ cloud để lấy metadata mới nhất
 let latestResource: any = null;
 try {
 const resourceRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}`, {headers});
 if (resourceRes.ok) {
 latestResource = await resourceRes.json();
}
} catch (resErr) {
 console.log('Không thể tải metadata phòng từ Cloud:', resErr);
}

 let resolvedOrderId = orderId;
 let orderData: any = null;
 
 // TỰ ĐỘNG CHỮA LÀNH (Self-heal): Nếu không có orderId cục bộ nhưng trạng thái là đang ở/chơi
 // thì truy vấn danh sách order in_progress trên server để đối chiếu resource_id.
 if (!resolvedOrderId) {
 const ordersRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100`, {headers});
 if (ordersRes.ok) {
 const ordersData = await ordersRes.json();
 const list = ordersData.data || [];
 const matched = list.find((o: any) => {
 try {
 const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {});
 return meta.resource_id === tableId;
} catch (e) {
 return false;
}
});
 if (matched) {
 resolvedOrderId = matched.id;
 orderData = matched;
}
}
}
 
 if (!resolvedOrderId) {
 return latestResource ? {order: null, items: [], resource: latestResource} : null;
}
 
 if (!orderData) {
 const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/${resolvedOrderId}`, {headers});
 if (!orderRes.ok) {
 return latestResource ? {order: null, items: [], resource: latestResource} : null;
}
 orderData = await orderRes.json();
}
 
 // 2. Tải chi tiết các Món ăn/Dịch vụ gọi kèm của đơn hàng
 const itemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${resolvedOrderId}&limit=200`, {headers});
 if (!itemsRes.ok) {
 return {order: orderData, items: [], resource: latestResource};
}
 const itemsData = await itemsRes.json();
 const rawItems = itemsData.data || [];
 
 return {order: orderData, items: rawItems, resource: latestResource};
} catch (err) {
 console.warn('Lỗi khi tải chi tiết phòng/bàn từ server:', err);
 return null;
}
};

 const syncOrderItemsOnline = async (orderId: string, cartItems: any) => {
 try {
 const currentUrl = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const headers = await getApiHeaders();
 
 // Tải món hiện tại trên server
 const serverItemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${orderId}&limit=200`, {headers});
 if (!serverItemsRes.ok) return false;
 const serverItemsData = await serverItemsRes.json();
 const serverItems = serverItemsData.data || [];
 
 const serverItemsMap = new Map<string, any>();
 for (const item of serverItems) {
 serverItemsMap.set(item.product_id, item);
}
 
 // Đồng bộ hóa vi sai (Differential Sync)
 let index = 1;
 for (const [prodId, cartItem] of Object.entries(cartItems) as [string, any][]) {
 if (prodId === 'TIME_CHARGE') continue; // Tiền giờ ảo không đồng bộ lên mục gọi món
 const existing = serverItemsMap.get(prodId);
 const lineTotal = cartItem.price * cartItem.quantity;
 const lineNo = String(index++);
 
 if (existing) {
 // Nếu đã tồn tại nhưng sai số lượng, cập nhật lên server
 if (parseInt(existing.qty, 10) !== cartItem.quantity || parseInt(existing.unit_price, 10) !== cartItem.price) {
 await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${existing.id}`, {
 method: 'PUT',
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({
 qty: String(cartItem.quantity),
 line_total: String(lineTotal),
 unit_price: String(cartItem.price)
})
});
}
 serverItemsMap.delete(prodId);
} else {
 // Chưa tồn tại thì thêm mới lên server (line_no là chuỗi bắt buộc của Zod Schema)
 await fetch(`${currentUrl}/api/shops/${shopId}/order-items`, {
 method: 'POST',
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({
 order_id: orderId,
 line_no: lineNo,
 product_id: prodId,
 product_name: cartItem.name,
 qty: String(cartItem.quantity),
 unit_price: String(cartItem.price),
 line_total: String(lineTotal),
 line_discount: '0'
})
});
}
}
 
 // Xóa món đã bị bỏ ra khỏi giỏ
 for (const [prodId, serverItem] of serverItemsMap.entries()) {
 await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${serverItem.id}`, {
 method: 'DELETE',
 headers
});
}
 
 return true;
} catch (err) {
 console.warn('Lỗi khi đồng bộ món lên server:', err);
 return false;
}
};

 // Mở bàn
 // Mở bàn
 const handleTablePress = async (table: any) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 if (table.status === 'playing' || table.status === 'occupied') {
 // 1. Mở modal ngay lập tức với dữ liệu cục bộ hiện có để mang lại trải nghiệm tức thì (Zero-Lag)
 setActiveTable(table);
 setIsSyncingTableSession(true);
 setActiveTableTab('billing'); // Reset tab về billing mặc định khi mở phòng bàn
 
 // Khôi phục thông tin khách lưu trú từ cache SQLite cục bộ trước khi sync
 let localMeta: any = {};
 try {
 localMeta = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
} catch (e) {}
 const cachedGuests = localMeta.guests_list || [];
 setRoomGuestCount(localMeta.num_guests || Math.max(1, cachedGuests.length));
 setLodgingGuests(cachedGuests.length > 0 
 ? cachedGuests.map((g: any) => ({
 id: g.id || undefined,
 name: g.name || '',
 id_type: g.id_type || g.idType || 'CCCD',
 id_number: g.id_number || g.idNumber || g.idCard || g.id_card || '',
 idCard: g.id_number || g.idNumber || g.idCard || g.id_card || '',
 expiry_date: g.expiry_date || g.expiryDate || '',
 nationality: g.nationality || 'Việt Nam',
 dob: g.dob || '',
 gender: g.gender || '',
 note: g.note || ''
})) 
 : [{name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''}]);
 
 // 2. Gọi đồng bộ chạy ngầm chỉ cho duy nhất phòng/bàn này để lấy món ăn & đơn hàng mới nhất từ Cloud
 try {
 const onlineSession = await fetchActiveTableSessionOnline(table.id, table.current_order_id || null);
 setIsSyncingTableSession(false);
 
 if (onlineSession) {
 // Bắt trạng thái đơn hàng/phòng đã thanh toán và giải phóng trên Cloud -> Tự động chữa lành cục bộ!
 if ('isFinished' in onlineSession && onlineSession.isFinished) {
 setIsSyncingTableSession(false);
 setActiveTable(null); // Đóng modal ngay lập tức
 
 // A. Cập nhật SQLite nội địa sang trống
 if (Platform.OS !== 'web') {
 try {
 await db
 .update(schema.location_resources)
 .set({status: 'available', current_order_id: null, startTime: null})
 .where(eq(schema.location_resources.id, table.id));
} catch (e) {}
}
 
 // B. Cập nhật state cục bộ sang trống
 setTables(prev => prev.map(t => t.id === table.id ? {...t, status: 'available', current_order_id: null, startTime: null} : t));
 setTableCarts(prev => {
 const copy = {...prev};
 delete copy[table.id];
 return copy;
});
 
 showToast("Phòng đã được thanh toán và trả trên hệ thống!", "info");
 return;
}

 const {order, items, resource} = onlineSession;
 let parsedMeta: any = {};
 if (order) {
 try {
 parsedMeta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {});
} catch (e) {}
}

 let resourceMeta: any = {};
 if (resource) {
 try {
 resourceMeta = typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : (resource.metadata || {});
} catch (e) {}
}

 let tableMetaObj: any = {};
 try {
 tableMetaObj = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
} catch (e) {}

 // Find the first metadata source that contains a non-empty guests list
 const onlineGuests = 
 (parsedMeta.guests_list && parsedMeta.guests_list.length > 0) ? parsedMeta.guests_list :
 (resourceMeta.guests_list && resourceMeta.guests_list.length > 0) ? resourceMeta.guests_list :
 (tableMetaObj.guests_list && tableMetaObj.guests_list.length > 0) ? tableMetaObj.guests_list : [];

 const rentalType = parsedMeta.rental_type || resourceMeta.rental_type || tableMetaObj.rental_type || 'hourly';
 const numGuests = (onlineGuests.length > 0) ? onlineGuests.length : (parsedMeta.num_guests || resourceMeta.num_guests || tableMetaObj.num_guests || 1);
 const checkInVal = parsedMeta.check_in || resourceMeta.check_in || tableMetaObj.check_in;
 const checkInTime = checkInVal ? new Date(checkInVal).getTime() : (table.startTime || Date.now());

 const updatedTable = {
 ...table,
 current_order_id: order ? order.id : table.current_order_id, // Tự động chữa lành ID đơn hàng nếu thiếu
 startTime: checkInTime,
 metadata: JSON.stringify({
 ...tableMetaObj,
 rental_type: rentalType,
 num_guests: numGuests,
 check_in: checkInVal,
 guests_list: onlineGuests
})
};

 // Gán khách hàng cho phòng bàn cục bộ
  if (order && order.customer_id) {
    const localCust = customersList.find(c => c.id === order.customer_id);
    const phoneVal = localCust?.phone || parsedMeta.customer_phone || "";
    const addressVal = localCust?.address || parsedMeta.customer_address || "";
    setTableCustomers(prev => ({
      ...prev,
      [table.id]: {
        id: order.customer_id, 
        name: order.customer_name || 'Khách lẻ',
        phone: phoneVal,
        address: addressVal
      }
    }));
  }

 // Cập nhật tables list state cục bộ và ghi SQLite ngoại tuyến để tự chữa lành
 setTables(prev => prev.map(t => t.id === table.id ? updatedTable : t));
 if (Platform.OS !== 'web') {
 try {
 await db
 .update(schema.location_resources)
 .set({current_order_id: order ? order.id : table.current_order_id, startTime: checkInTime, metadata: updatedTable.metadata})
 .where(eq(schema.location_resources.id, table.id));
} catch (e) {}
}
 
 // Đồng bộ món ăn của bàn về state cục bộ
 const mappedCart: any = {};
 if (items) {
 for (const item of items) {
 mappedCart[item.product_id] = {
 productId: item.product_id,
 name: item.product_name,
 price: parseInt(item.unit_price || '0', 10),
 quantity: parseInt(item.qty || '1', 10)
};
}
}
 
 setTableCarts(prev => ({
 ...prev,
 [table.id]: mappedCart
}));
 
 // Khôi phục thông tin khách lưu trú từ Cloud
 setRoomGuestCount(numGuests);
 setLodgingGuests(onlineGuests.length > 0 
 ? onlineGuests.map((g: any) => ({
 id: g.id || undefined,
 name: g.name || '',
 id_type: g.id_type || g.idType || 'CCCD',
 id_number: g.id_number || g.idNumber || g.idCard || g.id_card || '',
 idCard: g.id_number || g.idNumber || g.idCard || g.id_card || '',
 expiry_date: g.expiry_date || g.expiryDate || '',
 nationality: g.nationality || 'Việt Nam',
 dob: g.dob || '',
 gender: g.gender || '',
 note: g.note || ''
})) 
 : [{name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: ''}]);
 
 setActiveTable(updatedTable);
}
} catch (err) {
 console.warn('Lỗi khi đồng bộ nền phiên hoạt động:', err);
}
} else {
 setSelectedTableForOpen(table);
 setIsTableOpenDialogVisible(true);
}
};

 // Cập nhật thông tin khách lưu trú của phòng đang ở
 const handleUpdateActiveRoomGuests = async () => {
 if (!activeTable) return;
 
 // Dialog xác nhận an toàn trước khi cập nhật
 const confirmUpdate = Platform.OS === 'web'
 ? window.confirm("Bạn có chắc chắn muốn cập nhật thông tin khách lưu trú này?")
 : await new Promise<boolean>((resolve) => {
 Alert.alert(
 "Xác nhận Cập nhật",
 "Bạn có muốn cập nhật danh sách khách lưu trú này lên hệ thống?",
 [
 {text: "Hủy bỏ", onPress: () => resolve(false), style: "cancel"},
 {text: "Đồng ý", onPress: () => resolve(true)}
 ]
 );
});

 if (!confirmUpdate) return;

 try {
 setIsUpdatingGuestsLoading(true);
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 let syncSucceeded = false;

 // 1. Chuẩn hóa metadata khách lưu trú
 const updatedGuests = lodgingGuests
 .filter(g => g.name || g.id_number || g.idCard)
 .map(g => ({
 id: g.id || undefined,
 name: g.name || '',
 id_type: g.id_type || 'CCCD',
 id_number: g.id_number || g.idCard || '',
 idCard: g.id_number || g.idCard || '',
 expiry_date: g.expiry_date || '',
 nationality: g.nationality || 'Việt Nam',
 dob: g.dob || '',
 gender: g.gender || '',
 note: g.note || ''
}));

 // Đọc metadata hiện tại và ghi đè
 let currentMeta: any = {};
 try {
 currentMeta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
} catch (e) {}

 const updatedMeta = JSON.stringify({
 ...currentMeta,
 resource_id: activeTable.id,
 resource_name: activeTable.name,
 check_in: activeTable.startTime || new Date().toISOString(),
 num_guests: roomGuestCount,
 rental_type: roomRentalType,
 guests_list: updatedGuests
});

 // 2. Offline-First: Cập nhật SQLite nội địa và State
 if (Platform.OS === 'web') {
 setTables(prev => prev.map(t => t.id === activeTable.id ? {...t, metadata: updatedMeta} : t));
} else {
 await db
 .update(schema.location_resources)
 .set({metadata: updatedMeta})
 .where(eq(schema.location_resources.id, activeTable.id));
 const updated = await db.select().from(schema.location_resources);
 setTables(updated);
}

 // Cập nhật thông tin phòng đang mở để đồng bộ trực quan tức thì
 setActiveTable((prev: any) => prev ? {...prev, metadata: updatedMeta} : null);

 // 3. Online Sync lên Cloud Next.js nếu đang có mạng
 try {
 const currentUrl = getApiBaseUrl();
 const headers = await getApiHeaders();

 // A. PATCH location-resources metadata
 const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
 method: 'PATCH',
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({
 metadata: updatedMeta
}),
});

 // B. PUT active order metadata nếu tồn tại current_order_id
 if (activeTable.current_order_id) {
 await fetch(`${currentUrl}/api/shops/${shopId}/orders/${activeTable.current_order_id}`, {
 method: 'PUT',
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({
 metadata: updatedMeta
})
});
}

 if (patchRes.ok) {
 syncSucceeded = true;
}
} catch (syncErr) {
 console.log('Mất mạng hoặc lỗi server, bỏ qua đồng bộ metadata khách trực tuyến:', syncErr);
}

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 if (syncSucceeded) {
 showToast("Cập nhật thông tin khách lưu trú thành công!", "success");
} else {
 showToast("Đã cập nhật thông tin khách ngoại tuyến!", "info");
}
} catch (err) {
 console.error('Không thể cập nhật khách lưu trú:', err);
 showToast("Có lỗi xảy ra khi cập nhật khách!", "error");
} finally {
 setIsUpdatingGuestsLoading(false);
}
};

 // Trình mở DatePicker
 const handleDatePickerOpen = (index: number, field: 'dob' | 'expiry_date', currentValue: string) => {
 setPickerTargetIndex(index);
 setPickerTargetField(field);

 let d = 27, m = 5, y = 2026;
 if (currentValue && currentValue.includes('/')) {
 const parts = currentValue.split('/');
 if (parts.length === 3) {
 d = parseInt(parts[0]) || 27;
 m = parseInt(parts[1]) || 5;
 y = parseInt(parts[2]) || 2026;
}
} else {
 if (field === 'expiry_date') {
 y = 2031; // Hạn giấy tờ mặc định +5 năm
} else {
 y = 1995; // Ngày sinh mặc định 1995
}
}

 setPickerDay(d);
 setPickerMonth(m);
 setPickerYear(y);
 setDatePickerView('calendar');
 setIsDatePickerOpen(true);
};

 // Mở bàn
 const handleConfirmOpenTable = async () => {
    if (!selectedTableForOpen) return;
    try {
      const nowTime = Date.now();
      let syncSucceeded = false;
      let orderId = `ORD-T-INPROG-${Date.now()}`;

      let tMeta: any = {};
      try {
        tMeta = selectedTableForOpen.metadata ? JSON.parse(selectedTableForOpen.metadata) : {};
      } catch (e) {}

      // 1. Chuẩn hóa metadata nhận phòng để dùng chung cho cả Server và SQLite
      const openTableMeta = JSON.stringify({
        resource_id: selectedTableForOpen.id,
        resource_name: selectedTableForOpen.name,
        check_in: new Date(nowTime).toISOString(),
        num_guests: roomGuestCount,
        rental_type: roomRentalType,
        advanced_pricing: tMeta.advanced_pricing,
        overnight_rate: tMeta.overnight_rate,
        weekend_rate: tMeta.weekend_rate,
        room_class: tMeta.room_class,
        bed_type: tMeta.bed_type,
        guests_list: lodgingGuests
          .filter(g => g.name || g.id_number || g.idCard)
          .map(g => ({
            id: g.id || undefined,
            name: g.name || '',
            id_type: g.id_type || 'CCCD',
            id_number: g.id_number || g.idCard || '',
            idCard: g.id_number || g.idCard || '',
            expiry_date: g.expiry_date || '',
            nationality: g.nationality || 'Việt Nam',
            dob: g.dob || '',
            gender: g.gender || '',
            note: g.note || ''
          })),
      });

      // 2. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng (cho cả Web lẫn Native SQLite)
      try {
        const currentUrl = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const headers = await getApiHeaders();
        
        // A. Tạo order in_progress trên Next.js Server
        const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders`, {
          method: 'POST',
          headers: {...headers, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            status: 'in_progress',
            channel: 'pos',
            customer_id: selectedCustomer?.id || '',
            customer_name: selectedCustomer?.name || 'Khách lẻ',
            branch_id: shopId,
            employee_id: currentUserEmail,
            subtotal: '0',
            total_amount: '0',
            paid_amount: '0',
            resource_id: selectedTableForOpen.id,
            metadata: openTableMeta
          }),
        });

        if (orderRes.ok) {
          const createdOrder = await orderRes.json();
          orderId = createdOrder.id || createdOrder.order_id;

          // B. Cập nhật vị trí sang occupied
          const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForOpen.id}`, {
            method: 'PATCH',
            headers: {...headers, 'Content-Type': 'application/json'},
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

      // 3. Ghi đè vào DB Cục bộ hoặc State cục bộ
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForOpen.id ? {
          ...t, 
          status: 'occupied', 
          current_order_id: orderId, 
          startTime: nowTime,
          metadata: openTableMeta
        } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set({
            status: 'occupied', 
            current_order_id: orderId,
            startTime: nowTime,
            metadata: openTableMeta
          })
          .where(eq(schema.location_resources.id, selectedTableForOpen.id));
        
        // Nhập đơn hàng in_progress ngoại tuyến nếu chưa đồng bộ thành công
        if (!syncSucceeded) {
          const activeShiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
          await db.insert(schema.orders).values({
            id: orderId,
            order_no: `HD-T-${Date.now().toString().substring(9)}`,
            status: 'in_progress',
            customer_id: selectedCustomer?.id || null,
            customer_name: selectedCustomer?.name || 'Khách lẻ',
            total_amount: 0,
            paid_amount: 0,
            payment_method: '',
            created_at: new Date(nowTime).toISOString(),
            shift_id: activeShiftId,
            sync_status: 'pending',
            note: '',
            discount_amount: 0,
            metadata: openTableMeta,
          });
        }
        
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
 showToast(`Đã nhận ${shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : 'Bàn'} & Đồng bộ thành công!`, 'success');
} else {
 showToast(`Nhận ${shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : 'Bàn'} ngoại tuyến thành công!`, 'info');
}
} catch (err) {
 console.error('Không thể mở bàn bi-a:', err);
 showToast('Có lỗi xảy ra khi nhận phòng!', 'error');
}
};

     // Thay đổi số lượng món ăn/dịch vụ của phòng bàn trực tiếp
  const handleIncreaseTableItemQty = (tableId: string, cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTableCarts(prev => {
      const tableCart = prev[tableId] || {};
      const item = tableCart[cartItemId];
      if (!item) return prev;
      const updatedCart = {
        ...tableCart,
        [cartItemId]: {
          ...item,
          quantity: item.quantity + 1
        }
      };

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, updatedCart);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleDecreaseTableItemQty = (tableId: string, cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTableCarts(prev => {
      const tableCart = prev[tableId] || {};
      const item = tableCart[cartItemId];
      if (!item) return prev;
      const newQty = Math.max(1, item.quantity - 1);
      const updatedCart = {
        ...tableCart,
        [cartItemId]: {
          ...item,
          quantity: newQty
        }
      };

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, updatedCart);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleRemoveTableItem = (tableId: string, cartItemId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setTableCarts(prev => {
      const tableCart = { ...(prev[tableId] || {}) };
      delete tableCart[cartItemId];

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, tableCart);
      }

      return {
        ...prev,
        [tableId]: tableCart
      };
    });
  };

    const syncCustomerUpdate = async (orderId: string, custId: string, custName: string, custPhone: string) => {
    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();
      
      // Lấy metadata hiện tại
      let currentMeta: any = {};
      if (activeTable && activeTable.metadata) {
        try {
          currentMeta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
        } catch (e) {}
      }
      
      const updatedMeta = JSON.stringify({
        ...currentMeta,
        customer_phone: custPhone
      });

      // Cập nhật SQLite metadata cục bộ
      if (Platform.OS !== 'web' && activeTable) {
        await db.update(schema.location_resources)
          .set({ metadata: updatedMeta })
          .where(eq(schema.location_resources.id, activeTable.id));
      }

      // Cập nhật state activeTable và tables
      setActiveTable((prev: any) => prev ? { ...prev, metadata: updatedMeta } : null);
      setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, metadata: updatedMeta } : t));

      // Gọi PUT đồng bộ lên server Next.js
      await fetch(`${currentUrl}/api/shops/${shopId}/orders/${orderId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: custId,
          customer_name: custName,
          metadata: updatedMeta
        })
      });
    } catch (e) {
      console.warn('Lỗi khi đồng bộ khách hàng đại diện lên server:', e);
    }
  };

  const handleUpdateTableCustomer = async (tableId: string, customer: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!customer) {
      // Xóa khách hàng đại diện -> đưa về Khách lẻ
      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[tableId];
        return copy;
      });
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        await syncCustomerUpdate(activeTable.current_order_id, 'C-DEFAULT-RETAIL', 'Khách lẻ', '');
      }
    } else {
      // Gán khách hàng đại diện mới
      setTableCustomers(prev => ({
        ...prev,
        [tableId]: customer
      }));
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        await syncCustomerUpdate(activeTable.current_order_id, customer.id, customer.name, customer.phone || '');
      }
    }
  };

  // Bấm thanh toán phòng/bàn
 const triggerPayTable = (table: any) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 
 // 1. Tính toán tiền giờ/qua đêm lưu trú nâng cao sử dụng @oni/core
 const billing = calculateBilling(table);
 
 // 2. Chuyển tiền giờ thành sản phẩm TIME_CHARGE ảo đặc biệt
 const billingName = table.type === 'room' 
 ? `Tiền phòng - ${table.name} (${billing.label})` 
 : `Tiền giờ - ${table.name} (${billing.label})`;
 
 const tableCartItems = tableCarts[table.id] || {};
 const newCart: any = {...tableCartItems};
 
 if (billing.cost > 0) {
 newCart['TIME_CHARGE'] = {
 productId: 'TIME_CHARGE',
 name: billingName,
 price: billing.cost,
 quantity: 1,
 modifier_total: 0
};
}
 
 // 3. Thiết lập giỏ hàng bán lẻ dùng chung
 setCart(newCart);
 setCartOwnerTable(table);
 setSelectedCustomer(tableCustomers[table.id] || null);
 setDiscountAmount(0);
 setOrderNote('');
 
 // 4. Thiết lập phương thức thanh toán mặc định tương đương tổng tiền giỏ hàng
 const totalCartValue = Math.max(0, Object.values(newCart).reduce((sum: number, item: any) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0));
 setPaymentRows([{id: 'pay-cash', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: totalCartValue}]);
 
 // 5. Mở modal giỏ hàng chính để thanh toán hệ thống
 handleCheckoutPress(() => {
   setIsCartModalOpen(true);
   setActiveTable(null); // Đóng modal sơ đồ phòng bàn hiện tại
 });
};

 // Xác nhận Thanh toán bàn chơi / phòng lưu trú (Unified Flow)
 const handlePayTableConfirmUnified = async (
 customer: any,
 discount: number,
 note: string,
 payments: {id: string; method: string; fund_id: string; amount: number}[]
 ) => {
 if (!cartOwnerTable) return;
 setIsPayingTableLoading(true);
 try {
 const selectedTableForPay = cartOwnerTable;
 const billing = calculateBilling(selectedTableForPay);
 const tableCartItems = tableCarts[selectedTableForPay.id] || {};
 
 const itemsCost = Object.values(tableCartItems).reduce((sum, item) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0);
 const subtotal = billing.cost + itemsCost;
 const totalAmount = Math.max(0, subtotal - discount);
 const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);

 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
 const orderId = `ORD-T-${Date.now()}`;
 const orderNo = `HD-${shopVertical === 'lodging' ? '🏩' : '🎱'}-${Date.now().toString().substring(9)}`;
 const nowStr = new Date().toISOString();
  let syncSucceeded = false;
  let serverOrderNo = orderNo;

 const paymentMethodString = JSON.stringify(payments.map(p => {
    const fund = paymentFundsList.find(f => f.id === p.fund_id);
    return {
      method: p.method,
      amount: p.amount,
      meta: {
        fund_id: p.fund_id,
        fund_name: fund ? fund.name : ''
      }
    };
  }));

 // A. Lưu vào cơ sở dữ liệu SQLite cục bộ (Offline-First)
 if (Platform.OS === 'web') {
 setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? {...t, status: 'available', startTime: null} : t));
} else {
   await db.insert(schema.orders).values({
  id: orderId,
  order_no: orderNo,
  status: 'completed',
  customer_name: customer?.name || 'Khách lẻ',
  customer_id: customer?.id || null,
  total_amount: totalAmount,
  paid_amount: paidSum,
  payment_method: paymentMethodString,
  created_at: nowStr,
  shift_id: shiftId,
  sync_status: 'pending',
  note: note,
  discount_amount: discount,
  metadata: JSON.stringify({
    resource_id: selectedTableForPay.id,
    resource_name: selectedTableForPay.name,
    billing_cost: billing.cost,
    billing_duration: billing.label,
    check_out: nowStr,
    rental_type: selectedTableForPay.metadata ? JSON.parse(selectedTableForPay.metadata).rental_type : 'hourly',
    server_order_id: selectedTableForPay.current_order_id || ''
  }),
 });

 if (billing.cost > 0) {
 await db.insert(schema.order_items).values({
 id: `ORDI-${orderId}-time`,
 order_id: orderId,
 product_id: 'billiard-time',
 product_name: selectedTableForPay.type === 'room' 
 ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})` 
 : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
 qty: 1,
 unit_price: billing.cost,
 line_total: billing.cost,
});
}

 // Thêm các món ăn/dịch vụ gọi kèm vào SQLite order_items
 for (const [prodId, item] of Object.entries(tableCartItems)) {
 await db.insert(schema.order_items).values({
 id: `ORDI-${orderId}-${prodId}`,
 order_id: orderId,
 product_id: prodId,
 product_name: item.name,
 qty: item.quantity,
 unit_price: item.price,
 line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
});
}

 await db
 .update(schema.location_resources)
 .set({status: 'available', startTime: null, current_order_id: null})
 .where(eq(schema.location_resources.id, selectedTableForPay.id));

 const updated = await db.select().from(schema.location_resources);
 setTables(updated);
}

 // B. Đồng bộ trực tiếp lên Cloud Next.js Server nếu đang có mạng
 try {
 const currentUrl = getApiBaseUrl();
 const headers = await getApiHeaders();

 const payload = {
 local_order_id: orderId,
 server_order_id: selectedTableForPay.current_order_id || '', 
 order: {
 status: 'completed',
 channel: 'pos',
 customer_id: customer?.id || '',
 customer_name: customer?.name || 'Khách lẻ',
 branch_id: shopId,
 employee_id: currentUserEmail,
 subtotal: subtotal,
 discount_amount: discount,
 tax_amount: 0,
 total_amount: totalAmount,
 paid_amount: paidSum,
 debt_amount: Math.max(0, totalAmount - paidSum),
 note: note || `Thanh toán phòng/bàn từ di động.`,
 metadata: JSON.stringify({
 resource_id: selectedTableForPay.id,
 resource_name: selectedTableForPay.name,
 billing_cost: billing.cost,
 billing_duration: billing.label,
 check_out: nowStr,
 rental_type: selectedTableForPay.metadata ? JSON.parse(selectedTableForPay.metadata).rental_type : 'hourly'
})
},
 items: [
 ...(billing.cost > 0 ? [{
 product_id: 'billiard-time',
 product_name: selectedTableForPay.type === 'room' 
 ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})` 
 : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
 qty: 1,
 unit_price: billing.cost,
 discount_amount: 0,
 line_total: billing.cost,
}] : []),
 ...Object.entries(tableCartItems).map(([prodId, item]: [string, any]) => ({
 product_id: item.productId,
 product_name: item.name,
 qty: item.quantity,
 unit_price: (item.price + (item.modifier_total || 0)),
 discount_amount: 0,
 line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
}))
 ],
 payments: payments.map(p => {
    const fund = paymentFundsList.find(f => f.id === p.fund_id);
    return {
      method: p.method,
      amount: p.amount,
      meta: {
        fund_id: p.fund_id,
        fund_name: fund ? fund.name : ''
      }
    };
  }),
 stock_movements: Object.entries(tableCartItems).map(([prodId, item]: [string, any]) => ({
 type: 'sale_out',
 product_id: item.productId,
 qty: -item.quantity,
 branch_id: shopId,
}))
};

 const syncRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
  method: 'POST',
  headers: {...headers, 'Content-Type': 'application/json'},
  body: JSON.stringify(payload),
 });

  if (syncRes.ok) {
    const syncData = await syncRes.json().catch(() => ({}));
    if (syncData.order_no) serverOrderNo = syncData.order_no;
 // Cập nhật vị trí sang available trên Server Cloud
 const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForPay.id}`, {
 method: 'PATCH',
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({
 status: 'available',
 current_order_id: '',
 startTime: null
}),
});

 if (patchRes.ok) {
      syncSucceeded = true;
      if (Platform.OS !== 'web' && syncData.order_id) {
        const serverId = syncData.order_id;
        if (serverId !== orderId) {
          await db.update(schema.order_items)
            .set({ order_id: serverId })
            .where(eq(schema.order_items.order_id, orderId));
        }
        await db.update(schema.orders)
          .set({ id: serverId, order_no: syncData.order_no || orderNo, sync_status: 'synced', reference_no: orderId })
          .where(eq(schema.orders.id, orderId));
      }
    }
}
} catch (syncErr) {
 console.log('Bỏ qua sync checkout trực tiếp (sẽ sync sau):', syncErr);
}

 // Xóa giỏ hàng của bàn và khách hàng phòng bàn sau khi thanh toán
 setTableCarts(prev => {
 const copy = {...prev};
 delete copy[selectedTableForPay.id];
 return copy;
});
 setTableCustomers(prev => {
 const copy = {...prev};
 delete copy[selectedTableForPay.id];
 return copy;
});

 setCart({});
 setDiscountAmount(0);
 setOrderNote('');
 setSelectedCustomer(null);
 setCartOwnerTable(null);

 setIsCartModalOpen(false);
 setIsPayingTableLoading(false);
 setIsCheckoutConfirmVisible(false);

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

 // Hiển thị Toast thông báo kết quả sang trọng giống WebUI
  const hasTransfer = payments.some(p => ['bank_transfer', 'momo', 'card'].includes(p.method) && p.amount > 0);
  if (hasTransfer) {
    const transferAmount = payments.filter(p => ['bank_transfer', 'momo', 'card'].includes(p.method)).reduce((sum, p) => sum + p.amount, 0);
    const transferP = payments.find(p => ['bank_transfer', 'momo', 'card'].includes(p.method) && p.amount > 0);
    setQrPayload({amount: transferAmount, orderNo: serverOrderNo, fund_id: transferP ? transferP.fund_id : 'bank'});
    setIsQrModalOpen(true);
  } else {
    if (syncSucceeded) {
      showToast(`Thanh toán & Giải phóng thành công Hóa đơn ${serverOrderNo}!`, "success");
    } else {
      showToast(`Thanh toán ngoại tuyến thành công Hóa đơn ${orderNo}! Sẽ sync sau.`, "info");
    }
  }

  if (Platform.OS !== 'web') {
    setTimeout(() => {
      SyncManager.pushOfflineOrders(shopId);
    }, 800); // Trì hoãn 800ms để nhường luồng cho UI Animation đóng Modal mượt mà
  }
} catch (err) {
 console.error('Lỗi thanh toán phòng bàn:', err);
 setIsPayingTableLoading(false);
 setIsCheckoutConfirmVisible(false);
 showToast("Lỗi khi xử lý thanh toán!", "error");
}
};

 // Thanh toán Bán lẻ
 const handlePayCart = async (
 customer: any,
 discount: number,
 note: string,
 payments: {id: string; method: string; fund_id: string; amount: number}[],
 debtRepayOpts?: { debtRepayAmount?: number; debtFundId?: string; debtMethod?: string }
 ) => {
 if (cartOwnerTable) {
 await handlePayTableConfirmUnified(customer, discount, note, payments);
 return;
}
 setIsPayingCartLoading(true);
 try {
 const originalTotal = getCartTotal();
 const finalTotal = Math.max(0, originalTotal - discount);
 const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);

 const paymentMethodString = JSON.stringify(payments.map(p => {
    const fund = paymentFundsList.find(f => f.id === p.fund_id);
    return {
      method: p.method,
      amount: p.amount,
      meta: {
        fund_id: p.fund_id,
        fund_name: fund ? fund.name : ''
      }
    };
  }));

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

 for (const [cartItemId, item] of Object.entries(cart)) {
 await db.insert(schema.order_items).values({
 id: `ORDI-${orderId}-${cartItemId}`,
 order_id: orderId,
 product_id: item.productId,
 product_name: item.name,
 qty: item.quantity,
 unit_price: (item.price + (item.modifier_total || 0)),
 line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
});

 const originalProd = productsList.find(p => p.id === item.productId);
 if (originalProd) {
 const newStock = Math.max(0, originalProd.stock_qty - item.quantity);
 await db
 .update(schema.products)
 .set({stock_qty: newStock})
 .where(eq(schema.products.id, item.productId));
}
}

 const updatedProds = await db.select().from(schema.products);
 setProductsList(updatedProds);
}

 setCart({});
 setDiscountAmount(0);
 setOrderNote('');
 setSelectedCustomer(null);
 setIsCartModalOpen(false);
 setIsCheckoutConfirmVisible(false);

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

 // Thu nợ cũ kèm đơn hàng — thử sync trực tiếp để lấy server order_no
 const debtRepay = debtRepayOpts?.debtRepayAmount || 0;
 const debtShopId = await AsyncStorage.getItem('active_shop_id') || '';
 const currentUrl = isOnline ? getApiBaseUrl() : null;

 // Thử sync-batch trực tiếp để lấy server order_no cho note cashbook
 let serverOrderNo = orderNo; // fallback là local orderNo
 if (currentUrl && debtShopId) {
   try {
     const syncHeaders = await getApiHeaders();
     const directSyncRes = await fetch(`${currentUrl}/api/shops/${debtShopId}/orders/sync-batch`, {
       method: 'POST',
       headers: { ...(syncHeaders || {}), 'Content-Type': 'application/json' },
       body: JSON.stringify({
         local_order_id: orderId,
         order: {
           status: 'completed',
           channel: 'pos',
           customer_id: customer ? customer.id : '',
           customer_name: customer ? customer.name : 'Khách mua lẻ',
           branch_id: debtShopId,
           employee_id: currentUserEmail,
           subtotal: finalTotal + discountAmount,
           discount_amount: discountAmount,
           tax_amount: 0,
           total_amount: finalTotal,
           paid_amount: paidSum,
           debt_amount: Math.max(0, finalTotal - paidSum),
           note: note || '',
         },
         items: Object.entries(cart).map(([cartItemId, item]: [string, any]) => ({
           product_id: item.productId,
           product_name: item.name,
           qty: item.quantity,
           unit_price: item.price + (item.modifier_total || 0),
           discount_amount: 0,
           line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
         })),
         payments: payments.map(p => {
           const fund = paymentFundsList.find((f: any) => f.id === p.fund_id);
           return { method: p.method, amount: p.amount, fund_id: p.fund_id, meta: { fund_id: p.fund_id, fund_name: fund ? fund.name : '' } };
         }),
         stock_movements: Object.entries(cart).map(([, item]: [string, any]) => ({
           type: 'sale_out',
           product_id: item.productId,
           qty: -item.quantity,
           branch_id: debtShopId,
         })),
       }),
     });

     if (directSyncRes.ok) {
       const syncData = await directSyncRes.json().catch(() => ({}));
       if (syncData.order_no) serverOrderNo = syncData.order_no;
       // Mark as synced in SQLite
        if (Platform.OS !== 'web' && syncData.order_id) {
          const serverId = syncData.order_id;
          if (serverId !== orderId) {
            await db.update(schema.order_items)
              .set({ order_id: serverId })
              .where(eq(schema.order_items.order_id, orderId));
          }
          await db.update(schema.orders)
            .set({ id: serverId, order_no: syncData.order_no || orderNo, sync_status: 'synced', reference_no: orderId })
            .where(eq(schema.orders.id, orderId));
        }
     }
   } catch (syncErr) {
     console.warn('[POS] Sync trực tiếp thất bại, sẽ queue:', syncErr);
     // Fallback: push via SyncManager queue
     if (Platform.OS !== 'web') {
       setTimeout(() => SyncManager.pushOfflineOrders(debtShopId), 800);
     }
   }
 } else if (Platform.OS !== 'web') {
   // Offline: queue to sync later
   setTimeout(() => SyncManager.pushOfflineOrders(debtShopId || shopId), 800);
 }

 // Tắt trạng thái Loading thanh toán bán lẻ
  setIsPayingCartLoading(false);

  // Hiển thị QR thanh toán hoặc Toast báo thành công bằng server ID
  const hasTransfer = payments.some(p => ['bank_transfer', 'momo', 'card'].includes(p.method) && p.amount > 0);
  if (hasTransfer) {
    const transferAmount = payments.filter(p => ['bank_transfer', 'momo', 'card'].includes(p.method)).reduce((sum, p) => sum + p.amount, 0);
    const transferP = payments.find(p => ['bank_transfer', 'momo', 'card'].includes(p.method) && p.amount > 0);
    setQrPayload({amount: transferAmount, orderNo: serverOrderNo, fund_id: transferP ? transferP.fund_id : 'bank'});
    setIsQrModalOpen(true);
  } else {
    if (serverOrderNo !== orderNo) {
      showToast(`Đã thanh toán Hóa đơn ${serverOrderNo} thành công!`, 'success');
    } else {
      showToast(`Đã thanh toán Hóa đơn ngoại tuyến ${orderNo} thành công! Sẽ đồng bộ sau.`, 'info');
    }
  }

  // Ghi cashbook debt_collection với server order_no (hoặc local nếu offline)
  if (debtRepay > 0 && customer && customer.id && currentUrl && debtShopId) {
   try {
     await fetch(`${currentUrl}/api/shops/${debtShopId}/cashbook`, {
       method: 'POST',
       headers: { ...(apiAuthHeaders || {}), 'Content-Type': 'application/json' },
       body: JSON.stringify({
         type: 'receipt',
         category: 'debt_collection',
         amount: debtRepay,
         method: debtRepayOpts?.debtMethod || 'cash',
         fund_id: debtRepayOpts?.debtFundId || '',
         reference_id: customer.id,
         reference_name: customer.name || '',
         note: `Thu nợ cũ kèm đơn ${serverOrderNo}`,
         branch_id: debtShopId,
       })
     });
   } catch (e) {
     console.warn('[POS] Không gửi được debt_collection:', e);
   }
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

 // Quét mã vạch thực tế từ component BarcodeScannerModal
 const handleBarcodeScannedReal = (barcodeData: string) => {
 if (productsList.length === 0) {
 showToast('Không có sản phẩm nào trong SQLite để quét.', 'error');
 setIsScannerOpen(false);
 return;
}

 const query = barcodeData.trim().toLowerCase();
 // Tra cứu mã vạch chính xác, SKU, hoặc khớp tên
 const foundProduct = productsList.find(p => 
 (p.barcode && p.barcode.toLowerCase() === query) ||
 (p.sku && p.sku.toLowerCase() === query) ||
 (p.name && p.name.toLowerCase() === query)
 );

 if (foundProduct) {
 setScannedProductInfo(foundProduct);
 setIsScannerOpen(false);
 
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsScanSuccessDialogVisible(true);
} else {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 if (Platform.OS === 'web') {
 alert(`Không tìm thấy sản phẩm có mã vạch hoặc SKU: "${barcodeData}"`);
} else {
 Alert.alert(
 'Không tìm thấy sản phẩm',
 `Không tìm thấy sản phẩm nào khớp với mã vạch hoặc SKU: "${barcodeData}"`,
 [{text: 'Đóng'}]
 );
}
}
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
 return <View style={{flex: 1, backgroundColor: '#f8fafc'}} />;
}

 return (
 <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
 
 {/* Product Preview Modal (NEW) */}
 {previewProduct && (
 <ProductPreviewModal
 visible={isPreviewModalOpen}
 onClose={() => setIsPreviewModalOpen(false)}
 product={previewProduct}
 quantity={previewQuantity}
 setQuantity={setPreviewQuantity}
 selectedVariant={selectedVariant}
 setSelectedVariant={setSelectedVariant}
 selectedModifiers={selectedModifiers}
 setSelectedModifiers={setSelectedModifiers}
 onConfirm={handleConfirmAddToCart}
 />
 )}
 
 {/* 1. SHARED HEADER - Thống nhất 100% */}
 <Header onPressMenu={() => setIsDrawerOpen(true)} />

 {/* 2. CHỌN NGÀNH HÀNG/TAB DỌC - Giảm bo góc về rounded-xl, thay thế Emoji bằng Ionicons */}
  {['fnb', 'lodging', 'sports_court', 'billiards'].includes(shopVertical) && (
    <View className="py-2.5 px-4 bg-slate-50 border-b border-slate-100">
      <View className="flex-row">
        <TouchableOpacity 
          activeOpacity={0.8}
          className={`mr-3 px-4 py-2 rounded-xl flex-row items-center border ${            activeVertical === 'retail'               ? 'bg-orange-500 border-orange-500'               : 'bg-white border-slate-200'           }`}
          style={activeVertical === 'retail' ? {
            shadowColor: '#fa5908',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.12,
            shadowRadius: 3,
            elevation: 2,
          } : undefined}
          onPress={() => setActiveVertical('retail')}
        >
          <Ionicons name="cart-outline" size={14} color={activeVertical === 'retail' ? 'white' : '#fa5908'} className="mr-1.5" />
          <Text className={`font-semibold text-tiny ${activeVertical === 'retail' ? 'text-white' : 'text-slate-600'}`}>
            {getFirstTabLabel()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          activeOpacity={0.8}
          className={`px-4 py-2 rounded-xl flex-row items-center border ${            activeVertical !== 'retail'               ? 'bg-orange-500 border-orange-500'               : 'bg-white border-slate-200'           }`}
          style={activeVertical !== 'retail' ? {
            shadowColor: '#fa5908',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.12,
            shadowRadius: 3,
            elevation: 2,
          } : undefined}
          onPress={() => setActiveVertical(!['retail', 'fashion'].includes(shopVertical) ? shopVertical : 'billiards')}
        >
          <Ionicons 
            name={
              shopVertical === 'fnb' ? 'cafe-outline' :
              shopVertical === 'sports_court' ? 'football-outline' :
              shopVertical === 'lodging' ? 'bed-outline' :
              'play-circle-outline'
            } 
            size={14} 
            color={activeVertical !== 'retail' ? 'white' : '#fa5908'} 
            className="mr-1.5" 
          />
          <Text className={`font-semibold text-tiny ${activeVertical !== 'retail' ? 'text-white' : 'text-slate-600'}`}>
            {
              shopVertical === 'fnb' ? 'Sơ đồ Bàn' :
              shopVertical === 'sports_court' ? 'Sơ đồ Sân' :
              shopVertical === 'lodging' ? 'Sơ đồ Phòng' :
              'Bàn Bi-a (Giờ)'
            }
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )}

 {/* 3. CHI TIẾT NỘI DUNG */}
 {isLoading ? (
 <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16}}>
 {/* Skeleton.Text equivalent using raw inline styles */}
 <View style={{width: '100%', marginBottom: 32}}>
 {Array.from({length: 4}).map((_, idx) => (
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
 <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%'}}>
 {Array.from({length: 4}).map((_, i) => (
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
 <Text className="text-xs font-semibold text-slate-800 ml-2" numberOfLines={1}>
 Đang chọn món cho: <Text className="text-orange-600 font-medium">{cartOwnerTable.name}</Text>
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
 <Text className="text-xxs font-semibold text-slate-600">Hủy</Text>
 </TouchableOpacity>

 <TouchableOpacity 
 activeOpacity={0.7}
 className="bg-orange-500 border border-orange-600 px-3 py-1 rounded-lg active:scale-95"
 onPress={async () => {
 if (!cartOwnerTable) return;
 setIsSavingCart(true);
 // 1. Lưu món vào phòng/bàn cục bộ
 setTableCarts(prev => ({
 ...prev,
 [cartOwnerTable.id]: cart
}));

 // 2. Đồng bộ trực tuyến lên server nếu có mạng
 if (cartOwnerTable.current_order_id) {
 await syncOrderItemsOnline(cartOwnerTable.current_order_id, cart);
}
 
 setCart({});
 setCartOwnerTable(null);
 setActiveVertical(shopVertical);
 setIsSavingCart(false);
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 showToast("Đã lưu và đồng bộ món thành công!", "success");
}}
 >
 <Text className="text-xxs font-semibold text-white">Lưu món</Text>
 </TouchableOpacity>
 </View>
 </View>
 )}
 
 {/* Tìm kiếm nhanh */}
 <View className="mb-3 flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
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
 style={{
   paddingVertical: 0,
   textAlignVertical: 'center',
   lineHeight: undefined,
   ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
 }}
 />
 {productSearchQuery.length > 0 && (
 <TouchableOpacity onPress={() => {setProductSearchQuery(''); setDisplayLimit(20);}} className="mr-2">
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
 <Text className={`text-xxs font-semibold ${selectedCategoryId === 'all' ? 'text-orange-500' : 'text-slate-500'}`}>
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
 <Text className={`text-xxs font-semibold ${selectedCategoryId === cat.id ? 'text-orange-500' : 'text-slate-500'}`}>
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
 style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1.5}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}
 >
 <Ionicons name="sync" size={14} color="#fa5908" />
 </TouchableOpacity>
 </View>

 {/* Grid sản phẩm */}
 <ScrollView 
 className="flex-1" 
 showsVerticalScrollIndicator={false}
 onScroll={({nativeEvent}) => {
 const {layoutMeasurement, contentOffset, contentSize} = nativeEvent;
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
 <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy sản phẩm nào.</Text>
 </View>
 ) : (
 <View className="flex-row flex-wrap justify-between pb-28">
 {displayedProducts.map(p => (
 <TouchableOpacity 
 key={p.id} 
 activeOpacity={0.85}
 className="w-[48%] mb-4 p-3 rounded-2xl border bg-white border-slate-100 justify-between active:scale-[0.98]" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}
 onPress={() => addToCart(p)}
 >
 {/* Hình ảnh - Thay thế Emoji bằng Ionicons */}
 <View className="w-full h-24 bg-slate-50 border border-slate-100 rounded-xl mb-2.5 overflow-hidden justify-center items-center">
 {p.image_url ? (
 <Image
 source={{uri: p.image_url}}
 className="w-full h-full"
 resizeMode="cover"
 />
 ) : (
 <View className="bg-slate-50 w-full h-full justify-center items-center">
 <Ionicons name="image-outline" size={24} color="#fa5908" />
 </View>
 )}
 </View>
 
 <Text className="font-semibold text-xs text-slate-800" numberOfLines={1}>
 {p.name}
 </Text>
 <Text className="text-xxs text-slate-400 font-medium mt-0.5">
 Kho: {p.stock_qty} | {p.unit || 'cái'}
 </Text>
 
 <View className="flex-row justify-between items-center mt-2.5">
 <Text className="text-orange-500 font-semibold text-xs">
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
 <Text className="text-xxs font-semibold text-slate-450 mb-3 px-1">
 {
 shopVertical === 'fnb' ? 'Sơ đồ bàn Cafe hoạt động' :
 shopVertical === 'sports_court' ? 'Sơ đồ sân thể thao / sân bóng' :
 shopVertical === 'lodging' ? 'Sơ đồ phòng homestay / khách sạn' :
 'Sơ đồ bàn bi-a ngoại tuyến'
}
 </Text>
 
 {tables.length === 0 ? (
 <View className="items-center justify-center py-16 bg-white border border-slate-100 rounded-2xl">
 <Ionicons name="football-outline" size={36} color="#cbd5e1" />
 <Text className="text-xs text-slate-400 font-medium mt-2">Không tìm thấy bàn nào.</Text>
 </View>
 ) : (
 <View className="pb-28">
 {Object.entries(groupedZones).map(([zoneName, zoneTables]) => (
 <View key={zoneName} className="mb-6">
 {/* Tiêu đề Khu vực/Tầng */}
 <View className="flex-row items-center justify-between mb-3 px-1">
 <Text className="text-xs font-semibold text-slate-700">
 🏢 {zoneName}
 </Text>
 <Text className="text-tiny text-slate-400 font-medium">
 {zoneTables.length} {shopVertical === 'fnb' ? 'vị trí' : shopVertical === 'sports_court' ? 'sân' : shopVertical === 'lodging' ? 'phòng' : 'bàn'}
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
 shadowOffset: {width: 0, height: 1.5},
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
 <Text className="font-medium text-xs text-slate-800 mb-1.5">
 {t.name}
 </Text>

 {/* Chi tiết chỉ số */}
 <View className="mb-2">
 <View className="flex-row items-center mb-0.5">
 <Ionicons name="person-outline" size={10} color="#94a3b8" />
 <Text className="text-xxs text-slate-455 font-medium ml-1">
 {t.capacity || '4'} người
 </Text>
 </View>

 <View className="flex-row items-center mb-0.5">
 <Ionicons name="time-outline" size={10} color="#94a3b8" />
 <Text className="text-xxs text-slate-455 font-medium ml-1">
 {formatCurrency(t.hourly_rate)}/h
 </Text>
 </View>

 {shopVertical === 'lodging' && (
 <View className="flex-row items-center">
 <Ionicons name="moon-outline" size={10} color="#94a3b8" />
 <Text className="text-xxs text-slate-455 font-medium ml-1">
 {formatCurrency(t.hourly_rate * 3 || 200000)}/đêm
 </Text>
 </View>
 )}
 </View>

 {/* Tiện ích tags */}
 <View className="flex-row flex-wrap gap-1 mb-2.5">
 <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
 <Text className="text-[7.5px] font-medium text-slate-400">Điều hòa</Text>
 </View>
 <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
 <Text className="text-[7.5px] font-medium text-slate-400">WiFi</Text>
 </View>
 <View className="bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
 <Text className="text-[7.5px] font-semibold text-slate-400">+4</Text>
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
 <Text className="text-[8.5px] text-rose-700 font-semibold">
 ⏱️ Đã dùng: {billing.hours}h {billing.minutes}m
 </Text>
 <Text className="text-xxs text-rose-700 font-semibold mt-0.5">
 💵 Tiền giờ: {formatCurrency(billing.cost)}
 </Text>
 {cartItemsCount > 0 && (
 <Text 
 className="text-xxs text-slate-550 font-semibold mt-0.5 pt-0.5 border-t"
 style={{borderTopColor: 'rgba(244, 63, 94, 0.15)'}}
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
 <Text className={`text-tiny font-semibold ${
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
 className="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-xl flex-row items-center justify-center w-full"
 onPress={handleRefresh}
 >
 <Ionicons name="refresh-circle-outline" size={20} color="#fa5908" />
 <Text className="text-xs font-semibold text-slate-700 ml-2">Đồng bộ lại sơ đồ {shopVertical === 'lodging' ? 'phòng nghỉ' : shopVertical === 'sports_court' ? 'sân chơi' : shopVertical === 'fnb' ? 'bàn cafe' : 'bàn bi-a'}</Text>
 </TouchableOpacity>
 </View>
 </View>
 )}
 </ScrollView>
 )}

 {/* 4. THANH GIỎ HÀNG BÁN LẺ DƯỚI CÙNG - Giảm góc bo về rounded-t-2xl */}
 {getCartCount() > 0 && activeVertical === 'retail' && (
 <View className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white border-slate-100 flex-row justify-between items-center pb-6 rounded-t-2xl" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
 <View className="flex-row items-center">
 <View className="bg-orange-50 p-2.5 rounded-xl mr-3 relative border border-orange-100">
 <Ionicons name="cart" size={18} color="#fa5908" />
 <View className="absolute -top-1 -right-1 items-center justify-center border border-white" style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fa5908'}}>
 <Text className="text-xxs text-white font-semibold text-center leading-none">{getCartCount()}</Text>
 </View>
 </View>
 <View>
 <Text className="text-xxs font-semibold text-slate-455">Tổng cộng</Text>
 <Text className="text-orange-500 font-semibold text-base">{formatCurrency(getCartTotal())}</Text>
 </View>
 </View>

 <Button 
 variant="primary"
 size="md"
 onPress={async () => {
 if (cartOwnerTable) {
 setIsSavingCart(true);
 // 1. Lưu vào bàn/phòng cục bộ
 setTableCarts(prev => ({
 ...prev,
 [cartOwnerTable.id]: cart
}));

 // 2. Đồng bộ trực tuyến lên server nếu có mạng
 if (cartOwnerTable.current_order_id) {
 await syncOrderItemsOnline(cartOwnerTable.current_order_id, cart);
}
 
 setCart({});
 setCartOwnerTable(null);
 setActiveVertical(shopVertical);
 setIsSavingCart(false);
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 showToast("Đã lưu và đồng bộ món thành công!", "success");
} else {
 handleCheckoutPress(() => {
   setIsCartModalOpen(true);
 });
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
 <View className="flex-1 justify-end">
 <Pressable
      className="absolute inset-0 bg-black/60"
      onPress={() => setIsTableOpenDialogVisible(false)}
    />
 <View className="h-[75%] rounded-t-2xl p-6 bg-white justify-between relative" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
 {renderToast(true)}
 {/* Header */}
 <View className="flex-row justify-between items-center border-b border-slate-100 pb-4">
 <View className="flex-row items-center">
 <Ionicons name="enter-outline" size={20} color="#fa5908" />
 <Text className="text-sm font-semibold text-slate-800 ml-2">
 {selectedTableForOpen 
 ? `Nhận ${shopVertical === 'fnb' ? 'Bàn' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'lodging' ? 'Phòng' : 'Bàn'} - ${selectedTableForOpen.name}`
 : 'Nhận vị trí mới'}
 </Text>
 </View>
 <TouchableOpacity onPress={() => setIsTableOpenDialogVisible(false)} className="p-1">
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
 </View>

 {/* TAB SELECTOR (Crash-Proof Style without shadow-sm/border-opacity) */}
 {shopVertical === 'lodging' && (
 <View className="flex-row bg-slate-100 p-1 rounded-xl my-4">
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setCheckInTab('info')}
 className={`flex-1 py-2 items-center justify-center rounded-lg ${
 checkInTab === 'info' ? 'bg-white border border-slate-200' : 'bg-transparent'
}`}
 >
 <Text className={`text-xs font-semibold ${checkInTab === 'info' ? 'text-slate-800' : 'text-slate-500'}`}>
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
 <Text className={`text-xs font-semibold ${checkInTab === 'guests' ? 'text-slate-800' : 'text-slate-500'}`}>
 {`Khách lưu trú (${lodgingGuests.filter(g => g.name || g.id_number || g.idCard).length})`}
 </Text>
 </TouchableOpacity>
 </View>
 )}

 <ScrollView className="flex-1 my-2" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
 {checkInTab === 'info' || shopVertical !== 'lodging' ? (
 <View>
 {/* Bảng giá giờ */}
 {selectedTableForOpen && (
 <View className="bg-orange-50 border border-orange-100 p-4 rounded-2xl mb-4">
 <Text className="text-tiny text-orange-700 font-medium">Hình thức hoạt động:</Text>
 <Text className="text-orange-950 font-semibold text-sm mt-1">
 Tính phí theo thời gian sử dụng
 </Text>
 <Text className="text-tiny text-slate-500 mt-2 font-semibold">
 💵 Đơn giá: {formatCurrency(selectedTableForOpen.hourly_rate)}/{shopVertical === 'lodging' ? 'ngày' : 'giờ'}
 </Text>
 </View>
 )}

 {/* CHỌN KHÁCH HÀNG CRM (Premium component replicated) */}
 <Text className="text-tiny text-slate-400 font-medium mb-2">Thông tin Khách hàng (CRM):</Text>
 <View className="mb-4">
 {selectedCustomer ? (
 <View className="flex-row justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-xl">
 <View className="flex-1 mr-4">
 <Text className="text-xs font-semibold text-slate-800">{selectedCustomer.name}</Text>
 <Text className="text-tiny text-slate-500 font-medium mt-0.5">📞 {selectedCustomer.phone}</Text>
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
 style={{
   paddingVertical: 0,
   textAlignVertical: 'center',
   lineHeight: undefined,
   ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
 }}
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
 <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-40 overflow-hidden z-50" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5}}>
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
 <Text className="text-xs font-medium text-slate-800">{cust.name}</Text>
 <Text className="text-tiny text-slate-400 mt-0.5">{cust.phone}</Text>
 </View>
 <Badge variant="primary" label={cust.customer_type || 'Thành viên'} size="sm" />
 </TouchableOpacity>
 ))}
 </ScrollView>
 </View>
 )}
 </View>

 {/* THÔNG TIN LOẠI THUÊ (Dành riêng cho khách sạn) */}
 {shopVertical === 'lodging' && (
 <View className="mt-2">
 <Text className="text-tiny text-slate-400 font-medium mb-1.5">Hình thức thuê:</Text>
 <View className="flex-row bg-slate-100 p-0.5 rounded-lg border border-slate-200">
 <TouchableOpacity 
 onPress={() => setRoomRentalType('hourly')}
 className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'hourly' ? 'bg-white' : ''}`}
 >
 <Text className="text-tiny font-semibold text-slate-700">Theo giờ</Text>
 </TouchableOpacity>
 <TouchableOpacity 
 onPress={() => setRoomRentalType('daily')}
 className={`flex-1 py-1.5 items-center justify-center rounded-md ${roomRentalType === 'daily' ? 'bg-white' : ''}`}
 >
 <Text className="text-tiny font-semibold text-slate-700">Theo ngày</Text>
 </TouchableOpacity>
 </View>
 </View>
 )}
 </View>
 ) : (
 <LodgingGuestsForm
 guests={lodgingGuests}
 onChangeGuests={setLodgingGuests}
 guestCount={roomGuestCount}
 onChangeGuestCount={setRoomGuestCount}
 onPressDateInput={handleDatePickerOpen}
 />
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
 title={shopVertical === 'lodging' ? 'Nhận phòng' : 'Bắt đầu sử dụng'}
 onPress={handleConfirmOpenTable}
 className="flex-[2] py-3 rounded-xl"
 />
 </View>
 {renderDatePicker()}
 </View>
 </View>
 </Modal>

 {/* Unused isTablePayDialogVisible Dialog removed since we use POS unified checkout modal */}

 <Dialog
 visible={isScanSuccessDialogVisible}
 onClose={() => setIsScanSuccessDialogVisible(false)}
 onConfirm={handleConfirmAddScanned}
 title="Quét mã thành công"
 description={scannedProductInfo ? `Phát hiện sản phẩm: "${scannedProductInfo.name}"\nĐơn giá: ${formatCurrency(scannedProductInfo.sell_price)}` : ''}
 confirmLabel="Thêm vào giỏ"
 cancelLabel="Hủy bỏ"
 variant="success"
 >
 {scannedProductInfo?.image_url && (
 <View className="items-center justify-center mt-2.5 mb-1 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
 <Image
 source={{uri: scannedProductInfo.image_url}}
 style={{width: 110, height: 110, borderRadius: 16}}
 resizeMode="cover"
 />
 </View>
 )}
 </Dialog>

 {/* Hộp thoại xác nhận thanh toán đã được di chuyển vào bên trong Checkout Modal để xử lý z-index */}

 {/* 5. CAMERA SCAN BARCODE POPUP */}
 <BarcodeScannerModal
 visible={isScannerOpen}
 onClose={() => setIsScannerOpen(false)}
 onScan={handleBarcodeScannedReal}
 title="Quét mã sản phẩm"
 placeholder="Nhập mã sản phẩm hoặc SKU..."
 />

 {/* 6. MODAL XEM CHI TIẾT PHÒNG/BÀN ĐANG HOẠT ĐỘNG */}
 <Modal
 visible={!!activeTable}
 animationType="slide"
 transparent={true}
 onRequestClose={() => setActiveTable(null)}
 >
 <View className="flex-1 justify-end">
  <Pressable
    className="absolute inset-0 bg-black/60"
    onPress={() => setActiveTable(null)}
  />
  {activeTable && (
  <View className="h-[75%] rounded-t-2xl p-6 justify-between bg-white shadow-2xl relative">
 {renderToast(true)}
 {/* Modal Header */}
 <View className="flex-row justify-between items-center mb-4 border-b border-slate-100 pb-2">
 <View className="flex-row items-center">
 <Ionicons name="time" size={18} color="#fa5908" />
 <Text className="text-base font-semibold text-slate-800 ml-2">
 {activeTable.name} ({
 shopVertical === 'fnb' ? 'Có khách' :
 shopVertical === 'sports_court' ? 'Sân đang đá' :
 shopVertical === 'lodging' ? 'Phòng đang ở' :
 'Bàn đang chơi'
})
 </Text>
 </View>
 <TouchableOpacity onPress={() => setActiveTable(null)} className="p-1">
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
 </View>

 {/* TAB SELECTOR FOR ACTIVE ROOM */}
 {shopVertical === 'lodging' && (
 <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4">
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setActiveTableTab('billing')}
 className={`flex-1 py-2 items-center justify-center rounded-lg ${
 activeTableTab === 'billing' ? 'bg-white border border-slate-200' : 'bg-transparent'
}`}
 >
 <Text className={`text-xs font-semibold ${activeTableTab === 'billing' ? 'text-slate-800' : 'text-slate-500'}`}>
 Dịch vụ phòng
 </Text>
 </TouchableOpacity>
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setActiveTableTab('guests')}
 className={`flex-1 py-2 items-center justify-center rounded-lg ${
 activeTableTab === 'guests' ? 'bg-white border border-slate-200' : 'bg-transparent'
}`}
 >
 <Text className={`text-xs font-semibold ${activeTableTab === 'guests' ? 'text-slate-800' : 'text-slate-500'}`}>
 {`Khách lưu trú (${lodgingGuests.filter(g => g.name || g.id_number || g.idCard).length})`}
 </Text>
 </TouchableOpacity>
 </View>
 )}

 <ScrollView className="flex-1 my-2" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
 {activeTableTab === 'billing' || shopVertical !== 'lodging' ? (
 <View>
 {/* Tình trạng tiền giờ */}
 <View className="bg-orange-50 border border-orange-100 p-4 rounded-xl mb-4">
 <View className="flex-row justify-between items-center">
 <Text className="text-xxs text-slate-455 font-semibold">Phí dịch vụ giờ lẻ:</Text>
 <Badge variant="primary" label={formatCurrency(activeTable.hourly_rate) + '/' + (shopVertical === 'lodging' ? 'ngày' : 'giờ')} size="sm" />
 </View>
 <Text className="text-orange-500 text-3xl font-semibold mt-1.5">
 {formatCurrency(calculateBilling(activeTable).cost)}
 </Text>
 <Text className="text-[9.5px] text-slate-500 mt-3 font-semibold leading-relaxed">
 ⏱️ Nhận lúc: {new Date(activeTable.startTime).toLocaleTimeString()} ({calculateBilling(activeTable).hours}h {calculateBilling(activeTable).minutes}m)
                  </Text>
                </View>

                {/* GIAO DIỆN KHÁCH HÀNG CRM TRONG CHI TIẾT PHÒNG */}
                {tableCustomers[activeTable.id] ? (
                  <View className="mb-4 bg-slate-50 border border-slate-200 p-3 rounded-xl flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-[10px] text-slate-400 font-semibold mb-1">Khách hàng đại diện:</Text>
                      <Text className="text-xs font-bold text-slate-800">{tableCustomers[activeTable.id].name}</Text>
                      {tableCustomers[activeTable.id].phone ? (
                        <Text className="text-tiny text-slate-500 font-semibold mt-0.5">📞 {tableCustomers[activeTable.id].phone}</Text>
                      ) : (
                        <Text className="text-tiny text-slate-400 mt-0.5 font-medium">Không có số điện thoại</Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      activeOpacity={0.7}
                      className="bg-rose-50 p-2 rounded-xl border border-rose-200 items-center justify-center active:scale-95"
                      onPress={() => handleUpdateTableCustomer(activeTable.id, null)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#f43f5e" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="mb-4 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-[10px] text-slate-400 font-semibold">Khách hàng đại diện:</Text>
                      <View className="bg-slate-200/60 px-2 py-0.5 rounded">
                        <Text className="text-[9.5px] font-bold text-slate-600">Khách lẻ</Text>
                      </View>
                    </View>
                    
                    {/* Ô tìm kiếm khách hàng */}
                    <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 mt-1">
                      <Ionicons name="search-outline" size={14} color="#94a3b8" />
                      <TextInput 
                        className="flex-1 ml-2 text-xs text-slate-850 py-0.5"
                        placeholder="Tìm khách hàng đại diện..."
                        placeholderTextColor="#cbd5e1"
                        value={customerSearchQuery}
                        onChangeText={setCustomerSearchQuery}
                        style={{
                          paddingVertical: 0,
                          textAlignVertical: 'center',
                          lineHeight: undefined,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                        }}
                      />
                      {customerSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                          <Ionicons name="close" size={14} color="#cbd5e1" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Danh sách gợi ý khách hàng ngay trong modal chi tiết phòng */}
                    {customerSearchQuery.trim().length > 0 && (
                      <View className="bg-white border border-slate-200 rounded-xl mt-2 max-h-32 overflow-hidden z-50">
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
                                className="p-2.5 border-b border-slate-100 flex-row justify-between items-center active:bg-slate-50"
                                onPress={() => {
                                  handleUpdateTableCustomer(activeTable.id, cust);
                                  setCustomerSearchQuery('');
                                }}
                              >
                                <View>
                                  <Text className="text-xs font-semibold text-slate-800">{cust.name}</Text>
                                  {cust.phone ? (
                                    <Text className="text-[9.5px] text-slate-400 mt-0.5">{cust.phone}</Text>
                                  ) : null}
                                </View>
                                <Ionicons name="chevron-forward" size={12} color="#cbd5e1" />
                              </TouchableOpacity>
                            ))
                          }
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

 {/* CHI TIẾT MÓN / DỊCH VỤ ĐÃ GỌI KÈM */}
 {tableCarts[activeTable.id] && Object.keys(tableCarts[activeTable.id]).length > 0 ? (
 <View className="mb-4">
 <Text className="text-tiny text-slate-400 font-medium mb-2">Món ăn / Dịch vụ đã gọi:</Text>
 <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-32 overflow-hidden">
 <ScrollView nestedScrollEnabled={true}>
 {Object.entries(tableCarts[activeTable.id]).map(([cartItemId, item]) => (
                        <View key={cartItemId} className="flex-row justify-between items-center py-2 border-b border-slate-100 last:border-0">
                          <Text className="text-xs font-semibold text-slate-700 flex-1 mr-2" numberOfLines={1}>{item.name}</Text>
                          
                          <View className="flex-row items-center gap-2">
                            {/* Nút giảm số lượng */}
                            <TouchableOpacity 
                              onPress={() => handleDecreaseTableItemQty(activeTable.id, cartItemId)}
                              className="w-7 h-7 bg-slate-100 rounded-lg justify-center items-center active:bg-slate-200"
                            >
                              <Text className="text-slate-600 font-bold text-sm">-</Text>
                            </TouchableOpacity>

                            {/* Ô hiển thị số lượng */}
                            <View className="min-w-[30px] h-7 bg-white border border-slate-200 rounded-lg justify-center items-center px-1">
                              <Text className="text-xs font-bold text-slate-800">{item.quantity}</Text>
                            </View>

                            {/* Nút tăng số lượng */}
                            <TouchableOpacity 
                              onPress={() => handleIncreaseTableItemQty(activeTable.id, cartItemId)}
                              className="w-7 h-7 bg-slate-100 rounded-lg justify-center items-center active:bg-slate-200"
                            >
                              <Text className="text-slate-600 font-bold text-sm">+</Text>
                            </TouchableOpacity>

                            {/* Thành tiền */}
                            <Text className="text-xs font-bold text-slate-800 min-w-[70px] text-right ml-1">
                              {formatCurrency((item.price + (item.modifier_total || 0)) * item.quantity)}
                            </Text>

                            {/* Nút Xóa món */}
                            <TouchableOpacity 
                              onPress={() => handleRemoveTableItem(activeTable.id, cartItemId)}
                              className="p-1 ml-1"
                            >
                              <Ionicons name="close" size={16} color="#94a3b8" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
 </ScrollView>
 </View>
 </View>
 ) : null}

 {/* MENU CHỨC NĂNG PHỤ TRỢ (Như Web) */}
 <Text className="text-tiny text-slate-400 font-medium mb-2">Thao tác nghiệp vụ:</Text>
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
 <Text className="text-tiny font-semibold text-slate-700 ml-2">Gọi món / Dịch vụ</Text>
 </TouchableOpacity>

 {/* 2. Đổi phòng/bàn */}
 <TouchableOpacity 
 activeOpacity={0.8}
 className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
 onPress={() => {
 const label = shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn';
 showToast(`Chức năng Đổi ${label} đang đồng bộ với Cloud.`);
}}
 >
 <Ionicons name="swap-horizontal" size={16} color="#0284c7" />
 <Text className="text-tiny font-semibold text-slate-700 ml-2">Đổi {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}</Text>
 </TouchableOpacity>

 {/* 3. Gộp phòng/bàn */}
 <TouchableOpacity 
 activeOpacity={0.8}
 className="w-[47%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex-row items-center active:bg-slate-100"
 onPress={() => {
 const label = shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn';
 showToast(`Chức năng Gộp ${label} đang đồng bộ với Cloud.`);
}}
 >
 <Ionicons name="git-merge-outline" size={16} color="#059669" />
 <Text className="text-tiny font-semibold text-slate-700 ml-2">Gộp {shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : shopVertical === 'fnb' ? 'Bàn' : 'Bàn'}</Text>
 </TouchableOpacity>

 {/* 4. Hủy đơn / Trả phòng trống */}
 <TouchableOpacity 
 activeOpacity={0.8}
 className="w-[47%] bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex-row items-center active:bg-rose-100"
 onPress={async () => {
 // Hộp thoại xác nhận hủy an toàn
 const confirmCancel = Platform.OS === 'web'
 ? window.confirm("Bạn có chắc chắn muốn Hủy và giải phóng phòng này?")
 : await new Promise<boolean>((resolve) => {
 Alert.alert(
 "Xác nhận Hủy phòng",
 "Tất cả thông tin sử dụng và dịch vụ hiện tại sẽ bị xóa sạch. Bạn có chắc chắn muốn giải phóng phòng trống?",
 [
 {text: "Không", onPress: () => resolve(false), style: "cancel"},
 {text: "Đồng ý", onPress: () => resolve(true), style: "destructive"}
 ]
 );
});

 if (!confirmCancel) return;

 try {
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 let syncSucceeded = false;

 // 1. Đồng bộ cục bộ (Offline-First)
 if (Platform.OS === 'web') {
 setTables(prev => prev.map(t => t.id === activeTable.id ? {...t, status: 'available', startTime: null} : t));
} else {
 await db
 .update(schema.location_resources)
 .set({status: 'available', startTime: null})
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
 headers: {...headers, 'Content-Type': 'application/json'},
 body: JSON.stringify({reason: 'Hủy từ di động'})
});
}

 // B. Patch trạng thái bàn về available
 const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
 method: 'PATCH',
 headers: {...headers, 'Content-Type': 'application/json'},
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
 const copy = {...prev};
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
 <Text className="text-tiny font-semibold text-rose-700 ml-2">Hủy / Trả trống</Text>
 </TouchableOpacity>
 </View>
 </View>
 ) : (
 <View>
 <LodgingGuestsForm
 guests={lodgingGuests}
 onChangeGuests={setLodgingGuests}
 guestCount={roomGuestCount}
 onChangeGuestCount={setRoomGuestCount}
 onPressDateInput={handleDatePickerOpen}
 />
 </View>
 )}
 </ScrollView>

 {/* Hàng nút thanh toán chính */}
 <View className="flex-row justify-between gap-3 border-t border-slate-100 pt-4 bg-white">
 {activeTableTab === 'billing' || shopVertical !== 'lodging' ? (
 <Button 
 variant="primary"
 title="Thanh toán & Trả phòng"
 icon={<Ionicons name="card-outline" size={16} color="white" />}
 onPress={() => triggerPayTable(activeTable)}
 className="flex-1 py-3.5 rounded-xl"
 />
 ) : (
 <Button 
 variant="primary"
 title="Cập nhật khách lưu trú"
 icon={<Ionicons name="save-outline" size={16} color="white" />}
 onPress={handleUpdateActiveRoomGuests}
 className="flex-1 py-3.5 rounded-xl"
 loading={isUpdatingGuestsLoading}
 />
 )}
 </View>
 {renderDatePicker()}
 </View>
 )}
 </View>
 </Modal>

 {/* 7. MODAL GIỎ HÀNG & THANH TOÁN CHI TIẾT */}
      <CartCheckoutModal
        visible={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        cart={cart}
        updateCartItemQuantity={updateCartItemQuantity}
        removeFromCart={removeFromCart}
        getCartTotal={getCartTotal}
        discountAmount={discountAmount}
        setDiscountAmount={setDiscountAmount}
        orderNote={orderNote}
        setOrderNote={setOrderNote}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        customersList={customersList}
        paymentRows={paymentRows}
        setPaymentRows={setPaymentRows}
        paymentFundsList={paymentFundsList}
        productsList={productsList}
        getCartCount={getCartCount}
        shopId={activeShopId}
        isOnline={isOnline}
        apiBaseUrl={getApiBaseUrl()}
        apiHeaders={apiAuthHeaders}
        onCheckout={(opts) => {
          handlePayCart(selectedCustomer, discountAmount, orderNote, paymentRows, opts);
        }}
      />

      {/* 8. MODAL DYNAMIC QR CODE THANH TOÁN CHUYỂN KHOẢN */}
      <QRTransferModal
        visible={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        qrPayload={qrPayload as any}
        paymentFundsList={paymentFundsList}
        onConfirm={() => {
          setIsQrModalOpen(false);
          showToast('Đã xác nhận thanh toán chuyển khoản thành công!', 'success');
        }}
      />

      {/* Toast Notification Overlay */}
 {renderToast()}


 {/* Premium Saving & Cloud Syncing Glass Overlay */}
 {isSavingCart && (
 <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.65)', zIndex: 99999, justifyContent: 'center', alignItems: 'center'}}>
 <View className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl flex-row items-center shadow-2xl">
 <ActivityIndicator size="small" color="#f97316" />
 <Text className="text-white text-xs font-semibold ml-3">Đang đồng bộ món ăn lên Cloud...</Text>
 </View>
 </View>
 )}

 {/* Drawer Hamburger Sidebar */}
 <DrawerMenu 
 visible={isDrawerOpen} 
 onClose={() => setIsDrawerOpen(false)} 
 branchName="Chi nhánh chính"
 />

  {/* Modal Mở ca làm việc POS khi Checkout */}
  <Modal
    visible={isShiftModalOpen}
    animationType="fade"
    transparent={true}
    onRequestClose={() => setIsShiftModalOpen(false)}
  >
    <View className="flex-1 justify-center items-center px-6">
      <Pressable
        className="absolute inset-0 bg-black/60"
        onPress={() => setIsShiftModalOpen(false)}
      />
      <View className="bg-white w-full rounded-3xl p-6 shadow-2xl border border-slate-100 relative">
        <View className="items-center mb-4">
          <View className="bg-orange-50 p-3 rounded-full mb-3 border border-orange-100">
            <Ionicons name="wallet-outline" size={24} color="#fa5908" />
          </View>
          <Text className="text-base font-bold text-slate-800 text-center">Mở ca làm việc POS</Text>
          <Text className="text-xxs text-slate-400 text-center mt-1 leading-relaxed">
            Hệ thống đang bật chế độ Quản lý ca. Bạn cần khai báo số tiền mặt hiện có trong két trước khi thanh toán.
          </Text>
        </View>

        <View className="mb-6">
          <Text className="text-xxs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Số tiền mặt đầu ca
          </Text>
          <View className="relative flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
            <TextInput
              value={openingCashInput}
              onChangeText={(val) => {
                const num = val.replace(/\D/g, '');
                setOpeningCashInput(num ? Number(num).toLocaleString('vi-VN') : '0');
              }}
              keyboardType="numeric"
              className="flex-1 text-center text-lg font-bold text-slate-800"
              placeholder="0"
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
            <Text className="text-sm font-semibold text-slate-400 ml-2">đ</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 items-center"
            onPress={() => setIsShiftModalOpen(false)}
            disabled={isShiftLoading}
          >
            <Text className="text-slate-500 font-semibold text-xs">Hủy bỏ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 py-3 rounded-xl bg-orange-500 items-center justify-center flex-row"
            onPress={handleShiftOpenConfirm}
            disabled={isShiftLoading}
          >
            {isShiftLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-xs">Xác nhận</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>

 </SafeAreaView>
 );
}
