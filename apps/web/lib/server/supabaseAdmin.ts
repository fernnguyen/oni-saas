import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

// Service-role client — bypasses RLS, server-only, NEVER expose to client.
// Singleton: reuse the same instance across requests within the same server process
// to avoid excessive connection overhead. Safe because there is no per-user session state.
let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const url = env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || 'placeholder-service-role-key-for-build';
    _adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}
