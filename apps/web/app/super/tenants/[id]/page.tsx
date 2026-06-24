import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { TenantActions } from './TenantActions';
import { AddDomainForm } from './AddDomainForm';
import { EditPlanDialog } from './EditPlanDialog';
import { EditFeaturesDialog } from './EditFeaturesDialog';
import { ConnectorSwitchAdmin } from './ConnectorSwitchAdmin';
import { ShopSettingsAdminDialog } from './ShopSettingsAdminDialog';
import { getVerticalConfig } from '@oni/core';

const FEATURE_LABELS: Record<string, string> = {
  pos: 'Bán tại quầy (POS)',
  hrm: 'Quản lý nhân sự',
  accounting: 'Kế toán',
  orders: 'Đơn hàng',
  inventory: 'Kho & Vận kho',
  channels: 'Kênh bán hàng',
  reports: 'Báo cáo',
  multi_branch: 'Đa chi nhánh',
  google_sheets: 'Google Sheets',
  custom_domain: 'Custom domain',
  warehouse_p2p: 'Mua sắm & Phê duyệt (P2P)',
};

type StatusKey = 'active' | 'past_due' | 'canceled';

const STATUS_STYLE: Record<StatusKey, string> = {
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-red-100 text-red-700',
};

const STATUS_DOT: Record<StatusKey, string> = {
  active: 'bg-green-500',
  past_due: 'bg-yellow-500',
  canceled: 'bg-red-500',
};

export default async function SuperTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const [tenantRes, subsRes, shopsRes, membersRes, plansRes, featureRes, auditRes, ordersRes, modulesRes] = await Promise.all([
    admin.from('tenants').select('*').eq('id', id).single(),
    admin.from('subscriptions').select('*, plans(id, code, name, metadata)').eq('tenant_id', id).maybeSingle(),
    admin.from('shops').select('id, name, slug, created_at').eq('tenant_id', id).order('created_at'),
    admin.from('user_tenants').select('user_id, roles(code)').eq('tenant_id', id),
    admin.from('plans').select('id, code, name').order('id'),
    admin.from('feature_flags').select('key, enabled').eq('tenant_id', id),
    admin.from('audit_logs').select('id, action, user_id, metadata, created_at')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    admin.from('subscription_orders').select('id, plan_code, billing_interval, amount_vnd, reference_code, status, fulfilled_at, created_at')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('system_modules').select('code, name, description').order('code'),
  ]);

  if (tenantRes.error || !tenantRes.data) notFound();

  const tenant = tenantRes.data as {
    id: string; name: string; slug: string; industry_type: string; created_at: string; updated_at: string;
  };
  const sub = subsRes.data as any;
  const shops = (shopsRes.data ?? []) as any[];
  const members = (membersRes.data ?? []) as any[];
  const plans = (plansRes.data ?? []) as any[];
  const features = (featureRes.data ?? []) as Array<{ key: string; enabled: boolean }>;
  const auditLogs = (auditRes.data ?? []) as Array<{ id: string; action: string; user_id: string | null; metadata: Record<string, unknown>; created_at: string }>;
  const orders = (ordersRes.data ?? []) as Array<{ id: string; plan_code: string; billing_interval: string; amount_vnd: number; reference_code: string; status: string; fulfilled_at: string | null; created_at: string }>;
  const modules = (modulesRes.data ?? []) as Array<{ code: string; name: string; description: string | null }>;

  // Usage stats
  const shopIds = shops.map((s: any) => s.id);
  const [connectorsRes, domainsRes] = await Promise.all([
    shopIds.length > 0
      ? admin.from('connectors').select('id, shop_id, type, status').in('shop_id', shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? admin.from('domains').select('id, shop_id, domain, is_primary, verified_at, created_at').in('shop_id', shopIds)
      : Promise.resolve({ data: [] }),
  ]);

  const connectors = (connectorsRes.data ?? []) as any[];
  const domains = (domainsRes.data ?? []) as any[];

  // Also fetch tenant-level connector (new pattern)
  const { data: tenantConnectorRaw } = await admin
    .from('connectors')
    .select('id, type, status')
    .eq('tenant_id', id)
    .eq('status', 'active')
    .maybeSingle();
  const tenantConnector = tenantConnectorRaw as { id: string; type: string; status: string } | null;

  const planMeta = sub?.plans?.metadata ?? {};
  const subStatus: StatusKey = (sub?.status as StatusKey) ?? 'canceled';

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn';
  const defaultShop = shops[0];

  const limits = [
    { label: 'Chi nhánh',    used: shops.length,     max: planMeta.create_shop ?? 0 },
    { label: 'Thành viên',   used: members.length,   max: planMeta.create_shop_user ?? 0 },
    { label: 'Connectors',   used: connectors.length, max: (planMeta.create_connector ?? 0) * Math.max(shops.length, 1) },
    { label: 'Custom domain',used: domains.length,   max: planMeta.create_domain ?? 0 },
  ];

  const enabledFeatures = features.filter((f) => f.enabled);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/super/tenants" className="hover:text-slate-600 transition-colors">Tenants</Link>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-slate-500 font-mono text-xs truncate max-w-xs">{tenant.id}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white text-xl font-bold shrink-0">
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={subStatus} />
              <span className="text-sm text-slate-400">
                Registered {new Date(tenant.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
        <TenantActions tenantId={tenant.id} tenantName={tenant.name} editHref={`/super/tenants/${tenant.id}/edit`} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Tenant details */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-slate-800 text-sm">Tenant details</span>
            </div>
            <div className="divide-y divide-slate-50">
              <DetailRow label="TENANT ID">
                <span className="font-mono text-xs text-slate-700 break-all">{tenant.id}</span>
              </DetailRow>
              <DetailRow label="SLUG">
                <span className="font-mono text-sm text-slate-700">{tenant.slug}</span>
              </DetailRow>
              <DetailRow label="TRẠNG THÁI">
                <StatusBadge status={subStatus} />
              </DetailRow>
              <DetailRow label="NGÀNH NGHỀ">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                  {getVerticalConfig(tenant.industry_type).icon} {getVerticalConfig(tenant.industry_type).label}
                </span>
              </DetailRow>
              <DetailRow label="GÓI DỊCH VỤ">
                <span className="font-semibold text-slate-900">{sub?.plans?.name ?? '—'}</span>
              </DetailRow>
              <DetailRow label="CHU KỲ">
                <span className="text-slate-700">
                  {sub?.current_period_start
                    ? new Date(sub.current_period_start).toLocaleDateString('vi-VN')
                    : '—'}
                  {sub?.current_period_end
                    ? ` → ${new Date(sub.current_period_end).toLocaleDateString('vi-VN')}`
                    : ''}
                </span>
              </DetailRow>
              {sub?.trial_end && (
                <DetailRow label="TRIAL ĐẾN">
                  <span className={`text-sm font-medium ${new Date(sub.trial_end) > new Date() ? 'text-blue-600' : 'text-slate-400'}`}>
                    {new Date(sub.trial_end).toLocaleDateString('vi-VN')}
                    {new Date(sub.trial_end) <= new Date() && ' (hết hạn)'}
                  </span>
                </DetailRow>
              )}
              <DetailRow label="ĐĂNG KÝ LÚC">
                <span className="text-slate-700">
                  {new Date(tenant.created_at).toLocaleString('vi-VN')}
                </span>
              </DetailRow>
              <DetailRow label="CẬP NHẬT LÚC">
                <span className="text-slate-700">
                  {new Date(tenant.updated_at).toLocaleString('vi-VN')}
                </span>
              </DetailRow>
            </div>
          </div>

          {/* Plan limits & features */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                </svg>
                <span className="font-semibold text-slate-800 text-sm">Plan limits & features</span>
              </div>
              <EditPlanDialog
                tenantId={tenant.id}
                currentPlanId={sub?.plan_id ?? null}
                currentPlanName={sub?.plans?.name ?? null}
                currentEndDate={sub?.current_period_end ?? null}
                currentNotes={sub?.notes ?? null}
                plans={plans}
              />
            </div>

            <div className="p-5 space-y-5">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-3">Usage Limits</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {limits.map(({ label, used, max }) => {
                    const unlimited = max === -1;
                    const pct = unlimited || max === 0 ? 0 : Math.min((used / max) * 100, 100);
                    const over = !unlimited && max > 0 && used > max;
                    const high = !unlimited && max > 0 && pct >= 80;
                    const barColor = over ? 'bg-red-500' : high ? 'bg-amber-400' : 'bg-primary';
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">{label}</span>
                          <span className={`text-xs font-semibold ${over ? 'text-red-600' : 'text-slate-700'}`}>
                            {used}/{unlimited ? '∞' : max}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all ${barColor}`}
                            style={{ width: unlimited ? '0%' : `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Feature Access</p>
                  <EditFeaturesDialog
                    tenantId={tenant.id}
                    currentFeatures={features}
                    availableModules={modules}
                  />
                </div>
                {enabledFeatures.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {enabledFeatures.map(({ key }) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {FEATURE_LABELS[key] ?? key}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400">
                    Chưa có feature flags nào được bật. Nhấp "Cấu hình Features" ở trên để quản lý.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Domains */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span className="font-semibold text-slate-800 text-sm">Domains</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />
                {domains.length + 1} domain
              </span>
            </div>

            <div className="p-4 space-y-2">
              {/* Default subdomain (implicit, from tenant slug) */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {tenant.slug}.{rootDomain}
                    </p>
                    <p className="text-xs text-slate-400">Subdomain: {tenant.slug}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 shrink-0 ml-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                  Active
                </span>
              </div>

              {/* Custom domains */}
              {domains.map((d: any) => {
                const verified = !!d.verified_at;
                const shop = shops.find((s: any) => s.id === d.shop_id);
                return (
                  <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{d.domain}</p>
                        {shop && <p className="text-xs text-slate-400">Branch: {shop.name}</p>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ml-2 ${verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full inline-block ${verified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      {verified ? 'Active' : 'Pending'}
                    </span>
                  </div>
                );
              })}

              {/* Add domain form */}
              {defaultShop ? (
                <AddDomainForm
                  tenantId={tenant.id}
                  defaultShopId={defaultShop.id}
                  rootDomain={rootDomain}
                />
              ) : (
                <p className="text-xs text-slate-400 py-2">Cần tạo chi nhánh trước khi thêm domain</p>
              )}
            </div>
          </div>

          {/* Shops list */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="font-semibold text-slate-800 text-sm">Chi nhánh</span>
              </div>
              <span className="text-xs text-slate-400">{shops.length} chi nhánh</span>
            </div>
            {shops.length === 0 ? (
              <div className="px-5 py-4 text-xs text-slate-400">Chưa có chi nhánh</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {shops.map((shop: any) => {
                  const shopConnectors = connectors.filter((c: any) => c.shop_id === shop.id);
                  return (
                    <ShopSettingsAdminDialog
                      key={shop.id}
                      shopId={shop.id}
                      shopName={shop.name}
                      shopSlug={shop.slug}
                    >
                      <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[10px] shrink-0">
                            {shop.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-slate-800 truncate">{shop.name}</p>
                              <svg className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">{shop.slug}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {shopConnectors.length > 0 && (
                            <span className="text-[11px] text-slate-400">{shopConnectors.length}c</span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            {new Date(shop.created_at).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                    </ShopSettingsAdminDialog>
                  );
                })}
              </div>
            )}
          </div>

          {/* Members */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-semibold text-slate-800 text-sm">Thành viên</span>
              </div>
              <span className="text-xs text-slate-400">{members.length} người</span>
            </div>
            <div className="p-4 space-y-2">
              {members.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Chưa có thành viên</p>
              ) : (
                members.map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-500 font-mono truncate">{m.user_id.slice(0, 16)}…</span>
                    <span className="ml-2 shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                      {(m.roles as any)?.code ?? '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Connector Switch */}
          <ConnectorSwitchAdmin
            tenantId={tenant.id}
            currentConnector={tenantConnector}
          />
        </div>
      </div>

      {/* Payment history */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-semibold text-slate-800 text-sm">Lịch sử thanh toán</span>
          </div>
          <span className="text-xs text-slate-400">{orders.length} giao dịch</span>
        </div>
        {orders.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Chưa có giao dịch nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Gói</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Chu kỳ</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Số tiền</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mã đơn</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Trạng thái</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map((o) => {
                  const isDone = o.status === 'fulfilled' || o.status === 'completed';
                  const statusStyle =
                    isDone                   ? 'bg-green-100 text-green-700' :
                    o.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                    o.status === 'expired'   ? 'bg-slate-100 text-slate-500' :
                    'bg-red-100 text-red-700';
                  const statusLabel =
                    isDone                   ? 'Hoàn thành' :
                    o.status === 'pending'   ? 'Chờ thanh toán' :
                    o.status === 'expired'   ? 'Hết hạn' : o.status;
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{o.plan_code}</td>
                      <td className="px-5 py-3 text-slate-500">{o.billing_interval === 'yearly' ? 'Năm' : 'Tháng'}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">
                        {o.amount_vnd.toLocaleString('vi-VN')}₫
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{o.reference_code}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
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

      {/* Action history */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold text-slate-800 text-sm">Lịch sử tác động</span>
          </div>
          <a
            href={`/super/audit-logs?tenant_id=${tenant.id}`}
            className="text-xs text-primary hover:underline"
          >
            Xem tất cả →
          </a>
        </div>

        {auditLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            Chưa có hành động nào được ghi nhận
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {auditLogs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTION_META: Record<string, { label: string; color: string; dot: string }> = {
  'tenant.suspend':     { label: 'Tạm khóa',      color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  'tenant.cancel':      { label: 'Huỷ dịch vụ',   color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  'tenant.delete':      { label: 'Xoá tenant',     color: 'bg-red-100 text-red-700',      dot: 'bg-red-600' },
  'tenant.plan_change': { label: 'Đổi gói',        color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  'tenant.activate':    { label: 'Kích hoạt',      color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  'shop.settings_update': { label: 'Sửa cấu hình',   color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
};

function AuditLogRow({ log }: { log: { id: string; action: string; user_id: string | null; metadata: Record<string, unknown>; created_at: string } }) {
  const meta = ACTION_META[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

  function renderDetail(m: Record<string, unknown>): string {
    if (log.action === 'tenant.plan_change') {
      const prev = m.previous_plan_name as string | null;
      const next = m.new_plan_name as string | null;
      if (prev && next) return `${prev} → ${next}`;
      if (next) return `Chuyển sang: ${next}`;
    }
    if (log.action === 'tenant.suspend' || log.action === 'tenant.cancel') {
      const prev = m.previous_status as string | null;
      const next = m.new_status as string | null;
      if (prev && next) return `${prev} → ${next}`;
    }
    if (log.action === 'shop.settings_update') {
      const shopName = m.shop_name as string | null;
      const fields = m.updated_fields as string[] | null;
      return `Chi nhánh: ${shopName || m.shop_id || ''}${fields ? ` (sửa: ${fields.join(', ')})` : ''}`;
    }
    return Object.keys(m).length > 0 ? JSON.stringify(m) : '';
  }

  const detail = renderDetail(log.metadata ?? {});

  return (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
            {meta.label}
          </span>
          {detail && (
            <span className="text-xs text-slate-500">{detail}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {log.user_id && (
            <span className="text-[11px] text-slate-400 font-mono">by {log.user_id.slice(0, 8)}…</span>
          )}
          <span className="text-[11px] text-slate-400">
            {new Date(log.created_at).toLocaleString('vi-VN')}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusKey }) {
  const cls = STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-600';
  const dot = STATUS_DOT[status] ?? 'bg-slate-400';
  const label = status === 'active' ? 'Active' : status === 'past_due' ? 'Past due' : 'Canceled';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center px-5 py-3.5 gap-4">
      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase w-32 shrink-0">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}
