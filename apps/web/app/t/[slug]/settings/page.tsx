import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { TenantSettingsForm } from '@/app/components/settings/TenantSettingsForm';

import { DashboardShell } from '@/app/components/layout/DashboardShell';
import { getUserPermissions } from '@/lib/server/permissions';
import { getTenantActivePlanDetails, getTenantPlanMeta } from '@/lib/server/subscriptions';


interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TenantSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent(`/t/${slug}/settings`)}`);
  }

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, industry_type, share_customers')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) notFound();

  const { data: tenantAccessRaw } = await admin
    .from('user_tenants')
    .select('id, roles(name, code)')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!tenantAccessRaw) redirect('/');

  // @ts-ignore
  const roleCode = Array.isArray(tenantAccessRaw.roles) ? tenantAccessRaw.roles[0]?.code : tenantAccessRaw.roles?.code;
  // @ts-ignore
  const roleName = Array.isArray(tenantAccessRaw.roles) ? tenantAccessRaw.roles[0]?.name : tenantAccessRaw.roles?.name;

  const canManage = roleCode === 'owner' || roleCode === 'admin';
  if (!canManage) {
    redirect('/');
  }

  // Fetch all shops to find the default one for the sidebar
  const { data: shops } = await admin.from('shops').select('id, name, slug').eq('tenant_id', tenant.id);
  if (!shops || shops.length === 0) notFound();
  
  const defaultShop = shops[0];
  const homePath = `/${defaultShop.slug}`;

  const permissions = await getUserPermissions(authData.user.id, tenant.id, undefined).catch(() => [] as string[]);
  
  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  const planDetails = await getTenantActivePlanDetails(tenant.id);
  const planMeta = await getTenantPlanMeta(tenant.id);
  const canUsePushNotify = !!planMeta?.can_use_push_notify;
  const canUseCustomNotify = !!planMeta?.can_use_custom_notify;



  return (
    <DashboardShell
      tenantId={tenant.id}
      tenantName={tenant.name}
      shopName={defaultShop.name}
      userEmail={authData.user.email}
      displayName={displayName || undefined}
      roleName={roleName || undefined}
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
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Cài đặt workspace</h1>
          <p className="mt-1 text-sm text-slate-500">{tenant.name} · {tenant.slug}</p>
        </div>
        

        <TenantSettingsForm
          tenantId={tenant.id}
          canManage={canManage}
          isOwner={roleCode === 'owner'}
          initialShareCustomers={tenant.share_customers}
        />


      </div>
    </DashboardShell>
  );
}
