export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '@/lib/server/auth';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getConnectorForTenant } from '@/lib/server/connectorFactory';
import type { IDataConnector } from '@oni/adapters';

// ─── GMT+7 helpers ────────────────────────────────────────────────────────────
// The database stores timezone-naive timestamps representing VN time.
// We use "Fake UTC" Date objects where their internal UTC values actually represent VN local time.

const TZ_MS = 7 * 60 * 60 * 1000;

function nowGMT7(): Date {
  return new Date(Date.now() + TZ_MS);
}

function startOfDay(dFake: Date): Date {
  return new Date(Date.UTC(dFake.getUTCFullYear(), dFake.getUTCMonth(), dFake.getUTCDate()));
}

function subDays(baseFake: Date, n: number): Date {
  return new Date(baseFake.getTime() - n * 86_400_000);
}

function startOfMonth(dFake: Date, monthsBack = 0): Date {
  const c = new Date(dFake);
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() - monthsBack);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

/** 'YYYY-MM-DD' key from a fake UTC iso string */
function dayKey(isoStr: string): string {
  if (!isoStr) return '';
  return isoStr.slice(0, 10);
}

function buildDayKeys(nowFake: Date, days = 30): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(startOfDay(nowFake), i);
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    );
  }
  return keys;
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

// ─── COUNT-only via connector ─────────────────────────────────────────────────
// Uses limit:1 so DB runs COUNT(*) but returns just 1 data row.

async function countVia(
  connector: IDataConnector,
  entity: string,
  dateRange?: { start: string; end: string },
): Promise<number> {
  const res = await connector.list(entity, {
    limit: 1,
    ...(dateRange ? { date_range: { column: 'created_at', ...dateRange } } : {}),
  });
  return res.total;
}

// ─── Per-tenant stats ─────────────────────────────────────────────────────────

interface TenantStats {
  tenantId: string;
  ordersTotal: number;
  ordersToday: number;
  ordersYesterday: number;
  ordersLast7Days: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  productsTotal: number;
  customersTotal: number;
  revenueToday: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  /** Only in single-tenant mode: orders by day for the last 30 days */
  orderTrend: { date: string; count: number; revenue: number }[];
  ok: boolean;
}

const ZERO = (id: string): TenantStats => ({
  tenantId: id,
  ordersTotal: 0, ordersToday: 0, ordersYesterday: 0,
  ordersLast7Days: 0, ordersThisMonth: 0, ordersLastMonth: 0,
  productsTotal: 0, customersTotal: 0,
  revenueToday: 0, revenueThisMonth: 0, revenueLastMonth: 0,
  orderTrend: [], ok: false,
});

// ── Global mode: COUNT-only per tenant, no row fetching ───────────────────────

async function fetchCountsOnly(
  tenantId: string,
  connector: IDataConnector,
  dates: Record<string, string>,
  nowISO: string,
): Promise<TenantStats> {
  try {
    const [
      ordersTotal, ordersToday, ordersYesterday,
      ordersLast7Days, ordersThisMonth, ordersLastMonth,
      productsTotal, customersTotal,
    ] = await Promise.all([
      countVia(connector, 'orders'),
      countVia(connector, 'orders', { start: dates.todayStart,      end: nowISO }),
      countVia(connector, 'orders', { start: dates.yesterdayStart,  end: dates.yesterdayEnd }),
      countVia(connector, 'orders', { start: dates.last7Start,      end: nowISO }),
      countVia(connector, 'orders', { start: dates.thisMonthStart,  end: nowISO }),
      countVia(connector, 'orders', { start: dates.lastMonthStart,  end: dates.thisMonthStart }),
      countVia(connector, 'products'),
      countVia(connector, 'customers').catch(() => 0),
    ]);
    return {
      tenantId,
      ordersTotal, ordersToday, ordersYesterday,
      ordersLast7Days, ordersThisMonth, ordersLastMonth,
      productsTotal, customersTotal,
      revenueToday: 0, revenueThisMonth: 0, revenueLastMonth: 0,
      orderTrend: [], ok: true,
    };
  } catch {
    return ZERO(tenantId);
  }
}

// ── Single-tenant mode: fetch rows, compute everything in JS (reliable) ───────
// This mirrors the pattern used in /api/shops/[shopId]/reports/overview
// Fetches at most 5000 orders (bounded by date range, 30 days)

async function fetchSingleTenantStats(
  tenantId: string,
  connector: IDataConnector,
  dayKeys: string[],
  nowFake: Date,
  nowFakeISO: string,
  dates: Record<string, string>,
): Promise<TenantStats> {
  try {
    const todayMs       = startOfDay(nowFake).getTime();
    const yesterdayMs   = subDays(startOfDay(nowFake), 1).getTime();
    const last7Ms       = subDays(startOfDay(nowFake), 6).getTime();
    const thisMonthMs   = startOfMonth(nowFake, 0).getTime();
    const lastMonthMs   = startOfMonth(nowFake, 1).getTime();
    const thisMonthEnd  = startOfMonth(nowFake, 0).getTime(); 

    const [ordersRes, productsRes, customersRes] = await Promise.all([
      // Fetch recent orders up to current VN time (nowFakeISO)
      connector.list('orders', {
        limit: 5000,
        date_range: { column: 'created_at', start: dates.lastMonthStart, end: nowFakeISO },
      }),
      connector.list('products', { limit: 1 }),
      connector.list('customers', { limit: 1 }).catch(() => ({ total: 0, data: [] })),
    ]);

    // Total orders (all time) — separate bounded count query
    const totalRes = await countVia(connector, 'orders');

    // Aggregate from fetched rows (JS-side, timezone-aware)
    let ordersToday     = 0;
    let ordersYesterday = 0;
    let ordersLast7Days = 0;
    let ordersThisMonth = 0;
    let ordersLastMonth = 0;
    let revenueToday    = 0;
    let revenueThisMonth = 0;
    let revenueLastMonth = 0;

    const byDay: Record<string, { count: number; revenue: number }> = Object.fromEntries(
      dayKeys.map((k) => [k, { count: 0, revenue: 0 }])
    );

    for (const row of ordersRes.data) {
      const t = new Date(row.created_at || 0).getTime();
      const amount = Number(row.total_amount || row.amount || row.total || 0);

      if (t >= todayMs) {
        ordersToday++;
        revenueToday += amount;
      }
      if (t >= yesterdayMs && t < todayMs) ordersYesterday++;
      if (t >= last7Ms) ordersLast7Days++;

      if (t >= thisMonthMs) {
        ordersThisMonth++;
        revenueThisMonth += amount;
      }
      if (t >= lastMonthMs && t < thisMonthEnd) {
        ordersLastMonth++;
        revenueLastMonth += amount;
      }

      const k = dayKey(row.created_at);
      if (k in byDay) {
        byDay[k].count++;
        byDay[k].revenue += amount;
      }
    }

    const orderTrend = dayKeys.map((date) => ({
      date,
      count: byDay[date].count,
      revenue: byDay[date].revenue,
    }));

    return {
      tenantId,
      ordersTotal: totalRes,
      ordersToday, ordersYesterday, ordersLast7Days,
      ordersThisMonth, ordersLastMonth,
      productsTotal:   productsRes.total,
      customersTotal:  customersRes.total,
      revenueToday, revenueThisMonth, revenueLastMonth,
      orderTrend, ok: true,
    };
  } catch {
    return ZERO(tenantId);
  }
}

// ─── GET /api/super/stats ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getSuperAdminUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp            = req.nextUrl.searchParams;
    const tenantId      = sp.get('tenant_id') ?? undefined;
    const isSingleTenant = Boolean(tenantId);

    const admin  = getSupabaseAdminClient();
    
    const nowFake    = nowGMT7();
    const nowFakeISO = nowFake.toISOString();

    const dayKeys30 = buildDayKeys(nowFake, 30);

    // Fake UTC boundaries matching VN midnight
    const dates = {
      todayStart:     startOfDay(nowFake).toISOString(),
      yesterdayStart: subDays(startOfDay(nowFake), 1).toISOString(),
      yesterdayEnd:   new Date(startOfDay(nowFake).getTime() - 1).toISOString(),
      last7Start:     subDays(startOfDay(nowFake), 6).toISOString(),
      thisMonthStart: startOfMonth(nowFake, 0).toISOString(),
      lastMonthStart: startOfMonth(nowFake, 1).toISOString(),
      last30Start:    subDays(startOfDay(nowFake), 29).toISOString(),
    };

    // ── Supabase platform queries (never touch connector) ─────────────────────
    const [tenantsRes, shopsRes, usersRes, subsRes, connectorsRes, newTenantsRes] =
      await Promise.all([
        admin
          .from('tenants')
          .select('id, name, slug, created_at, subscriptions(status, plans(code, name)), shops(id)')
          .order('created_at', { ascending: false })
          .limit(200),
        (() => {
          let q = admin.from('shops').select('*', { count: 'exact', head: true });
          if (tenantId) q = q.eq('tenant_id', tenantId);
          return q;
        })(),
        (() => {
          let q = admin.from('user_tenants').select('*', { count: 'exact', head: true });
          if (tenantId) q = q.eq('tenant_id', tenantId);
          return q;
        })(),
        admin.from('subscriptions').select('tenant_id, status, plans(code, name)').limit(500),
        admin.from('connectors').select('tenant_id, type, status').eq('status', 'active'),
        admin
          .from('tenants')
          .select('created_at')
          .gte('created_at', dates.last30Start)
          .order('created_at', { ascending: true })
          .limit(500),
      ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTenants    = (tenantsRes.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSubs       = (subsRes.data  ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allConnectors = (connectorsRes.data ?? []) as any[];

    const tenantsWithConnector = new Set<string>(allConnectors.map((c: any) => c.tenant_id));

    const tenantsToQuery = isSingleTenant
      ? allTenants.filter((t) => t.id === tenantId && tenantsWithConnector.has(t.id))
      : allTenants.filter((t) => tenantsWithConnector.has(t.id));

    // ── Connector queries — batched, timeout-guarded ───────────────────────────
    // SAFETY:
    //   Global mode  → COUNT only, no row fetch, concurrency=5, timeout=5s
    //   Single mode  → Full JS-side aggregation, max 5000 rows, timeout=10s

    const CONCURRENCY = 5;
    const TIMEOUT_MS  = isSingleTenant ? 10_000 : 5_000;

    const tenantStatsList: TenantStats[] = [];

    for (let i = 0; i < tenantsToQuery.length; i += CONCURRENCY) {
      const batch = tenantsToQuery.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (t) => {
          const work = async (): Promise<TenantStats> => {
            let connector: IDataConnector;
            try { connector = await getConnectorForTenant(t.id); }
            catch { return ZERO(t.id); }

            return isSingleTenant
              ? fetchSingleTenantStats(t.id, connector, dayKeys30, nowFake, nowFakeISO, dates)
              : fetchCountsOnly(t.id, connector, dates, nowFakeISO);
          };
          return withTimeout(work().catch(() => ZERO(t.id)), TIMEOUT_MS, ZERO(t.id));
        }),
      );
      tenantStatsList.push(...results);
    }

    const statsByTenant = new Map(tenantStatsList.map((s) => [s.tenantId, s]));

    const sum = (key: keyof TenantStats) =>
      tenantStatsList.reduce((acc, s) => acc + (typeof s[key] === 'number' ? (s[key] as number) : 0), 0);

    const connectorErrors = tenantStatsList.filter((s) => !s.ok).length;

    // ── Order trend ───────────────────────────────────────────────────────────
    // Single-tenant: pre-computed in fetchSingleTenantStats
    // Global: not shown (no row fetching)
    let orderTrend: { date: string; count: number }[] = dayKeys30.map((d) => ({ date: d, count: 0 }));
    if (isSingleTenant && tenantStatsList.length > 0) {
      orderTrend = tenantStatsList[0].orderTrend.length > 0
        ? tenantStatsList[0].orderTrend
        : dayKeys30.map((d) => ({ date: d, count: 0 }));
    }

    // ── New tenants trend (always from Supabase) ───────────────────────────────
    const newTenantsByDay: Record<string, number> = Object.fromEntries(dayKeys30.map((k) => [k, 0]));
    for (const t of (newTenantsRes.data ?? [])) {
      const k = dayKey(t.created_at);
      if (k in newTenantsByDay) newTenantsByDay[k]++;
    }
    const newTenantsTrend = dayKeys30.map((date) => ({ date, count: newTenantsByDay[date] }));

    // ── Top tenants ───────────────────────────────────────────────────────────
    const topTenants = tenantStatsList
      .filter((s) => s.ordersThisMonth > 0 || s.ordersLast7Days > 0)
      .sort((a, b) => b.ordersThisMonth - a.ordersThisMonth || b.ordersLast7Days - a.ordersLast7Days)
      .slice(0, 10)
      .map((s) => {
        const t = allTenants.find((x) => x.id === s.tenantId);
        return {
          id: s.tenantId, name: t?.name ?? s.tenantId, slug: t?.slug ?? '',
          ordersMonth: s.ordersThisMonth, ordersToday: s.ordersToday,
          products: s.productsTotal, customers: s.customersTotal,
        };
      });

    // ── Subscription breakdown ────────────────────────────────────────────────
    const subByStatus: Record<string, number> = {};
    const subByPlan:   Record<string, number> = {};
    for (const s of allSubs) {
      if (tenantId && s.tenant_id !== tenantId) continue;
      subByStatus[s.status] = (subByStatus[s.status] ?? 0) + 1;
      const planName = (s.plans as any)?.name ?? 'Unknown';
      subByPlan[planName] = (subByPlan[planName] ?? 0) + 1;
    }

    // ── Tenant list ───────────────────────────────────────────────────────────
    const tenantsForUI = allTenants.map((t) => {
      const sub       = Array.isArray(t.subscriptions) ? t.subscriptions[0] : t.subscriptions;
      const shopCount = Array.isArray(t.shops) ? t.shops.length : 0;
      const stats     = statsByTenant.get(t.id);
      return {
        id: t.id, name: t.name, slug: t.slug,
        plan:     (sub?.plans as any)?.name ?? null,
        planCode: (sub?.plans as any)?.code ?? null,
        status:   sub?.status ?? null,
        shopCount, createdAt: t.created_at,
        hasConnector:    tenantsWithConnector.has(t.id),
        connectorOk:     stats?.ok ?? false,
        ordersToday:     stats?.ordersToday     ?? 0,
        ordersThisMonth: stats?.ordersThisMonth ?? 0,
        productsTotal:   stats?.productsTotal   ?? 0,
        customersTotal:  stats?.customersTotal  ?? 0,
      };
    });

    return NextResponse.json({
      overview: {
        totalTenants:         allTenants.length,
        totalShops:           shopsRes.count   ?? 0,
        totalUsers:           usersRes.count   ?? 0,
        tenantsWithConnector: tenantsWithConnector.size,
        connectorErrors,
        totalOrders:          sum('ordersTotal'),
        ordersToday:          sum('ordersToday'),
        ordersYesterday:      sum('ordersYesterday'),
        ordersLast7Days:      sum('ordersLast7Days'),
        ordersThisMonth:      sum('ordersThisMonth'),
        ordersLastMonth:      sum('ordersLastMonth'),
        totalProducts:        sum('productsTotal'),
        totalCustomers:       sum('customersTotal'),
      },
      subscriptions: {
        byStatus: subByStatus,
        byPlan: Object.entries(subByPlan).sort((a, b) => b[1] - a[1]).map(([plan, count]) => ({ plan, count })),
      },
      topTenants,
      orderTrend,
      hasTrend:       isSingleTenant,
      newTenantsTrend,
      tenants:        tenantsForUI,
    });
  } catch (err) {
    console.error('[super/stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
