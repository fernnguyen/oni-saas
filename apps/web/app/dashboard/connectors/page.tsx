import { getSessionUserWithTenant } from '../../../lib/server/auth';
import { getShopsForTenant } from '../../../lib/server/shops';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { ConnectorsList } from './ConnectorsList';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ tenant_id?: string }>;
}

export default async function ConnectorsPage({ searchParams }: Props) {
  const { tenant_id: tenantIdParam } = await searchParams;

  const ctx = await getSessionUserWithTenant();
  if (!ctx?.tenant) redirect('/onboarding/step-1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTenant = ctx.tenant as unknown as { id: string; name: string };

  let tenantId = sessionTenant.id;

  if (tenantIdParam && tenantIdParam !== sessionTenant.id) {
    // Verify the user actually belongs to the requested tenant before using it
    const admin = getSupabaseAdminClient();
    const { data: membership } = await admin
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', ctx.user.id)
      .eq('tenant_id', tenantIdParam)
      .maybeSingle();
    if (membership) tenantId = tenantIdParam;
  } else if (tenantIdParam) {
    tenantId = tenantIdParam;
  }

  const shops = await getShopsForTenant(tenantId).catch((err) => {
    console.error('[ConnectorsPage] getShopsForTenant error:', err?.message);
    return [];
  });

  const supabase = await getSupabaseServerClient();
  const shopIds = shops.map((s: any) => s.id);
  const { data: connectors } = shopIds.length
    ? await supabase
        .from('connectors')
        .select('*')
        .in('shop_id', shopIds)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kết nối dữ liệu</h1>
          <p className="text-sm text-slate-500 mt-0.5">Quản lý nguồn dữ liệu cho từng chi nhánh</p>
        </div>
      </div>

      <ConnectorsList tenantId={tenantId} shops={shops} connectors={connectors ?? []} />
    </div>
  );
}
