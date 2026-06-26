import React from 'react';
import {Modal, Text, View, TouchableWithoutFeedback} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Button} from './Button';

export interface DialogProps {
 visible: boolean;
 onClose: () => void;
 onConfirm: () => void | Promise<void>;
 title: string;
 description?: string;
 confirmLabel?: string;
 cancelLabel?: string;
 variant?: 'default' | 'danger' | 'success';
 loading?: boolean;
 children?: React.ReactNode;
 disableOutsideClick?: boolean;
 useNativeModal?: boolean;
}

export function Dialog({
 visible,
 onClose,
 onConfirm,
 title,
 description,
 confirmLabel = 'Xác nhận',
 cancelLabel = 'Hủy',
 variant = 'default',
 loading = false,
 children,
 disableOutsideClick = false,
 useNativeModal = true,
}: DialogProps) {
 
 const handleOutsidePress = () => {
 if (!loading && !disableOutsideClick) {
 onClose();
}
};

 // Xác định icon tương ứng với từng biến thể
 const renderIcon = () => {
 switch (variant) {
 case 'danger':
 return (
 <View className="bg-red-50 p-4 rounded-full mb-4 items-center justify-center border border-red-100">
 <Ionicons name="warning-outline" size={32} color="#ef4444" />
 </View>
 );
 case 'success':
 return (
 <View className="bg-emerald-50 p-4 rounded-full mb-4 items-center justify-center border border-emerald-100">
 <Ionicons name="checkmark-circle-outline" size={32} color="#10b981" />
 </View>
 );
 default:
 return (
 <View className="bg-orange-50 p-4 rounded-full mb-4 items-center justify-center border border-orange-100">
 <Ionicons name="information-circle-outline" size={32} color="#fa5908" />
 </View>
 );
 }
};

 const content = (
 <TouchableWithoutFeedback onPress={handleOutsidePress}>
 <View className={`flex-1 justify-center items-center bg-black/60 px-6 ${!useNativeModal ? 'absolute inset-0 z-[9999]' : ''}`}>
 <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
 <View className="w-full max-w-sm p-6 rounded-[28px] shadow-2xl bg-white border border-slate-100 items-center">
 
 {renderIcon()}
 
 <Text className="text-base font-semibold text-slate-800 text-center mb-2 leading-tight">
 {title}
 </Text>
 
 {description && (
 <Text className="text-xs text-slate-450 mt-1 text-center font-semibold leading-relaxed mb-4">
 {description}
 </Text>
 )}

 {children && (
 <View className="w-full mb-4">{children}</View>
 )}

 <View className="flex-row justify-between w-full mt-2 gap-3">
 {cancelLabel && !loading && (
 <Button
 variant="outline"
 size="md"
 title={cancelLabel}
 disabled={loading}
 onPress={onClose}
 className="rounded-2xl"
 style={{ flex: 0.7 }}
 />
 )}
 
 <Button
 variant={variant === 'danger' ? 'danger' : 'primary'}
 size="md"
 title={confirmLabel}
 loading={loading}
 onPress={onConfirm}
 className="rounded-2xl"
 style={loading ? { width: '100%' } : { flex: 1.3 }}
 />
 </View>
 
 </View>
 </TouchableWithoutFeedback>
 </View>
 </TouchableWithoutFeedback>
 );

 if (!useNativeModal) {
 if (!visible) return null;
 return content;
 }

 return (
 <Modal
 visible={visible}
 animationType="fade"
 transparent={true}
 onRequestClose={onClose}
 >
 {content}
 </Modal>
 );
}
