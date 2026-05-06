import { getSupabaseServerClient } from './supabaseServer';

export async function getShopsForTenant(tenantId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getShopBySlug(slug: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('shops_view')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Check if a user can access a shop — via tenant-level OR shop-level membership */
export async function assertUserShopAccess(userId: string, shopId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();

  // 1. Tenant-level access (owner/admin inherits all shops)
  const { data: tenantAccess } = await supabase
    .from('user_tenants')
    .select('user_tenants.id')
    .eq('user_id', userId)
    .eq('shops.id', shopId)  // via shops.tenant_id join
    .maybeSingle();

  if (tenantAccess) return true;

  // 2. Shop-level access (staff assigned to specific shop)
  const { data: shopAccess } = await supabase
    .from('user_shops')
    .select('id')
    .eq('user_id', userId)
    .eq('shop_id', shopId)
    .maybeSingle();

  return !!shopAccess;
}
