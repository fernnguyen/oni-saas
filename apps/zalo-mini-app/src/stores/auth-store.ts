import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  role?: string;
  tenant_id?: string;
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      profile: null,
      get isAuthenticated() {
        return get().session !== null;
      },
      setSession: (session: Session | null) => set({ session }),
      setProfile: (profile: UserProfile | null) => set({ profile }),
      logout: () => set({ session: null, profile: null }),
    }),
    {
      name: 'oni-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        profile: state.profile,
      }),
    },
  ),
);
