import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

export default async function SuperDashboard() {
  const admin = getSupabaseAdminClient();

  const [tenantsRes, subscriptionsRes, usersRes] = await Promise.all([
    admin.from('tenants').select('id, created_at', { count: 'exact' }),
    admin.from('subscriptions').select('status, plan_id, plans(code, name)', { count: 'exact' }),
    admin.from('user_tenants').select('user_id', { count: 'exact' }),
  ]);

  const totalTenants = tenantsRes.count ?? 0;
  const totalMemberships = usersRes.count ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = (subscriptionsRes.data ?? []) as any[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const signupsToday = (tenantsRes.data ?? []).filter(
    (t) => new Date(t.created_at) >= today,
  ).length;

  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;

  const planCounts: Record<string, number> = {};
  for (const sub of subscriptions) {
    const label = sub.plans?.name ?? 'Unknown';
    planCounts[label] = (planCounts[label] ?? 0) + 1;
  }

  const stats = [
    { label: 'Tổng tổ chức', value: totalTenants, bg: 'bg-blue-50', text: 'text-blue-700', icon: '🏢' },
    { label: 'Đăng ký hôm nay', value: signupsToday, bg: 'bg-green-50', text: 'text-green-700', icon: '✨' },
    { label: 'Subscription active', value: activeSubs, bg: 'bg-purple-50', text: 'text-purple-700', icon: '💳' },
    { label: 'Tổng thành viên', value: totalMemberships, bg: 'bg-orange-50', text: 'text-orange-700', icon: '👥' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">Dữ liệu toàn bộ ONI Platform</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl mb-3 ${stat.bg} ${stat.text}`}>
              {stat.icon}
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Phân bổ theo gói dịch vụ</h2>
        {Object.keys(planCounts).length === 0 ? (
          <p className="text-sm text-slate-400">Chưa có dữ liệu subscription</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(planCounts).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{plan}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-[#0268FF]"
                      style={{ width: `${totalTenants > 0 ? (count / totalTenants) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
