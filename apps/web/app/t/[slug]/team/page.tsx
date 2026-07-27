import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { listTenantUsers } from '@/lib/server/tenantUsers';
import { listRoles } from '@/lib/server/roles';
import { getTenantActivePlanDetails } from '@/lib/server/subscriptions';
import { TeamClient } from './TeamClient';

import { DashboardShell } from '@/app/components/layout/DashboardShell';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TeamPage({ params }: Props) {
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
    .select('id, name, slug, industry_type')
    .eq('slug', slug)
    .maybeSingle();
  if (!tenant) notFound();

  // Fetch all shops to find the default one for the sidebar and to pass to TeamClient
  const { data: shops } = await admin
    .from('shops')
    .select('id, name, slug')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true }); // deterministic order
  if (!shops || shops.length === 0) notFound();

  const defaultShop = shops[0];
  const homePath = `/${defaultShop.slug}`;

  // Must have at least users.view
  const permissions: string[] = await getUserPermissions(authData.user.id, tenant.id, undefined).catch(() => [] as string[]);
  if (!permissions.includes('users.view')) notFound();

  const [users, roles] = await Promise.all([
    listTenantUsers(tenant.id).catch((): Awaited<ReturnType<typeof listTenantUsers>> => []),
    listRoles(tenant.id).catch(() => [])
  ]);

  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  const planDetails = await getTenantActivePlanDetails(tenant.id);
  
  // Fetch max users from plan metadata
  let maxUsers: number | undefined = undefined;
  if (planDetails?.planCode) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('plans(metadata)')
      .eq('tenant_id', tenant.id)
      .maybeSingle();
      
    const plans = sub?.plans as any;
    const planMeta = Array.isArray(plans) ? plans[0]?.metadata : plans?.metadata;
    maxUsers = planMeta?.create_shop_user;
  }

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
      permissions={permissions}
      sidebarContext="shop"
      currentBranchSlug={defaultShop.slug}
      planCode={planDetails?.planCode}
      planName={planDetails?.planName}
      periodStart={planDetails?.periodStart}
      periodEnd={planDetails?.periodEnd}
      industryType={tenant.industry_type}
    >
      <div className="space-y-6">
        <TeamClient
          tenantId={tenant.id}
          tenantSlug={tenant.slug}
          initialUsers={users}
          shops={shops}
          roles={roles}
          canInvite={permissions.includes('users.invite') as boolean}
          canRemove={permissions.includes('users.remove') as boolean}
          canResetAuth={permissions.includes('tenants.manage') as boolean}
          currentUserId={authData.user.id}
          maxUsers={maxUsers}
        />
      </div>
    </DashboardShell>
  );
}
