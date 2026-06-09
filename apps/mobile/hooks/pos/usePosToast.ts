import { useState, useRef } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

export function usePosToast() {
  const [toastMsg, setToastMsg] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

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

  return { toastMsg, toastOpacity, showToast };
}
