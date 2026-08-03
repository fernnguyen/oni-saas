import { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { HrmSalaryAdvancesPanel } from '@/app/components/hrm/HrmSalaryAdvancesPanel';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Ứng lương | HRM | ONI.vn',
  description: 'Quản lý yêu cầu ứng lương và tự động khấu trừ',
};

export default async function SalaryAdvancesPage(props: {
  params: Promise<{ slug: string; branch: string }>;
}) {
  const { slug, branch } = await props.params;

  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect('/auth/login');
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

  const { repository, userId, permissions } = await requireHrmAccess(shop.id, 'hrm.view');
  const canManage = permissions.includes('hrm.payroll.manage');
  const selfProfileId = await repository.getProfileIdForAuthUser(userId);

  return (
    <HrmSalaryAdvancesPanel
      shopId={shop.id}
      selfProfileId={selfProfileId}
      canManage={canManage}
    />
  );
}
