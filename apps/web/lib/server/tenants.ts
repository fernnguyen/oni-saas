import { getSupabaseServerClient } from './supabaseServer';
import { getSupabaseAdminClient } from './supabaseAdmin';

export async function listTenantsForCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { tenants: [] };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenants_view')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return { tenants: data ?? [] };
}

export async function getTenantForUser(userId: string) {
  const admin = getSupabaseAdminClient();

  // Use admin client to bypass RLS — user identity already verified via auth.getUser()
  const { data, error } = await admin
    .from('user_tenants')
    .select('tenant_id, is_default, tenants(id, name, slug, created_at)')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getTenantForUser] error:', error.message);
    return null;
  }
  if (!data) return null;

  // @ts-ignore
  return data.tenants;
}
