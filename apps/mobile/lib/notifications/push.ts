/**
 * Push Notification Module — Expo Push (Tầng 2)
 *
 * Quản lý OS-level push notifications qua APNs (iOS) / FCM (Android):
 * - Xin quyền notification
 * - Lấy Expo Push Token
 * - Đăng ký token lên backend
 * - Xử lý notification khi nhận (foreground/background/killed)
 *
 * ⚠️ Yêu cầu: expo-notifications, expo-device, expo-constants
 * ⚠️ Push tokens chỉ hoạt động trên thiết bị thật (Development Build), KHÔNG chạy trên Expo Go
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHeaders } from '../api/config';

// Lazy imports — cho phép module được import ngay cả khi expo-notifications chưa cài
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let Constants: typeof import('expo-constants') | null = null;

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants');
} catch (e) {
  console.warn('[PushNotifications] expo-notifications / expo-device / expo-constants not installed. Push disabled.');
}

// ─────────────────────────────────────────────────────
// 1. Đăng ký Push Token
// ─────────────────────────────────────────────────────

/**
 * Xin quyền notification và lấy Expo Push Token.
 * Trả về token string hoặc null nếu thất bại.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) {
    console.warn('[PushNotifications] Push notifications not available (missing packages)');
    return null;
  }

  // Push tokens chỉ hoạt động trên thiết bị thật
  if (Platform.OS !== 'web' && !Device.isDevice) {
    console.warn('[PushNotifications] Push notifications only work on physical devices');
    return null;
  }

  try {
    // 1. Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // 2. Request permission nếu chưa có
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PushNotifications] Permission denied by user');
      return null;
    }

    // 3. Android channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo chung',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#fa5908',
        sound: 'default',
      });

      // Channel riêng cho QR orders (high priority)
      await Notifications.setNotificationChannelAsync('qr_orders', {
        name: 'Yêu cầu gọi món QR',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#fa5908',
        sound: 'default',
      });
    }

    // 4. Lấy Expo Push Token
    const projectId = Constants?.default?.expoConfig?.extra?.eas?.projectId
      ?? Constants?.default?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });

    const token = tokenResponse.data;
    console.log('[PushNotifications] Expo Push Token:', token);

    return token;
  } catch (error) {
    console.error('[PushNotifications] Registration failed:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────
// 2. Gửi Push Token lên Backend
// ─────────────────────────────────────────────────────

/**
 * Đăng ký push token lên server (upsert).
 * Gọi sau khi registerForPushNotifications() trả về token.
 */
export async function savePushTokenToServer(token: string): Promise<boolean> {
  try {
    const tenantId = await AsyncStorage.getItem('active_tenant_id');
    if (!tenantId) {
      console.warn('[PushNotifications] No tenantId, skipping token registration');
      return false;
    }

    const baseUrl = getApiBaseUrl();
    const headers = await getApiHeaders();

    const res = await fetch(`${baseUrl}/api/push-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        token,
        tenantId,
        platform: Platform.OS,
        deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android Device',
      }),
    });

    if (res.ok) {
      // Cache token locally để biết đã đăng ký
      await AsyncStorage.setItem('expo_push_token', token);
      console.log('[PushNotifications] Token registered successfully');
      return true;
    } else {
      const err = await res.text();
      console.error('[PushNotifications] Token registration failed:', err);
      return false;
    }
  } catch (error) {
    console.error('[PushNotifications] savePushTokenToServer error:', error);
    return false;
  }
}

/**
 * Hủy đăng ký push token khi logout.
 */
export async function removePushTokenFromServer(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('expo_push_token');
    if (!token) return;

    const baseUrl = getApiBaseUrl();
    const headers = await getApiHeaders();

    await fetch(`${baseUrl}/api/push-tokens`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ token }),
    });

    await AsyncStorage.removeItem('expo_push_token');
    console.log('[PushNotifications] Token removed successfully');
  } catch (error) {
    console.error('[PushNotifications] removePushTokenFromServer error:', error);
  }
}

// ─────────────────────────────────────────────────────
// 3. Setup Notification Handlers
// ─────────────────────────────────────────────────────

/**
 * Cấu hình cách hiển thị notification khi app ở foreground.
 * Gọi MỘT LẦN trong _layout.tsx.
 */
export function setupNotificationHandlers() {
  if (!Notifications) return;

  // Hiển thị notification ngay cả khi app đang foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Đăng ký listener khi user tap vào notification.
 * Trả về cleanup function.
 */
export function addNotificationResponseListener(
  callback: (response: any) => void
): () => void {
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener(callback);
  return () => subscription.remove();
}

/**
 * Đăng ký listener khi nhận notification ở foreground.
 * Trả về cleanup function.
 */
export function addNotificationReceivedListener(
  callback: (notification: any) => void
): () => void {
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationReceivedListener(callback);
  return () => subscription.remove();
}

// ─────────────────────────────────────────────────────
// 4. Full Initialization Flow
// ─────────────────────────────────────────────────────

/**
 * Initialize push notifications hoàn chỉnh.
 * Gọi sau khi user đã đăng nhập thành công.
 * 
 * Flow:
 * 1. Setup notification handlers (foreground display)
 * 2. Đăng ký push token
 * 3. Gửi token lên server
 */
export async function initializePushNotifications(): Promise<void> {
  if (!Notifications || !Device) {
    console.log('[PushNotifications] Skipping init — packages not available');
    return;
  }

  // 1. Setup handlers
  setupNotificationHandlers();

  // 2. Đăng ký token
  const token = await registerForPushNotifications();
  if (!token) return;

  // 3. Gửi token lên server
  await savePushTokenToServer(token);
}
