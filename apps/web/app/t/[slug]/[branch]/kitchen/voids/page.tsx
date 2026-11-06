import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { isKitchenEligibleIndustry } from '@oni/core';
import { KitchenVoidsClient } from './KitchenVoidsClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

// Bar/Bếp — cancelled dishes report (huỷ món, hao hụt). Owners/managers and report viewers.
export default async function KitchenVoidsPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/auth/signin?next=${encodeURIComponent('/')}`);

  const admin = getSupabaseAdminClient();
  const { data: tenant } = await admin.from('tenants').select('id, industry_type').eq('slug', slug).maybeSingle();
  if (!tenant) notFound();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, tenant_id, industry_type')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!shop) notFound();
  if (!isKitchenEligibleIndustry(shop.industry_type ?? tenant.industry_type ?? 'retail')) notFound();

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);
  if (!['reports.view_shop', 'settings.manage', 'owner', 'admin'].some((p) => permissions.includes(p))) notFound();

  return <KitchenVoidsClient shopId={shop.id} shopName={shop.name} />;
}
