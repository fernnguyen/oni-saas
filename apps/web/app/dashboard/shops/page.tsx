import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import Link from 'next/link';

interface Props {
  searchParams: Promise<{ tenant_id?: string }>;
}

export default async function ShopsPage({ searchParams }: Props) {
  const { tenant_id } = await searchParams;

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/auth/signin');

  if (!tenant_id) redirect('/dashboard/tenants');

  const admin = getSupabaseAdminClient();

  // Verify user belongs to this tenant
  const { data: membership } = await admin
    .from('user_tenants')
    .select('tenants(id, name, slug)')
    .eq('user_id', auth.user.id)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  if (!membership) redirect('/dashboard/tenants');

  const tenant = (membership as any).tenants as { id: string; name: string; slug: string };

  const { data: shops } = await admin
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: true });

  const { data: connector } = await admin
    .from('connectors')
    .select('id, status')
    .eq('tenant_id', tenant_id)
    .eq('status', 'active')
    .maybeSingle();

  const connectorStatus = connector?.status ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tenants" className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Chi nhánh — {tenant.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Quản lý các chi nhánh kinh doanh</p>
          </div>
        </div>
        <Link
          href={`/dashboard/shops/new?tenant_id=${tenant_id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Thêm chi nhánh
        </Link>
      </div>

      {!shops || shops.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Chưa có chi nhánh nào</h3>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Mỗi chi nhánh có subdomain riêng (vd: <span className="font-mono">co-so-1.oni.vn</span>)
          </p>
          <Link
            href={`/dashboard/shops/new?tenant_id=${tenant_id}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tạo chi nhánh đầu tiên
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(shops as any[]).map((shop) => (
            <div key={shop.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                    {shop.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{shop.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{shop.slug}.oni.vn</div>
                    {shop.address && (
                      <div className="text-xs text-slate-400 mt-0.5">{shop.address}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    connectorStatus === 'active'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      connectorStatus === 'active' ? 'bg-green-500' : 'bg-amber-400'
                    }`} />
                    {connectorStatus === 'active' ? 'Đã kết nối' : 'Chưa kết nối'}
                  </span>
                  <Link
                    href={`/dashboard/connectors?tenant_id=${tenant_id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cấu hình
                  </Link>
                  <Link
                    href={`/s/${shop.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
                  >
                    Vào cửa hàng
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
