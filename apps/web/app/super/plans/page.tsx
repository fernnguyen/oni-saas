import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

export default async function SuperPlans() {
  const admin = getSupabaseAdminClient();

  const { data: plans = [], error } = await admin
    .from('plans')
    .select('*')
    .order('id');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Gói dịch vụ</h1>
        <p className="text-sm text-slate-500 mt-0.5">Xem và quản lý các gói dịch vụ của hệ thống</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error.message}
        </div>
      )}

      <div className="space-y-4">
        {(plans as any[]).map((plan) => {
          const meta = plan.metadata ?? {};
          const limits = [
            { label: 'Chi nhánh tối đa', value: meta.max_shops === -1 ? '∞' : (meta.max_shops ?? '—') },
            { label: 'Người dùng tối đa', value: meta.max_users === -1 ? '∞' : (meta.max_users ?? '—') },
            { label: 'Connector/chi nhánh', value: meta.max_connectors_per_shop === -1 ? '∞' : (meta.max_connectors_per_shop ?? '—') },
            { label: 'Custom domain', value: meta.max_custom_domains === -1 ? '∞' : (meta.max_custom_domains ?? '—') },
          ];

          return (
            <div key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{plan.name}</h2>
                    {plan.is_default && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{plan.code}</p>
                </div>
                <span className="text-xs text-slate-400">ID: {plan.id}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {limits.map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-400 mb-1">{label}</div>
                    <div className="text-lg font-bold text-slate-900">{String(value)}</div>
                  </div>
                ))}
              </div>

              <details className="mt-4">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                  Xem metadata JSON
                </summary>
                <pre className="mt-2 rounded-xl bg-slate-900 text-slate-100 p-4 text-xs overflow-auto">
                  {JSON.stringify(plan.metadata, null, 2)}
                </pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
