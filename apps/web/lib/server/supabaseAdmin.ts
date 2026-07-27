import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

// Service-role client — bypasses RLS, server-only, NEVER expose to client.
// Singleton: reuse the same instance across requests within the same server process
// to avoid excessive connection overhead. Safe because there is no per-user session state.
let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}
