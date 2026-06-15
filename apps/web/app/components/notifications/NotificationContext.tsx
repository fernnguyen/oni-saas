'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export interface AppNotification {
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
    path?: string;
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
  tenantId?: string; // Optional tenant ID for general operational notifications
  children: React.ReactNode;
}

export function NotificationProvider({ shopId, tenantId, children }: ProviderProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [tables, setTables] = useState<Record<string, string>>({});
  const [industryType, setIndustryType] = useState('fnb');

  const industryTypeRef = useRef(industryType);
  useEffect(() => {
    industryTypeRef.current = industryType;
  }, [industryType]);
  
  // QR Drawer states
  const [isQRDrawerOpen, setIsQRDrawerOpen] = useState(false);
  const [activeQRTab, setActiveQRTab] = useState<'sessions' | 'orders'>('sessions');
  const [highlightQRId, setHighlightQRId] = useState<string | null>(null);

  // Authenticated user reference for scoping notifications
  const authUserRef = useRef<any>(null);

  // Deduplication cache to prevent duplicate toasts for the same realtime event
  const toastedIdsRef = useRef<Set<string>>(new Set());

  // Initialize mute sound preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const muted = localStorage.getItem('global_notification_mute_sound') === 'true';
      setIsMuted(muted);
    }
  }, []);

  // Fetch and cache the currently authenticated user with reactive updates
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    // Initial fetch
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        authUserRef.current = data.user;
      }
    });

    // Sub to auth changes to ensure user ref is never stale
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        authUserRef.current = session.user;
      } else {
        authUserRef.current = null;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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
      // 0. Fetch shop settings to get industry_type
      let currentIndustry = 'fnb';
      const settingsRes = await fetch(`/api/shops/${shopId}/settings`);
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings && settings.industry_type) {
          currentIndustry = settings.industry_type.toLowerCase();
          setIndustryType(currentIndustry);
        }
      }

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

      // 2. Fetch pending requests (QR Orders)
      const reqRes = await fetch(`/api/shops/${shopId}/qr-orders?status=pending`);
      let qrOrderNotifications: AppNotification[] = [];
      if (reqRes.ok) {
        const orders = await reqRes.json();
        qrOrderNotifications = (orders || []).map((o: any) => {
          const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : currentIndustry === 'retail' ? 'Khách mua' : 'Bàn ăn';
          const tableName = tableMap[o.resource_id] || `${defaultTableName} ẩn danh`;
          const qty = Array.isArray(o.items) ? o.items.length : 0;
          
          let title = 'Yêu cầu gọi món mới';
          let description = `${tableName} vừa gửi yêu cầu duyệt ${qty} món mới.`;
          if (currentIndustry === 'sports_court' || currentIndustry === 'lodging') {
            title = 'Yêu cầu dịch vụ mới';
            description = `${tableName} vừa gửi yêu cầu duyệt ${qty} dịch vụ mới.`;
          } else if (currentIndustry === 'retail') {
            title = 'Yêu cầu đơn hàng QR mới';
            description = `${tableName} vừa gửi yêu cầu duyệt ${qty} sản phẩm mới.`;
          }

          return {
            id: `qr_order_${o.id}`,
            type: 'qr_order' as const,
            title,
            description,
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

      // 3. Fetch pending table sessions (QR Sessions)
      const sessRes = await fetch(`/api/shops/${shopId}/qr-sessions?status=pending`);
      let qrSessionNotifications: AppNotification[] = [];
      if (sessRes.ok) {
        const sessions = await sessRes.json();
        qrSessionNotifications = (sessions || []).map((s: any) => {
          const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : currentIndustry === 'retail' ? 'Khách mua' : 'Bàn ăn';
          const tableName = tableMap[s.resource_id] || `${defaultTableName} ẩn danh`;

          let title = 'Yêu cầu mở bàn ăn';
          let description = `${tableName} vừa quét mã QR và yêu cầu mở bàn.`;
          if (currentIndustry === 'sports_court') {
            title = 'Yêu cầu nhận sân';
            description = `${tableName} vừa quét mã QR và yêu cầu nhận sân.`;
          } else if (currentIndustry === 'lodging') {
            title = 'Yêu cầu nhận phòng';
            description = `${tableName} vừa quét mã QR và yêu cầu nhận phòng.`;
          } else if (currentIndustry === 'retail') {
            title = 'Yêu cầu kết nối khách hàng';
            description = `${tableName} vừa quét mã QR và kết nối.`;
          }

          return {
            id: `qr_session_${s.id}`,
            type: 'qr_session' as const,
            title,
            description,
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

      // 4. Fetch general in-app notifications if tenantId is provided
      let inAppNotifications: AppNotification[] = [];
      if (tenantId) {
        const inAppRes = await fetch(`/api/notifications?tenantId=${tenantId}&shopId=${shopId}`);
        if (inAppRes.ok) {
          const inAppList = await inAppRes.json();
          inAppNotifications = (inAppList || []).map((n: any) => ({
            id: `in_app_${n.id}`,
            type: n.type as any,
            title: n.title,
            description: n.content,
            status: n.status,
            priority: (n.metadata?.priority || 'medium') as any,
            createdAt: n.created_at,
            metadata: {
              ...n.metadata,
              branchId: n.branch_id,
              tenantId: n.tenant_id,
            }
          }));
        }
      }

      // Filter out duplicate historical QR notifications if their active pending counterparts are already in the list
      const activeSessionIds = new Set((qrSessionNotifications || []).map(n => n.metadata?.sessionId).filter(Boolean));
      const activeOrderIds = new Set((qrOrderNotifications || []).map(n => n.metadata?.orderId).filter(Boolean));

      const filteredInApp = (inAppNotifications || []).filter((n) => {
        if (n.type === 'qr_session' && n.metadata?.sessionId && activeSessionIds.has(n.metadata.sessionId)) {
          return false; // Skip duplicate history item, active pending is already displayed
        }
        if (n.type === 'qr_order' && n.metadata?.orderId && activeOrderIds.has(n.metadata.orderId)) {
          return false; // Skip duplicate history item, active pending is already displayed
        }
        return true;
      });

      // Combine and sort by createdAt desc
      const combined = [...qrSessionNotifications, ...qrOrderNotifications, ...filteredInApp].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNotifications(combined);
    } catch (err) {
      console.error('Failed to fetch global notifications metadata:', err);
    }
  }, [shopId, tenantId]);

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

  // Subscribe to Realtime QR notifications from Supabase (postgres_changes)
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
              
              let shouldAlert = false;
              if (!toastedIdsRef.current.has(notiId)) {
                toastedIdsRef.current.add(notiId);
                shouldAlert = true;
                setTimeout(() => {
                  toastedIdsRef.current.delete(notiId);
                }, 10000);
              }

              // Update State
              setNotifications((prev) => {
                if (prev.some((n) => n.id === notiId)) return prev;
                
                const currentIndustry = industryTypeRef.current;
                const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                const tableName = tablesRef.current[newReq.resource_id] || `${defaultTableName} ẩn danh`;
                const qty = Array.isArray(newReq.items) ? newReq.items.length : 0;
                
                let title = 'Yêu cầu gọi món mới';
                let description = `${tableName} vừa gửi yêu cầu duyệt ${qty} món mới.`;
                if (currentIndustry === 'sports_court') {
                  title = 'Yêu cầu gọi món/dịch vụ';
                  description = `${tableName} vừa gửi yêu cầu duyệt ${qty} món mới.`;
                } else if (currentIndustry === 'lodging') {
                  title = 'Yêu cầu dịch vụ phòng';
                  description = `${tableName} vừa gửi yêu cầu duyệt ${qty} dịch vụ mới.`;
                }

                const newNoti: AppNotification = {
                  id: notiId,
                  type: 'qr_order',
                  title,
                  description,
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

              if (shouldAlert) {
                const currentIndustry = industryTypeRef.current;
                const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                const tableName = tablesRef.current[newReq.resource_id] || `${defaultTableName} ẩn danh`;
                const qty = Array.isArray(newReq.items) ? newReq.items.length : 0;
                
                let toastMsg = `🔔 ${tableName} vừa gọi ${qty} món mới!`;
                if (currentIndustry === 'sports_court') {
                  toastMsg = `🔔 ${tableName} vừa gọi ${qty} món/dịch vụ mới!`;
                } else if (currentIndustry === 'lodging') {
                  toastMsg = `🔔 ${tableName} vừa gọi ${qty} dịch vụ mới!`;
                }

                playChimeRef.current();
                toast.info(toastMsg, {
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
                setNotifications((prev) => prev.filter((n) => n.id !== notiId));
              } else {
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === notiId)) return prev;
                  
                  const currentIndustry = industryTypeRef.current;
                  const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                  const tableName = tablesRef.current[req.resource_id] || `${defaultTableName} ẩn danh`;
                  const qty = Array.isArray(req.items) ? req.items.length : 0;

                  let title = 'Yêu cầu gọi món mới';
                  let description = `${tableName} vừa gửi yêu cầu duyệt ${qty} món mới.`;
                  if (currentIndustry === 'sports_court') {
                    title = 'Yêu cầu gọi món/dịch vụ';
                    description = `${tableName} vừa gửi yêu cầu duyệt ${qty} món mới.`;
                  } else if (currentIndustry === 'lodging') {
                    title = 'Yêu cầu dịch vụ phòng';
                    description = `${tableName} vừa gửi yêu cầu duyệt ${qty} dịch vụ mới.`;
                  }

                  return [{
                    id: notiId,
                    type: 'qr_order',
                    title,
                    description,
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
              
              let shouldAlert = false;
              if (!toastedIdsRef.current.has(notiId)) {
                toastedIdsRef.current.add(notiId);
                shouldAlert = true;
                setTimeout(() => {
                  toastedIdsRef.current.delete(notiId);
                }, 10000);
              }

              // Update State
              setNotifications((prev) => {
                if (prev.some((n) => n.id === notiId)) return prev;
                
                const currentIndustry = industryTypeRef.current;
                const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                const tableName = tablesRef.current[sess.resource_id] || `${defaultTableName} ẩn danh`;

                let title = 'Yêu cầu mở bàn';
                let description = `${tableName} vừa quét mã QR và yêu cầu mở bàn.`;
                if (currentIndustry === 'sports_court') {
                  title = 'Yêu cầu mở sân';
                  description = `${tableName} vừa quét mã QR và yêu cầu mở sân.`;
                } else if (currentIndustry === 'lodging') {
                  title = 'Yêu cầu mở phòng';
                  description = `${tableName} vừa quét mã QR và yêu cầu mở phòng.`;
                }

                const newNoti: AppNotification = {
                  id: notiId,
                  type: 'qr_session',
                  title,
                  description,
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

              if (shouldAlert) {
                const currentIndustry = industryTypeRef.current;
                const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                const tableName = tablesRef.current[sess.resource_id] || `${defaultTableName} ẩn danh`;
                
                let toastMsg = `🔔 ${tableName} yêu cầu mở bàn!`;
                let toastLabel = 'Mở bàn';
                if (currentIndustry === 'sports_court') {
                  toastMsg = `🔔 ${tableName} yêu cầu mở sân!`;
                  toastLabel = 'Mở sân';
                } else if (currentIndustry === 'lodging') {
                  toastMsg = `🔔 ${tableName} yêu cầu mở phòng!`;
                  toastLabel = 'Mở phòng';
                }

                playChimeRef.current();
                toast.info(toastMsg, {
                  duration: 8000,
                  action: {
                    label: toastLabel,
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
                  
                  const currentIndustry = industryTypeRef.current;
                  const defaultTableName = currentIndustry === 'sports_court' ? 'Sân' : currentIndustry === 'lodging' ? 'Phòng' : 'Bàn';
                  const tableName = tablesRef.current[sess.resource_id] || `${defaultTableName} ẩn danh`;

                  let title = 'Yêu cầu mở bàn';
                  let description = `${tableName} vừa quét mã QR và yêu cầu mở bàn.`;
                  if (currentIndustry === 'sports_court') {
                    title = 'Yêu cầu mở sân';
                    description = `${tableName} vừa quét mã QR và yêu cầu mở sân.`;
                  } else if (currentIndustry === 'lodging') {
                    title = 'Yêu cầu mở phòng';
                    description = `${tableName} vừa quét mã QR và yêu cầu mở phòng.`;
                  }

                  return [{
                    id: notiId,
                    type: 'qr_session',
                    title,
                    description,
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

  // Subscribe to General operational in-app notifications
  useEffect(() => {
    if (!tenantId) return;

    const provider = process.env.NEXT_PUBLIC_REALTIME_PROVIDER || 'supabase';

    if (provider === 'socketio') {
      // 1. Native WebSocket Connection (Lightweight self-hosted custom WS on /socket)
      let ws: WebSocket | null = null;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect directly to domain/socket (which Nginx reverse proxies to internal port 3001)
        ws = new WebSocket(`${protocol}//${window.location.host}/socket?tenantId=${tenantId}`);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && data.tenantId === tenantId) {
              // Apply scoping checks
              if (data.branchId && data.branchId !== shopId) return;
              if (data.recipientId && data.recipientId !== authUserRef.current?.id) return;

              const notiId = `in_app_ws_${Date.now()}`;
              let shouldAlert = false;
              if (!toastedIdsRef.current.has(notiId)) {
                toastedIdsRef.current.add(notiId);
                shouldAlert = true;
                setTimeout(() => {
                  toastedIdsRef.current.delete(notiId);
                }, 8000);
              }

              if (shouldAlert) {
                const isQrEvent = data.type === 'qr_order' || data.type === 'qr_session';

                // Play bell chime sound for all operational in-app events (QR events have dedicated table listeners that chime & toast)
                if (!isQrEvent) {
                  playChimeRef.current();
                  if (data.type === 'system_broadcast') {
                    toast.info(`📢 ${data.title}: ${data.content}`, {
                      duration: 10000,
                    });
                  }
                }

                // Pull latest notification list from the server
                void fetchData();
              }
            }
          } catch (err) {
            console.error('Failed to parse WS message:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket connection error:', err);
        };
      } catch (err) {
        console.error('Failed to initialize WebSocket client:', err);
      }

      return () => {
        if (ws) ws.close();
      };
    } else {
      // 2. Supabase Cloud Realtime listener (Postgres changes)
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const channelName = `in-app-notifications-${tenantId}-${Math.random().toString(36).slice(2, 9)}`;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'in_app_notifications'
          },
          (payload) => {
            const newNoti = payload.new as any;
            if (!newNoti) return;

            // Detailed debug logs for realtime notification routing in development
            console.log("[Notification Realtime DB Event] Received row:", {
              id: newNoti.id,
              tenant_id: newNoti.tenant_id,
              branch_id: newNoti.branch_id,
              recipient_id: newNoti.recipient_id,
              recipient_role: newNoti.recipient_role,
              currentUser: authUserRef.current?.id
            });

            // Enforce tenant, branch and recipient user scope checks on client
            if (newNoti.tenant_id !== tenantId) {
              console.log("[Notification Realtime DB Event] Filtered out: tenant mismatch");
              return;
            }
            if (newNoti.branch_id && newNoti.branch_id !== shopId) {
              console.log("[Notification Realtime DB Event] Filtered out: branch mismatch");
              return;
            }
            if (newNoti.recipient_id && newNoti.recipient_id !== authUserRef.current?.id) {
              console.log("[Notification Realtime DB Event] Filtered out: recipient mismatch");
              return;
            }

            const notiId = `in_app_${newNoti.id}`;
            let shouldAlert = false;
            if (!toastedIdsRef.current.has(notiId)) {
              toastedIdsRef.current.add(notiId);
              shouldAlert = true;
              setTimeout(() => {
                toastedIdsRef.current.delete(notiId);
              }, 10000);
            }

            if (shouldAlert) {
              const isQrEvent = newNoti.type === 'qr_order' || newNoti.type === 'qr_session';

              // Play bell chime sound for all operational in-app events (QR table events have dedicated table listeners that chime & toast)
              if (!isQrEvent) {
                playChimeRef.current();
                
                if (newNoti.type === 'system_broadcast') {
                  toast.info(`📢 ${newNoti.title}: ${newNoti.content}`, {
                    duration: 10000,
                  });
                }
              }

              // Pull latest notifications (quietly updates Noti Center)
              void fetchData();
            }
          }
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }
  }, [tenantId, shopId, fetchData]);

  const markAsRead = async (id: string) => {
    // 1. Optimistically update local React state
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'read' as const } : n))
    );

    // 2. If it is a persistent in-app notification, save to Postgres reads
    if (id.startsWith('in_app_')) {
      try {
        const rawId = id.replace('in_app_', '');
        await fetch(`/api/notifications/${rawId}/read`, {
          method: 'POST',
        });
      } catch (err) {
        console.error('Failed to mark notification as read on database:', err);
      }
    }
  };

  const markAllAsRead = async () => {
    // 1. Optimistically update local React state
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: 'read' as const }))
    );

    // 2. Save read-all status on Postgres
    if (tenantId) {
      try {
        await fetch('/api/notifications/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, shopId }),
        });
      } catch (err) {
        console.error('Failed to mark all notifications as read on database:', err);
      }
    }
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
