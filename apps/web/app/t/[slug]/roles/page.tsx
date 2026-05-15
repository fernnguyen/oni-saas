import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { listRoles, listPermissions } from '@/lib/server/roles';
import { getTenantActivePlanDetails } from '@/lib/server/subscriptions';
import { RolesClient } from './RolesClient';

import { DashboardShell } from '@/app/components/layout/DashboardShell';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RolesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect(`/auth/signin`);

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

  // Fetch default shop
  const { data: shops } = await admin.from('shops').select('id, name, slug').eq('tenant_id', tenant.id);
  if (!shops || shops.length === 0) notFound();
  
  const defaultShop = shops[0];
  const homePath = `/${defaultShop.slug}`;

  // Must have roles.view
  const userPermissions = await getUserPermissions(authData.user.id, tenant.id, undefined).catch(() => [] as string[]);
  if (!userPermissions.includes('roles.view')) notFound();

  const [roles, permissions] = await Promise.all([
    listRoles(tenant.id).catch(() => []),
    listPermissions().catch(() => [])
  ]);

  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  const planDetails = await getTenantActivePlanDetails(tenant.id);

  return (
    <DashboardShell
      tenantId={tenant.id}
      tenantName={tenant.name}
      shopName={defaultShop.name}
      userEmail={authData.user.email}
      displayName={displayName || undefined}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath}/connectors`}
      settingsHref={`${homePath}/settings`}
      tenantBillingHref={`/billing`}
      tenantSettingsHref={`/settings`}
      tenantTeamHref={`/team`}
      tenantRolesHref={`/roles`}
      accountHref={`${homePath}/account`}
      supportHref={`${homePath}/support`}
      permissions={userPermissions}
      sidebarContext="shop"
      currentBranchSlug={defaultShop.slug}
      planCode={planDetails?.planCode}
      planName={planDetails?.planName}
      periodStart={planDetails?.periodStart}
      periodEnd={planDetails?.periodEnd}
    >
      <div className="space-y-6">
        <RolesClient
          tenantId={tenant.id}
          initialRoles={roles}
          permissions={permissions}
          canManage={userPermissions.includes('roles.manage')}
        />
      </div>
    </DashboardShell>
  );
}
