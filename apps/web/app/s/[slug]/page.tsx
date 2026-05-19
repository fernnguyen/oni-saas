import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { getUserPermissions } from '../../../lib/server/permissions';
import { DashboardShell } from '../../components/layout/DashboardShell';
import { ShopDashboard } from './ShopDashboard';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin.from('shops_view').select('name').eq('slug', slug).maybeSingle();
  if (!shop) return { title: 'ONI.vn' };
  return { title: `${shop.name} | ONI.vn - Nền tảng quản lý bán hàng` };
}

// Each shop has its own subdomain: co-so-1.oni.vn → /s/co-so-1
export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const subdomain = extractSubdomain(host, rootDomain);
  const homePath = subdomain ? '/' : `/s/${slug}`;
  const shellBasePath = subdomain ? '/' : `/s/${slug}`;
  const controlPlaneOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? `http://${rootDomain}`;
  if (!authData.user) {
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

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);

  const { data: connector } = await admin
    .from('connectors')
    .select('id, status')
    .eq('tenant_id', shop.tenant_id)
    .eq('status', 'active')
    .maybeSingle();

  const connectorStatus = connector?.status ?? null;
  const connectorId = connector?.id ?? null;

  return (
    <DashboardShell
      tenantName={shop.name}
      shopName={shop.name}
      userEmail={authData.user.email}
      sidebarBasePath={shellBasePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath === '/' ? '' : homePath}/connectors` || '/connectors'}
      settingsHref={`${homePath === '/' ? '' : homePath}/settings` || '/settings'}
      supportHref={`${homePath === '/' ? '' : homePath}/support` || '/support'}
      permissions={permissions}
    >
      <ShopDashboard
        shop={{ id: shop.id, tenantId: shop.tenant_id, name: shop.name, slug: shop.slug }}
        connectorStatus={connectorStatus}
        connectorId={connectorId}
        homePath={homePath}
      />
    </DashboardShell>
  );
}

function extractSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;
  if (!host.endsWith(`.${rootDomain}`)) return null;
  const sub = host.slice(0, host.length - rootDomain.length - 1);
  if (sub === 'www') return null;
  return sub || null;
}
