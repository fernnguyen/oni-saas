import { createBrowserClient } from '@supabase/ssr';
import { getAuthCookieDomainForHost } from './authCookieScope';

export function getSupabaseBrowserClient() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const currentHost = typeof window === 'undefined' ? rootDomain : window.location.host;
  const cookieDomain = getAuthCookieDomainForHost(currentHost, rootDomain);

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        domain: cookieDomain,
        path: '/',
        sameSite: 'lax',
        secure: !rootDomain.includes('localhost'),
      },
    }
  );
}
