import { getSupabaseAdminClient } from './supabaseAdmin';

export async function getShopsForTenant(tenantId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getShopsForTenant] error:', error.message);
    throw error;
  }
  return data ?? [];
}

export async function getShopBySlug(slug: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('shops_view')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function assertUserShopAccess(userId: string, shopId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();

  // Resolve the shop's tenant first
  const { data: shop } = await admin
    .from('shops')
    .select('tenant_id')
    .eq('id', shopId)
    .maybeSingle();

  if (!shop) return false;

  // Tenant-level access: user belongs to the tenant that owns this shop
  const { data: tenantMembership } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', shop.tenant_id)
    .maybeSingle();

  if (tenantMembership) return true;

  // Shop-level access: user assigned directly to this shop
  const { data: shopMembership } = await admin
    .from('user_shops')
    .select('id')
    .eq('user_id', userId)
    .eq('shop_id', shopId)
    .maybeSingle();

  return !!shopMembership;
}
