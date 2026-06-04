import React from 'react';
import {TouchableOpacity, View} from 'react-native';
import * as Haptics from 'expo-haptics';

export interface SwitchProps {
 value: boolean;
 onValueChange: (value: boolean) => void;
 disabled?: boolean;
}

export function Switch({value, onValueChange, disabled = false}: SwitchProps) {
 
 const handleToggle = () => {
 if (disabled) return;
 
 // Rung phản hồi nhẹ khi chạm công tắc
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 
 onValueChange(!value);
};

 return (
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={handleToggle}
 disabled={disabled}
 className={`w-12 h-7 rounded-full p-1 justify-center transition-all ${
 disabled 
 ? 'bg-slate-100 border border-slate-200' 
 : value 
 ? 'bg-orange-500 items-end shadow-sm shadow-orange-500/10' 
 : 'bg-slate-350 items-start'
}`}
 style={{
 backgroundColor: disabled ? '#f1f5f9' : value ? '#fa5908' : '#cbd5e1',
}}
 >
 <View 
 className={`w-5 h-5 rounded-full bg-white shadow-sm ${
 disabled ? 'bg-slate-300' : ''
}`} 
 />
 </TouchableOpacity>
 );
}
