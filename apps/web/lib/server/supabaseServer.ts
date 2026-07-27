import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '../env';
import {
  getAuthCookieDomainForHost,
  getGlobalAuthCookieDomain,
  getScopedAuthCookieName,
  getStaleSupabaseAuthCookieNames,
} from '../authCookieScope';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get('Authorization');
  const requestHost = headerStore.get('x-forwarded-host') ?? headerStore.get('host');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const cookieDomain = getAuthCookieDomainForHost(requestHost, rootDomain);
  const globalCookieDomain = getGlobalAuthCookieDomain(rootDomain);
  const supabaseUrl = env.SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = env.SUPABASE_ANON_KEY || 'placeholder-anon-key-for-build';
  const cookieName = getScopedAuthCookieName(requestHost, rootDomain, supabaseUrl);
  const staleCookieNames = getStaleSupabaseAuthCookieNames(
    cookieStore.getAll().map((cookie) => cookie.name),
    cookieName,
    supabaseUrl,
  );

  function clearCookie(name: string, options: any) {
    const clearedValue = { name, value: '', ...options };
    cookieStore.set(clearedValue);
    if (globalCookieDomain) {
      cookieStore.set({ ...clearedValue, domain: globalCookieDomain });
    }
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
        for (const staleCookieName of staleCookieNames) {
          clearCookie(staleCookieName, options);
        }

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
        for (const staleCookieName of staleCookieNames) {
          clearCookie(staleCookieName, options);
        }

        clearCookie(name, options);
      },
    },
  });

  return supabase;
}
