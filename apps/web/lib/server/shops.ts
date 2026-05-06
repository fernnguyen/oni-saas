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

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (tenantAccess) {
    // Check if this tenant owns the shop
    const { data: shop } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shop) {
      const { data: membership } = await admin
        .from('user_tenants')
        .select('id')
        .eq('user_id', userId)
        .eq('tenant_id', shop.tenant_id)
        .maybeSingle();
      if (membership) return true;
    }
  }

  const { data: shopAccess } = await admin
    .from('user_shops')
    .select('id')
    .eq('user_id', userId)
    .eq('shop_id', shopId)
    .maybeSingle();

  return !!shopAccess;
}
