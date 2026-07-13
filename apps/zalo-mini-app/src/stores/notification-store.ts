import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { getNotifications, markNotificationRead, markAllNotificationsRead, getQrOrders } from '@/services/shop-api';
import { useAuthStore } from './auth-store';
import { useTenantStore } from './tenant-store';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  status: 'unread' | 'read' | 'archived';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  metadata?: any;
  notification_reads?: { read_at: string }[];
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  initialized: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addRealtimeNotification: (notif: any) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  initialized: false,

  fetchNotifications: async () => {
    const { tenant, shop } = useTenantStore.getState();
    if (!tenant?.id) return;
    
    set({ loading: true });
    try {
      // 1. Fetch system notifications
      const notifRes = await getNotifications(tenant.id, shop?.id);
      let systemNotifs = Array.isArray(notifRes?.data) ? notifRes.data : [];

      // 2. Fetch pending QR orders
      let qrNotifs: AppNotification[] = [];
      if (shop?.id) {
        const qrRes = await getQrOrders(shop.id, { status: 'pending' });
        if (Array.isArray(qrRes)) {
          qrNotifs = qrRes.map((req: any) => ({
            id: `qr_order_${req.id}`,
            type: 'qr_order',
            title: 'Yêu cầu gọi món mới',
            content: `Khách hàng vừa gửi yêu cầu duyệt ${Array.isArray(req.items) ? req.items.length : 0} món mới.`,
            status: 'unread',
            priority: 'high',
            created_at: req.created_at,
            metadata: { orderId: req.id }
          }));
        }
      }

      const combined = [...qrNotifs, ...systemNotifs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const unreadCount = combined.filter((n) => !n.notification_reads?.length).length;

      set({ notifications: combined, unreadCount, initialized: true });
    } catch (err) {
      console.error('[NotificationStore] Fetch error:', err);
    } finally {
      set({ loading: false });
    }
  },

  markAsRead: async (id: string) => {
    try {
      set((state) => {
        const updated = state.notifications.map((n) => {
          if (n.id === id && !n.notification_reads?.length) {
            return { ...n, notification_reads: [{ read_at: new Date().toISOString() }] };
          }
          return n;
        });
        const unreadCount = updated.filter((n) => !n.notification_reads?.length).length;
        return { notifications: updated, unreadCount };
      });
      
      if (!id.startsWith('qr_order_')) {
        await markNotificationRead(id);
      }
    } catch (err) {
      console.error('[NotificationStore] Mark read error:', err);
    }
  },

  markAllAsRead: async () => {
    const { tenant, shop } = useTenantStore.getState();
    if (!tenant?.id) return;

    try {
      set((state) => {
        const updated = state.notifications.map((n) => ({
          ...n,
          notification_reads: n.notification_reads?.length ? n.notification_reads : [{ read_at: new Date().toISOString() }]
        }));
        return { notifications: updated, unreadCount: 0 };
      });
      
      await markAllNotificationsRead(tenant.id, shop?.id);
    } catch (err) {
      console.error('[NotificationStore] Mark all read error:', err);
    }
  },

  addRealtimeNotification: (newNotif) => {
    set((state) => {
      if (state.notifications.some((n) => n.id === newNotif.id)) return state;
      return {
        notifications: [newNotif, ...state.notifications],
        unreadCount: state.unreadCount + 1
      };
    });
  },

  reset: () => {
    set({ notifications: [], unreadCount: 0, initialized: false });
  }
}));

// Synthesize Premium Ding-Dong Chime using Web Audio API (0% static asset dependency)
export function playChime() {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const oscHarmonic = ctx.createOscillator();
      const gainHarmonic = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 1.5, startTime);
      
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      gainHarmonic.gain.setValueAtTime(0.05, startTime);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7);
      
      osc.connect(gainNode);
      oscHarmonic.connect(gainHarmonic);
      
      gainNode.connect(ctx.destination);
      gainHarmonic.connect(ctx.destination);
      
      osc.start(startTime);
      oscHarmonic.start(startTime);
      
      osc.stop(startTime + duration);
      oscHarmonic.stop(startTime + duration);
    };

    // Ding (A5 - 880Hz)
    playTone(880, ctx.currentTime, 1.0);
    // Dong (E5 - 659.25Hz) after 0.25 seconds
    playTone(659.25, ctx.currentTime + 0.25, 1.2);
  } catch (err) {
    console.error('AudioContext synthesis failed:', err);
  }
}

// A hook to handle realtime subscriptions and showing toasts
export function useNotificationListener() {
  const { tenant, shop } = useTenantStore();
  const { fetchNotifications, addRealtimeNotification, initialized } = useNotificationStore();

  useEffect(() => {
    if (tenant?.id && !initialized) {
      fetchNotifications();
    }
  }, [tenant?.id, initialized]);
  
  useEffect(() => {
    if (!tenant?.id) return;
    
    // 1. Channel for System Notifications
    const sysChannel = supabase
      .channel('public:in_app_notifications:tenant:' + tenant.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'in_app_notifications', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          if (shop?.id && newNotif.metadata?.branchId && newNotif.metadata.branchId !== shop.id) return;
          
          addRealtimeNotification(newNotif);
          toast.success(`${newNotif.title}: ${newNotif.content}`, { duration: 4000 });
          playChime();
        }
      )
      .subscribe();
      
    // 2. Channel for QR Orders (only if shop is selected)
    let qrChannel: any = null;
    if (shop?.id) {
      qrChannel = supabase
        .channel('public:qr_order_requests:shop:' + shop.id)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'qr_order_requests', filter: `branch_id=eq.${shop.id}` },
          (payload) => {
            const newReq = payload.new as any;
            if (newReq.status === 'pending') {
              const qty = Array.isArray(newReq.items) ? newReq.items.length : 0;
              const notifId = `qr_order_${newReq.id}`;
              const qrNotif: AppNotification = {
                id: notifId,
                type: 'qr_order',
                title: 'Yêu cầu gọi món mới',
                content: `Khách hàng vừa gửi yêu cầu duyệt ${qty} món mới.`,
                status: 'unread',
                priority: 'high',
                created_at: newReq.created_at,
                metadata: { orderId: newReq.id }
              };
              
              addRealtimeNotification(qrNotif);
              toast.success(`${qrNotif.title}: ${qrNotif.content}`, { duration: 4000 });
              playChime();
            }
          }
        )
        .subscribe();
    }
      
    return () => {
      supabase.removeChannel(sysChannel);
      if (qrChannel) supabase.removeChannel(qrChannel);
    };
  }, [tenant?.id, shop?.id]);
}
