import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { ShopDashboard } from '@/app/s/[slug]/ShopDashboard';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

// Only accessible via subdomain rewrite. slug = tenant slug, branch = shop slug.
export default async function BranchPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, tenant_id, name, slug, address')
    .eq('slug', branch)
    .maybeSingle();

  if (!shop) notFound();

  const { data: connector } = await admin
    .from('connectors')
    .select('id, status')
    .eq('tenant_id', shop.tenant_id)
    .eq('status', 'active')
    .maybeSingle();

  const connectorStatus = connector?.status ?? null;
  const connectorId = connector?.id ?? null;

  const homePath = `/${branch}`;

  return (
    <ShopDashboard
      shop={{
        id: shop.id,
        tenantId: shop.tenant_id,
        name: shop.name,
        slug: shop.slug,
        tenantSlug: slug,
        address: shop.address,
      }}
      connectorStatus={connectorStatus}
      connectorId={connectorId}
      homePath={homePath}
    />
  );
}
