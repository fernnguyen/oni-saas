import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { TenantActions } from './TenantActions';
import { AddDomainForm } from './AddDomainForm';

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

  const [tenantRes, subsRes, shopsRes, membersRes, plansRes, featureRes] = await Promise.all([
    admin.from('tenants').select('*').eq('id', id).single(),
    admin.from('subscriptions').select('*, plans(id, code, name, metadata)').eq('tenant_id', id).maybeSingle(),
    admin.from('shops').select('id, name, slug, created_at').eq('tenant_id', id).order('created_at'),
    admin.from('user_tenants').select('user_id, roles(code)').eq('tenant_id', id),
    admin.from('plans').select('id, code, name').order('id'),
    admin.from('feature_flags').select('key, enabled').eq('tenant_id', id),
  ]);

  if (tenantRes.error || !tenantRes.data) notFound();

  const tenant = tenantRes.data as {
    id: string; name: string; slug: string; created_at: string; updated_at: string;
  };
  const sub = subsRes.data as any;
  const shops = (shopsRes.data ?? []) as any[];
  const members = (membersRes.data ?? []) as any[];
  const plans = (plansRes.data ?? []) as any[];
  const features = (featureRes.data ?? []) as Array<{ key: string; enabled: boolean }>;

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

  const planMeta = sub?.plans?.metadata ?? {};
  const subStatus: StatusKey = (sub?.status as StatusKey) ?? 'canceled';

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn';
  const defaultShop = shops[0];

  const limits = [
    { label: 'Chi nhánh', used: shops.length, max: planMeta.max_shops ?? 0 },
    { label: 'Thành viên', used: members.length, max: planMeta.max_users ?? 0 },
    { label: 'Connectors', used: connectors.length, max: (planMeta.max_connectors_per_shop ?? 0) * Math.max(shops.length, 1) },
    { label: 'Custom domain', used: domains.length, max: planMeta.max_custom_domains ?? 0 },
  ];

  const enabledFeatures = features.filter((f) => f.enabled);

  return (
    <div className="space-y-6 max-w-6xl">
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
          <div className="h-12 w-12 rounded-2xl bg-[#0268FF] flex items-center justify-center text-white text-xl font-bold shrink-0">
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
                <span className="font-mono text-sm text-slate-700">{tenant.id}</span>
              </DetailRow>
              <DetailRow label="STATUS">
                <StatusBadge status={subStatus} />
              </DetailRow>
              <DetailRow label="PLAN">
                <span className="font-semibold text-slate-900">{sub?.plans?.name ?? '—'}</span>
              </DetailRow>
              <DetailRow label="SUBSCRIPTION">
                <StatusBadge status={subStatus} />
              </DetailRow>
              <DetailRow label="CREATED">
                <span className="text-slate-700">
                  {new Date(tenant.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </DetailRow>
              <DetailRow label="LAST UPDATED">
                <span className="text-slate-700">
                  {new Date(tenant.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
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
              <form action={`/api/super/tenants/${tenant.id}/plan`} method="POST" className="flex items-center gap-2">
                <select
                  name="plan_id"
                  defaultValue={sub?.plan_id ?? ''}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0268FF]"
                >
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#0268FF] transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit plan
                </button>
              </form>
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
                    const barColor = over ? 'bg-red-500' : high ? 'bg-amber-400' : 'bg-[#0268FF]';
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

              {enabledFeatures.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-3">Feature Access</p>
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
                </div>
              )}

              {enabledFeatures.length === 0 && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400">
                  Chưa có feature flags nào được bật. Thêm qua Supabase Dashboard hoặc API.
                </div>
              )}
            </div>
          </div>

          {/* Shops list */}
          {shops.length > 0 && (
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
              <div className="divide-y divide-slate-50">
                {shops.map((shop: any) => {
                  const shopConnectors = connectors.filter((c: any) => c.shop_id === shop.id);
                  return (
                    <div key={shop.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                          {shop.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{shop.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{shop.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {shopConnectors.length > 0 && (
                          <span className="text-xs text-slate-400">{shopConnectors.length} connector</span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(shop.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
