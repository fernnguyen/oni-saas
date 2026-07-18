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

export async function getTenantAndShopBySlugs(tenantSlug: string, shopSlug: string) {
  const admin = getSupabaseAdminClient();
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenant) return { tenant: null, shop: null };

  const { data: shop, error: shopError } = await admin
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('slug', shopSlug)
    .maybeSingle();

  if (shopError) throw shopError;
  return { tenant, shop };
}

export async function assertUserShopAccess(userId: string, shopId: string, preFetchedShop?: any): Promise<boolean> {
  const admin = getSupabaseAdminClient();

  // Resolve the shop's tenant first
  let shop = preFetchedShop;
  if (!shop) {
    const { data } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .maybeSingle();
    shop = data;
  }

  if (!shop) return false;

  const [tenantRes, shopRes] = await Promise.all([
    admin.from('user_tenants').select('id').eq('user_id', userId).eq('tenant_id', shop.tenant_id).maybeSingle(),
    admin.from('user_shops').select('id').eq('user_id', userId).eq('shop_id', shopId).maybeSingle()
  ]);

  return !!(tenantRes.data || shopRes.data);
}
