'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQRCollaborativeCart, CartItem, SelectedModifier, generateRandomNickname } from '@/hooks/useQRCollaborativeCart';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { toast } from 'sonner';

interface QRClientPageProps {
  shopId: string;
  shopName: string;
  tenantId: string;
  shopSlug: string;
  resourceId: string;
}

interface ModifierOption {
  id: string;
  name: string;
  price_adj: string | number;
}

interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_selection: number; // 1 = single, 99 = multi
  options: ModifierOption[];
}

function fmtVND(v: number | string | null | undefined) {
  const num = Number(v ?? 0);
  return num.toLocaleString('vi-VN') + ' ₫';
}

function safeJson(s?: any) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Custom Icons as simple SVG React components to ensure zero package installation errors
const SvgIcons = {
  Sparkles: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-5 h-5"}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5z" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
    </svg>
  ),
  ServiceBell: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-5 h-5"}>
      <path d="M12 3v3" />
      <path d="M19 17a7 7 0 0 0-14 0" />
      <path d="M4 17h16" />
      <path d="M2 20h20" />
      <path d="M12 17v3" />
    </svg>
  ),
  Users: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Edit: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-3.5 h-3.5"}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Cart: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  ),
  ChevronRight: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  Search: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Plus: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  ),
  Minus: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>
      <path d="M5 12h14" />
    </svg>
  ),
  Trash: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  Spinner: ({ className = 'w-6 h-6' }: { className?: string } = {}) => (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  Clock: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-5 h-5"}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  History: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-5 h-5"}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="16" y2="14" />
    </svg>
  ),
  Menu: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || "w-5 h-5"}>
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  ),
  Sun: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  Moon: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
};

export default function QRClientPage({
  shopId,
  shopName,
  tenantId,
  shopSlug,
  resourceId,
}: QRClientPageProps) {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Onboarding Name state
  const [nameConfigured, setNameConfigured] = useState(true); // Default to true to prevent screen flash
  const [showOnboardingNameModal, setShowOnboardingNameModal] = useState(false);
  const [inputName, setInputName] = useState('');

  // Session States
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [table, setTable] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Menu States
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers States
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showActiveGuests, setShowActiveGuests] = useState(false);
  const [tempGuestName, setTempGuestName] = useState('');

  // Picker States
  const [selectedParentProduct, setSelectedParentProduct] = useState<any | null>(null);
  const [selectedModifierProduct, setSelectedModifierProduct] = useState<any | null>(null);
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});

  // Active Orders History States
  const [orderRequests, setOrderRequests] = useState<any[]>([]);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [splitCount, setSplitCount] = useState(2);

  // Touch drag states for swiping down to close bottom sheet drawers
  const [historyDragY, setHistoryDragY] = useState(0);
  const [isDraggingHistory, setIsDraggingHistory] = useState(false);
  const historyTouchStart = React.useRef<number | null>(null);

  const handleHistoryTouchStart = (e: React.TouchEvent) => {
    historyTouchStart.current = e.touches[0].clientY;
    setIsDraggingHistory(true);
  };

  const handleHistoryTouchMove = (e: React.TouchEvent) => {
    if (historyTouchStart.current === null) return;
    const deltaY = e.touches[0].clientY - historyTouchStart.current;
    if (deltaY > 0) {
      setHistoryDragY(deltaY);
    }
  };

  const handleHistoryTouchEnd = () => {
    if (historyDragY > 120) {
      setIsHistoryOpen(false);
    }
    setHistoryDragY(0);
    setIsDraggingHistory(false);
    historyTouchStart.current = null;
  };

  const [cartDragY, setCartDragY] = useState(0);
  const [isDraggingCart, setIsDraggingCart] = useState(false);
  const cartTouchStart = React.useRef<number | null>(null);

  const handleCartTouchStart = (e: React.TouchEvent) => {
    cartTouchStart.current = e.touches[0].clientY;
    setIsDraggingCart(true);
  };

  const handleCartTouchMove = (e: React.TouchEvent) => {
    if (cartTouchStart.current === null) return;
    const deltaY = e.touches[0].clientY - cartTouchStart.current;
    if (deltaY > 0) {
      setCartDragY(deltaY);
    }
  };

  const handleCartTouchEnd = () => {
    if (cartDragY > 120) {
      setIsCartOpen(false);
    }
    setCartDragY(0);
    setIsDraggingCart(false);
    cartTouchStart.current = null;
  };

  // Initialize Supabase collaborative cart when session is available
  const currentSessionId = session?.id || '';
  const colabCart = useQRCollaborativeCart(currentSessionId, tenantId);

  const isDark = theme === 'dark';

  const themeClasses = {
    bg: isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900',
    headerBg: isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200 shadow-sm',
    cardBg: isDark ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-white' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900 shadow-sm',
    cardTextTitle: isDark ? 'text-slate-200 group-hover:text-white' : 'text-slate-800 group-hover:text-orange-600',
    cardTextDesc: isDark ? 'text-slate-500' : 'text-slate-400',
    inputBg: isDark ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-inner',
    pillActiveBg: 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md shadow-orange-500/20',
    pillInactiveBg: isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-400' : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm',
    modalBg: isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200',
    modalTextTitle: isDark ? 'text-white' : 'text-slate-900',
    modalTextDesc: isDark ? 'text-slate-400' : 'text-slate-500',
    textMuted: isDark ? 'text-slate-400' : 'text-slate-500',
    textMain: isDark ? 'text-slate-200' : 'text-slate-700',
    border: isDark ? 'border-slate-800' : 'border-slate-200',
    subBarBg: isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-100/60 border-slate-200',
    footerBg: isDark ? 'bg-slate-950' : 'bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]',
    onboardingBg: isDark
      ? 'bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 text-white'
      : 'bg-gradient-to-tr from-slate-100 via-white to-slate-50 text-slate-900',
    badgeBg: isDark ? 'bg-slate-950/80 border-slate-800 text-amber-400' : 'bg-orange-50/90 border-orange-100 text-orange-600',
    waitingBg: isDark
      ? 'bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 text-white'
      : 'bg-gradient-to-tr from-slate-100 via-white to-slate-50 text-slate-900',
    clockBg: isDark ? 'bg-slate-800/80 border-slate-700/50 text-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.15)]' : 'bg-white border-slate-200 text-orange-500 shadow-md shadow-orange-500/10',
    shimmerBg: isDark ? 'bg-slate-800' : 'bg-slate-200',
    guestPillBg: isDark ? 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-amber-400' : 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-600',
    iconBtn: isDark ? 'bg-slate-800 border-slate-700/50 text-slate-300 hover:text-orange-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-orange-600 hover:bg-slate-200',
    activeGuestsBg: isDark ? 'bg-slate-800 border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm',
    activeGuestsText: isDark ? 'text-slate-300' : 'text-slate-600',
    tooltipBg: isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl',
    floatBarBg: isDark
      ? 'from-slate-900 to-slate-950/95 border-orange-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-white'
      : 'from-white to-slate-50/95 border-orange-500/25 shadow-[0_8px_32px_rgba(249,115,22,0.1)] text-slate-900',
    variantBtn: isDark
      ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/30 hover:border-orange-500/50 text-white'
      : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-orange-500/50 text-slate-800 shadow-sm',
    closeBtn: isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
    modifierBtnActive: isDark
      ? 'border-orange-500 bg-orange-950/20 text-orange-400 font-bold'
      : 'border-orange-500 bg-orange-50 text-orange-600 font-bold',
    modifierBtnInactive: isDark
      ? 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-300'
      : 'border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700',
    historyCardBg: isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200 shadow-sm',
  };

  // 1. Theme and Name configuration loading from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('oni_qr_theme') as 'light' | 'dark';
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
      } else {
        setTheme('light'); // default is light
      }

      const configured = localStorage.getItem('oni_qr_guest_name_configured') === 'true';
      setNameConfigured(configured);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('oni_qr_theme', next);
  };

  // Trigger Onboarding Name Modal if guest lands on active session and hasn't configured name
  useEffect(() => {
    if (session?.status === 'active' && !nameConfigured) {
      setShowOnboardingNameModal(true);
    }
  }, [session, nameConfigured]);

  // Onboarding entry point
  const handleStartFlow = () => {
    if (!nameConfigured) {
      setShowOnboardingNameModal(true);
    } else {
      handleRequestSession();
    }
  };

  const handleSaveOnboardingName = (customName?: string) => {
    const nameToUse = customName?.trim();
    if (nameToUse) {
      colabCart.updateGuestName(nameToUse);
    }
    localStorage.setItem('oni_qr_guest_name_configured', 'true');
    setNameConfigured(true);
    setShowOnboardingNameModal(false);

    // If session is not requested/opened yet, trigger it now!
    if (!session) {
      handleRequestSession();
    }
  };

  // 2. Fetch Session Status & Table details on load
  const fetchSessionStatus = async (showLoading = false) => {
    if (showLoading) setLoadingSession(true);
    try {
      const res = await fetch(`/api/shops/${shopId}/qr-sessions?resource_id=${resourceId}`);
      if (!res.ok) {
        throw new Error('Không thể tải thông tin Phòng/Bàn.');
      }
      const data = await res.json();

      if (data.session) {
        // Prevent redundant state updates of session if nothing changed, avoiding continuous re-fetching loops
        setSession((prev: any) => {
          if (prev && prev.id === data.session.id && prev.status === data.session.status) {
            return prev; // keep same reference
          }
          return data.session;
        });

        setTable((prev: any) => {
          if (prev && prev.status === data.table.status && prev.current_order_id === data.table.current_order_id) {
            return prev; // keep same reference
          }
          return data.table;
        });

        // Persist active session credentials
        localStorage.setItem('oni_qr_session_id', data.session.id);
        localStorage.setItem('oni_qr_session_token', data.session.session_token);
      } else {
        // No active session on table. Check if we have a saved session in localStorage to resume recap
        const savedId = localStorage.getItem('oni_qr_session_id');
        const savedToken = localStorage.getItem('oni_qr_session_token');
        if (savedId && savedToken) {
          const verifyRes = await fetch(`/api/shops/${shopId}/qr-sessions?session_id=${savedId}&session_token=${savedToken}`);
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            // Ensure this session belongs to this specific table/resource
            if (verifyData.session && verifyData.session.resource_id === resourceId) {
              setSession((prev: any) => {
                if (prev && prev.id === verifyData.session.id && prev.status === verifyData.session.status) {
                  return prev;
                }
                return verifyData.session;
              });

              setTable((prev: any) => {
                if (prev && prev.status === verifyData.table.status && prev.current_order_id === verifyData.table.current_order_id) {
                  return prev;
                }
                return verifyData.table;
              });
              return;
            }
          }
        }
        setSession((prev: any) => prev === null ? null : null);
        setTable((prev: any) => {
          if (prev && prev.status === data.table.status && prev.current_order_id === data.table.current_order_id) {
            return prev;
          }
          return data.table;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoadingSession(false);
    }
  };

  useEffect(() => {
    fetchSessionStatus(true);
  }, [shopId, resourceId]);

  // 3. Poll session status if it's pending or active (waiting for staff to open table or cashier checkout)
  useEffect(() => {
    if (!session || (session.status !== 'pending' && session.status !== 'active')) return;

    const interval = setInterval(() => {
      fetchSessionStatus(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [session]);

  // Subscribe to real-time session status and order requests updates
  useEffect(() => {
    if (!session || session.status === 'completed') return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channelName = `session_realtime_status_${session.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'qr_ordering_sessions',
          filter: `id=eq.${session.id}`
        },
        (payload) => {
          const updatedRecord = payload.new as any;
          if (updatedRecord && updatedRecord.status === 'completed') {
            setSession((prev: any) => {
              if (prev && prev.id === updatedRecord.id && prev.status === updatedRecord.status) {
                return prev;
              }
              return updatedRecord;
            });
            colabCart.clearCart();
            if (updatedRecord.active === 'FALSE') {
              toast.error('Yêu cầu mở bàn ăn của bạn đã bị từ chối.');
            } else {
              toast.info('Phiên phục vụ tại bàn đã được hoàn tất. Cảm ơn quý khách!');
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'qr_order_requests',
          filter: `session_id=eq.${session.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRequest = payload.new as any;
            setOrderRequests((prev) => {
              // Avoid duplicates
              if (prev.some((r) => r.id === newRequest.id)) return prev;
              return [newRequest, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRequest = payload.new as any;
            setOrderRequests((prev) =>
              prev.map((r) => (r.id === updatedRequest.id ? updatedRequest : r))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedRequest = payload.old as any;
            setOrderRequests((prev) => prev.filter((r) => r.id !== deletedRequest.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.id, session?.status, colabCart]);

  // 4. Request session creation (Yêu cầu mở bàn)
  const handleRequestSession = async () => {
    try {
      setLoadingSession(true);
      const res = await fetch(`/api/shops/${shopId}/qr-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId }),
      });
      if (!res.ok) {
        throw new Error('Yêu cầu mở bàn thất bại. Vui lòng liên hệ nhân viên.');
      }
      const data = await res.json();
      setSession(data.session);
      setTable(data.table);

      if (data.session) {
        localStorage.setItem('oni_qr_session_id', data.session.id);
        localStorage.setItem('oni_qr_session_token', data.session.session_token);
      }

      toast.success('Đã gửi yêu cầu mở bàn!');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gửi yêu cầu');
    } finally {
      setLoadingSession(false);
    }
  };

  // 4. Fetch menu & order requests when session becomes active or completed
  const fetchMenuAndOrders = async () => {
    if (!session || (session.status !== 'active' && session.status !== 'completed')) return;
    setMenuLoading(true);
    try {
      const oUrl = `/api/shops/${shopId}/qr-orders?session_id=${session.id}&session_token=${session.session_token}`;

      // If session is completed, we don't load the menu, only fetch historical orders for invoice recap
      if (session.status === 'completed') {
        const ordersRes = await fetch(oUrl).then((r) => {
          if (!r.ok) throw new Error('Không thể tải lịch sử gọi món.');
          return r.json();
        });
        setOrderRequests(ordersRes || []);
        return;
      }

      const pUrl = `/api/shops/${shopId}/qr-products?session_id=${session.id}&session_token=${session.session_token}`;
      const [menuRes, ordersRes] = await Promise.all([
        fetch(pUrl).then((r) => {
          if (!r.ok) throw new Error('Không thể tải menu.');
          return r.json();
        }),
        fetch(oUrl).then((r) => {
          if (!r.ok) throw new Error('Không thể tải lịch sử gọi món.');
          return r.json();
        }),
      ]);

      setProducts(menuRes.products || []);
      setCategories(menuRes.categories || []);
      setOrderRequests(ordersRes || []);
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuAndOrders();
  }, [session]);



  // 6. Handle nicknames
  const openNameEdit = () => {
    setTempGuestName(colabCart.guestName);
    setIsEditingName(true);
  };

  const handleRollRandomNickname = () => {
    const newName = generateRandomNickname();
    setTempGuestName(newName);
  };

  const saveNameEdit = () => {
    if (tempGuestName.trim()) {
      colabCart.updateGuestName(tempGuestName.trim());
      setIsEditingName(false);
      toast.success('Đã cập nhật biệt danh!');
    }
  };

  // 7. Product & Category structures
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.active !== false);
  }, [products]);

  // Filter child variants out from main grid
  const displayProducts = useMemo(() => {
    return activeProducts.filter(
      (p) => p.product_type !== 'variant_child' && !p.parent_id
    );
  }, [activeProducts]);

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    let list = displayProducts;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_id === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      );
    }
    return list;
  }, [displayProducts, selectedCategory, searchQuery]);

  // Product helper
  const getProductChildren = (parentId: string) => {
    return activeProducts.filter((p) => p.parent_id === parentId);
  };

  // 8. Adding products to cart logic
  const handleProductAddClick = (product: any) => {
    // A. Check if it's a parent variant product
    if (product.product_type === 'variant_parent') {
      setSelectedParentProduct(product);
      return;
    }

    // B. Check if it has modifiers
    const config = safeJson(product.variant_options);
    const groups = Array.isArray(config?.groups) ? config.groups : [];

    if (groups.length > 0) {
      // Initialize modifier selections with first options if required
      const initialSel: Record<string, string[]> = {};
      for (const group of groups) {
        if (group.options.length > 0) {
          initialSel[group.id] = [group.options[0].id];
        }
      }
      setModifierSelections(initialSel);
      setSelectedModifierProduct(product);
      return;
    }

    // C. Simple product, no option
    colabCart.addItem(product);
    toast.success(`Đã thêm ${product.name} vào giỏ hàng`);
  };

  // Confirm variant selection
  const handleConfirmVariant = (childVariant: any) => {
    const opts = safeJson(childVariant.variant_options) ?? {};
    const label = Object.entries(opts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' / ') || childVariant.name;

    const basePrice = Number(childVariant.sell_price);
    const item: CartItem = {
      product_id: childVariant.product_id,
      product_name: selectedParentProduct.name,
      sku: childVariant.sku,
      unit_price: basePrice,
      cost_price: Number(childVariant.cost_price || 0),
      qty: 1,
      discount_amount: 0,
      modifier_total: 0,
      variant_label: label,
      line_total: basePrice,
    };

    // Check if this variant child itself has modifiers!
    const config = safeJson(childVariant.variant_options);
    const groups = Array.isArray(config?.groups) ? config.groups : [];

    if (groups.length > 0) {
      // The child has modifiers as well, proceed to modifier picker for this specific variant child
      setSelectedParentProduct(null);
      // set modifier product
      const initialSel: Record<string, string[]> = {};
      for (const group of groups) {
        if (group.options.length > 0) {
          initialSel[group.id] = [group.options[0].id];
        }
      }
      setModifierSelections(initialSel);
      // We pass down a custom variant wrapper
      setSelectedModifierProduct({
        ...childVariant,
        name: `${selectedParentProduct.name} (${label})`,
      });
      return;
    }

    colabCart.addItemWithOptions(item);
    setSelectedParentProduct(null);
    toast.success(`Đã thêm ${selectedParentProduct.name} (${label})`);
  };

  // Modifier toggles
  const handleModifierOptionToggle = (group: ModifierGroup, optId: string) => {
    const prev = modifierSelections[group.id] || [];
    if (group.max_selection === 1) {
      setModifierSelections({
        ...modifierSelections,
        [group.id]: [optId],
      });
    } else {
      const idx = prev.indexOf(optId);
      let next = [...prev];
      if (idx >= 0) {
        next.splice(idx, 1);
      } else {
        next.push(optId);
      }
      setModifierSelections({
        ...modifierSelections,
        [group.id]: next,
      });
    }
  };

  // Confirm modifier selection
  const handleConfirmModifiers = () => {
    const config = safeJson(selectedModifierProduct.variant_options);
    const groups: ModifierGroup[] = Array.isArray(config?.groups) ? config.groups : [];

    // Verify requirements
    const missingGroups = groups.filter(
      (g) => g.is_required && (!modifierSelections[g.id] || modifierSelections[g.id].length === 0)
    );

    if (missingGroups.length > 0) {
      toast.error(`Vui lòng chọn: ${missingGroups.map((g) => g.name).join(', ')}`);
      return;
    }

    const selectedMods: SelectedModifier[] = [];
    let modifierTotal = 0;

    for (const g of groups) {
      const selIds = modifierSelections[g.id] || [];
      for (const o of g.options) {
        if (selIds.includes(o.id)) {
          const adj = Number(o.price_adj) || 0;
          selectedMods.push({
            group: g.name,
            option: o.name,
            price_adj: adj,
          });
          modifierTotal += adj;
        }
      }
    }

    const labelParts = selectedMods.map((m) => m.option);
    const label = labelParts.length > 0 ? labelParts.join(', ') : undefined;
    const basePrice = Number(selectedModifierProduct.sell_price);

    const item: CartItem = {
      product_id: selectedModifierProduct.product_id,
      product_name: selectedModifierProduct.name,
      sku: selectedModifierProduct.sku,
      unit_price: basePrice,
      cost_price: Number(selectedModifierProduct.cost_price || 0),
      qty: 1,
      discount_amount: 0,
      modifier_total: modifierTotal,
      modifiers: selectedMods,
      variant_label: label,
      line_total: basePrice + modifierTotal,
    };

    colabCart.addItemWithOptions(item);
    setSelectedModifierProduct(null);
    toast.success(`Đã thêm ${selectedModifierProduct.name}`);
  };

  // 9. Submit collaborative order to backend
  const handleSubmitOrder = async () => {
    if (colabCart.cartItems.length === 0) return;
    setSubmittingOrder(true);
    try {
      const res = await fetch(`/api/shops/${shopId}/qr-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          session_token: session.session_token,
          items: colabCart.cartItems,
        }),
      });

      if (!res.ok) {
        throw new Error('Không thể gửi yêu cầu. Vui lòng thử lại.');
      }

      const data = await res.json();
      // Add submitted order request locally
      setOrderRequests([data, ...orderRequests]);
      colabCart.clearCart();
      setIsCartOpen(false);
      toast.success('Đã gửi yêu cầu! Nhân viên sẽ xác nhận trong giây lát');
      setIsHistoryOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gửi yêu cầu');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleDownloadInvoiceImage = () => {
    const acceptedOrders = orderRequests.filter(r => r.status === 'accepted');
    if (acceptedOrders.length === 0) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const items = acceptedOrders.flatMap(o => o.items || []);
      const totalAmount = acceptedOrders.reduce((sum, order) => {
        const orderSum = (order.items || []).reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
        return sum + orderSum;
      }, 0);

      const width = 600;
      const padding = 40;
      const itemHeight = 35;

      const headerHeight = 220;
      const itemsHeight = items.length * itemHeight;
      const footerHeight = 180;
      const height = headerHeight + itemsHeight + footerHeight;

      canvas.width = width * 2;
      canvas.height = height * 2;
      ctx.scale(2, 2);

      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, width - 20, height - 20);

      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(shopName.toUpperCase(), width / 2, 60);

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('HÓA ĐƠN ĐIỆN TỬ - ELECTRONIC RECEIPT', width / 2, 85);

      ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`Phòng/Bàn: ${table?.name || 'Chưa rõ'}`, width / 2, 115);

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '12px sans-serif';
      const timeStr = new Date().toLocaleString('vi-VN');
      ctx.fillText(`Thời gian thanh toán: ${timeStr}`, width / 2, 135);

      ctx.beginPath();
      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.setLineDash([6, 4]);
      ctx.moveTo(padding, 160);
      ctx.lineTo(width - padding, 160);
      ctx.stroke();

      let y = 190;
      ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SẢN PHẨM / DỊCH VỤ', padding, y);
      ctx.textAlign = 'center';
      ctx.fillText('SL', width - padding - 120, y);
      ctx.textAlign = 'right';
      ctx.fillText('THÀNH TIỀN', width - padding, y);

      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.strokeStyle = isDark ? '#475569' : '#e2e8f0';
      ctx.moveTo(padding, y + 10);
      ctx.lineTo(width - padding, y + 10);
      ctx.stroke();

      y += 35;

      ctx.font = '13px sans-serif';
      items.forEach((it: any) => {
        ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
        ctx.textAlign = 'left';

        const maxNameWidth = 260;
        let displayName = it.product_name;
        if (it.variant_label) displayName += ` (${it.variant_label})`;

        if (ctx.measureText(displayName).width > maxNameWidth) {
          displayName = displayName.substring(0, 30) + '...';
        }

        ctx.fillText(displayName, padding, y);

        ctx.textAlign = 'center';
        ctx.fillText(String(it.qty), width - padding - 120, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(fmtVND(it.line_total), width - padding, y);

        y += itemHeight;
      });

      ctx.beginPath();
      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.setLineDash([6, 4]);
      ctx.moveTo(padding, y - 10);
      ctx.lineTo(width - padding, y - 10);
      ctx.stroke();

      y += 20;

      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('TỔNG CỘNG:', padding, y);

      ctx.textAlign = 'right';
      ctx.fillText(fmtVND(totalAmount), width - padding, y);

      y += 50;

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = 'italic 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Cảm ơn quý khách đã tin tưởng và ủng hộ chúng tôi!', width / 2, y);
      ctx.fillText('Hẹn gặp lại quý khách lần sau! Chúc một ngày tuyệt vời.', width / 2, y + 20);

      ctx.font = '9px sans-serif';
      ctx.fillStyle = isDark ? '#475569' : '#94a3b8';
      ctx.fillText('Powered by Oni SaaS • Plug-and-Play QR Ordering System', width / 2, y + 50);

      const link = document.createElement('a');
      link.download = `HoaDon_${table?.name || 'Ban'}_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Đã tải hình ảnh hóa đơn thành công! 📸');
    } catch (err) {
      console.error('Invoice image generation failed:', err);
      toast.error('Lỗi khi xuất ảnh hóa đơn.');
    }
  };

  // Render Onboarding Screen (No session yet)
  if (!session && !loadingSession) {
    return (
      <div className={`min-h-screen ${themeClasses.onboardingBg} flex flex-col justify-between p-6 transition-colors duration-300`}>
        {/* Floating Theme Toggle */}
        <div className="flex justify-end pt-2">
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-full transition-all ${themeClasses.iconBtn}`}
            title={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {isDark ? <SvgIcons.Sun className="w-5 h-5" /> : <SvgIcons.Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-8">
          {/* Neon Glow Circle */}
          <div className="relative w-32 h-32 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center shadow-[0_4px_25px_rgba(249,115,22,0.25)] border border-orange-400/30 animate-pulse shrink-0">
            <span className="text-3xl font-extrabold tracking-wider drop-shadow-md text-white">
              {table?.name || 'ONI'}
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400 dark:from-orange-400 dark:to-amber-300">
              {shopName}
            </h1>
            <p className={`text-sm leading-relaxed ${themeClasses.textMuted}`}>
              Chào mừng bạn đến với chúng tôi. Để xem thực đơn, tiến hành gọi món và đặt dịch vụ trực tiếp tại bàn, vui lòng nhấn nút gửi yêu cầu bên dưới.
            </p>
          </div>

          <button
            onClick={handleStartFlow}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 active:scale-[0.98] font-bold text-base rounded-2xl shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_25px_rgba(249,115,22,0.5)] transition-all duration-300 flex items-center justify-center gap-2 group text-white"
          >
            <SvgIcons.ServiceBell />
            Yêu cầu gọi món hoặc đặt dịch vụ...
            <span className="group-hover:translate-x-1 transition-transform">
              <SvgIcons.ChevronRight />
            </span>
          </button>
        </div>

        <div className="text-center text-xs text-slate-400 dark:text-slate-600 py-4">
          Powered by Oni SaaS • Plug-and-Play QR Ordering
        </div>

        {/* 10. Onboarding Name Modal for Welcome Screen */}
        {showOnboardingNameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
            <div className={`relative w-full max-w-sm border rounded-3xl p-6 shadow-2xl space-y-6 animate-scale-in ${themeClasses.modalBg}`}>
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-orange-500/20">
                  <SvgIcons.Sparkles className="w-8 h-8" />
                </div>
                <h3 className={`text-lg font-black tracking-tight ${themeClasses.modalTextTitle}`}>
                  Cho quán biết tên của bạn nhé!
                </h3>
                <p className={`text-xs ${themeClasses.textMuted} leading-relaxed`}>
                  Tên này dùng để hiển thị trong giỏ hàng chung với bạn bè cùng bàn và giúp nhân viên phục vụ bạn chu đáo hơn.
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  maxLength={20}
                  placeholder="Nhập tên của bạn (ví dụ: Anh Nam, Lan Anh...)"
                  className={`w-full border focus:border-orange-500 rounded-2xl px-4 py-3.5 text-sm outline-none transition-colors text-center font-semibold ${themeClasses.inputBg}`}
                />

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    onClick={() => handleSaveOnboardingName(inputName)}
                    disabled={!inputName.trim()}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] font-bold text-sm text-white text-center shadow-md transition-all cursor-pointer"
                  >
                    Tiếp tục
                  </button>
                  <button
                    onClick={() => handleSaveOnboardingName()}
                    className={`w-full py-3 rounded-2xl text-xs font-bold transition-all text-center ${themeClasses.closeBtn}`}
                  >
                    Bỏ qua & dùng Biệt danh ngẫu nhiên
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render Waiting/Approval Screen (Pending session)
  if (session?.status === 'pending' && !loadingSession) {
    return (
      <div className={`min-h-screen ${themeClasses.waitingBg} flex flex-col justify-between p-6 transition-colors duration-300`}>
        {/* Floating Theme Toggle */}
        <div className="flex justify-end pt-2">
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-full transition-all ${themeClasses.iconBtn}`}
            title={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {isDark ? <SvgIcons.Sun className="w-5 h-5" /> : <SvgIcons.Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-8">
          {/* Pulsing clock */}
          <div className={`w-24 h-24 rounded-full flex items-center justify-center animate-bounce ${themeClasses.clockBg}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <div className="space-y-4">
            <h1 className="text-xl font-bold">Đang chờ duyệt yêu cầu...</h1>
            <p className={`text-sm leading-relaxed ${themeClasses.textMuted}`}>
              Yêu cầu của <span className="text-orange-600 dark:text-amber-400 font-semibold">{table?.name}</span> đã được chuyển tới nhân viên phục vụ. Vui lòng đợi trong giây lát hoặc thông báo với nhân viên để kích hoạt yêu cầu gọi món.
            </p>
          </div>

          {/* Elegant shimmer status bar */}
          <div className={`w-full h-1.5 rounded-full overflow-hidden relative ${themeClasses.shimmerBg}`}>
            <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-orange-500 to-amber-400 w-1/2 rounded-full animate-[shimmer_1.5s_infinite_linear]" style={{ transform: 'translateX(-100%)' }} />
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 dark:text-slate-600 py-4">
          Hệ thống sẽ tự động chuyển trang ngay khi được duyệt!
        </div>

        <style jsx global>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `}</style>
      </div>
    );
  }

  // Render Session Completed Screen (Check-out or rejection)
  if (session?.status === 'completed' && !loadingSession) {
    const isRejected = session.active === 'FALSE';

    // Calculate total price of accepted orders to display in invoice recap
    const acceptedOrders = orderRequests.filter(r => r.status === 'accepted');
    const totalOrderAmount = acceptedOrders.reduce((sum, order) => {
      const items = order.items || [];
      const orderSum = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
      return sum + orderSum;
    }, 0);

    return (
      <div className={`min-h-screen ${themeClasses.bg} flex flex-col justify-between p-6 transition-colors duration-300`}>
        {/* Header */}
        <header className="flex justify-between items-center pt-2">
          <span className="text-xs font-bold uppercase tracking-wider opacity-60">
            📍 {table?.name || 'Phòng/Bàn'}
          </span>
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-full transition-all ${themeClasses.iconBtn}`}
          >
            {isDark ? <SvgIcons.Sun className="w-5 h-5" /> : <SvgIcons.Moon className="w-5 h-5" />}
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto text-center py-8 space-y-6 w-full">
          {isRejected ? (
            <>
              {/* Rejected State */}
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center text-red-500 border border-red-200 dark:border-red-900/30 shadow-lg shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-black text-red-600 dark:text-red-400">Yêu cầu bị từ chối</h1>
                <p className={`text-sm leading-relaxed ${themeClasses.textMuted}`}>
                  Yêu cầu mở bàn ăn tại <span className="font-bold">{table?.name}</span> đã bị nhân viên từ chối hoặc bàn này hiện không khả dụng. Vui lòng liên hệ trực tiếp với nhân viên để được hỗ trợ.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Completed/Paid State */}
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 border border-emerald-200 dark:border-emerald-900/30 shadow-lg shadow-emerald-500/10 shrink-0 animate-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">Thanh toán hoàn tất!</h1>
                <p className={`text-sm leading-relaxed ${themeClasses.textMuted}`}>
                  Cảm ơn quý khách đã tin tưởng và ủng hộ <span className="font-bold text-orange-500">{shopName}</span>. Phiên phục vụ đã hoàn tất và bàn đã thanh toán thành công.
                </p>
              </div>

              {/* Order Invoice Recap */}
              {acceptedOrders.length > 0 && (
                <div className={`w-full text-left rounded-2xl border p-4 space-y-3 overflow-y-auto ${themeClasses.cardBg}`}>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider border-b pb-1.5 flex justify-between items-center">
                    <span>Tóm tắt đơn hàng ({acceptedOrders.length} lần gọi)</span>
                    <button
                      onClick={handleDownloadInvoiceImage}
                      className="px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white font-bold text-[9px] uppercase tracking-wide transition-all active:scale-95 flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
                    >
                      Tải ảnh hóa đơn
                    </button>
                  </p>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2.5">
                    {acceptedOrders.flatMap((order, oIdx) =>
                      (order.items || []).map((it: any, iIdx: number) => (
                        <div key={`${oIdx}-${iIdx}`} className="flex justify-between items-baseline pt-2 text-xs">
                          <div className="pr-4 truncate flex-1">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{it.product_name}</span>
                            {it.variant_label && (
                              <span className="block text-[10px] text-slate-400 font-medium">({it.variant_label})</span>
                            )}
                          </div>
                          <span className="text-slate-500 mr-4">x{it.qty}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{fmtVND(it.line_total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t pt-2.5 flex justify-between items-center text-sm font-black">
                    <span className={themeClasses.textMain}>Tổng thanh toán</span>
                    <span className="text-orange-600 dark:text-amber-400">{fmtVND(totalOrderAmount)}</span>
                  </div>
                </div>
              )}

              {/* Split Bill Calculator ("Tính năng vui vẻ") */}
              {acceptedOrders.length > 0 && (
                <div className={`w-full text-left rounded-2xl border p-4 space-y-4 ${themeClasses.cardBg}`}>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider border-b pb-1.5 flex items-center justify-between">
                    <span>Chia tiền (Split Bill)</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-full font-bold">Tính năng vui vẻ</span>
                  </p>

                  <div className="flex items-center justify-between gap-4">
                    <span className={`text-xs font-semibold ${themeClasses.textMain}`}>Số người chia:</span>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setSplitCount(prev => Math.max(1, prev - 1))}
                        className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center font-bold text-lg select-none cursor-pointer ${themeClasses.iconBtn}`}
                      >
                        -
                      </button>
                      <span className="text-sm font-black w-8 text-center">{splitCount}</span>
                      <button
                        onClick={() => setSplitCount(prev => prev + 1)}
                        className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center font-bold text-lg select-none cursor-pointer ${themeClasses.iconBtn}`}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl p-3.5 border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-bold opacity-65 uppercase tracking-wider">Mỗi người cần trả</p>
                      <p className="text-base font-black text-orange-600 dark:text-amber-400">
                        {fmtVND(Math.round(totalOrderAmount / splitCount))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold opacity-65 uppercase tracking-wider">Trạng thái chia</p>
                      <span className="text-[10px] font-semibold text-slate-500 italic block mt-0.5">
                        {splitCount === 1 ? 'Solo bao trọn! 😎' :
                          splitCount === 2 ? 'Chia đôi tình nghĩa! 🤝' :
                            splitCount <= 4 ? 'Đồng đội săn mồi! 🦁' : 'Đại gia đình ONI! 🥳'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const shareAmt = Math.round(totalOrderAmount / splitCount);
                      const msg = `Tóm tắt hóa đơn tại ${shopName} - ${table?.name || 'Phòng/Bàn'}:\n- Tổng cộng: ${totalOrderAmount.toLocaleString('vi-VN')}đ.\n- Chia đều cho ${splitCount} người: mỗi người ${shareAmt.toLocaleString('vi-VN')}đ.\n💸 Chuyển khoản cho thủ quỹ nhé!`;
                      navigator.clipboard.writeText(msg);
                      toast.success('Đã sao chép tin nhắn gửi nhóm bạn bè!');
                    }}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    📋 Sao chép tin nhắn gửi đi
                  </button>
                </div>
              )}

              <p className="text-[11px] text-slate-400 italic">
                Chúc quý khách một ngày tuyệt vời và hẹn gặp lại quý khách lần sau!
              </p>
            </>
          )}

          <button
            onClick={() => {
              setSession(null);
              setOrderRequests([]);
              localStorage.removeItem('oni_qr_guest_name_configured');
              localStorage.removeItem('oni_qr_session_id');
              localStorage.removeItem('oni_qr_session_token');
              toast.success('Bắt đầu phiên gọi món mới.');
            }}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 font-bold text-sm rounded-2xl shadow-lg transition-all text-white flex items-center justify-center gap-2"
          >
            <SvgIcons.Sparkles className="w-4 h-4" />
            Bắt đầu gọi món mới
          </button>
        </div>

        <div className="text-center text-[10px] text-slate-400 dark:text-slate-600 py-2">
          Powered by Oni SaaS • Plug-and-Play QR Ordering
        </div>
      </div>
    );
  }

  // Loading States
  if (loadingSession) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center space-y-4 ${themeClasses.bg}`}>
        <SvgIcons.Spinner className="w-10 h-10 text-orange-500" />
        <p className={`text-sm ${themeClasses.textMuted}`}>Đang tải thông tin...</p>
      </div>
    );
  }

  // Render Main Ordering Screen (Session is ACTIVE)
  return (
    <div className={`min-h-screen ${themeClasses.bg} flex flex-col pb-24 font-sans selection:bg-orange-500 selection:text-white transition-colors duration-300`}>
      {/* 1. Header (Premium glassmorphic look) */}
      <header className={`sticky top-0 z-40 ${themeClasses.headerBg} border-b backdrop-blur-md px-4 py-3 flex items-center justify-between transition-all duration-300`}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center font-black text-white text-base shadow-[0_2px_10px_rgba(249,115,22,0.3)]">
            {table?.name?.substring(0, 3) || 'ON'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold truncate max-w-[130px]">{shopName}</h1>
              <span className={`w-2 h-2 rounded-full ${colabCart.isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'} animate-pulse`} />
            </div>
            <p className={`text-[11px] flex items-center gap-1 ${themeClasses.textMuted}`}>
              📍 {table?.name || 'Phòng/Bàn'}
            </p>
          </div>
        </div>

        {/* Guest & Collaborative presence controls */}
        <div className="flex items-center gap-2">
          {/* Guest Name pill */}
          <button
            onClick={openNameEdit}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[11px] font-medium transition-colors ${themeClasses.guestPillBg}`}
          >
            <span className="truncate max-w-[90px]">{colabCart.guestName}</span>
            <SvgIcons.Edit />
          </button>

          {/* Active guests button */}
          <div className="relative">
            <button
              onClick={() => setShowActiveGuests(!showActiveGuests)}
              className={`flex items-center gap-1 py-1.5 px-2.5 rounded-full text-[11px] transition-colors hover:opacity-90 active:scale-95 ${themeClasses.activeGuestsBg} ${themeClasses.activeGuestsText}`}
            >
              <SvgIcons.Users className="w-3.5 h-3.5" />
              <span className="font-semibold">{colabCart.activeGuests.length}</span>
            </button>

            {showActiveGuests && (
              <>
                {/* Transparent backdrop to catch click outside and close the dropdown */}
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowActiveGuests(false)}
                />

                {/* Dropdown showing list of friends */}
                <div className={`absolute right-0 top-full mt-2 w-48 rounded-xl p-2.5 shadow-2xl z-50 border transition-all duration-200 animate-scale-in ${themeClasses.tooltipBg}`}>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-1.5">Đang online ({colabCart.activeGuests.length})</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {colabCart.activeGuests.map((g) => (
                      <div key={g.guestId} className={`text-[11px] flex items-center gap-1.5 truncate ${themeClasses.textMain}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className={g.guestId === colabCart.guestId ? 'font-bold text-orange-600 dark:text-amber-400' : ''}>
                          {g.guestName} {g.guestId === colabCart.guestId && '(Bạn)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Theme Toggle Button - commented out to save space */}
          {/* <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-full transition-colors ${themeClasses.iconBtn}`}
            title={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {isDark ? <SvgIcons.Sun className="w-5 h-5" /> : <SvgIcons.Moon className="w-5 h-5" />}
          </button> */}

          {/* History Icon */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className={`p-1.5 rounded-full transition-colors relative ${themeClasses.iconBtn}`}
          >
            <SvgIcons.History />
            {orderRequests.some((r) => r.status === 'pending') && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full animate-ping" />
            )}
          </button>
        </div>
      </header>

      {/* 2. Search & Category Slider */}
      <div className="px-4 pt-4 pb-1 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50">
            <SvgIcons.Search />
          </span>
          <input
            type="text"
            placeholder="Tìm món ngon tại đây..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-3 border focus:border-orange-500 rounded-2xl text-sm outline-none transition-all ${themeClasses.inputBg}`}
          />
        </div>

        {/* Categories horizontal list */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`py-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${selectedCategory === 'all'
              ? themeClasses.pillActiveBg
              : themeClasses.pillInactiveBg
              }`}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id || cat.category_id}
              onClick={() => setSelectedCategory(cat.id || cat.category_id)}
              className={`py-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${selectedCategory === (cat.id || cat.category_id)
                ? themeClasses.pillActiveBg
                : themeClasses.pillInactiveBg
                }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Product grid */}
      <main className="flex-1 px-4 py-2">
        {menuLoading ? (
          <div className="grid grid-cols-2 gap-3 py-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`rounded-2xl p-3 space-y-3 animate-pulse border ${themeClasses.cardBg}`}>
                <div className={`w-full aspect-[4/3] rounded-xl ${themeClasses.shimmerBg}`} />
                <div className={`h-4 rounded-md w-3/4 ${themeClasses.shimmerBg}`} />
                <div className={`h-3 rounded-md w-1/2 ${themeClasses.shimmerBg}`} />
                <div className="flex justify-between items-center">
                  <div className={`h-5 rounded-md w-1/3 ${themeClasses.shimmerBg}`} />
                  <div className={`w-8 h-8 rounded-full ${themeClasses.shimmerBg}`} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className={`p-4 rounded-full border opacity-60 ${themeClasses.iconBtn}`}>
              <SvgIcons.Cart className="w-8 h-8" />
            </div>
            <p className={`text-sm font-medium ${themeClasses.textMuted}`}>Không tìm thấy món ăn nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => {
              const config = safeJson(p.variant_options);
              const hasOptions = p.product_type === 'variant_parent' || (Array.isArray(config?.groups) && config.groups.length > 0);

              return (
                <div
                  key={p.id || p.product_id}
                  onClick={() => handleProductAddClick(p)}
                  className={`group border rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer active:scale-[0.99] ${themeClasses.cardBg}`}
                >
                  {/* Image fallback with premium styling */}
                  <div className="relative w-full aspect-[4/3] bg-gradient-to-tr from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 overflow-hidden flex items-center justify-center text-slate-500 shrink-0">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="text-center p-2 flex flex-col items-center gap-1.5 opacity-70">
                        <img
                          src="/logo.png"
                          alt="ONI Logo"
                          className="w-9 h-9 object-contain rounded-xl saturate-100"
                        />
                        <span className={`text-[10px] uppercase font-bold tracking-wider ${themeClasses.textMuted}`}>
                          ONI Delicious
                        </span>
                      </div>
                    )}
                    {hasOptions && (
                      <span className={`absolute top-2 right-2 rounded-full backdrop-blur-sm border px-2 py-0.5 text-[9px] font-semibold ${themeClasses.badgeBg}`}>
                        Tuỳ chọn
                      </span>
                    )}
                  </div>

                  {/* Body info */}
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                    <div className="space-y-1">
                      <h3 className={`text-xs font-bold leading-snug line-clamp-2 min-h-[32px] transition-colors ${themeClasses.cardTextTitle}`}>
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className={`text-[10px] line-clamp-1 ${themeClasses.cardTextDesc}`}>
                          {p.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 mt-auto">
                      <span className="text-xs font-black text-orange-600 dark:text-amber-400">
                        {fmtVND(p.sell_price)}
                      </span>
                      <button
                        className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center hover:shadow-[0_0_12px_rgba(249,115,22,0.3)] transition-all pointer-events-none"
                      >
                        <SvgIcons.Plus />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 4. Collaborative Float Bar */}
      {colabCart.cartItems.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 animate-slide-up">
          <div
            onClick={() => setIsCartOpen(true)}
            className={`w-full p-4 rounded-2xl bg-gradient-to-r border backdrop-blur-lg flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all ${themeClasses.floatBarBg}`}
          >
            <div className="flex items-center gap-3">
              {/* Bag icon with red pulsing badge */}
              <div className="relative w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
                <SvgIcons.Cart className="w-5.5 h-5.5" />
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 border border-white dark:border-slate-950 text-white rounded-full text-[10px] font-black w-5 h-5 flex items-center justify-center shadow-md animate-bounce">
                  {colabCart.cartItems.reduce((acc, i) => acc + i.qty, 0)}
                </span>
              </div>
              <div>
                <p className="text-[10px] opacity-60 font-bold uppercase tracking-wider">Giỏ hàng chung</p>
                <p className="text-sm font-black text-orange-600 dark:text-amber-400">{fmtVND(colabCart.total)}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 font-bold">
              <span>Xem giỏ hàng</span>
              <SvgIcons.ChevronRight />
            </div>
          </div>
        </div>
      )}

      {/* 5. Variant Picker Modal */}
      {selectedParentProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedParentProduct(null)} />
          <div className={`relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-slide-up ${themeClasses.modalBg}`}>
            {/* Header */}
            <div className={`flex items-center justify-between border-b px-4 py-3 shrink-0 ${themeClasses.border}`}>
              <div>
                <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Chọn phân loại</p>
                <h3 className={`text-sm font-black ${themeClasses.modalTextTitle}`}>{selectedParentProduct.name}</h3>
              </div>
              <button
                onClick={() => setSelectedParentProduct(null)}
                className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${themeClasses.closeBtn}`}
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {getProductChildren(selectedParentProduct.product_id).length === 0 ? (
                <p className={`text-center text-xs py-6 ${themeClasses.textMuted}`}>Không có phân loại nào khả dụng.</p>
              ) : (
                getProductChildren(selectedParentProduct.product_id).map((child) => {
                  const opts = safeJson(child.variant_options) ?? {};
                  const label = Object.entries(opts)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' / ') || child.name;

                  return (
                    <button
                      key={child.product_id}
                      onClick={() => handleConfirmVariant(child)}
                      className={`w-full text-left border rounded-xl p-3.5 transition-all flex items-center justify-between ${themeClasses.variantBtn}`}
                    >
                      <div>
                        <p className={`text-xs font-bold ${themeClasses.modalTextTitle}`}>{label}</p>
                        {child.sku && <p className={`text-[10px] mt-0.5 ${themeClasses.textMuted}`}>SKU: {child.sku}</p>}
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <span className="text-xs font-extrabold text-orange-600 dark:text-amber-400">{fmtVND(child.sell_price)}</span>
                        <span className="text-[9px] font-bold bg-orange-100 dark:bg-orange-950 border border-orange-200 dark:border-orange-800/40 text-orange-600 dark:text-orange-400 rounded-full px-2 py-0.5 flex items-center gap-1">
                          <SvgIcons.Plus className="w-2.5 h-2.5" /> Thêm
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Modifier Picker Modal */}
      {selectedModifierProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedModifierProduct(null)} />
          <div className={`relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up ${themeClasses.modalBg}`}>
            {/* Header */}
            <div className={`flex items-center justify-between border-b px-4 py-3.5 shrink-0 ${themeClasses.border}`}>
              <div>
                <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Tuỳ chỉnh</p>
                <h3 className={`text-sm font-black ${themeClasses.modalTextTitle}`}>{selectedModifierProduct.name}</h3>
              </div>
              <button
                onClick={() => setSelectedModifierProduct(null)}
                className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${themeClasses.closeBtn}`}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {(safeJson(selectedModifierProduct.variant_options)?.groups || []).map((group: ModifierGroup) => (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-xs font-black ${themeClasses.textMain}`}>{group.name}</h4>
                    {group.is_required ? (
                      <span className="rounded-full bg-orange-100 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/30 px-2 py-0.5 text-[9px] font-semibold text-orange-600 dark:text-orange-400">Bắt buộc</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[9px] ${themeClasses.closeBtn}`}>Tuỳ chọn</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.options.map((opt) => {
                      const selected = (modifierSelections[group.id] || []).includes(opt.id);
                      const adj = Number(opt.price_adj) || 0;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModifierOptionToggle(group, opt.id)}
                          className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between text-xs ${selected
                            ? themeClasses.modifierBtnActive
                            : themeClasses.modifierBtnInactive
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-400 dark:border-slate-700'}`}>
                              {selected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            <span>{opt.name}</span>
                          </div>
                          {adj > 0 && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">+{fmtVND(adj)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA bar */}
            <div className={`border-t p-4 shrink-0 flex items-center justify-between gap-4 ${themeClasses.border} ${themeClasses.subBarBg}`}>
              <div>
                <p className="text-[10px] opacity-60">Tổng cộng</p>
                <p className="text-base font-extrabold text-orange-600 dark:text-amber-400">
                  {fmtVND(
                    Number(selectedModifierProduct.sell_price) +
                    Object.entries(modifierSelections).reduce((sum, [groupId, optIds]) => {
                      const groups = safeJson(selectedModifierProduct.variant_options)?.groups || [];
                      const group = groups.find((g: any) => g.id === groupId);
                      if (!group) return sum;
                      const groupTotal = group.options
                        .filter((o: any) => optIds.includes(o.id))
                        .reduce((s: number, o: any) => s + (Number(o.price_adj) || 0), 0);
                      return sum + groupTotal;
                    }, 0)
                  )}
                </p>
              </div>
              <button
                onClick={handleConfirmModifiers}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 active:scale-[0.98] text-xs font-bold text-white text-center shadow-lg transition-all"
              >
                Xác nhận thêm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Collaborative Cart Drawer (Bottom Sheet) */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setIsCartOpen(false)} />
          <div
            style={{
              transform: `translateY(${cartDragY}px)`,
              transition: isDraggingCart ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            className={`relative w-full max-w-md border-t rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] z-10 animate-slide-up ${themeClasses.modalBg}`}
          >
            {/* Touchable Drag Area to Slide Down */}
            <div
              onTouchStart={handleCartTouchStart}
              onTouchMove={handleCartTouchMove}
              onTouchEnd={handleCartTouchEnd}
              className="cursor-ns-resize select-none shrink-0 touch-none active:bg-slate-100/5 dark:active:bg-slate-800/5 transition-colors"
            >
              {/* Grab handle */}
              <div className={`w-12 h-1 rounded-full mx-auto my-3 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

              {/* Header */}
              <div className={`px-5 pb-3 border-b flex items-center justify-between ${themeClasses.border}`}>
                <div>
                  <h3 className={`text-base font-black flex items-center gap-1.5 ${themeClasses.modalTextTitle}`}>
                    🛒 Giỏ hàng chung
                  </h3>
                  <p className={`text-[10px] font-bold ${themeClasses.textMuted}`}>Mọi thay đổi sẽ đồng bộ với bạn bè cùng bàn</p>
                </div>
                <button
                  onClick={() => {
                    colabCart.clearCart();
                    setIsCartOpen(false);
                    toast.info('Đã xoá toàn bộ giỏ hàng.');
                  }}
                  className={`text-xs flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800/50 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer ${themeClasses.textMuted} hover:text-red-500`}
                >
                  <SvgIcons.Trash />
                  Xoá tất cả
                </button>
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {colabCart.cartItems.map((item) => (
                <div key={`${item.product_id}_${item.variant_label}`} className="flex items-start gap-3 justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-bold truncate ${themeClasses.modalTextTitle}`}>{item.product_name}</h4>
                    {item.variant_label && (
                      <p className="text-[10px] text-orange-600 dark:text-amber-500/80 font-medium mt-0.5 line-clamp-2">
                        ⭐ {item.variant_label}
                      </p>
                    )}
                    <span className={`text-[10px] font-bold block mt-1 ${themeClasses.textMuted}`}>
                      {fmtVND(item.unit_price + (item.modifier_total || 0))} / món
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => colabCart.setQty(item.product_id, item.qty - 1, item.variant_label, item.modifiers)}
                      className={`w-7 h-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer ${themeClasses.iconBtn}`}
                    >
                      <SvgIcons.Minus />
                    </button>
                    <span className={`text-xs font-extrabold w-6 text-center ${themeClasses.modalTextTitle}`}>{item.qty}</span>
                    <button
                      onClick={() => colabCart.setQty(item.product_id, item.qty + 1, item.variant_label, item.modifiers)}
                      className={`w-7 h-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer ${themeClasses.iconBtn}`}
                    >
                      <SvgIcons.Plus />
                    </button>
                    <span className="text-xs font-black text-orange-600 dark:text-amber-400 w-20 text-right shrink-0">
                      {fmtVND(item.line_total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Cart Note */}
            <div className={`px-5 py-3 border-t border-b shrink-0 ${themeClasses.subBarBg}`}>
              <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${themeClasses.textMuted}`}>Yêu cầu đặc biệt</label>
              <textarea
                placeholder="Ví dụ: Không hành, nhiều đá, ít đường..."
                value={colabCart.note}
                onChange={(e) => colabCart.setNote(e.target.value)}
                rows={2}
                className={`w-full border focus:border-orange-500 rounded-xl p-2.5 text-xs outline-none resize-none transition-colors ${themeClasses.inputBg}`}
              />
            </div>

            {/* Footer Checkout action */}
            <div className={`p-5 shrink-0 flex flex-col gap-3 ${themeClasses.footerBg}`}>
              <div className="flex justify-between items-center text-xs">
                <span className={`font-bold ${themeClasses.textMuted}`}>Tổng số lượng</span>
                <span className={`font-black ${themeClasses.modalTextTitle}`}>{colabCart.cartItems.reduce((acc, i) => acc + i.qty, 0)} món</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={`text-sm font-extrabold ${themeClasses.textMain}`}>Tạm tính</span>
                <span className="text-lg font-black text-orange-600 dark:text-amber-400">{fmtVND(colabCart.total)}</span>
              </div>

              <button
                disabled={submittingOrder}
                onClick={handleSubmitOrder}
                className="w-full mt-2 py-4 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-50 active:scale-[0.98] text-sm font-bold text-white flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(249,115,22,0.3)] transition-all cursor-pointer"
              >
                {submittingOrder ? (
                  <>
                    <SvgIcons.Spinner className="w-4 h-4 text-white" /> Đang gửi...
                  </>
                ) : (
                  <>
                    🛎️ Tiến hành gọi món
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Bar when cart is empty but order history is present */}
      {colabCart.cartItems.length === 0 && orderRequests.length > 0 && (
        <div className={`fixed bottom-0 left-0 right-0 z-40 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex justify-center border-t ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
          <button
            onClick={() => setIsHistoryOpen(true)}
            className={`w-full max-w-md rounded-xl border font-bold py-3 text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              isDark 
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SvgIcons.History />
            <span>Lịch sử gọi món ({orderRequests.length} lượt)</span>
          </button>
        </div>
      )}

      {/* 8. Order Requests History Sidebar/Modal */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setIsHistoryOpen(false)} />
          <div
            style={{
              transform: `translateY(${historyDragY}px)`,
              transition: isDraggingHistory ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            className={`relative w-full max-w-md border-t rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] z-10 animate-slide-up ${themeClasses.modalBg}`}
          >
            {/* Touchable Drag Area to Slide Down */}
            <div
              onTouchStart={handleHistoryTouchStart}
              onTouchMove={handleHistoryTouchMove}
              onTouchEnd={handleHistoryTouchEnd}
              className="cursor-ns-resize select-none shrink-0 touch-none active:bg-slate-100/5 dark:active:bg-slate-800/5 transition-colors"
            >
              {/* Grab handle */}
              <div className={`w-12 h-1 rounded-full mx-auto my-3 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

              {/* Header */}
              <div className={`px-5 pb-3 border-b flex items-center justify-between ${themeClasses.border}`}>
                <div>
                  <h3 className={`text-base font-black flex items-center gap-1.5 ${themeClasses.modalTextTitle}`}>
                    🛎️ Lịch sử gọi món
                  </h3>
                  <p className={`text-[10px] font-bold ${themeClasses.textMuted}`}>Các đơn của bàn hiện tại</p>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${themeClasses.closeBtn}`}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Requests list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {orderRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className={`p-3.5 rounded-full border ${themeClasses.iconBtn}`}>
                    <SvgIcons.Clock />
                  </div>
                  <p className={`text-xs ${themeClasses.textMuted}`}>Chưa gửi yêu cầu gọi món nào.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orderRequests.map((req) => (
                    <div key={req.id} className={`border rounded-2xl p-4 space-y-3 ${themeClasses.historyCardBg}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold ${themeClasses.textMuted}`}>
                          {new Date(req.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {req.status === 'pending' && (
                          <span className="rounded-full bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900/30 px-2.5 py-0.5 text-[9px] font-extrabold text-yellow-600 dark:text-yellow-400 flex items-center gap-1 animate-pulse">
                            ⏳ Chờ duyệt
                          </span>
                        )}
                        {(req.status === 'accepted' || req.status === 'confirmed') && (
                          <span className="rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/30 px-2.5 py-0.5 text-[9px] font-extrabold text-green-600 dark:text-green-400 flex items-center gap-1">
                            ✅ Đã xác nhận
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/30 px-2.5 py-0.5 text-[9px] font-extrabold text-red-600 dark:text-red-400 flex items-center gap-1">
                            ❌ Đã từ chối
                          </span>
                        )}
                      </div>

                      {/* Items */}
                      <div className={`divide-y space-y-1.5 ${isDark ? 'divide-slate-800/40' : 'divide-slate-200/50'}`}>
                        {(req.items || []).map((it: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs pt-1.5">
                            <div className="min-w-0 flex-1">
                              <span className={`font-bold ${themeClasses.modalTextTitle}`}>{it.product_name}</span>
                              {it.variant_label && (
                                <p className={`text-[9px] ${themeClasses.textMuted}`}>
                                  {it.variant_label}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-3">
                              <span className={themeClasses.textMuted}>x{it.qty}</span>
                              <span className={`font-semibold min-w-[70px] inline-block ${themeClasses.modalTextTitle}`}>{fmtVND(it.line_total)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {req.reject_reason && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-2 mt-1">
                          Lý do từ chối: {req.reject_reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. Name Edit Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsEditingName(false)} />
          <div className={`relative w-full max-w-xs border rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-in ${themeClasses.modalBg}`}>
            <div>
              <h3 className={`text-sm font-black ${themeClasses.modalTextTitle}`}>Đổi biệt danh của bạn</h3>
              <p className={`text-[10px] ${themeClasses.textMuted} mt-0.5`}>Biệt danh hiển thị cùng bạn bè tại bàn</p>
            </div>
            <input
              type="text"
              value={tempGuestName}
              onChange={(e) => setTempGuestName(e.target.value)}
              maxLength={20}
              placeholder="Nhập tên ngộ nghĩnh của bạn..."
              className={`w-full border focus:border-orange-500 rounded-xl px-3 py-2.5 text-xs outline-none transition-colors ${themeClasses.inputBg}`}
            />
            <button
              type="button"
              onClick={handleRollRandomNickname}
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[11px] font-bold border border-dashed border-orange-300 dark:border-slate-700 active:scale-95 transition-all ${themeClasses.guestPillBg}`}
            >
              🎲 Sử dụng nickname ngẫu nhiên
            </button>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditingName(false)}
                className={`py-2 px-3 rounded-lg text-[11px] font-bold ${themeClasses.closeBtn}`}
              >
                Huỷ
              </button>
              <button
                onClick={saveNameEdit}
                className="py-2 px-4 rounded-lg text-[11px] font-bold bg-gradient-to-r from-orange-600 to-amber-500 text-white"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Onboarding Name Modal */}
      {showOnboardingNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
          <div className={`relative w-full max-w-sm border rounded-3xl p-6 shadow-2xl space-y-6 animate-scale-in ${themeClasses.modalBg}`}>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-orange-500/20">
                <SvgIcons.Sparkles className="w-8 h-8" />
              </div>
              <h3 className={`text-lg font-black tracking-tight ${themeClasses.modalTextTitle}`}>
                Cho quán biết tên của bạn nhé!
              </h3>
              <p className={`text-xs ${themeClasses.textMuted} leading-relaxed`}>
                Tên này dùng để hiển thị trong giỏ hàng chung với bạn bè cùng bàn và giúp nhân viên phục vụ bạn chu đáo hơn.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                maxLength={20}
                placeholder="Nhập tên của bạn (ví dụ: Anh Nam, Lan Anh...)"
                className={`w-full border focus:border-orange-500 rounded-2xl px-4 py-3.5 text-sm outline-none transition-colors text-center font-semibold ${themeClasses.inputBg}`}
              />

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  onClick={() => handleSaveOnboardingName(inputName)}
                  disabled={!inputName.trim()}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] font-bold text-sm text-white text-center shadow-md transition-all cursor-pointer"
                >
                  Tiếp tục
                </button>
                <button
                  onClick={() => handleSaveOnboardingName()}
                  className={`w-full py-3 rounded-2xl text-xs font-bold transition-all text-center ${themeClasses.closeBtn}`}
                >
                  Bỏ qua & dùng Biệt danh ngẫu nhiên
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
