import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { DashboardShell } from '@/app/components/layout/DashboardShell';
import { getTenantActivePlanDetails } from '@/lib/server/subscriptions';
import { UpgradeButton } from '@/app/components/billing/UpgradeButton';
import { PayNowButton } from '@/app/components/billing/PayNowButton';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BillingPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect(`/auth/signin`);

  const admin = getSupabaseAdminClient();
  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, industry_type')
    .eq('slug', slug)
    .maybeSingle();
  if (!tenant) notFound();

  // Fetch default shop
  const { data: shops } = await admin
    .from('shops')
    .select('id, name, slug')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true }); // deterministic order
  if (!shops || shops.length === 0) notFound();

  const defaultShop = shops[0];
  const homePath = `/${defaultShop.slug}`;

  // Use settings.view permission for billing
  const permissions = await getUserPermissions(authData.user.id, tenant.id, undefined).catch(() => [] as string[]);
  if (!permissions.includes('settings.view')) notFound();

  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  // Fetch current subscription
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('*, plans(id, code, name, metadata)')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  // Fetch billing history
  const { data: billingHistory } = await admin
    .from('subscription_orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  const sub = subscription as any;
  const history = (billingHistory ?? []) as any[];

  const planDetails = await getTenantActivePlanDetails(tenant.id);

  return (
    <DashboardShell
      tenantId={tenant.id}
      tenantName={tenant.name}
      shopName={defaultShop.name}
      userEmail={authData.user.email}
      displayName={displayName || undefined}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath}/connectors`}
      settingsHref={`${homePath}/settings`}
      tenantBillingHref={`/billing`}
      tenantSettingsHref={`/settings`}
      tenantTeamHref={`/team`}
      tenantRolesHref={`/roles`}
      accountHref={`${homePath}/account`}
      supportHref={`${homePath}/support`}
      permissions={permissions}
      sidebarContext="shop"
      currentBranchSlug={defaultShop.slug}
      planCode={planDetails?.planCode}
      planName={planDetails?.planName}
      periodStart={planDetails?.periodStart}
      periodEnd={planDetails?.periodEnd}
      industryType={tenant.industry_type}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Gói dịch vụ & Thanh toán</h1>
            <p className="mt-1 text-sm text-slate-500">Quản lý các gói dịch vụ và xem lịch sử giao dịch.</p>
          </div>
          <div>
            <UpgradeButton />
          </div>
        </div>

        {/* Current Plan Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">Gói hiện tại</p>
              <h2 className="text-2xl font-bold text-slate-900">{sub?.plans?.name ?? 'Chưa đăng ký'}</h2>
              <div className="mt-2 flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  sub?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sub?.status === 'active' ? 'bg-green-500' : 'bg-slate-400'}`} />
                  {sub?.status === 'active' ? 'Đang hoạt động' : sub?.status || 'Không xác định'}
                </span>
                {sub?.current_period_end && (
                  <span className="text-sm text-slate-500">
                    Hết hạn ngày {new Date(sub.current_period_end).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Lịch sử thanh toán</h2>
          </div>
          {history.length === 0 ? (
            <div className="flex h-40 items-center justify-center bg-slate-50">
              <p className="text-sm text-slate-500">Chưa có dữ liệu thanh toán.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Gói</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Chu kỳ</th>
                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Số tiền</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mã đơn</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Trạng thái</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((o) => {
                    const orderExpiresAt = new Date(o.expires_at);
                    const now = new Date();
                    const isOrderExpired = o.status === 'pending' && now > orderExpiresAt;

                    const isDone = o.status === 'fulfilled' || o.status === 'completed';
                    const currentStatus = isOrderExpired ? 'expired' : o.status;

                    const statusStyle =
                      isDone                        ? 'bg-green-100 text-green-700' :
                      currentStatus === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                      currentStatus === 'expired'   ? 'bg-slate-100 text-slate-500' :
                      'bg-red-100 text-red-700';
                    const statusLabel =
                      isDone                        ? 'Hoàn thành' :
                      currentStatus === 'pending'   ? 'Chờ thanh toán' :
                      currentStatus === 'expired'   ? 'Hết hạn' : currentStatus;
                    return (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800">{o.plan_code}</td>
                        <td className="px-6 py-4 text-slate-500">{o.billing_interval === 'yearly' ? 'Năm' : 'Tháng'}</td>
                        <td className="px-6 py-4 text-right font-mono font-semibold text-slate-800">
                          {(o.amount_vnd ?? 0).toLocaleString('vi-VN')}₫
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{o.reference_code}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyle}`}>
                              {statusLabel}
                            </span>
                            {currentStatus === 'pending' && (
                              <PayNowButton orderId={o.id} expiresAt={o.expires_at} />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
