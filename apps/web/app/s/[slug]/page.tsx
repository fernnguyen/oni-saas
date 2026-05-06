import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { ShopDashboard } from './ShopDashboard';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    redirect(`/auth/signin?next=/s/${slug}`);
  }

  // Resolve shop from slug
  const { data: shop } = await supabase
    .from('shops_view')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!shop) redirect('/dashboard');

  // Check access: tenant-level OR shop-level
  const { data: tenantAccess } = await supabase
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', shop.tenant_id)
    .maybeSingle();

  if (!tenantAccess) {
    const { data: shopAccess } = await supabase
      .from('user_shops')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();

    if (!shopAccess) redirect('/dashboard');
  }

  return (
    <ShopDashboard
      shop={{
        id: shop.id,
        tenantId: shop.tenant_id,
        name: shop.name,
        slug: shop.slug,
      }}
      connectorStatus={shop.connector_status ?? null}
      connectorId={shop.connector_id ?? null}
    />
  );
}
