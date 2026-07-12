import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
import { useQRCollaborativeCart, CartItem, SelectedModifier } from '@/hooks/useQRCollaborativeCart';
import { generateRandomNickname } from '@/hooks/useQRCollaborativeCart';
import toast from 'react-hot-toast';
import { getUserInfo } from 'zmp-sdk/apis';

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

// Inline SVGs for lightweight UI rendering without adding npm dependencies
const SvgIcons = {
  Sparkles: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  Users: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Edit: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Cart: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  ),
  ChevronRight: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  Search: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Plus: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  ),
  Minus: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
    </svg>
  ),
  Trash: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
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
  History: ({ className }: { className?: string } = {}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="16" y2="14" />
    </svg>
  ),
};

export default function QRClientPage() {
  const [searchParams] = useSearchParams();
  const shopSlug = searchParams.get('shop_slug');
  const tableId = searchParams.get('table_id') || searchParams.get('tableId');

  // Resolved Shop & Tenant States
  const [loadingShop, setLoadingShop] = useState(true);
  const [shop, setShop] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Session & Table States
  const [loadingSession, setLoadingSession] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [table, setTable] = useState<any>(null);

  // Identity state
  const [nameConfigured, setNameConfigured] = useState(false);
  const [isZaloLoading, setIsZaloLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempName, setTempName] = useState('');

  // Menu States
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // UI Modals & Drawers States
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [orderRequests, setOrderRequests] = useState<any[]>([]);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Product Selection/Picker States
  const [selectedParentProduct, setSelectedParentProduct] = useState<any | null>(null);
  const [selectedModifierProduct, setSelectedModifierProduct] = useState<any | null>(null);
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});

  // 1. Fetch public shop metadata from main domain
  useEffect(() => {
    async function loadShopData() {
      if (!shopSlug) {
        setError('Thiếu tham số mã cửa hàng (shop_slug).');
        setLoadingShop(false);
        return;
      }

      try {
        const rootDomain = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';
        const devApiUrl = import.meta.env.VITE_DEV_API_URL || '';
        const isDev = import.meta.env.DEV;
        const baseUrl = isDev && devApiUrl ? devApiUrl : `https://${rootDomain}`;

        const res = await fetch(`${baseUrl}/api/public/shops/by-slug?slug=${shopSlug}`);
        if (!res.ok) {
          throw new Error('Không tìm thấy thông tin cửa hàng.');
        }

        const data = await res.json();
        setShop(data);
        
        // Cấu hình Base URL cho các API endpoints theo tenant_slug
        setTenantCode(data.tenant_slug);

        // Check if name is already configured
        const guestName = localStorage.getItem('oni_qr_guest_name');
        if (guestName) {
          setNameConfigured(true);
        }
      } catch (err: any) {
        setError(err.message || 'Lỗi tải dữ liệu.');
      } finally {
        setLoadingShop(false);
      }
    }

    void loadShopData();
  }, [shopSlug]);

  // 2. Fetch session details when shop info and tableId are available
  const fetchSessionStatus = async (showLoading = false) => {
    if (!shop || !tableId) return;
    if (showLoading) setLoadingSession(true);
    try {
      const rootDomain = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';
      const devApiUrl = import.meta.env.VITE_DEV_API_URL || '';
      const isDev = import.meta.env.DEV;
      const apiHost = isDev && devApiUrl ? devApiUrl : `https://${shop.tenant_slug}.${rootDomain}`;

      const res = await fetch(`${apiHost}/api/shops/${shop.id}/qr-sessions?resource_id=${tableId}`);
      if (!res.ok) {
        throw new Error('Không thể lấy thông tin bàn ăn.');
      }
      const data = await res.json();

      if (data.session) {
        setSession((prev: any) => {
          if (prev && prev.id === data.session.id && prev.status === data.session.status) {
            return prev;
          }
          return data.session;
        });
        setTable((prev: any) => {
          if (prev && prev.status === data.table.status && prev.current_order_id === data.table.current_order_id) {
            return prev;
          }
          return data.table;
        });

        localStorage.setItem('oni_qr_session_id', data.session.id);
        localStorage.setItem('oni_qr_session_token', data.session.session_token);
      } else {
        setSession(null);
        setTable(data.table);
      }
    } catch (err: any) {
      console.error('Lỗi lấy session:', err);
    } finally {
      if (showLoading) setLoadingSession(false);
    }
  };

  useEffect(() => {
    if (shop && tableId) {
      void fetchSessionStatus(true);
    }
  }, [shop, tableId]);

  // 3. Collaborative Cart Hook instantiation
  const colabCart = useQRCollaborativeCart(session?.id || '', shop?.tenant_id || '');

  // 4. Periodically poll session status if it's pending/waiting for approval
  useEffect(() => {
    if (!session || (session.status !== 'pending' && session.status !== 'active')) return;

    const interval = setInterval(() => {
      void fetchSessionStatus(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [session, shop]);

  // 5. Fetch Menu & Submitted Orders once session is active
  const fetchMenuAndOrders = async () => {
    if (!shop || !session || (session.status !== 'active' && session.status !== 'completed')) return;
    setMenuLoading(true);
    try {
      const rootDomain = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';
      const devApiUrl = import.meta.env.VITE_DEV_API_URL || '';
      const isDev = import.meta.env.DEV;
      const apiHost = isDev && devApiUrl ? devApiUrl : `https://${shop.tenant_slug}.${rootDomain}`;

      const oUrl = `${apiHost}/api/shops/${shop.id}/qr-orders?session_id=${session.id}&session_token=${session.session_token}`;
      
      if (session.status === 'completed') {
        const ordersRes = await fetch(oUrl).then(r => r.json());
        setOrderRequests(ordersRes || []);
        return;
      }

      const pUrl = `${apiHost}/api/shops/${shop.id}/qr-products?session_id=${session.id}&session_token=${session.session_token}`;
      const [menuRes, ordersRes] = await Promise.all([
        fetch(pUrl).then(r => {
          if (!r.ok) throw new Error('Không thể tải menu.');
          return r.json();
        }),
        fetch(oUrl).then(r => {
          if (!r.ok) throw new Error('Không thể tải lịch sử đơn hàng.');
          return r.json();
        })
      ]);

      setProducts(menuRes.products || []);
      setCategories(menuRes.categories || []);
      setOrderRequests(ordersRes || []);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải danh mục/sản phẩm');
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      void fetchMenuAndOrders();
    }
  }, [session, shop]);

  // Realtime updates for Order Requests Status via Supabase Realtime
  useEffect(() => {
    if (!session || session.status === 'completed') return;

    const channelName = `zma_session_orders_${session.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_order_requests',
          filter: `session_id=eq.${session.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRequest = payload.new as any;
            setOrderRequests((prev) => {
              if (prev.some((r) => r.id === newRequest.id)) return prev;
              return [newRequest, ...prev];
            });
            toast.success('Gửi món mới thành công!');
          } else if (payload.eventType === 'UPDATE') {
            const updatedRequest = payload.new as any;
            setOrderRequests((prev) =>
              prev.map((r) => (r.id === updatedRequest.id ? updatedRequest : r))
            );
            
            if (updatedRequest.status === 'approved') {
              toast.success('Đơn gọi món của bạn đã được nhà hàng duyệt!');
            } else if (updatedRequest.status === 'rejected') {
              toast.error('Đơn gọi món bị từ chối. Vui lòng liên hệ nhân viên.');
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.id, session?.status]);

  // 6. Welcome flow handlers
  const handleZaloAuthAndRequestSession = () => {
    setIsZaloLoading(true);
    getUserInfo({
      success: (data) => {
        const { userInfo } = data;
        const name = userInfo?.name?.trim();
        if (name) {
          localStorage.setItem('oni_qr_guest_name', name);
          localStorage.setItem('oni_qr_guest_name_configured', 'true');
          colabCart.updateGuestName(name);
          setNameConfigured(true);
          toast.success(`Chào mừng ${name}!`);
          void handleRequestSession();
        } else {
          fallbackToRandomName();
        }
        setIsZaloLoading(false);
      },
      fail: (err) => {
        console.warn('Từ chối cấp quyền thông tin Zalo:', err);
        fallbackToRandomName();
        setIsZaloLoading(false);
      }
    });
  };

  const fallbackToRandomName = () => {
    const randomName = generateRandomNickname();
    localStorage.setItem('oni_qr_guest_name', randomName);
    localStorage.setItem('oni_qr_guest_name_configured', 'true');
    colabCart.updateGuestName(randomName);
    setNameConfigured(true);
    toast.success(`Sử dụng biệt danh: ${randomName}`);
    void handleRequestSession();
  };

  const handleRequestSession = async () => {
    if (!shop || !tableId) return;
    setIsJoinLoading(true);
    try {
      const rootDomain = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';
      const devApiUrl = import.meta.env.VITE_DEV_API_URL || '';
      const isDev = import.meta.env.DEV;
      const apiHost = isDev && devApiUrl ? devApiUrl : `https://${shop.tenant_slug}.${rootDomain}`;

      const res = await fetch(`${apiHost}/api/shops/${shop.id}/qr-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: tableId })
      });

      if (!res.ok) {
        throw new Error('Yêu cầu mở bàn ăn thất bại.');
      }
      
      const data = await res.json();
      setSession(data.session);
      setTable(data.table);

      if (data.session) {
        localStorage.setItem('oni_qr_session_id', data.session.id);
        localStorage.setItem('oni_qr_session_token', data.session.session_token);
      }

      toast.success(data.session.status === 'active' ? 'Bàn ăn đã được mở!' : 'Đã gửi yêu cầu mở bàn ăn!');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gửi yêu cầu mở bàn.');
    } finally {
      setIsJoinLoading(false);
    }
  };

  // Nickname editor
  const handleOpenNameEdit = () => {
    setTempName(colabCart.guestName);
    setShowNameModal(true);
  };

  const handleSaveNickname = () => {
    if (tempName.trim()) {
      colabCart.updateGuestName(tempName.trim());
      setShowNameModal(false);
      toast.success('Đã cập nhật biệt danh!');
    }
  };

  // 7. Product selection & logic
  const handleProductClick = (product: any) => {
    if (product.product_type === 'variant_parent') {
      setSelectedParentProduct(product);
      return;
    }

    const config = safeJson(product.variant_options);
    const groups = Array.isArray(config?.groups) ? config.groups : [];

    if (groups.length > 0) {
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

    colabCart.addItem(product);
    toast.success(`Đã thêm ${product.name} vào giỏ hàng`);
  };

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

    const config = safeJson(childVariant.variant_options);
    const groups = Array.isArray(config?.groups) ? config.groups : [];

    if (groups.length > 0) {
      setSelectedParentProduct(null);
      const initialSel: Record<string, string[]> = {};
      for (const group of groups) {
        if (group.options.length > 0) {
          initialSel[group.id] = [group.options[0].id];
        }
      }
      setModifierSelections(initialSel);
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

  const handleModifierOptionToggle = (group: ModifierGroup, optId: string) => {
    const prev = modifierSelections[group.id] || [];
    if (group.max_selection === 1) {
      setModifierSelections({
        ...modifierSelections,
        [group.id]: [optId],
      });
    } else {
      const idx = prev.indexOf(optId);
      const next = [...prev];
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

  const handleConfirmModifiers = () => {
    const config = safeJson(selectedModifierProduct.variant_options);
    const groups: ModifierGroup[] = Array.isArray(config?.groups) ? config.groups : [];

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

  // 8. Order Submission
  const handleSubmitOrder = async () => {
    if (colabCart.cartItems.length === 0) {
      toast.error('Giỏ hàng trống!');
      return;
    }
    setSubmittingOrder(true);
    try {
      const rootDomain = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';
      const devApiUrl = import.meta.env.VITE_DEV_API_URL || '';
      const isDev = import.meta.env.DEV;
      const apiHost = isDev && devApiUrl ? devApiUrl : `https://${shop.tenant_slug}.${rootDomain}`;

      const res = await fetch(`${apiHost}/api/shops/${shop.id}/qr-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          session_token: session.session_token,
          guest_id: colabCart.guestId,
          guest_name: colabCart.guestName,
          items: colabCart.cartItems,
          note: colabCart.note
        })
      });

      if (!res.ok) {
        throw new Error('Gửi yêu cầu gọi món thất bại.');
      }

      colabCart.clearCart();
      setIsCartOpen(false);
      setIsHistoryOpen(true);
      toast.success('Đã gửi yêu cầu gọi món! Đang đợi bếp duyệt...');
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra khi đặt món.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Filters for display
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.active !== false);
  }, [products]);

  const displayProducts = useMemo(() => {
    return activeProducts.filter(
      (p) => p.product_type !== 'variant_child' && !p.parent_id
    );
  }, [activeProducts]);

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

  const getProductChildren = (parentId: string) => {
    return activeProducts.filter((p) => p.parent_id === parentId);
  };

  // UI Rendering States
  if (loadingShop) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto animate-spin rounded-full border-4 border-orange-500 border-t-transparent h-10 w-10"></div>
          <p className="mt-4 text-sm font-semibold text-slate-500">Đang tải thông tin cửa hàng...</p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-500">
            ⚠️
          </div>
          <h3 className="text-lg font-bold text-slate-800">Không tìm thấy gian hàng</h3>
          <p className="mt-2 text-sm text-slate-500">{error || 'Đường dẫn QR không hợp lệ hoặc cửa hàng đã ngừng hoạt động.'}</p>
        </div>
      </div>
    );
  }

  // A. WELCOME SCREEN (When guest hasn't requested/joined an active session on this table)
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        {/* Banner header */}
        <div className="relative h-48 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
          {shop.banner_url ? (
            <img src={shop.banner_url} alt={shop.name} className="absolute inset-0 h-full w-full object-cover opacity-60" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-500 opacity-80" />
          )}
          
          <div className="relative text-center z-10 p-4">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight shadow-xs">{shop.name}</h1>
            <p className="text-xs text-orange-100 font-bold mt-1 uppercase tracking-wider">{table?.name || 'Bàn gọi món'}</p>
          </div>
        </div>

        {/* Info Card */}
        <div className="flex-1 -mt-6 relative z-10 px-4">
          <div className="rounded-t-3xl bg-white p-6 shadow-xl border-t border-slate-100 text-center space-y-6">
            
            {/* Logo */}
            <div className="mx-auto -mt-16 relative h-20 w-20 overflow-hidden rounded-2xl bg-white p-1.5 shadow-md border border-slate-100">
              {shop.logo_url ? (
                <img src={shop.logo_url} alt="Logo" className="h-full w-full object-contain rounded-xl" />
              ) : (
                <div className="h-full w-full rounded-xl bg-orange-100 text-orange-600 font-black text-xl flex items-center justify-center">
                  {shop.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-800">Chào mừng quý khách!</h3>
              <p className="text-sm text-slate-500">Quét mã thành công để truy cập thực đơn trực tuyến tại bàn.</p>
            </div>

            {/* Address & Hotline */}
            <div className="rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-600 space-y-2 border border-slate-100">
              {shop.address && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 shrink-0">📍</span>
                  <span>{shop.address}</span>
                </div>
              )}
              {shop.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 shrink-0">📞</span>
                  <span>Hotline hỗ trợ: <strong className="text-orange-600 font-bold">{shop.phone}</strong></span>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="space-y-3 pt-4">
              <button
                onClick={handleZaloAuthAndRequestSession}
                disabled={isZaloLoading || isJoinLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-4 text-sm transition-all active:scale-98 shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isZaloLoading ? (
                  <>
                    <SvgIcons.Spinner className="h-4 w-4 text-white" />
                    <span>Đang xác thực Zalo...</span>
                  </>
                ) : isJoinLoading ? (
                  <>
                    <SvgIcons.Spinner className="h-4 w-4 text-white" />
                    <span>Đang gửi yêu cầu...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Bắt đầu gọi món tại {table?.name || 'bàn'}</span>
                  </>
                )}
              </button>

              <button
                onClick={fallbackToRandomName}
                className="w-full text-slate-500 font-semibold py-2.5 text-xs hover:text-orange-500 transition-colors"
              >
                Bỏ qua xác thực, sử dụng Biệt danh ngẫu nhiên
              </button>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="py-6 text-center text-[10px] text-slate-400 font-medium">
          Powered by ONI POS
        </div>
      </div>
    );
  }

  // B. PENDING APPROVAL SCREEN
  if (session.status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative">
            <div className="animate-ping absolute inset-0 h-16 w-16 rounded-full bg-orange-100 opacity-75"></div>
            <div className="relative h-16 w-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-3xl shadow-sm">
              🔔
            </div>
          </div>

          <div className="space-y-2 max-w-xs">
            <h3 className="text-lg font-bold text-slate-800">Đang chờ nhân viên mở bàn</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Yêu cầu kết nối tại <strong>{table?.name || 'bàn ăn'}</strong> đã gửi tới nhân viên phục vụ.
              Bàn sẽ tự động mở khi được chấp nhận.
            </p>
          </div>

          {/* Quick shop details */}
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-sm border border-slate-100 text-xs text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">{shop.name}</p>
            {shop.phone && <p>Hotline: {shop.phone}</p>}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-orange-500 font-bold animate-pulse">
            <SvgIcons.Spinner className="h-3.5 w-3.5" />
            <span>Đang đợi phản hồi từ quầy thu ngân...</span>
          </div>
        </div>

        {/* Action Call */}
        <div className="space-y-4">
          {shop.phone && (
            <a
              href={`tel:${shop.phone}`}
              className="block w-full text-center rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold py-3 text-xs shadow-xs"
            >
              📞 Gọi nhân viên hỗ trợ
            </a>
          )}
          <div className="text-center text-[10px] text-slate-400 font-medium">
            Powered by ONI POS
          </div>
        </div>
      </div>
    );
  }

  // C. COMPLETED SESSION Recapitulation
  if (session.status === 'completed') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-3xl shadow-sm">
            ✅
          </div>

          <div className="space-y-2 max-w-xs">
            <h3 className="text-lg font-bold text-slate-800">Phiên phục vụ hoàn tất</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cảm ơn quý khách đã dùng bữa tại <strong>{shop.name}</strong>. Phiên gọi món tại {table?.name || 'bàn'} đã được nhân viên chốt thanh toán.
            </p>
          </div>

          {/* Bill items recap if any */}
          {orderRequests.length > 0 && (
            <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm border border-slate-100 text-left text-xs space-y-3">
              <p className="font-bold text-slate-800 border-b pb-1.5">Lịch sử gọi món:</p>
              <div className="max-h-60 overflow-y-auto space-y-2.5 divide-y divide-slate-50">
                {orderRequests.map((req, rIdx) => {
                  const items = safeJson(req.items) || [];
                  return (
                    <div key={req.id} className={`${rIdx > 0 ? 'pt-2.5' : ''}`}>
                      <div className="flex justify-between font-semibold text-slate-600 mb-1">
                        <span>Lượt gọi #{orderRequests.length - rIdx}</span>
                        <span className="text-green-600">Đã duyệt</span>
                      </div>
                      <ul className="space-y-1 text-slate-500">
                        {items.map((item: any, iIdx: number) => (
                          <li key={iIdx} className="flex justify-between">
                            <span>{item.product_name} {item.variant_label ? `(${item.variant_label})` : ''} x{item.qty}</span>
                            <span>{fmtVND(item.line_total)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-slate-400 font-medium">
          Powered by ONI POS
        </div>
      </div>
    );
  }

  // D. ACTIVE ORDERING MENU SCREEN
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between pb-24">
      {/* Header Info */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg overflow-hidden bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm shrink-0">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              shop.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 truncate max-w-40">{shop.name}</h2>
            <p className="text-[10px] text-slate-450 font-bold flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
              {table?.name || 'Bàn ăn'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active collaborative guests list */}
          <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 rounded-full px-2.5 py-1 text-[10px] text-orange-600 font-semibold">
            <SvgIcons.Users />
            <span>{colabCart.activeGuests.length}</span>
          </div>

          {/* Nickname button */}
          <button
            onClick={handleOpenNameEdit}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs text-slate-600 font-medium cursor-pointer"
          >
            <span className="max-w-20 truncate">{colabCart.guestName}</span>
            <SvgIcons.Edit />
          </button>
        </div>
      </div>

      {/* Main Menu Layout */}
      <div className="flex-1 flex flex-col">
        {/* Search & Categories Bar */}
        <div className="bg-white border-b border-slate-100 p-3 space-y-2.5">
          {/* Search box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <SvgIcons.Search />
            </span>
            <input
              type="text"
              placeholder="Tìm món ăn, đồ uống..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border-0 pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Category List */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold shrink-0 cursor-pointer transition-all ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/10'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold shrink-0 cursor-pointer transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/10'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu loading spinner */}
        {menuLoading ? (
          <div className="py-20 text-center">
            <SvgIcons.Spinner className="mx-auto h-8 w-8 text-orange-500" />
            <p className="mt-2 text-xs text-slate-400">Đang tải thực đơn...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-xs">
            Không tìm thấy món ăn nào phù hợp.
          </div>
        ) : (
          /* Products Grid */
          <div className="p-3 grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => {
              const children = getProductChildren(p.product_id || p.id);
              const hasOptions = p.product_type === 'variant_parent' || children.length > 0;
              
              return (
                <div
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-xs hover:border-slate-200 transition-all flex flex-col justify-between active:scale-98 cursor-pointer"
                >
                  <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-300 font-black text-2xl uppercase select-none">
                        {p.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{p.name}</h4>
                      {p.sku && <span className="text-[9px] text-slate-400 font-mono">SKU: {p.sku}</span>}
                    </div>
                    
                    <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                      <span className="text-xs font-black text-orange-600">
                        {p.product_type === 'variant_parent' ? 'Chọn loại' : fmtVND(p.sell_price)}
                      </span>
                      <button className="h-6 w-6 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-600 font-black text-sm flex items-center justify-center shrink-0 cursor-pointer transition-all">
                        {hasOptions ? '⌥' : '+'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {colabCart.cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 p-3 shadow-xl flex items-center justify-between gap-3">
          <div
            onClick={() => setIsCartOpen(true)}
            className="flex-1 flex items-center gap-3 bg-orange-50 border border-orange-100 hover:bg-orange-100/55 rounded-2xl p-2.5 cursor-pointer transition-all"
          >
            <div className="relative h-10 w-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
              <SvgIcons.Cart />
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full text-[9px] font-black h-4.5 w-4.5 flex items-center justify-center border border-white">
                {colabCart.cartItems.reduce((acc, curr) => acc + curr.qty, 0)}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Giỏ hàng chung</p>
              <p className="text-sm font-black text-slate-800">{fmtVND(colabCart.total)}</p>
            </div>
          </div>

          <button
            onClick={() => setIsCartOpen(true)}
            className="rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 text-xs transition-colors shrink-0 cursor-pointer shadow-md shadow-orange-500/10"
          >
            Xem giỏ hàng
          </button>
        </div>
      )}

      {/* Cart Drawer Bottom Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800">Giỏ hàng của bàn</h3>
                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <span>{colabCart.activeGuests.length} khách online</span>
                </p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {colabCart.cartItems.length === 0 ? (
                <p className="text-center py-10 text-xs text-slate-400">Giỏ hàng trống.</p>
              ) : (
                <div className="space-y-3">
                  {colabCart.cartItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-start border-b border-slate-50 pb-3 gap-3">
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-slate-800 leading-tight">{item.product_name}</h4>
                        {item.variant_label && <p className="text-[9px] text-slate-500 font-medium">{item.variant_label}</p>}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[9px] text-slate-450 italic leading-snug">
                            + {item.modifiers.map(m => m.option).join(', ')}
                          </p>
                        )}
                        <p className="text-xs font-extrabold text-orange-600 mt-1">{fmtVND(item.line_total)}</p>
                      </div>

                      <div className="flex items-center gap-2 border border-slate-150 rounded-xl bg-slate-50 px-2 py-1 shrink-0">
                        <button
                          onClick={() => colabCart.setQty(item.product_id, item.qty - 1, item.variant_label, item.modifiers)}
                          className="text-slate-500 font-black text-sm w-5 h-5 flex items-center justify-center cursor-pointer active:scale-90"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold text-slate-700 w-6 text-center">{item.qty}</span>
                        <button
                          onClick={() => colabCart.setQty(item.product_id, item.qty + 1, item.variant_label, item.modifiers)}
                          className="text-slate-500 font-black text-sm w-5 h-5 flex items-center justify-center cursor-pointer active:scale-90"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Order note input */}
              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ghi chú cho bếp</label>
                <textarea
                  placeholder="Ví dụ: Không hành, nhiều đá, ít cay..."
                  value={colabCart.note}
                  onChange={(e) => colabCart.setNote(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border-0 p-3 text-xs text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-orange-500 resize-none h-16"
                />
              </div>
            </div>

            {/* Submission Actions */}
            <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-slate-500">Tổng cộng cộng tác:</span>
                <span className="font-black text-orange-600 text-lg">{fmtVND(colabCart.total)}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setIsHistoryOpen(true);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold py-3 text-xs text-slate-600 shadow-xs cursor-pointer text-center"
                >
                  Lịch sử gọi món
                </button>
                
                <button
                  onClick={handleSubmitOrder}
                  disabled={colabCart.cartItems.length === 0 || submittingOrder}
                  className="flex-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-60"
                >
                  {submittingOrder ? (
                    <>
                      <SvgIcons.Spinner className="h-4 w-4" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <>
                      <span>🔔</span>
                      <span>Gửi món vào bếp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Submitted Order Requests Drawer */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800">Lịch sử gửi món</h3>
                <p className="text-[10px] text-slate-400 font-bold">Theo dõi trạng thái các món đã gửi</p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {orderRequests.length === 0 ? (
                <div className="text-center py-20 text-xs text-slate-400">
                  Chưa gửi lượt món nào trong phiên hiện tại.
                </div>
              ) : (
                <div className="space-y-4">
                  {orderRequests.map((req, rIdx) => {
                    const items = safeJson(req.items) || [];
                    const createdTime = new Date(req.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    
                    const statusText = req.status === 'approved' 
                      ? 'Đã duyệt' 
                      : req.status === 'rejected' 
                      ? 'Từ chối' 
                      : 'Đang đợi';
                    
                    const statusClass = req.status === 'approved'
                      ? 'bg-green-100 text-green-600'
                      : req.status === 'rejected'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-600 animate-pulse';

                    return (
                      <div key={req.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-700">Lượt gọi #{orderRequests.length - rIdx} ({createdTime})</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusClass}`}>
                            {statusText}
                          </span>
                        </div>
                        <ul className="text-xs text-slate-500 space-y-1 divide-y divide-slate-100/50">
                          {items.map((item: any, iIdx: number) => (
                            <li key={iIdx} className="flex justify-between pt-1">
                              <span>{item.product_name} {item.variant_label ? `(${item.variant_label})` : ''} x{item.qty}</span>
                              <span className="font-semibold text-slate-600">{fmtVND(item.line_total)}</span>
                            </li>
                          ))}
                        </ul>
                        {req.note && (
                          <p className="text-[10px] text-slate-400 italic bg-white/70 p-1.5 rounded-md mt-1">
                            Ghi chú: {req.note}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-4 bg-slate-50">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="w-full rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 text-xs cursor-pointer text-center"
              >
                Tiếp tục gọi món
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Product Variant Picker Modal */}
      {selectedParentProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-800">{selectedParentProduct.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold">Vui lòng chọn một loại sản phẩm:</p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {getProductChildren(selectedParentProduct.product_id || selectedParentProduct.id).map((child) => {
                const opts = safeJson(child.variant_options) ?? {};
                const label = Object.entries(opts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' / ') || child.name;
                
                return (
                  <button
                    key={child.id}
                    onClick={() => handleConfirmVariant(child)}
                    className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-orange-500/50 p-3 text-xs font-semibold text-slate-800 transition-all flex justify-between items-center cursor-pointer shadow-xs"
                  >
                    <span>{label}</span>
                    <span className="text-orange-600 font-bold">{fmtVND(child.sell_price)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedParentProduct(null)}
                className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-semibold py-2.5 text-xs cursor-pointer text-center"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Group Picker Modal */}
      {selectedModifierProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col justify-between">
            <div className="overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-800">{selectedModifierProduct.name}</h3>
                <p className="text-[10px] text-slate-400 font-bold">Tùy chọn thêm của bạn:</p>
              </div>

              <div className="space-y-4">
                {(safeJson(selectedModifierProduct.variant_options)?.groups || []).map((group: ModifierGroup) => (
                  <div key={group.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-700">
                        {group.name} {group.is_required && <span className="text-red-500 font-bold">*</span>}
                      </h4>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        {group.max_selection === 1 ? 'Chọn 1' : `Chọn tối đa ${group.max_selection}`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt) => {
                        const isSelected = (modifierSelections[group.id] || []).includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleModifierOptionToggle(group, opt.id)}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-xs'
                                : 'border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700'
                            }`}
                          >
                            <span>{opt.name}</span>
                            <span className="ml-1 text-[9px] opacity-75">
                              ({Number(opt.price_adj) > 0 ? `+${fmtVND(opt.price_adj)}` : 'Miễn phí'})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => setSelectedModifierProduct(null)}
                className="w-1/3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-semibold py-3 text-xs cursor-pointer text-center"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmModifiers}
                className="w-2/3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 text-xs transition-colors cursor-pointer text-center shadow-md shadow-orange-500/10"
              >
                Xác nhận thêm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nickname Editor Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-800">Cập nhật Biệt danh</h3>
              <p className="text-[10px] text-slate-400 font-bold">Biệt danh của bạn sẽ hiển thị với những người cùng bàn:</p>
            </div>

            <input
              type="text"
              placeholder="Nhập biệt danh của bạn..."
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border-0 px-4 py-3 text-xs text-slate-850 placeholder-slate-400 focus:ring-1 focus:ring-orange-500 font-semibold"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowNameModal(false)}
                className="w-1/2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-semibold py-2.5 text-xs cursor-pointer text-center"
              >
                Đóng
              </button>
              <button
                onClick={handleSaveNickname}
                disabled={!tempName.trim()}
                className="w-1/2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 text-xs transition-colors cursor-pointer text-center shadow-md disabled:opacity-60"
              >
                Lưu lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Bar when cart is empty but order history is present */}
      {colabCart.cartItems.length === 0 && orderRequests.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 p-3 shadow-lg flex justify-center">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold py-3 text-xs text-slate-600 flex items-center justify-center gap-2 cursor-pointer"
          >
            <SvgIcons.History />
            <span>Lịch sử gọi món ({orderRequests.length} lượt)</span>
          </button>
        </div>
      )}
    </div>
  );
}
