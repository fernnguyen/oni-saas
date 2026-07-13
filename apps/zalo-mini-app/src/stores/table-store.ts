/**
 * Zustand store for table/room management.
 * Persists carts, sessions, and customer assignments per table.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Order } from '@/services/shop-api';

export type RentalType = 'hourly' | 'daily' | 'overnight';

export type TableStatus =
  | 'available'
  | 'occupied'
  | 'checking_out'
  | 'dirty'
  | 'cleaning'
  | 'inspected'
  | 'reserved'
  | 'maintenance';

export interface LodgingGuest {
  id?: string | number;
  name: string;
  id_type: string;
  id_number: string;
  idCard?: string;
  expiry_date?: string;
  nationality?: string;
  dob?: string;
  gender?: string;
  address?: string;
  note?: string;
}

export interface ResourceFull {
  id: string;
  name: string;
  zone?: string;
  type?: string;           // 'room' | 'table' | 'court' | 'billiards'
  status: TableStatus;
  current_order_id?: string;
  capacity?: number;
  hourly_rate?: number;
  daily_rate?: number;
  overnight_rate?: number;
  sort_order?: number;
  metadata?: string;       // JSON with advanced_pricing, etc.
}

export interface TableSession {
  tableId: string;
  orderId?: string;          // server order ID
  rentalType: RentalType;
  checkInTime: string;       // ISO
  numGuests: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  expectedCheckout?: string; // ISO
  hourlyRate?: number;
  dailyRate?: number;
  overnightRate?: number;
  advancedPricing?: any;
  lodgingGuests?: LodgingGuest[];
}

export interface TableCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  variantLabel?: string;
}

export interface ShopSettings {
  enable_shift_management?: boolean;
  enable_realtime_sync?: boolean;
  industry_type?: string;
  resource_sub_types?: any[];
  hourly_billing?: any;
  hotel_billing?: any;
  [key: string]: any;
}

// Composite key for cart items: productId_variant_note
export function makeTableCartItemId(productId: string, variantLabel?: string): string {
  return `${productId}_${variantLabel || 'none'}`;
}

type TableCart = Record<string, TableCartItem>;
type TableCustomer = { id: string; name: string; phone?: string } | null;

interface TableState {
  // ── Data ──
  resources: ResourceFull[];
  inProgressOrders: Order[];
  shopSettings: ShopSettings | null;

  // ── Per-table persistent state ──
  tableCarts: Record<string, TableCart>;
  tableCustomers: Record<string, TableCustomer>;
  tableSessions: Record<string, TableSession>;

  // ── View state ──
  statusFilter: 'all' | 'available' | 'occupied' | 'dirty' | 'cleaning';
  selectedZone: string | null;
  isLoading: boolean;
  lastFetched: number | null;

  // ── Modal state ──
  isCheckInModalOpen: boolean;
  selectedTableForOpen: ResourceFull | null;
  activeTable: ResourceFull | null;
  isSessionModalOpen: boolean;
  isTableCheckoutOpen: boolean;
  isCleanConfirmOpen: boolean;
  tableToClean: ResourceFull | null;
  isTransferModalOpen: boolean;

  // ── Bridge: table being ordered for from retail grid ──
  cartOwnerTableId: string | null;

  // ── Actions ──
  setResources: (r: ResourceFull[]) => void;
  setInProgressOrders: (o: Order[]) => void;
  setShopSettings: (s: ShopSettings) => void;
  setStatusFilter: (f: TableState['statusFilter']) => void;
  setSelectedZone: (z: string | null) => void;
  setIsLoading: (v: boolean) => void;
  setLastFetched: (ts: number | null) => void;
  setIsCheckInModalOpen: (v: boolean) => void;
  setSelectedTableForOpen: (t: ResourceFull | null) => void;
  setActiveTable: (t: ResourceFull | null) => void;
  setIsSessionModalOpen: (v: boolean) => void;
  setIsTableCheckoutOpen: (v: boolean) => void;
  setIsCleanConfirmOpen: (v: boolean) => void;
  setTableToClean: (t: ResourceFull | null) => void;
  setIsTransferModalOpen: (v: boolean) => void;
  setCartOwnerTableId: (id: string | null) => void;

  // ── Session management ──
  setTableSession: (tableId: string, session: TableSession) => void;
  updateTableSession: (tableId: string, updates: Partial<TableSession>) => void;
  removeTableSession: (tableId: string) => void;

  // ── Cart management ──
  setTableCart: (tableId: string, cart: TableCart) => void;
  addTableCartItem: (tableId: string, item: TableCartItem) => void;
  updateTableCartItemQty: (tableId: string, cartItemId: string, qty: number) => void;
  removeTableCartItem: (tableId: string, cartItemId: string) => void;
  clearTableCart: (tableId: string) => void;

  // ── Customer management ──
  setTableCustomer: (tableId: string, customer: TableCustomer) => void;

  // ── Optimistic resource update ──
  updateResource: (resourceId: string, updates: Partial<ResourceFull>) => void;
  removeResource: (resourceId: string) => void;
}

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      resources: [],
      inProgressOrders: [],
      shopSettings: null,
      tableCarts: {},
      tableCustomers: {},
      tableSessions: {},
      statusFilter: 'all',
      selectedZone: null,
      isLoading: false,
      lastFetched: null,
      isCheckInModalOpen: false,
      selectedTableForOpen: null,
      activeTable: null,
      isSessionModalOpen: false,
      isTableCheckoutOpen: false,
      isCleanConfirmOpen: false,
      tableToClean: null,
      isTransferModalOpen: false,
      cartOwnerTableId: null,

      // ── Setters ──
      setResources: (resources) => set({ resources }),
      setInProgressOrders: (inProgressOrders) => set({ inProgressOrders }),
      setShopSettings: (shopSettings) => set({ shopSettings }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setSelectedZone: (selectedZone) => set({ selectedZone }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setLastFetched: (lastFetched) => set({ lastFetched }),
      setIsCheckInModalOpen: (isCheckInModalOpen) => set({ isCheckInModalOpen }),
      setSelectedTableForOpen: (selectedTableForOpen) => set({ selectedTableForOpen }),
      setActiveTable: (activeTable) => set({ activeTable }),
      setIsSessionModalOpen: (isSessionModalOpen) => set({ isSessionModalOpen }),
      setIsTableCheckoutOpen: (isTableCheckoutOpen) => set({ isTableCheckoutOpen }),
      setIsCleanConfirmOpen: (isCleanConfirmOpen) => set({ isCleanConfirmOpen }),
      setTableToClean: (tableToClean) => set({ tableToClean }),
      setIsTransferModalOpen: (isTransferModalOpen) => set({ isTransferModalOpen }),
      setCartOwnerTableId: (cartOwnerTableId) => set({ cartOwnerTableId }),

      // ── Session management ──
      setTableSession: (tableId, session) =>
        set((s) => ({ tableSessions: { ...s.tableSessions, [tableId]: session } })),
      updateTableSession: (tableId, updates) =>
        set((s) => ({
          tableSessions: {
            ...s.tableSessions,
            [tableId]: { ...s.tableSessions[tableId], ...updates },
          },
        })),
      removeTableSession: (tableId) =>
        set((s) => {
          const copy = { ...s.tableSessions };
          delete copy[tableId];
          return { tableSessions: copy };
        }),

      // ── Cart management ──
      setTableCart: (tableId, cart) =>
        set((s) => ({ tableCarts: { ...s.tableCarts, [tableId]: cart } })),
      addTableCartItem: (tableId, item) => {
        const cartItemId = makeTableCartItemId(item.productId, item.variantLabel);
        const existing = get().tableCarts[tableId]?.[cartItemId];
        set((s) => ({
          tableCarts: {
            ...s.tableCarts,
            [tableId]: {
              ...s.tableCarts[tableId],
              [cartItemId]: existing
                ? { ...existing, quantity: existing.quantity + item.quantity }
                : item,
            },
          },
        }));
      },
      updateTableCartItemQty: (tableId, cartItemId, qty) => {
        if (qty <= 0) {
          get().removeTableCartItem(tableId, cartItemId);
          return;
        }
        set((s) => ({
          tableCarts: {
            ...s.tableCarts,
            [tableId]: {
              ...s.tableCarts[tableId],
              [cartItemId]: { ...s.tableCarts[tableId]?.[cartItemId], quantity: qty },
            },
          },
        }));
      },
      removeTableCartItem: (tableId, cartItemId) =>
        set((s) => {
          const cart = { ...s.tableCarts[tableId] };
          delete cart[cartItemId];
          return { tableCarts: { ...s.tableCarts, [tableId]: cart } };
        }),
      clearTableCart: (tableId) =>
        set((s) => ({ tableCarts: { ...s.tableCarts, [tableId]: {} } })),

      // ── Customer management ──
      setTableCustomer: (tableId, customer) =>
        set((s) => ({ tableCustomers: { ...s.tableCustomers, [tableId]: customer } })),

      // ── Optimistic resource updates ──
      updateResource: (resourceId, updates) =>
        set((s) => ({
          resources: s.resources.map((r) =>
            r.id === resourceId ? { ...r, ...updates } : r
          ),
        })),
      removeResource: (resourceId) =>
        set((s) => ({ resources: s.resources.filter((r) => r.id !== resourceId) })),
    }),
    {
      name: 'oni-table-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist the per-table data, not UI state
      partialize: (state) => ({
        tableCarts: state.tableCarts,
        tableCustomers: state.tableCustomers,
        tableSessions: state.tableSessions,
      }),
    }
  )
);
