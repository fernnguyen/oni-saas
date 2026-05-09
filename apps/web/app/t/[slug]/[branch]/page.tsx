import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { ShopDashboard } from '@/app/s/[slug]/ShopDashboard';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

// Only accessible via subdomain rewrite. slug = tenant slug, branch = shop slug.
export default async function BranchPage({ params }: Props) {
  const { branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, tenant_id, name, slug, connector_status, connector_id')
    .eq('slug', branch)
    .maybeSingle();

  if (!shop) notFound();

  const homePath = `/${branch}`;

  return (
    <ShopDashboard
      shop={{ id: shop.id, tenantId: shop.tenant_id, name: shop.name, slug: shop.slug }}
      connectorStatus={shop.connector_status ?? null}
      connectorId={shop.connector_id ?? null}
      homePath={homePath}
    />
  );
}
