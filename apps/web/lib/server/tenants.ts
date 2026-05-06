import { getSupabaseServerClient } from './supabaseServer';

export async function listTenantsForCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { tenants: [] };

  const { data, error } = await supabase
    .from('tenants_view')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return { tenants: data ?? [] };
}

export async function getTenantForUser(userId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenants(*)')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (error || !data) return null;
  // @ts-ignore
  return data.tenants;
}
