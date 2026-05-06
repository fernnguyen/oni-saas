import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

// Service-role client — bypasses RLS, server-only, NEVER expose to client
export function getSupabaseAdminClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
