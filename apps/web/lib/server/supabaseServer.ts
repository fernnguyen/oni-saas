import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '../env';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get('Authorization');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const cookieDomain = rootDomain.includes('localhost') ? undefined : `.${rootDomain}`;

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
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
        cookieStore.set({ name, value, domain: cookieDomain, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', domain: cookieDomain, ...options });
      },
    },
  });

  return supabase;
}
