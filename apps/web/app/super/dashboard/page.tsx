'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  Store,
  Users,
  Package,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  UserCheck,
  ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  totalTenants: number;
  totalShops: number;
  totalUsers: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  ordersToday: number;
  ordersYesterday: number;
  ordersLast7Days: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  tenantsWithConnector: number;
  connectorErrors: number;
  revenueToday?: number;
  revenueThisMonth?: number;
  revenueLastMonth?: number;
}

interface StatsData {
  overview: Overview;
  hasTrend: boolean;
  subscriptions: {
    byStatus: Record<string, number>;
    byPlan: { plan: string; count: number }[];
  };
  topTenants: {
    id: string; name: string; slug: string;
    ordersMonth: number; ordersToday: number; products: number; customers: number;
  }[];
  orderTrend: { date: string; count: number; revenue?: number }[];
  newTenantsTrend: { date: string; count: number }[];
  tenants: {
    id: string; name: string; slug: string;
    hasConnector: boolean; status: string | null;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('vi-VN');
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string; value: number; sub?: string; color: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums sm:text-2xl">{fmt(value)}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function CompareCard({
  label, current, previous, previousLabel,
}: {
  label: string; current: number; previous: number; previousLabel: string;
}) {
  const d    = pct(current, previous);
  const isUp = d !== null && d > 0;
  const isDn = d !== null && d < 0;
  const Icon = isUp ? TrendingUp : isDn ? TrendingDown : Minus;
  const clr  = isUp
    ? 'text-emerald-600 bg-emerald-50'
    : isDn ? 'text-red-500 bg-red-50' : 'text-slate-400 bg-slate-50';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums sm:text-3xl">
        {current.toLocaleString('vi-VN')}
      </p>
      <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${clr}`}>
        <Icon className="h-3 w-3" />
        {d !== null ? `${Math.abs(d).toFixed(1)}% so với ${previousLabel}` : '—'}
      </div>
    </div>
  );
}

function BarChart({ data, color = '#6366f1', emptyLabel, tooltipSuffix = 'đơn' }: {
  data: { date: string; count: number; revenue?: number }[];
  color?: string;
  emptyLabel?: string;
  tooltipSuffix?: string;
}) {
  const max     = Math.max(...data.map((d) => d.count), 1);
  const hasData = data.some((d) => d.count > 0);

  const formatMD = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate.slice(5);
    return `${parts[2]}/${parts[1]}`;
  };

  if (!hasData) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        {emptyLabel ?? 'Chưa có dữ liệu'}
      </p>
    );
  }

  // h-28 = 7rem. At 16px base = 112px.
  // Use pixel heights directly — items-end prevents % from resolving correctly
  // on flex children that don't have an explicit height.
  const BAR_PX = 112;

  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {data.map((d, i) => {
          const heightPx = d.count > 0 ? Math.max(3, Math.round((d.count / max) * BAR_PX)) : 0;
          return (
            <div key={i} className="group relative flex-1" style={{ minWidth: 0 }}>
              <div
                className="w-full rounded-t opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${heightPx}px`, backgroundColor: color }}
              />
              {d.count > 0 && (
                <div className="absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1.5 text-xs text-white shadow-lg group-hover:block">
                  <div className="text-center font-medium">{formatMD(d.date)}</div>
                  <div className="mt-0.5 text-slate-300">
                    {d.count.toLocaleString('vi-VN')} {tooltipSuffix}
                    {d.revenue ? ` · ${fmt(d.revenue)}đ` : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex text-[10px] text-slate-400" style={{ gap: 2 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 overflow-hidden text-center" style={{ minWidth: 0 }}>
            {i % 7 === 0 ? formatMD(d.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function HBarList({ items, colorClass = 'bg-indigo-500' }: {
  items: { label: string; value: number; sub?: string }[];
  colorClass?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right text-xs text-slate-400 tabular-nums">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-700">{item.label}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${colorClass} transition-all`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-semibold text-slate-800 tabular-nums">
              {item.value.toLocaleString('vi-VN')}
            </span>
            {item.sub && <p className="text-xs text-slate-400">{item.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-600',
};
const STATUS_DOT: Record<string, string> = {
  active:   'bg-emerald-500',
  past_due: 'bg-amber-500',
  canceled: 'bg-red-500',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', past_due: 'Past due', canceled: 'Canceled',
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SuperDashboard() {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tenantSearch,   setTenantSearch]   = useState('');
  const [dropdownOpen,   setDropdownOpen]   = useState(false);

  const apiUrl = selectedTenant
    ? `/api/super/stats?tenant_id=${selectedTenant}`
    : '/api/super/stats';

  const { data, isLoading, isError, refetch, isFetching } = useQuery<StatsData>({
    queryKey: ['super-stats', selectedTenant],
    queryFn:  async () => {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error('Không tải được dữ liệu');
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const selectedName = useMemo(() => {
    if (!selectedTenant || !data) return 'Toàn bộ hệ thống';
    return data.tenants.find((t) => t.id === selectedTenant)?.name ?? 'Toàn bộ hệ thống';
  }, [selectedTenant, data]);

  const filteredTenants = useMemo(() => {
    if (!data) return [];
    const q = tenantSearch.toLowerCase();
    return q
      ? data.tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      : data.tenants;
  }, [data, tenantSearch]);

  const ov = data?.overview;

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Tổng quan hệ thống</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            ONI Platform ·{' '}
            <span className="font-medium text-slate-700">{selectedName}</span>
            {!selectedTenant && ov && (
              <span className="ml-1 text-slate-400">
                ({ov.tenantsWithConnector}/{ov.totalTenants} cửa hàng có connector)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tenant filter dropdown */}
          <div className="relative">
            <button
              id="tenant-filter-btn"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:min-w-[200px]"
            >
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="hidden flex-1 truncate text-left sm:block">
                {selectedTenant
                  ? (data?.tenants.find((t) => t.id === selectedTenant)?.name ?? 'Đang tải...')
                  : 'Toàn bộ hệ thống'}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-80">
                <div className="border-b border-slate-100 p-2">
                  <input
                    autoFocus
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    placeholder="Tìm cửa hàng..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  <button
                    onClick={() => { setSelectedTenant(''); setDropdownOpen(false); setTenantSearch(''); }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${!selectedTenant ? 'font-medium text-indigo-600' : 'text-slate-700'}`}
                  >
                    🌐 Toàn bộ hệ thống
                  </button>
                  {filteredTenants.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTenant(t.id); setDropdownOpen(false); setTenantSearch(''); }}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${selectedTenant === t.id ? 'font-medium text-indigo-600' : 'text-slate-700'}`}
                    >
                      <p className="min-w-0 flex-1 truncate">{t.name}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!t.hasConnector && (
                          <span title="Chưa có connector"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /></span>
                        )}
                        {t.status && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[t.status] ?? 'bg-slate-400'}`} />
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            id="refresh-stats-btn"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Làm mới dữ liệu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Error / warnings ── */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tải được dữ liệu. Vui lòng thử lại.
        </div>
      )}
      {ov && ov.connectorErrors > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {ov.connectorErrors} cửa hàng không trả được dữ liệu (connector lỗi / chưa cấu hình).
            Số liệu đơn hàng / sản phẩm có thể chưa đầy đủ.
          </span>
        </div>
      )}

      {/* ── Stat Cards — 2 cols mobile, 3 cols sm, 6 cols lg ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 sm:h-24" />)}
        </div>
      ) : ov ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {!selectedTenant && (
            <StatCard icon={Building2}    label="Cửa hàng"      value={ov.totalTenants}   color="bg-indigo-50 text-indigo-600"   sub={`${ov.tenantsWithConnector} có connector`} />
          )}
          
          <StatCard icon={Store}        label="Chi nhánh"     value={ov.totalShops}     color="bg-blue-50 text-blue-600" />
          <StatCard icon={Users}        label="Thành viên"    value={ov.totalUsers}     color="bg-violet-50 text-violet-600" />
          <StatCard icon={Package}      label="Sản phẩm"      value={ov.totalProducts}  color="bg-amber-50 text-amber-600" />
          <StatCard icon={UserCheck}    label="Khách hàng"    value={ov.totalCustomers} color="bg-rose-50 text-rose-600" />
          <StatCard icon={ClipboardList} label="Tổng đơn hàng" value={ov.totalOrders}  color="bg-emerald-50 text-emerald-600" />
          
          {selectedTenant && (
            <StatCard icon={TrendingUp}   label="Doanh thu (tháng)" value={ov.revenueThisMonth || 0} color="bg-indigo-50 text-indigo-600" />
          )}
        </div>
      ) : null}

      {/* ── Order/Revenue comparison — 2 cols mobile, 4 cols sm+ ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 sm:h-28" />)}
        </div>
      ) : ov ? (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {selectedTenant ? 'Đơn hàng & Doanh thu' : 'Đơn hàng theo thời gian'}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CompareCard label="Hôm nay"    current={ov.ordersToday}     previous={ov.ordersYesterday} previousLabel="hôm qua" />
            <CompareCard label="Tháng này"  current={ov.ordersThisMonth} previous={ov.ordersLastMonth} previousLabel="tháng trước" />
            {!selectedTenant ? (
              <>
                <CompareCard label="Hôm qua"    current={ov.ordersYesterday} previous={0}                  previousLabel="" />
                <CompareCard label="7 ngày qua" current={ov.ordersLast7Days} previous={ov.ordersLastMonth > 0 ? Math.round(ov.ordersLastMonth * 7 / 30) : 0} previousLabel="tháng trước" />
              </>
            ) : (
              <>
                <CompareCard label="Doanh thu hôm nay"   current={ov.revenueToday || 0}     previous={0} previousLabel="" />
                <CompareCard label="Doanh thu tháng này" current={ov.revenueThisMonth || 0} previous={ov.revenueLastMonth || 0} previousLabel="tháng trước" />
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Charts — conditional by mode ── */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-52 sm:h-60" />
          <Skeleton className="h-52 sm:h-60" />
        </div>
      ) : data ? (
        data.hasTrend ? (
          /* Single-tenant: full-width trend chart */
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Xu hướng đơn hàng — 30 ngày</h2>
              <span className="text-xs text-slate-400">
                Tổng: {data.orderTrend.reduce((s, d) => s + d.count, 0).toLocaleString('vi-VN')} đơn
              </span>
            </div>
            <BarChart
              data={data.orderTrend}
              color="#6366f1"
              emptyLabel="Chưa có đơn hàng nào trong 30 ngày qua"
              tooltipSuffix="đơn"
            />
          </div>
        ) : (
          /* Global: subscription plans + new tenants side-by-side */
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Subscription plans */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="mb-4 font-semibold text-slate-800">Gói dịch vụ</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(data.subscriptions.byStatus).filter(([, v]) => v > 0).map(([status, count]) => (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-slate-400'}`} />
                    {STATUS_LABEL[status] ?? status}: {count}
                  </span>
                ))}
              </div>
              {data.subscriptions.byPlan.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
              ) : (
                <div className="space-y-3">
                  {data.subscriptions.byPlan.map((p) => {
                    const total  = data.subscriptions.byPlan.reduce((s, x) => s + x.count, 0);
                    const pctVal = total > 0 ? (p.count / total) * 100 : 0;
                    const COLORS: Record<string, string> = {
                      'Mini (Miễn phí)': 'bg-slate-400',
                      'Pro': 'bg-indigo-500',
                      'Enterprise': 'bg-violet-600',
                    };
                    return (
                      <div key={p.plan} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-sm text-slate-600">{p.plan}</span>
                        <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${COLORS[p.plan] ?? 'bg-indigo-500'}`}
                            style={{ width: `${pctVal}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-800 tabular-nums">{p.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* New tenants trend */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">Cửa hàng mới — 30 ngày</h2>
                <span className="text-xs text-slate-400">
                  {data.newTenantsTrend.reduce((s, d) => s + d.count, 0)} cửa hàng
                </span>
              </div>
              <BarChart
                data={data.newTenantsTrend}
                color="#10b981"
                emptyLabel="Không có cửa hàng nào mới trong 30 ngày"
                tooltipSuffix="cửa hàng"
              />
            </div>
          </div>
        )
      ) : null}

      {/* ── Top cửa hàng ── */}
      {isLoading ? (
        <Skeleton className="h-56 sm:h-64" />
      ) : data && data.topTenants.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between sm:mb-5">
            <h2 className="font-semibold text-slate-800">Top cửa hàng</h2>
            <a
              href="/super/tenants"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
            >
              Xem tất cả <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Mobile: stacked list; Desktop: 2-col */}
          <div className="space-y-3 sm:hidden">
            {data.topTenants.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{t.name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                    <span>{t.ordersMonth.toLocaleString('vi-VN')} đ.tháng</span>
                    <span>{t.ordersToday} đ.hôm nay</span>
                    <span>{fmt(t.customers)} KH</span>
                    <span>{fmt(t.products)} SP</span>
                  </div>
                </div>
                <a href={`/super/tenants/${t.id}`} className="shrink-0 text-xs text-indigo-600 hover:underline">→</a>
              </div>
            ))}
          </div>

          {/* Desktop: 2-col */}
          <div className="hidden sm:grid sm:gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-medium text-slate-500">Đơn hàng tháng này</p>
              <HBarList
                colorClass="bg-indigo-500"
                items={data.topTenants.map((t) => ({
                  label: t.name, value: t.ordersMonth, sub: t.slug,
                }))}
              />
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-slate-500">Đơn hôm nay / Khách hàng / Sản phẩm</p>
              <div className="space-y-2.5">
                {data.topTenants.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{t.name}</p>
                    <div className="flex shrink-0 gap-3 text-xs text-slate-500 tabular-nums">
                      <span>{t.ordersToday} đ.hôm nay</span>
                      <span>{fmt(t.customers)} KH</span>
                      <span>{fmt(t.products)} SP</span>
                    </div>
                    <a
                      href={`/super/tenants/${t.id}`}
                      className="shrink-0 text-xs font-medium text-indigo-600 hover:underline"
                    >→</a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
