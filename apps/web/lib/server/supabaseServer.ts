import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '../env';
import { getAuthCookieDomainForHost, getGlobalAuthCookieDomain, getScopedAuthCookieName } from '../authCookieScope';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get('Authorization');
  const requestHost = headerStore.get('x-forwarded-host') ?? headerStore.get('host');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const cookieDomain = getAuthCookieDomainForHost(requestHost, rootDomain);
  const globalCookieDomain = getGlobalAuthCookieDomain(rootDomain);
  const cookieName = getScopedAuthCookieName(requestHost, rootDomain, env.SUPABASE_URL);

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: {
      name: cookieName,
    },
    global: {
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        const scopedOptions = { name, value, ...options };
        if (cookieDomain) {
          cookieStore.set({ ...scopedOptions, value: '', maxAge: 0 });
          cookieStore.set({ ...scopedOptions, domain: cookieDomain });
          return;
        }

        if (globalCookieDomain) {
          cookieStore.set({ ...scopedOptions, value: '', domain: globalCookieDomain, maxAge: 0 });
        }

        cookieStore.set(scopedOptions);
      },
      remove(name: string, options: any) {
        const clearedValue = { name, value: '', ...options };
        cookieStore.set(clearedValue);
        if (globalCookieDomain) {
          cookieStore.set({ ...clearedValue, domain: globalCookieDomain });
        }
      },
    },
  });

  return supabase;
}
