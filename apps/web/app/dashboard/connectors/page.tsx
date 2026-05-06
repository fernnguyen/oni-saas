import { getSessionUserWithTenant } from '../../../lib/server/auth';
import { getShopsForTenant } from '../../../lib/server/shops';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { ConnectorsList } from './ConnectorsList';
import { redirect } from 'next/navigation';

export default async function ConnectorsPage() {
  const ctx = await getSessionUserWithTenant();
  if (!ctx?.tenant) redirect('/onboarding/step-1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = ctx.tenant as unknown as { id: string; name: string };

  const shops = await getShopsForTenant(tenant.id).catch(() => []);

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

      <ConnectorsList shops={shops} connectors={connectors ?? []} />
    </div>
  );
}
