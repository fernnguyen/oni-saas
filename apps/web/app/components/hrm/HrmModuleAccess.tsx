'use client';

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';

export interface HrmModuleAccessValue {
  enabled: boolean;
  canUpgrade: boolean;
  shopId: string;
}

const HrmModuleAccessContext = createContext<HrmModuleAccessValue | null>(null);

export function HrmModuleAccessProvider({
  children,
  enabled,
  canUpgrade,
  shopId,
}: HrmModuleAccessValue & { children: ReactNode }) {
  return (
    <HrmModuleAccessContext.Provider value={{ enabled, canUpgrade, shopId }}>
      {children}
    </HrmModuleAccessContext.Provider>
  );
}

export function useHrmModuleAccess(): HrmModuleAccessValue {
  const context = useContext(HrmModuleAccessContext);

  if (!context) {
    throw new Error('useHrmModuleAccess must be used inside HrmModuleAccessProvider');
  }

  return context;
}
