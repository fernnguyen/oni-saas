import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

interface SearchParams {
  tenant_id?: string;
  action?: string;
}

export default async function SuperAuditLogs({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { tenant_id, action } = await searchParams;
  const admin = getSupabaseAdminClient();

  let query = admin
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (tenant_id) query = query.eq('tenant_id', tenant_id);
  if (action) query = query.ilike('action', `%${action}%`);

  const { data: logs = [], error } = await query;

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    login: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nhật ký hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {(logs as any[]).length} bản ghi gần nhất
        </p>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="tenant_id"
          defaultValue={tenant_id}
          placeholder="Tenant ID..."
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#0268FF] font-mono"
        />
        <input
          name="action"
          defaultValue={action}
          placeholder="Loại hành động..."
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#0268FF]"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] transition-colors"
        >
          Lọc
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error.message}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Thời gian</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Hành động</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Tenant</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(logs as any[]).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Không có nhật ký nào
                </td>
              </tr>
            ) : (
              (logs as any[]).map((log) => {
                const actionPrefix = log.action?.split('.')[0] ?? '';
                const colorClass = actionColors[actionPrefix] ?? 'bg-slate-100 text-slate-600';
                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                        {log.action ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {log.tenant_id ? log.tenant_id.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
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
