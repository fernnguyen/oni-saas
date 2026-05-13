import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { TenantSettingsForm } from '@/app/components/settings/TenantSettingsForm';
import { DashboardShell } from '@/app/components/layout/DashboardShell';
import { getUserPermissions } from '@/lib/server/permissions';

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
    .select('id, name, slug')
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

  const { data: connectorRaw } = await admin
    .from('connectors')
    .select('id, tenant_id, type, status, config, updated_at')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle();

  const connector = connectorRaw
    ? {
        connector_id: connectorRaw.id as string,
        tenant_id: tenant.id as string,
        type: connectorRaw.type as string,
        sheet_id: (connectorRaw.config?.sheet_id as string) ?? '',
        sheet_title: (connectorRaw.config?.sheet_title as string) ?? 'Google Sheet',
        sheet_url: (connectorRaw.config?.sheet_url as string) ?? '',
        status: connectorRaw.status as string,
        updated_at: connectorRaw.updated_at as string,
      }
    : null;

  const permissions = await getUserPermissions(authData.user.id, tenant.id, null).catch(() => []);
  
  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  return (
    <DashboardShell
      tenantId={tenant.id}
      tenantName={tenant.name}
      userEmail={authData.user.email}
      displayName={displayName || undefined}
      roleName={roleName || undefined}
      sidebarBasePath={`/t/${slug}`}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`/t/${slug}/settings`}
      settingsHref={`/t/${slug}/settings`}
      accountHref={`/t/${slug}/account`}
      supportHref={`/t/${slug}/support`}
      permissions={permissions}
      sidebarContext="control"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Cài đặt workspace</h1>
          <p className="mt-1 text-sm text-slate-500">{tenant.name} · {tenant.slug}</p>
        </div>
        
        <TenantSettingsForm
          tenantId={tenant.id}
          connector={connector}
          canManage={canManage}
        />
      </div>
    </DashboardShell>
  );
}
