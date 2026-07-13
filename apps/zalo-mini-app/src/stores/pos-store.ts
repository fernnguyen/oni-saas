import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Product, Category, Customer, PaymentMethod } from '@/services/shop-api';

// ────────────────────────────── Types ──────────────────────────────

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  note?: string;
}

interface PosState {
  // Data
  products: Product[];
  categories: Category[];
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentFunds: any[];

  // Cart
  cart: CartItem[];

  // UI State
  selectedCategory: string | null;
  searchQuery: string;
  selectedCustomer: Customer | null;
  discountAmount: number;
  orderNote: string;
  isCheckoutOpen: boolean;
  isLoading: boolean;

  // Cart actions
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateUnitPrice: (productId: string, price: number) => void;
  clearCart: () => void;

  retailCartBackup: {
    cart: CartItem[];
    selectedCustomer: Customer | null;
    discountAmount: number;
    orderNote: string;
  } | null;
  backupRetailCart: () => void;
  restoreRetailCart: () => void;

  // Setters
  setProducts: (products: Product[]) => void;
  setCategories: (categories: Category[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setPaymentMethods: (paymentMethods: PaymentMethod[]) => void;
  setPaymentFunds: (paymentFunds: any[]) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  setDiscountAmount: (amount: number) => void;
  setOrderNote: (note: string) => void;
  setIsCheckoutOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      // Data
      products: [],
      categories: [],
      customers: [],
      paymentMethods: [],
      paymentFunds: [],

      // Cart
      cart: [],
      retailCartBackup: null,

      // UI State
      selectedCategory: null,
      searchQuery: '',
      selectedCustomer: null,
      discountAmount: 0,
      orderNote: '',
      isCheckoutOpen: false,
      isLoading: false,

      // ── Cart actions ──

      addToCart: (product: Product) => {
        const { cart } = get();
        const existingIndex = cart.findIndex(
          (item) => item.product.id === product.id,
        );

        if (existingIndex >= 0) {
          const updated = [...cart];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + 1,
          };
          set({ cart: updated });
        } else {
          const unitPrice = parseFloat(String(product.sell_price)) || 0;
          set({
            cart: [
              ...cart,
              { product, quantity: 1, unit_price: unitPrice },
            ],
          });
        }
      },

      removeFromCart: (productId: string) => {
        set({ cart: get().cart.filter((item) => item.product.id !== productId) });
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }
        const updated = get().cart.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item,
        );
        set({ cart: updated });
      },

      updateUnitPrice: (productId: string, price: number) => {
        const updated = get().cart.map((item) =>
          item.product.id === productId ? { ...item, unit_price: Math.max(0, price) } : item,
        );
        set({ cart: updated });
      },

      clearCart: () =>
        set({
          cart: [],
          selectedCustomer: null,
          discountAmount: 0,
          orderNote: '',
        }),

      backupRetailCart: () => {
        set({
          retailCartBackup: {
            cart: get().cart,
            selectedCustomer: get().selectedCustomer,
            discountAmount: get().discountAmount,
            orderNote: get().orderNote,
          }
        });
      },

      restoreRetailCart: () => {
        const backup = get().retailCartBackup;
        if (backup) {
          set({
            cart: backup.cart,
            selectedCustomer: backup.selectedCustomer,
            discountAmount: backup.discountAmount,
            orderNote: backup.orderNote,
            retailCartBackup: null,
          });
        } else {
          set({
            cart: [],
            selectedCustomer: null,
            discountAmount: 0,
            orderNote: '',
          });
        }
      },

      // ── Setters ──

      setProducts: (products) => set({ products }),
      setCategories: (categories) => set({ categories }),
      setCustomers: (customers) => set({ customers }),
      setPaymentMethods: (paymentMethods) => set({ paymentMethods }),
      setPaymentFunds: (paymentFunds) => set({ paymentFunds }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedCustomer: (selectedCustomer) => set({ selectedCustomer }),
      setDiscountAmount: (discountAmount) => set({ discountAmount }),
      setOrderNote: (orderNote) => set({ orderNote }),
      setIsCheckoutOpen: (isCheckoutOpen) => set({ isCheckoutOpen }),
      setIsLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'oni-pos-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cart: state.cart,
        selectedCustomer: state.selectedCustomer,
        discountAmount: state.discountAmount,
        orderNote: state.orderNote,
        retailCartBackup: state.retailCartBackup,
      }),
    }
  )
);
