import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { checkFeatureAccess } from '@/lib/server/features';
import { POClient } from './POClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function POPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  
  // Resolve tenant info
  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) notFound();

  // Enforce P2P Enterprise Add-on gating
  const hasAddon = await checkFeatureAccess(tenant.id, 'warehouse_p2p');
  if (!hasAddon) {
    redirect(`/${branch}`); // fallback if addon is not active
  }

  // Fetch shop/branch info
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
    
  if (!shop) notFound();

  return <POClient shopId={shop.id} shopName={shop.name} userId={authData.user.id} />;
}
