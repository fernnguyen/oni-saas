/**
 * NotificationContext — Mobile
 * 
 * Tầng 1: Supabase Realtime subscription (y hệt web NotificationContext)
 *   - Lắng nghe INSERT trên bảng `in_app_notifications` 
 *   - Cập nhật badge count + hiển thị in-app alert khi app foreground
 *
 * Tầng 2: Expo Push Notifications (OS-level)
 *   - Đăng ký push token + gửi lên backend
 *   - Xử lý notification khi tap (foreground/background/killed)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getAuthToken } from '../supabase';
import { getApiBaseUrl, getApiHeaders } from '../api/config';
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface MobileNotification {
  id: string;
  type: 
    | 'qr_session' 
    | 'qr_order' 
    | 'low_stock' 
    | 'system' 
    | 'payment' 
    | 'booking'
    | 'system_broadcast' 
    | 'order_expiring' 
    | 'debt_alert' 
    | 'return_approval' 
    | 'purchase_approval';
  title: string;
  description: string;
  status: 'unread' | 'read';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  metadata?: {
    shopId?: string;
    branchId?: string;
    resourceId?: string;
    sessionId?: string;
    orderId?: string;
    productId?: string;
    itemCount?: number;
    path?: string;
    [key: string]: any;
  };
}

interface NotificationContextProps {
  notifications: MobileNotification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

const SAFE_FALLBACK: NotificationContextProps = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  markAsRead: () => {},
  markAllAsRead: () => {},
  refreshNotifications: async () => {},
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) return SAFE_FALLBACK;
  return ctx;
}

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

interface ProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: ProviderProps) {
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Refs cho stable callbacks
  const authUserRef = useRef<any>(null);
  const toastedIdsRef = useRef<Set<string>>(new Set());

  // ─────────────────────────────────────────────────
  // 1. Load session context từ AsyncStorage
  // ─────────────────────────────────────────────────
  const loadSessionContext = useCallback(async () => {
    try {
      const [sId, tId] = await Promise.all([
        AsyncStorage.getItem('active_shop_id'),
        AsyncStorage.getItem('active_tenant_id'),
      ]);
      setShopId(sId || '');
      setTenantId(tId || '');
    } catch (err) {
      console.error('[NotificationContext] Failed to load session context:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────
  // 2. Fetch notifications từ REST API
  // ─────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!tenantId) return;

    try {
      setIsLoading(true);
      const baseUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      const res = await fetch(
        `${baseUrl}/api/notifications?tenantId=${tenantId}&shopId=${shopId || ''}&limit=50`,
        { headers }
      );

      if (res.ok) {
        const list = await res.json();
        const mapped: MobileNotification[] = (list || []).map((n: any) => ({
          id: `in_app_${n.id}`,
          type: n.type as any,
          title: n.title,
          description: n.content,
          status: n.status || 'unread',
          priority: (n.metadata?.priority || 'medium') as any,
          createdAt: n.created_at,
          metadata: {
            ...n.metadata,
            branchId: n.branch_id,
            tenantId: n.tenant_id,
          },
        }));

        setNotifications(mapped);
      }

      // Tải tổng số lượng tin chưa đọc toàn hệ thống để cập nhật huy hiệu icon điện thoại
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const unreadRes = await fetch(
          `${baseUrl}/api/notifications/unread-counts?tenantId=${tenantId}`,
          { headers, signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (unreadRes.ok) {
          const unreadData = await unreadRes.json();
          const totalUnread = unreadData.total || 0;
          if (Platform.OS !== 'web') {
            const Notifications = require('expo-notifications');
            Notifications.setBadgeCountAsync(totalUnread).catch(() => {});
          }
        }
      } catch (unreadErr) {
        console.warn('[NotificationContext] Không thể đồng bộ badge count (mạng lỗi hoặc timeout):', unreadErr);
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, shopId]);

  // ─────────────────────────────────────────────────
  // 3. Initialize — Load context + auth + initial data
  // ─────────────────────────────────────────────────
  useEffect(() => {
    loadSessionContext();

    // Lắng nghe sự kiện branch-changed để cập nhật shopId/tenantId ngay lập tức
    const branchSub = DeviceEventEmitter.addListener('branch-changed', () => {
      void loadSessionContext();
    });

    // Cache authenticated user
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        authUserRef.current = data.user;
      }
    });

    // Track auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authUserRef.current = session?.user ?? null;
    });

    return () => {
      branchSub.remove();
      subscription.unsubscribe();
    };
  }, [loadSessionContext]);

  // Fetch notifications whenever context loads/changes
  useEffect(() => {
    if (tenantId) {
      void fetchNotifications();
    }
  }, [tenantId, shopId, fetchNotifications]);

  // ─────────────────────────────────────────────────
  // 4. Supabase Realtime Subscription (Tầng 1)
  //    Y hệt web NotificationContext — lắng nghe INSERT trên in_app_notifications
  // ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const channelName = `mobile-notifications-${tenantId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
        },
        (payload) => {
          const newNoti = payload.new as any;
          if (!newNoti) return;

          // Client-side scope filtering (y hệt web)
          if (newNoti.tenant_id !== tenantId) return;
          if (newNoti.branch_id && newNoti.branch_id !== shopId) return;
          if (newNoti.recipient_id && newNoti.recipient_id !== authUserRef.current?.id) return;

          const notiId = `in_app_${newNoti.id}`;

          // Dedup check
          if (toastedIdsRef.current.has(notiId)) return;
          toastedIdsRef.current.add(notiId);
          setTimeout(() => toastedIdsRef.current.delete(notiId), 10000);

          // Haptic feedback cho new notification
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          // Re-fetch full list to ensure consistency
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, shopId, fetchNotifications]);

  // ─────────────────────────────────────────────────
  // 5. Refresh khi app trở lại foreground
  // ─────────────────────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Reload session context (có thể đã chuyển branch)
        loadSessionContext().then(() => {
          if (tenantId) void fetchNotifications();
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [loadSessionContext, tenantId, fetchNotifications]);

  // ─────────────────────────────────────────────────
  // 6. Mark as read
  // ─────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, status: 'read' as const } : n))
    );

    // Persist to server
    if (id.startsWith('in_app_')) {
      try {
        const rawId = id.replace('in_app_', '');
        const baseUrl = getApiBaseUrl();
        const headers = await getApiHeaders();
        const res = await fetch(`${baseUrl}/api/notifications/${rawId}/read`, {
          method: 'POST',
          headers,
        });

        if (res.ok && tenantId) {
          // Đồng bộ lại badge count ngoài icon điện thoại
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const unreadRes = await fetch(
            `${baseUrl}/api/notifications/unread-counts?tenantId=${tenantId}`,
            { headers, signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (unreadRes.ok) {
            const unreadData = await unreadRes.json();
            const totalUnread = unreadData.total || 0;
            if (Platform.OS !== 'web') {
              const Notifications = require('expo-notifications');
              Notifications.setBadgeCountAsync(totalUnread).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error('[NotificationContext] Failed to mark as read:', err);
      }
    }
  }, [tenantId]);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, status: 'read' as const })));

    // Persist to server
    if (tenantId) {
      try {
        const baseUrl = getApiBaseUrl();
        const headers = await getApiHeaders();
        const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ tenantId, shopId }),
        });

        if (res.ok) {
          // Đồng bộ lại badge count ngoài icon điện thoại
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const unreadRes = await fetch(
            `${baseUrl}/api/notifications/unread-counts?tenantId=${tenantId}`,
            { headers, signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (unreadRes.ok) {
            const unreadData = await unreadRes.json();
            const totalUnread = unreadData.total || 0;
            if (Platform.OS !== 'web') {
              const Notifications = require('expo-notifications');
              Notifications.setBadgeCountAsync(totalUnread).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error('[NotificationContext] Failed to mark all as read:', err);
      }
    }
  }, [tenantId, shopId]);

  // ─────────────────────────────────────────────────
  // 7. Computed values
  // ─────────────────────────────────────────────────
  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
