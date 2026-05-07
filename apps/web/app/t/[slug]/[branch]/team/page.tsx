import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { listTenantUsers } from '@/lib/server/tenantUsers';
import { DashboardShell } from '@/app/components/layout/DashboardShell';
import { TeamClient } from './TeamClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function TeamPage({ params }: Props) {
  const { slug, branch } = await params;
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

  const { data: shop } = await admin
    .from('shops')
    .select('id, name, slug')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!shop) notFound();

  // Must have at least users.view
  const permissions: string[] = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => []);
  if (!permissions.includes('users.view')) notFound();

  const [users, { data: shops }] = await Promise.all([
    listTenantUsers(tenant.id).catch((): Awaited<ReturnType<typeof listTenantUsers>> => []),
    admin.from('shops').select('id, name, slug').eq('tenant_id', tenant.id),
  ]);

  const homePath = `/${branch}`;

  return (
    <DashboardShell
      tenantName={tenant.name}
      shopName={shop.name}
      userEmail={authData.user.email}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath}/connectors`}
      settingsHref={`${homePath}/settings`}
      supportHref={`${homePath}/support`}
      permissions={permissions}
    >
      <TeamClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialUsers={users}
        shops={shops ?? []}
        canInvite={permissions.includes('users.invite') as boolean}
        canRemove={permissions.includes('users.remove') as boolean}
        currentUserId={authData.user.id}
      />
    </DashboardShell>
  );
}
