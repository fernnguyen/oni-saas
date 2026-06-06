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
  className="w-12 h-7 rounded-full p-1 justify-center"
  style={{
    backgroundColor: disabled ? '#f1f5f9' : value ? '#fa5908' : '#cbd5e1',
    alignItems: value ? 'flex-end' : 'flex-start',
  }}
  >
  <View 
  className="w-5 h-5 rounded-full bg-white"
  style={disabled ? { backgroundColor: '#cbd5e1' } : {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  }}
  />
  </TouchableOpacity>
 );
}
