import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  brand_color?: string;
  industry_type?: string;
  settings?: Record<string, any>;
}

interface ShopInfo {
  id: string;
  name: string;
  slug: string;
  address?: string;
  industry_type?: string;
}

interface TenantState {
  tenant: TenantInfo | null;
  shop: ShopInfo | null;
  setTenant: (tenant: TenantInfo) => void;
  setShop: (shop: ShopInfo) => void;
  clearTenant: () => void;
  clearAll: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenant: null,
      shop: null,
      setTenant: (tenant: TenantInfo) => set({ tenant }),
      setShop: (shop: ShopInfo) => set({ shop }),
      clearTenant: () => set({ tenant: null }),
      clearAll: () => set({ tenant: null, shop: null }),
    }),
    {
      name: 'oni-tenant',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
