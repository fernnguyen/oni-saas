import React from 'react';
import {Text, View} from 'react-native';

export interface BadgeProps {
 label: string;
 variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
 size?: 'sm' | 'md';
 showDot?: boolean;
 pulseDot?: boolean;
 className?: string;
 textClassName?: string;
}

export function Badge({
 label,
 variant = 'primary',
 size = 'md',
 showDot = false,
 pulseDot = false,
 className = '',
 textClassName = '',
}: BadgeProps) {
 
 // Thiết lập màu sắc nền & viền mờ cao cấp HSL tương ứng
 let bgStyles = 'flex-row items-center justify-center border ';
 let textStyles = 'font-medium ';
 let dotStyles = 'w-1.5 h-1.5 rounded-full mr-1.5 ';

 switch (variant) {
 case 'primary':
 bgStyles += 'bg-orange-50 border-orange-200 ';
 textStyles += 'text-orange-600 ';
 dotStyles += 'bg-orange-500 ';
 break;
 case 'secondary':
 bgStyles += 'bg-slate-100 border-slate-200 ';
 textStyles += 'text-slate-600 ';
 dotStyles += 'bg-slate-400 ';
 break;
 case 'success':
 bgStyles += 'bg-emerald-50 border-emerald-200 ';
 textStyles += 'text-emerald-700 ';
 dotStyles += 'bg-emerald-600 ';
 break;
 case 'warning':
 bgStyles += 'bg-amber-50 border-amber-200 ';
 textStyles += 'text-amber-700 ';
 dotStyles += 'bg-amber-500 ';
 break;
 case 'danger':
 bgStyles += 'bg-rose-50 border-rose-200 ';
 textStyles += 'text-rose-700 ';
 dotStyles += 'bg-rose-500 ';
 break;
 case 'info':
 bgStyles += 'bg-blue-50 border-blue-200 ';
 textStyles += 'text-blue-700 ';
 dotStyles += 'bg-blue-500 ';
 break;
}

 // Thiết lập kích thước
 switch (size) {
 case 'sm':
 bgStyles += 'px-2 py-0.5 rounded-lg ';
 textStyles += 'text-xxs ';
 break;
 case 'md':
 bgStyles += 'px-3 py-1.5 rounded-xl ';
 textStyles += 'text-xxs ';
 break;
}

 return (
 <View className={`${bgStyles} ${className}`}>
 {showDot && (
 <View 
 className={`${dotStyles} ${pulseDot ? 'animate-pulse' : ''}`} 
 />
 )}
 <Text className={`${textStyles} ${textClassName}`}>
 {label}
 </Text>
 </View>
 );
}
