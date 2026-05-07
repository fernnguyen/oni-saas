import { getSupabaseServerClient } from './supabaseServer';
import { getTenantForUser } from './tenants';

export async function getSuperAdminUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  if (data.user.app_metadata?.role !== 'super_admin') return null;
  return data.user;
}

export async function getSessionUserWithTenant() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const tenant = await getTenantForUser(data.user.id);

  return {
    user: data.user,
    tenant,
  };
}
