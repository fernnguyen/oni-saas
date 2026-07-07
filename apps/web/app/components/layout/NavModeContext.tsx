'use client';

import React, { createContext, useContext } from 'react';

interface NavModeContextValue {
  isHorizontal: boolean;
}

const NavModeContext = createContext<NavModeContextValue>({ isHorizontal: false });

export function NavModeProvider({
  children,
  isHorizontal,
}: {
  children: React.ReactNode;
  isHorizontal: boolean;
}) {
  return (
    <NavModeContext.Provider value={{ isHorizontal }}>
      {children}
    </NavModeContext.Provider>
  );
}

/** Returns true when the nav is in horizontal mode (sidebar hidden, NavHorizontal visible). */
export function useNavMode() {
  return useContext(NavModeContext);
}
