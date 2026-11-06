import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { isKitchenEligibleIndustry } from '@oni/core';
import { KitchenStationsClient } from './KitchenStationsClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

// Bar/Bếp K0 — station setup (docs/KITCHEN-BAR-PLAN.md). Only table/room verticals.
export default async function KitchenSettingsPage({ params }: Props) {
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

  const industryType: string = shop.industry_type ?? tenant.industry_type ?? 'retail';
  if (!isKitchenEligibleIndustry(industryType)) notFound();

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);
  const has = (p: string) => permissions.includes(p);
  if (!(has('settings.view') || has('settings.manage') || has('owner') || has('admin'))) notFound();
  const canManage = has('settings.manage') || has('owner') || has('admin');

  return (
    <KitchenStationsClient shopId={shop.id} shopName={shop.name} industryType={industryType} canManage={canManage} />
  );
}
