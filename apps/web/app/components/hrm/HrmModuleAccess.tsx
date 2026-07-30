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
  /** Public-facing branch slug used to build HRM sub-page links (/{branch}/hrm/*) */
  branchSlug: string;
}

const HrmModuleAccessContext = createContext<HrmModuleAccessValue | null>(null);

export function HrmModuleAccessProvider({
  children,
  enabled,
  canUpgrade,
  shopId,
  branchSlug,
}: HrmModuleAccessValue & { children: ReactNode }) {
  return (
    <HrmModuleAccessContext.Provider value={{ enabled, canUpgrade, shopId, branchSlug }}>
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
