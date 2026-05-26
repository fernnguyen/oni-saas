import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '../env';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get('Authorization');

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
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', ...options });
      },
    },
  });

  return supabase;
}
