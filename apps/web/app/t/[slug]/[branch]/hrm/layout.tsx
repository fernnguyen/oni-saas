import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { HrmLayout } from '@/app/components/hrm/HrmLayout';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string; branch: string }>;
}

/**
 * HRM sub-layout — wraps all /hrm/* pages with the left sidebar.
 *
 * Reads permissions server-side so HrmLayout can gate sidebar items
 * without an extra client-side fetch.
 *
 * Note: HrmModuleAccessProvider (shopId, enabled, canUpgrade) is already
 * injected by the parent branch/layout.tsx — no need to re-read it here.
 */
export default async function HrmSubLayout({ children, params }: Props) {
  const { slug, branch } = await params;

  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/${branch}/hrm`);
  }

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) redirect('/');

  const { data: shop } = await admin
    .from('shops_view')
    .select('id')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!shop) redirect('/');

  const permissions = await getUserPermissions(
    authData.user.id,
    tenant.id,
    shop.id,
  ).catch(() => [] as string[]);

  return (
    <HrmLayout permissions={permissions} branchSlug={branch}>
      {children}
    </HrmLayout>
  );
}
