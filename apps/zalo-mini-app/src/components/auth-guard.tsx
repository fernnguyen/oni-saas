import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { supabase } from '@/lib/supabase';
import { onAuthStateChange } from '@/services/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const shop = useTenantStore((s) => s.shop);
  const setSession = useAuthStore((s) => s.setSession);
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          useAuthStore.getState().setProfile({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Người dùng',
            phone: user.phone || user.user_metadata?.phone || '',
            avatar_url: user.user_metadata?.avatar_url || '',
          });
        }
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (session) => {
      setSession(session);
      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          useAuthStore.getState().setProfile({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Người dùng',
            phone: user.phone || user.user_metadata?.phone || '',
            avatar_url: user.user_metadata?.avatar_url || '',
          });
        }
      } else {
        useAuthStore.getState().setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!shop) {
    return <Navigate to="/select-branch" replace />;
  }

  return <>{children}</>;
}
