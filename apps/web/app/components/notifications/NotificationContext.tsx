'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export interface AppNotification {
  id: string;
  type: 'qr_session' | 'qr_order' | 'low_stock' | 'system' | 'payment' | 'booking';
  title: string;
  description: string;
  status: 'unread' | 'read' | 'archived';
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
    [key: string]: any;
  };
}

interface NotificationContextProps {
  notifications: AppNotification[];
  unreadCount: number;
  isMuted: boolean;
  toggleMute: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  
  // Global QR Drawer controls
  isQRDrawerOpen: boolean;
  activeQRTab: 'sessions' | 'orders';
  highlightQRId: string | null;
  openQRDrawer: (tab: 'sessions' | 'orders', highlightId?: string) => void;
  closeQRDrawer: () => void;
  
  // Shared metadata
  tables: Record<string, string>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

const SAFE_FALLBACK_CONTEXT: NotificationContextProps = {
  notifications: [],
  unreadCount: 0,
  isMuted: true,
  toggleMute: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  isQRDrawerOpen: false,
  activeQRTab: 'sessions',
  highlightQRId: null,
  openQRDrawer: () => {},
  closeQRDrawer: () => {},
  tables: {},
  refreshNotifications: async () => {},
};

export function useNotificationCenter() {
  const context = useContext(NotificationContext);
  if (!context) {
    return SAFE_FALLBACK_CONTEXT;
  }
  return context;
}

interface ProviderProps {
  shopId: string;
  children: React.ReactNode;
}

export function NotificationProvider({ shopId, children }: ProviderProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [tables, setTables] = useState<Record<string, string>>({});
  
  // QR Drawer states
  const [isQRDrawerOpen, setIsQRDrawerOpen] = useState(false);
  const [activeQRTab, setActiveQRTab] = useState<'sessions' | 'orders'>('sessions');
  const [highlightQRId, setHighlightQRId] = useState<string | null>(null);

  // Deduplication cache to prevent duplicate toasts for the same realtime event
  const toastedIdsRef = useRef<Set<string>>(new Set());

  // Initialize mute sound preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const muted = localStorage.getItem('global_notification_mute_sound') === 'true';
      setIsMuted(muted);
    }
  }, []);

  const toggleMute = () => {
    const newVal = !isMuted;
    setIsMuted(newVal);
    localStorage.setItem('global_notification_mute_sound', String(newVal));
    toast.success(newVal ? 'Đã tắt âm thanh thông báo' : 'Đã bật âm thanh thông báo');
  };

  // Synthesize Bell Ding-Dong Chime using Web Audio API (0% static asset dependency)
  const playChime = useCallback(() => {
    if (isMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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
        
        gainNode.gain.setValueAtTime(0.22, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        gainHarmonic.gain.setValueAtTime(0.06, startTime);
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

      // Premium Ding-Dong Bell Sound
      playTone(880, ctx.currentTime, 1.2); // Ding (A5)
      playTone(659.25, ctx.currentTime + 0.28, 1.5); // Dong (E5)
    } catch (err) {
      console.error('AudioContext synthesis failed:', err);
    }
  }, [isMuted]);

  // Fetch initial pending QR details & table mapping
  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch tables map to render human-friendly names
      const tabRes = await fetch(`/api/shops/${shopId}/location-resources?limit=200`);
      const tableMap: Record<string, string> = {};
      if (tabRes.ok) {
        const result = await tabRes.json();
        const rows = Array.isArray(result.data) ? result.data : [];
        rows.forEach((r: any) => {
          const id = r.resource_id || r.id || '';
          if (id) {
            tableMap[id] = r.name;
          }
        });
        setTables(tableMap);
      }

      // 2. Fetch pending requests
      const reqRes = await fetch(`/api/shops/${shopId}/qr-orders?status=pending`);
      let qrOrderNotifications: AppNotification[] = [];
      if (reqRes.ok) {
        const orders = await reqRes.json();
        qrOrderNotifications = (orders || []).map((o: any) => {
          const tableName = tableMap[o.resource_id] || 'Bàn ăn ẩn danh';
          const qty = Array.isArray(o.items) ? o.items.length : 0;
          return {
            id: `qr_order_${o.id}`,
            type: 'qr_order' as const,
            title: 'Yêu cầu gọi món mới',
            description: `${tableName} vừa gửi yêu cầu duyệt ${qty} món ăn mới.`,
            status: 'unread' as const,
            priority: 'high' as const,
            createdAt: o.created_at,
            metadata: {
              shopId,
              branchId: shopId,
              resourceId: o.resource_id,
              sessionId: o.session_id,
              orderId: o.id,
              itemCount: qty,
            }
          };
        });
      }

      // 3. Fetch pending table sessions
      const sessRes = await fetch(`/api/shops/${shopId}/qr-sessions?status=pending`);
      let qrSessionNotifications: AppNotification[] = [];
      if (sessRes.ok) {
        const sessions = await sessRes.json();
        qrSessionNotifications = (sessions || []).map((s: any) => {
          const tableName = tableMap[s.resource_id] || 'Bàn ăn ẩn danh';
          return {
            id: `qr_session_${s.id}`,
            type: 'qr_session' as const,
            title: 'Yêu cầu mở bàn ăn',
            description: `${tableName} vừa quét mã QR và yêu cầu mở bàn.`,
            status: 'unread' as const,
            priority: 'high' as const,
            createdAt: s.created_at,
            metadata: {
              shopId,
              branchId: shopId,
              resourceId: s.resource_id,
              sessionId: s.id,
            }
          };
        });
      }

      // Combine and sort by createdAt desc
      const combined = [...qrSessionNotifications, ...qrOrderNotifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNotifications(combined);
    } catch (err) {
      console.error('Failed to fetch global notifications metadata:', err);
    }
  }, [shopId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const playChimeRef = useRef(playChime);
  useEffect(() => {
    playChimeRef.current = playChime;
  }, [playChime]);

  // Subscribe to Realtime notifications from Supabase
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channelName = `global-notifications-${shopId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_order_requests',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            const newReq = newRecord as any;
            if (newReq && newReq.status === 'pending') {
              const notiId = `qr_order_${newReq.id}`;
              
              // Prevent double notify using deduplication ref
              let shouldAlert = false;
              if (!toastedIdsRef.current.has(notiId)) {
                toastedIdsRef.current.add(notiId);
                shouldAlert = true;
                setTimeout(() => {
                  toastedIdsRef.current.delete(notiId);
                }, 10000);
              }

              // 1. Update State (PURE transition)
              setNotifications((prev) => {
                if (prev.some((n) => n.id === notiId)) return prev;
                
                const tableName = tablesRef.current[newReq.resource_id] || 'Bàn ăn ẩn danh';
                const qty = Array.isArray(newReq.items) ? newReq.items.length : 0;
                const newNoti: AppNotification = {
                  id: notiId,
                  type: 'qr_order',
                  title: 'Yêu cầu gọi món mới',
                  description: `${tableName} vừa gửi yêu cầu duyệt ${qty} món ăn mới.`,
                  status: 'unread',
                  priority: 'high',
                  createdAt: newReq.created_at,
                  metadata: {
                    shopId,
                    branchId: shopId,
                    resourceId: newReq.resource_id,
                    sessionId: newReq.session_id,
                    orderId: newReq.id,
                    itemCount: qty,
                  }
                };
                
                return [newNoti, ...prev];
              });

              // 2. Trigger Side Effects Outside setNotifications (guarantees exactly once execution)
              if (shouldAlert) {
                const tableName = tablesRef.current[newReq.resource_id] || 'Bàn ăn ẩn danh';
                const qty = Array.isArray(newReq.items) ? newReq.items.length : 0;
                
                playChimeRef.current();
                toast.info(`🔔 ${tableName} vừa gọi ${qty} món mới!`, {
                  duration: 8000,
                  action: {
                    label: 'Xem ngay',
                    onClick: () => {
                      openQRDrawer('orders', newReq.id);
                    }
                  }
                });
              }
            }
          } else if (eventType === 'UPDATE') {
            const req = newRecord as any;
            if (req) {
              const notiId = `qr_order_${req.id}`;
              if (req.status !== 'pending') {
                // If no longer pending, remove from unread notifications list
                setNotifications((prev) => prev.filter((n) => n.id !== notiId));
              } else {
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === notiId)) return prev;
                  const tableName = tablesRef.current[req.resource_id] || 'Bàn ăn ẩn danh';
                  const qty = Array.isArray(req.items) ? req.items.length : 0;
                  return [{
                    id: notiId,
                    type: 'qr_order',
                    title: 'Yêu cầu gọi món mới',
                    description: `${tableName} vừa gửi yêu cầu duyệt ${qty} món ăn mới.`,
                    status: 'unread',
                    priority: 'high',
                    createdAt: req.created_at,
                    metadata: {
                      shopId,
                      branchId: shopId,
                      resourceId: req.resource_id,
                      sessionId: req.session_id,
                      orderId: req.id,
                      itemCount: qty,
                    }
                  }, ...prev];
                });
              }
            }
          } else if (eventType === 'DELETE') {
            const req = oldRecord as any;
            if (req) {
              const notiId = `qr_order_${req.id}`;
              setNotifications((prev) => prev.filter((n) => n.id !== notiId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_ordering_sessions',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            const sess = newRecord as any;
            if (sess && sess.status === 'pending' && sess.active === 'TRUE') {
              const notiId = `qr_session_${sess.id}`;
              
              // Prevent double notify using deduplication ref
              let shouldAlert = false;
              if (!toastedIdsRef.current.has(notiId)) {
                toastedIdsRef.current.add(notiId);
                shouldAlert = true;
                setTimeout(() => {
                  toastedIdsRef.current.delete(notiId);
                }, 10000);
              }

              // 1. Update State (PURE transition)
              setNotifications((prev) => {
                if (prev.some((n) => n.id === notiId)) return prev;
                
                const tableName = tablesRef.current[sess.resource_id] || 'Bàn ăn ẩn danh';
                const newNoti: AppNotification = {
                  id: notiId,
                  type: 'qr_session',
                  title: 'Yêu cầu mở bàn ăn',
                  description: `${tableName} vừa quét mã QR và yêu cầu mở bàn.`,
                  status: 'unread',
                  priority: 'high',
                  createdAt: sess.created_at,
                  metadata: {
                    shopId,
                    branchId: shopId,
                    resourceId: sess.resource_id,
                    sessionId: sess.id,
                  }
                };
                
                return [newNoti, ...prev];
              });

              // 2. Trigger Side Effects Outside setNotifications (guarantees exactly once execution)
              if (shouldAlert) {
                const tableName = tablesRef.current[sess.resource_id] || 'Bàn ăn ẩn danh';
                
                playChimeRef.current();
                toast.info(`🔔 ${tableName} yêu cầu mở bàn!`, {
                  duration: 8000,
                  action: {
                    label: 'Mở bàn',
                    onClick: () => {
                      openQRDrawer('sessions', sess.id);
                    }
                  }
                });
              }
            }
          } else if (eventType === 'UPDATE') {
            const sess = newRecord as any;
            if (sess) {
              const notiId = `qr_session_${sess.id}`;
              if (sess.status !== 'pending' || sess.active !== 'TRUE') {
                setNotifications((prev) => prev.filter((n) => n.id !== notiId));
              } else {
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === notiId)) return prev;
                  const tableName = tablesRef.current[sess.resource_id] || 'Bàn ăn ẩn danh';
                  return [{
                    id: notiId,
                    type: 'qr_session',
                    title: 'Yêu cầu mở bàn ăn',
                    description: `${tableName} vừa quét mã QR và yêu cầu mở bàn.`,
                    status: 'unread',
                    priority: 'high',
                    createdAt: sess.created_at,
                    metadata: {
                      shopId,
                      branchId: shopId,
                      resourceId: sess.resource_id,
                      sessionId: sess.id,
                    }
                  }, ...prev];
                });
              }
            }
          } else if (eventType === 'DELETE') {
            const sess = oldRecord as any;
            if (sess) {
              const notiId = `qr_session_${sess.id}`;
              setNotifications((prev) => prev.filter((n) => n.id !== notiId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shopId]);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'read' as const } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: 'read' as const }))
    );
  };

  // QR Drawer handlers
  const openQRDrawer = (tab: 'sessions' | 'orders', highlightId?: string) => {
    setActiveQRTab(tab);
    if (highlightId) {
      setHighlightQRId(highlightId);
    } else {
      setHighlightQRId(null);
    }
    setIsQRDrawerOpen(true);
  };

  const closeQRDrawer = () => {
    setIsQRDrawerOpen(false);
    setHighlightQRId(null);
  };

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isMuted,
        toggleMute,
        markAsRead,
        markAllAsRead,
        
        // Global QR Drawer controls
        isQRDrawerOpen,
        activeQRTab,
        highlightQRId,
        openQRDrawer,
        closeQRDrawer,
        
        tables,
        refreshNotifications: fetchData,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
