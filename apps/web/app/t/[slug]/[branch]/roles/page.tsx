import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { listRoles, listPermissions } from '@/lib/server/roles';
import { RolesClient } from './RolesClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function RolesPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect(`/auth/signin`);

  const admin = getSupabaseAdminClient();

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

  // Must have roles.view
  const userPermissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => []);
  if (!userPermissions.includes('roles.view')) notFound();

  const [roles, permissions] = await Promise.all([
    listRoles(tenant.id).catch(() => []),
    listPermissions().catch(() => [])
  ]);

  return (
    <RolesClient
      tenantId={tenant.id}
      initialRoles={roles}
      permissions={permissions}
      canManage={userPermissions.includes('roles.manage')}
    />
  );
}
