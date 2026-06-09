import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, Platform, Alert} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Dialog} from '../ui/Dialog';

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
 address?: string;
 note?: string;
}

interface LodgingGuestsFormProps {
 guests: LodgingGuest[];
 onChangeGuests: (guests: LodgingGuest[]) => void;
 guestCount: number;
 onChangeGuestCount: (count: number) => void;
 onPressDateInput: (index: number, field: 'dob' | 'expiry_date', currentValue: string) => void;
}

const formatDisplayDate = (dateStr: string | undefined) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${parseInt(d)}/${parseInt(m)}/${y}`;
    }
  }
  return dateStr;
};

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
   updated[index] = {name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: ''};
  }
  updated[index] = {...updated[index], [field]: value};
  // Maintain idCard and id_number sync
  if (field === 'id_number') {
   updated[index].idCard = value;
  } else if (field === 'idCard') {
   updated[index].id_number = value;
  }
  setExpandedState(prev => {
    if (prev[index] !== true) {
      return {...prev, [index]: true};
    }
    return prev;
  });
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

 const [expandedState, setExpandedState] = useState<Record<number, boolean>>({});
 const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

 const renderGuestForm = (guest: LodgingGuest, index: number) => {
  const isExpanded = expandedState[index] !== false && (!guest.name || expandedState[index]);
  const showCollapsed = !isExpanded && guest.name;

  return (
   <View key={index}>
    {showCollapsed && (
     <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => setExpandedState(prev => ({...prev, [index]: true}))}
      className="mb-3 p-3 bg-white border border-slate-200 rounded-xl flex-row justify-between items-center"
     >
      <View className="flex-row items-center flex-1">
       <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
        <Ionicons name="person" size={14} color="#64748b" />
       </View>
       <View className="flex-1">
        <Text className="text-xs font-bold text-slate-850" numberOfLines={1}>
         {guest.name || 'Chưa nhập tên'}
        </Text>
        <Text className="text-[10px] text-slate-500 mt-0.5" numberOfLines={1}>
         {guest.id_type || 'CCCD'}: {guest.id_number || 'Chưa nhập'}
        </Text>
       </View>
      </View>
      <View className="flex-row items-center">
       <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpandedState(prev => ({...prev, [index]: true}))}
        className="px-2.5 py-1.5 bg-orange-50 rounded-lg border border-orange-100"
       >
        <Text className="text-[10px] font-bold text-orange-600">Sửa</Text>
       </TouchableOpacity>
       {guests.length > 1 && (
        <>
         <Text className="text-slate-350 mx-1.5 text-xs">|</Text>
         <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setDeleteConfirmIndex(index)}
          className="px-2.5 py-1.5 bg-rose-50 rounded-lg border border-rose-100"
         >
          <Text className="text-[10px] font-bold text-rose-600">Xóa</Text>
         </TouchableOpacity>
        </>
       )}
      </View>
     </TouchableOpacity>
    )}

    <View style={{ display: showCollapsed ? 'none' : 'flex' }} className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 animate-fade-in">
     <View className="flex-row justify-between items-center mb-3">
      <TouchableOpacity
       activeOpacity={0.7}
       disabled={!guest.name}
       onPress={() => setExpandedState(prev => ({...prev, [index]: !prev[index]}))}
       className="flex-row items-center flex-1 py-1"
      >
       <View className="w-6 h-6 rounded-full bg-orange-50 items-center justify-center mr-2">
        <Text className="text-xs font-bold text-orange-600">{index + 1}</Text>
       </View>
       <Text className="text-sm font-semibold text-orange-600">Khách lưu trú #{index + 1}</Text>
      </TouchableOpacity>
      <View className="flex-row items-center">
       {guest.name ? (
        <TouchableOpacity
         activeOpacity={0.7}
         onPress={() => setExpandedState(prev => ({...prev, [index]: false}))}
         className="px-2.5 py-1.5 bg-slate-100 rounded-lg border border-slate-200 mr-2"
        >
         <Text className="text-[10px] font-bold text-slate-600">Thu gọn</Text>
        </TouchableOpacity>
       ) : null}
       {guests.length > 1 && (
        <TouchableOpacity
         activeOpacity={0.7}
         onPress={() => setDeleteConfirmIndex(index)}
         className="p-2 bg-rose-50 rounded-xl border border-rose-100 items-center justify-center active:scale-95"
        >
         <Ionicons name="trash-outline" size={15} color="#f43f5e" />
        </TouchableOpacity>
       )}
      </View>
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
          className={`flex-1 h-[36px] items-center justify-center rounded-lg ${isSelected ? 'bg-white' : 'bg-transparent'}`}
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
         {formatDisplayDate(guest.expiry_date) || 'Chọn ngày...'}
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
         {formatDisplayDate(guest.dob) || 'Chọn ngày...'}
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

     {/* Field 7.5: Địa chỉ */}
     <View className="mt-3">
      <Text className="text-xs text-slate-500 font-medium mb-1.5">Địa chỉ:</Text>
      <TextInput
       className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 font-semibold h-[44px]"
       placeholder="Nhập địa chỉ..."
       placeholderTextColor="#cbd5e1"
       value={guest.address || ''}
       onChangeText={(val) => updateGuestField(index, 'address', val)}
       style={{
        paddingVertical: 0,
        textAlignVertical: 'center',
        lineHeight: undefined,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
       }}
      />
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
   </View>
  );
 };

 return (
  <View className="px-1 py-2">
   {guests.map((guest, index) => renderGuestForm(guest, index))}

   {/* Add Guest Button */}
   <TouchableOpacity 
    activeOpacity={0.8}
    onPress={() => {
     const updated = [...guests, {name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: ''}];
     onChangeGuests(updated);
     onChangeGuestCount(updated.length);
    }}
    className="flex-row items-center justify-center bg-orange-50 border border-orange-100 py-3.5 rounded-xl mt-2 active:bg-orange-100"
   >
    <Ionicons name="add-circle" size={18} color="#fa5908" />
    <Text className="text-xs font-semibold text-orange-600 ml-2">Thêm khách lưu trú</Text>
   </TouchableOpacity>

   {/* Custom Confirmation Dialog for Delete */}
   <Dialog
    visible={deleteConfirmIndex !== null}
    onClose={() => setDeleteConfirmIndex(null)}
    onConfirm={() => {
     if (deleteConfirmIndex !== null) {
      const updated = guests.filter((_, i) => i !== deleteConfirmIndex);
      onChangeGuests(updated);
      onChangeGuestCount(updated.length);
      setExpandedState(prev => {
       const next = {...prev};
       delete next[deleteConfirmIndex];
       return next;
      });
      setDeleteConfirmIndex(null);
     }
    }}
    title="Xóa khách lưu trú"
    description="Bạn có chắc chắn muốn xóa khách lưu trú này?"
    confirmLabel="Xóa"
    cancelLabel="Hủy"
    variant="danger"
   />
  </View>
 );
}
