import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { DashboardShell } from '@/app/components/layout/DashboardShell';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
  children: React.ReactNode;
}

export default async function BranchLayout({ params, children }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) notFound();

  const { data: shop } = await admin
    .from('shops_view')
    .select('*')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!shop) notFound();

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!tenantAccess) {
    const { data: shopAccess } = await admin
      .from('user_shops')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();
    if (!shopAccess) notFound();
  }

  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => []);
  const homePath = `/${branch}`;

  // Lấy thông tin gói cước
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('current_period_start, current_period_end, plans(code, name)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle();

  let planCode = '';
  let planName = '';
  let periodStart = undefined;
  let periodEnd = undefined;

  if (subscription && subscription.plans) {
    const p = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    planCode = p.code;
    planName = p.name;
    periodStart = subscription.current_period_start;
    periodEnd = subscription.current_period_end;
  }

  return (
    <DashboardShell
      tenantId={tenant.id}
      tenantName={tenant.name}
      shopName={shop.name}
      userEmail={authData.user.email}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath}/connectors`}
      settingsHref={`${homePath}/settings`}
      supportHref={`${homePath}/support`}
      permissions={permissions}
      planCode={planCode}
      planName={planName}
      periodStart={periodStart}
      periodEnd={periodEnd}
    >
      {children}
    </DashboardShell>
  );
}
