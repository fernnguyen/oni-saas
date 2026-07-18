import { createBrowserClient } from '@supabase/ssr';
import { getAuthCookieDomainForHost, getScopedAuthCookieName } from './authCookieScope';

export function getSupabaseBrowserClient() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const currentHost = typeof window === 'undefined' ? rootDomain : window.location.host;
  const cookieDomain = getAuthCookieDomainForHost(currentHost, rootDomain);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cookieName = getScopedAuthCookieName(currentHost, rootDomain, supabaseUrl);

  return createBrowserClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: cookieName,
        domain: cookieDomain,
        path: '/',
        sameSite: 'lax',
        secure: !rootDomain.includes('localhost'),
      },
    }
  );
}
