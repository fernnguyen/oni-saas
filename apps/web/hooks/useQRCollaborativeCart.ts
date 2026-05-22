'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { toast } from 'sonner';

export interface SelectedModifier {
  group: string;
  option: string;
  price_adj: number;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  sku?: string;
  unit_price: number;
  cost_price: number;
  qty: number;
  discount_amount: number;
  line_total: number;
  variant_label?: string;
  modifiers?: SelectedModifier[];
  modifier_total?: number;
  unit_id?: string;
  unit_name?: string;
  conversion_rate?: number;
}

export interface ActiveGuest {
  guestId: string;
  guestName: string;
  joinedAt: number;
}

const CUTE_ANIMALS = [
  'Gấu Trúc', 'Sóc Nhỏ', 'Thỏ Ngọc', 'Mèo Con', 'Cáo Đỏ', 
  'Cánh Cụt', 'Hươu Cao Cổ', 'Rùa Con', 'Sư Tử', 'Khỉ Con', 
  'Nhím Gai', 'Hải Cẩu', 'Gấu Bắc Cực', 'Nai Vàng', 'Voi Con'
];

const CUTE_ADJECTIVES = [
  'Tinh Nghịch', 'Dễ Thương', 'Nhanh Nhẹn', 'Thông Minh', 
  'Ngộ Nghĩnh', 'Chăm Chỉ', 'Đáng Yêu', 'Vui Vẻ', 'Hiền Lành', 
  'Ấm Áp', 'Láu Lỉnh', 'Béo Tròn'
];

function generateRandomNickname(): string {
  const animal = CUTE_ANIMALS[Math.floor(Math.random() * CUTE_ANIMALS.length)];
  const adj = CUTE_ADJECTIVES[Math.floor(Math.random() * CUTE_ADJECTIVES.length)];
  return `${animal} ${adj}`;
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function useQRCollaborativeCart(sessionId: string, tenantId: string) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [note, setNote] = useState<string>('');
  const [guestId, setGuestId] = useState<string>('');
  const [guestName, setGuestName] = useState<string>('');
  const [activeGuests, setActiveGuests] = useState<ActiveGuest[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const supabase = getSupabaseBrowserClient();
  const channelRef = useRef<any>(null);

  const cartItemsRef = useRef(cartItems);
  cartItemsRef.current = cartItems;

  const noteRef = useRef(note);
  noteRef.current = note;

  const guestIdRef = useRef(guestId);
  guestIdRef.current = guestId;

  const guestNameRef = useRef(guestName);
  guestNameRef.current = guestName;

  // 1. Initialize identity from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let savedId = localStorage.getItem('oni_qr_guest_id');
    if (!savedId) {
      savedId = generateShortId();
      localStorage.setItem('oni_qr_guest_id', savedId);
    }
    setGuestId(savedId);

    let savedName = localStorage.getItem('oni_qr_guest_name');
    if (!savedName) {
      savedName = generateRandomNickname();
      localStorage.setItem('oni_qr_guest_name', savedName);
    }
    setGuestName(savedName);
  }, []);

  // Helper function to calculate line totals
  const calculateLineTotal = (item: CartItem): number => {
    const modTotal = item.modifier_total ?? 0;
    return Math.max(0, item.unit_price + modTotal - item.discount_amount) * item.qty;
  };

  // Helper to update state and send broadcast
  const updateCartAndBroadcast = useCallback((newItems: CartItem[], newNote: string) => {
    setCartItems(newItems);
    setNote(newNote);

    if (channelRef.current && isConnected) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'cart_update',
        payload: {
          cartItems: newItems,
          note: newNote,
          updatedBy: guestIdRef.current,
          timestamp: Date.now(),
        },
      });
    }
  }, [isConnected]);

  // 2. Manage Supabase Realtime channel for Broadcast and Presence
  useEffect(() => {
    if (!sessionId || !tenantId || !guestId || !guestName) return;

    const channelName = `tenant_${tenantId}_session_${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: guestId,
        },
      },
    });

    channelRef.current = channel;

    // A. Presence - track online users in this table
    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const guests: ActiveGuest[] = Object.keys(presenceState).map((key) => {
          const presences = presenceState[key] as any[];
          return {
            guestId: key,
            guestName: presences[0]?.guest_name || 'Khách ẩn danh',
            joinedAt: presences[0]?.joined_at || Date.now(),
          };
        });
        setActiveGuests(guests);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const joinedName = newPresences[0]?.guest_name || 'Thực khách';
        if (key !== guestIdRef.current) {
          toast.success(`${joinedName} vừa tham gia bàn ăn`);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const leftName = leftPresences[0]?.guest_name || 'Thực khách';
        if (key !== guestIdRef.current) {
          toast.info(`${leftName} đã rời bàn ăn`);
        }
      });

    // B. Broadcast - synchronize RAM-based shopping cart
    channel
      .on('broadcast', { event: 'cart_update' }, ({ payload }) => {
        if (payload.updatedBy !== guestIdRef.current) {
          setCartItems(payload.cartItems);
          setNote(payload.note || '');
        }
      })
      .on('broadcast', { event: 'cart_sync_request' }, ({ payload }) => {
        // A late-joiner joined and is asking for current cart.
        // If we have items in our cart, we reply with the source of truth.
        if (payload.requestedBy !== guestIdRef.current && cartItemsRef.current.length > 0) {
          channel.send({
            type: 'broadcast',
            event: 'cart_sync_response',
            payload: {
              cartItems: cartItemsRef.current,
              note: noteRef.current,
              syncedBy: guestIdRef.current,
              timestamp: Date.now(),
            },
          });
        }
      })
      .on('broadcast', { event: 'cart_sync_response' }, ({ payload }) => {
        // If we are a late-joiner (our cart is empty), adopt the synced cart from other guest.
        if (cartItemsRef.current.length === 0) {
          setCartItems(payload.cartItems);
          setNote(payload.note || '');
          toast.info(`Đã đồng bộ giỏ hàng từ ${payload.syncedName || 'bàn ăn'}`);
        }
      });

    // C. Subscribe to the channel
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // Track our presence on the table
        await channel.track({
          guest_name: guestNameRef.current,
          joined_at: Date.now(),
        });

        // Request initial cart sync from any active guests on the table
        channel.send({
          type: 'broadcast',
          event: 'cart_sync_request',
          payload: {
            requestedBy: guestIdRef.current,
          },
        });
      } else {
        setIsConnected(false);
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId, tenantId, guestId, guestName]);

  // 3. User operations mapped to collaborative states
  const addItem = useCallback((product: any) => {
    const existingIndex = cartItemsRef.current.findIndex(
      (i) => i.product_id === product.product_id && !i.variant_label && (!i.modifiers || i.modifiers.length === 0)
    );

    let newItems = [...cartItemsRef.current];
    if (existingIndex >= 0) {
      const item = newItems[existingIndex];
      const updatedQty = item.qty + 1;
      newItems[existingIndex] = {
        ...item,
        qty: updatedQty,
        line_total: calculateLineTotal({ ...item, qty: updatedQty }),
      };
    } else {
      const price = Number(product.sell_price || product.unit_price || 0);
      newItems.push({
        product_id: product.product_id,
        product_name: product.name || product.product_name,
        sku: product.sku,
        unit_price: price,
        cost_price: Number(product.cost_price || 0),
        qty: 1,
        discount_amount: 0,
        line_total: price,
      });
    }

    updateCartAndBroadcast(newItems, noteRef.current);
  }, [updateCartAndBroadcast]);

  const addItemWithOptions = useCallback((item: CartItem) => {
    const sig = item.variant_label || JSON.stringify(item.modifiers || []);
    const existingIndex = cartItemsRef.current.findIndex(
      (i) => i.product_id === item.product_id &&
        (i.variant_label || JSON.stringify(i.modifiers || [])) === sig
    );

    let newItems = [...cartItemsRef.current];
    if (existingIndex >= 0) {
      const existingItem = newItems[existingIndex];
      const updatedQty = existingItem.qty + 1;
      newItems[existingIndex] = {
        ...existingItem,
        qty: updatedQty,
        line_total: calculateLineTotal({ ...existingItem, qty: updatedQty }),
      };
    } else {
      newItems.push(item);
    }

    updateCartAndBroadcast(newItems, noteRef.current);
  }, [updateCartAndBroadcast]);

  const removeItem = useCallback((productId: string, variantLabel?: string, modifiers?: SelectedModifier[]) => {
    const sig = variantLabel || JSON.stringify(modifiers || []);
    const newItems = cartItemsRef.current.filter(
      (i) => !(i.product_id === productId && (i.variant_label || JSON.stringify(i.modifiers || [])) === sig)
    );
    updateCartAndBroadcast(newItems, noteRef.current);
  }, [updateCartAndBroadcast]);

  const setQty = useCallback((productId: string, qty: number, variantLabel?: string, modifiers?: SelectedModifier[]) => {
    const sig = variantLabel || JSON.stringify(modifiers || []);
    if (qty <= 0) {
      const newItems = cartItemsRef.current.filter(
        (i) => !(i.product_id === productId && (i.variant_label || JSON.stringify(i.modifiers || [])) === sig)
      );
      updateCartAndBroadcast(newItems, noteRef.current);
      return;
    }

    const newItems = cartItemsRef.current.map((i) => {
      if (i.product_id === productId && (i.variant_label || JSON.stringify(i.modifiers || [])) === sig) {
        return {
          ...i,
          qty,
          line_total: calculateLineTotal({ ...i, qty }),
        };
      }
      return i;
    });

    updateCartAndBroadcast(newItems, noteRef.current);
  }, [updateCartAndBroadcast]);

  const setNoteValue = useCallback((newNote: string) => {
    updateCartAndBroadcast(cartItemsRef.current, newNote);
  }, [updateCartAndBroadcast]);

  const clearCart = useCallback(() => {
    updateCartAndBroadcast([], noteRef.current);
  }, [updateCartAndBroadcast]);

  const updateGuestName = useCallback((newName: string) => {
    if (!newName.trim() || newName === guestNameRef.current) return;
    
    setGuestName(newName);
    localStorage.setItem('oni_qr_guest_name', newName);

    // Track the new name in Presence immediately
    if (channelRef.current && isConnected) {
      channelRef.current.track({
        guest_name: newName,
        joined_at: Date.now(),
      });
    }
  }, [isConnected]);

  // Derived calculations
  const subtotal = cartItems.reduce((sum, item) => sum + item.line_total, 0);
  const total = subtotal; // QR cart doesn't apply dynamic code-based discount in RAM draft

  return {
    cartItems,
    note,
    guestId,
    guestName,
    activeGuests,
    isConnected,
    subtotal,
    total,
    addItem,
    addItemWithOptions,
    removeItem,
    setQty,
    setNote: setNoteValue,
    clearCart,
    updateGuestName,
  };
}
