import Link from 'next/link';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

interface SearchParams {
  q?: string;
  plan?: string;
  status?: string;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-red-100 text-red-700',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  past_due: 'bg-yellow-500',
  canceled: 'bg-red-500',
};

export default async function SuperTenants({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, plan, status } = await searchParams;
  const admin = getSupabaseAdminClient();

  let query = admin
    .from('tenants')
    .select(`
      id, name, slug, created_at,
      subscriptions(status, plan_id, plans(code, name))
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data: tenants = [], error } = await query;

  const filtered = (tenants ?? []).filter((t: any) => {
    const sub = Array.isArray(t.subscriptions) ? t.subscriptions[0] : t.subscriptions;
    if (plan && sub?.plans?.code !== plan) return false;
    if (status && sub?.status !== status) return false;
    return true;
  });

  const planOptions = [
    { value: 'plan_mini', label: 'Mini (Miễn phí)' },
    { value: 'plan_pro', label: 'Pro' },
    { value: 'plan_enterprise', label: 'Enterprise' },
  ];
  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'past_due', label: 'Past due' },
    { value: 'canceled', label: 'Canceled' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tất cả tổ chức</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} tổ chức</p>
        </div>
        <Link
          href="/super/tenants/create"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo mới
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên hoặc slug..."
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          name="plan"
          defaultValue={plan ?? ''}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Tất cả gói</option>
          {planOptions.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          Lọc
        </button>
        {(q || plan || status) && (
          <Link
            href="/super/tenants"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Xoá bộ lọc
          </Link>
        )}
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Lỗi tải dữ liệu: {error.message}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Tổ chức</th>
              <th className="text-left px-4 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Slug</th>
              <th className="text-left px-4 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Gói</th>
              <th className="text-left px-4 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Trạng thái</th>
              <th className="text-left px-4 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">Ngày tạo</th>
              <th className="px-4 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                  Không có tổ chức nào
                </td>
              </tr>
            ) : (
              (filtered as any[]).map((tenant) => {
                const sub = Array.isArray(tenant.subscriptions)
                  ? tenant.subscriptions[0]
                  : tenant.subscriptions;
                const subStatus = sub?.status ?? null;
                const dotClass = STATUS_DOT[subStatus] ?? 'bg-slate-400';
                const badgeClass = STATUS_STYLE[subStatus] ?? 'bg-slate-100 text-slate-600';
                const statusLabel = subStatus === 'active' ? 'Active' : subStatus === 'past_due' ? 'Past due' : subStatus === 'canceled' ? 'Canceled' : '—';

                return (
                  <tr key={tenant.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {tenant.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-slate-500">{tenant.slug}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {sub?.plans?.name ? (
                        <span className="text-sm font-medium text-slate-700">{sub.plans.name}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {subStatus ? (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          {statusLabel}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(tenant.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/super/tenants/${tenant.id}`}
                        className="text-xs font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Chi tiết →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
