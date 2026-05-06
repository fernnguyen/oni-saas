import { getSupabaseServerClient } from './supabaseServer';
import { getTenantForUser } from './tenants';

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
