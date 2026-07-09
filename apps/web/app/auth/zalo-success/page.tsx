'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

export default function ZaloSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get('intent') || 'login';

  useEffect(() => {
    // If this is the root domain but we have a tenant param, we need to forward the hash fragment to the tenant domain
    const tenant = searchParams.get('tenant');
    if (tenant && tenant !== window.location.origin) {
      window.location.href = `${tenant}/auth/zalo-success?intent=${intent}${window.location.hash}`;
      return;
    }

    const supabase = getSupabaseBrowserClient();
    // Manually parse the hash if it exists
    if (window.location.hash && window.location.hash.includes('access_token')) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }).then(({ data, error }) => {
          if (!error && data.session) {
            window.location.href = `/api/auth/login-success?intent=${intent}`;
          } else {
            console.error("Manual setSession failed:", error);
          }
        });
      }
    }

    // Also listen for standard Auth events just in case
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.location.href = `/api/auth/login-success?intent=${intent}`;
      } else if (event === 'SIGNED_OUT') {
        window.location.href = '/auth/signin?error=AuthFailed';
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [intent]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        <p className="text-sm font-medium text-slate-600">Đang đồng bộ phiên đăng nhập...</p>
      </div>
    </div>
  );
}
