import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { ShopDashboard } from './ShopDashboard';

interface Props {
  params: Promise<{ slug: string }>;
}

// Each shop has its own subdomain: co-so-1.oni.vn → /s/co-so-1
export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    const headerStore = await headers();
    const host = headerStore.get('host') ?? '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
    const nextPath = extractSubdomain(host, rootDomain) ? '/' : `/s/${slug}`;
    redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  }

  const admin = getSupabaseAdminClient();

  const { data: shop } = await admin
    .from('shops_view')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!shop) redirect('/dashboard');

  // Check access: tenant-level OR shop-level
  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', shop.tenant_id)
    .maybeSingle();

  if (!tenantAccess) {
    const { data: shopAccess } = await admin
      .from('user_shops')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();
    if (!shopAccess) redirect('/dashboard');
  }

  return (
    <ShopDashboard
      shop={{ id: shop.id, tenantId: shop.tenant_id, name: shop.name, slug: shop.slug }}
      connectorStatus={shop.connector_status ?? null}
      connectorId={shop.connector_id ?? null}
    />
  );
}

function extractSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;
  if (!host.endsWith(`.${rootDomain}`)) return null;
  const sub = host.slice(0, host.length - rootDomain.length - 1);
  if (sub === 'www') return null;
  return sub || null;
}
