import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, type TouchableOpacityProps } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface ButtonProps extends TouchableOpacityProps {
  children?: React.ReactNode;
  title?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  haptic?: boolean | Haptics.ImpactFeedbackStyle;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  textClassName?: string;
}

export function Button({
  children,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  haptic = true,
  icon,
  iconPosition = 'left',
  className = '',
  textClassName = '',
  disabled,
  onPress,
  ...props
}: ButtonProps) {
  
  const handlePress = (e: any) => {
    if (disabled || loading) return;
    
    // Tạo phản hồi rung xúc giác khi bấm nút
    if (haptic) {
      const hapticStyle = typeof haptic === 'string' 
        ? haptic 
        : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(hapticStyle).catch(() => {});
    }

    if (onPress) {
      onPress(e);
    }
  };

  // Xác định các lớp CSS NativeWind tương ứng
  let containerStyles = 'flex-row items-center justify-center rounded-2xl active:scale-[0.98] transition-transform ';
  let textStyles = 'font-bold tracking-wide ';

  // Cấu hình Biến thể màu sắc
  if (disabled) {
    containerStyles += 'bg-slate-100 border border-slate-200 ';
    textStyles += 'text-slate-400 ';
  } else {
    switch (variant) {
      case 'primary':
        containerStyles += 'bg-orange-500 shadow-md shadow-orange-500/10 ';
        textStyles += 'text-white ';
        break;
      case 'secondary':
        containerStyles += 'bg-slate-100 border border-slate-200 ';
        textStyles += 'text-slate-700 ';
        break;
      case 'danger':
        containerStyles += 'bg-red-500 shadow-md shadow-red-500/10 ';
        textStyles += 'text-white ';
        break;
      case 'outline':
        containerStyles += 'bg-transparent border border-slate-200 ';
        textStyles += 'text-slate-600 ';
        break;
      case 'ghost':
        containerStyles += 'bg-transparent ';
        textStyles += 'text-slate-500 ';
        break;
    }
  }

  // Cấu hình Kích thước
  switch (size) {
    case 'sm':
      containerStyles += 'px-3.5 py-2 ';
      textStyles += 'text-[10px] uppercase ';
      break;
    case 'md':
      containerStyles += 'px-5 py-3.5 ';
      textStyles += 'text-xs uppercase ';
      break;
    case 'lg':
      containerStyles += 'px-6 py-4.5 ';
      textStyles += 'text-sm ';
      break;
  }

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      onPress={handlePress}
      activeOpacity={0.8}
      className={`${containerStyles} ${className}`}
      {...props}
    >
      {loading ? (
        <View className="flex-row items-center justify-center">
          <ActivityIndicator 
            size="small" 
            color={variant === 'primary' || variant === 'danger' ? '#ffffff' : '#fa5908'} 
          />
          {title || children ? (
            <Text className={`${textStyles} ml-2 ${textClassName}`}>
              Đang xử lý...
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="flex-row items-center justify-center">
          {icon && iconPosition === 'left' && (
            <View className="mr-2">{icon}</View>
          )}
          {title ? (
            <Text className={`${textStyles} ${textClassName}`}>{title}</Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' && (
            <View className="ml-2">{icon}</View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
