import React from 'react';
import { Animated, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PosToastProps {
  toastMsg: {message: string; type: 'success' | 'error' | 'info'} | null;
  toastOpacity: Animated.Value;
  isForModal?: boolean;
  isAnyModalVisible?: boolean;
}

export function PosToast({ toastMsg, toastOpacity, isForModal = false, isAnyModalVisible = false }: PosToastProps) {
  if (!toastMsg) return null;
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
}
