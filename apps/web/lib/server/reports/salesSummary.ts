import { getVerticalConfig, isTimeChargeProduct, normalizePaymentMethod } from '@oni/core'

// Sales summaries for orders/stats and reports/overview.
//
// Both endpoints are built from small aggregates (per-day buckets, per-product
// groups, …). On Postgres the aggregates come from SQL (pgReportQueries.ts);
// on other connectors they are computed here from raw rows. The assemble*
// functions are shared, so both paths return the same response shape.

export type Row = Record<string, string>

export interface DayBucket { day: string; isReturn: boolean; count: number; revenue: number; debt: number }
export interface ProductGroup { productId: string; productName: string; revenue: number; qty: number }
export interface MethodAmount { method: string; amount: number }
export interface ReturnsTotal { count: number; refund: number }
export interface ResourceGroup {
  key: string
  name: string
  count: number
  revenue: number
  todayCount: number
  todayRevenue: number
  monthCount: number
  monthRevenue: number
}

/** Calendar days in Vietnam (UTC+7) as 'YYYY-MM-DD'. */
export interface VnDays { today: string; yesterday: string; weekStart: string; monthStart: string; seriesStart: string }

const DAY_MS = 86_400_000
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

export function vnDays(now = new Date()): VnDays {
  const local = new Date(now.getTime() + VN_OFFSET_MS)
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const monthStart = fmt(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1))
  const day30 = fmt(base - 29 * DAY_MS)
  return {
    today: fmt(base),
    yesterday: fmt(base - DAY_MS),
    weekStart: fmt(base - 6 * DAY_MS),
    monthStart,
    seriesStart: monthStart < day30 ? monthStart : day30,
  }
}

/** 'YYYY-MM-DD' in Vietnam for a stored timestamp, '' when unparseable. */
export function vnDayOf(value: string | undefined): string {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return ''
  return new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10)
}

export function parseAmount(v: string | undefined | null) {
  return parseFloat(v ?? '0') || 0
}

// ── Aggregates from raw rows (non-Postgres connectors) ───────────────────────

export function orderDaysFromRows(orders: Row[], since: string): DayBucket[] {
  const buckets = new Map<string, DayBucket>()
  for (const o of orders) {
    const day = vnDayOf(o.created_at)
    if (!day || day < since) continue
    const isReturn = o.is_return === 'TRUE'
    const key = `${day}|${isReturn}`
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { day, isReturn, count: 0, revenue: 0, debt: 0 }))
    b.count++
    b.revenue += parseAmount(o.total_amount)
    b.debt += parseAmount(o.debt_amount)
  }
  return [...buckets.values()]
}

export function processedReturnsFromRows(returns: Row[], since: string): ReturnsTotal {
  let count = 0
  let refund = 0
  for (const r of returns) {
    if (r.status !== 'processed') continue
    if (vnDayOf(r.processed_at || r.created_at) < since) continue
    count++
    refund += parseAmount(r.total_refund)
  }
  return { count, refund }
}

export function statusBreakdownFromRows(orders: Row[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const o of orders) {
    const s = o.status || 'unknown'
    out[s] = (out[s] ?? 0) + 1
  }
  return out
}

export function productGroupsFromRows(items: Row[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>()
  for (const item of items) {
    if (!item.product_id) continue
    const key = `${item.product_id}|${item.product_name ?? ''}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { productId: item.product_id, productName: item.product_name ?? '', revenue: 0, qty: 0 }))
    g.revenue += parseAmount(item.line_total)
    g.qty += parseAmount(item.qty)
  }
  return [...groups.values()]
}

/** Payment amounts by raw method, counted on paid_at (else the order's or the payment's created_at). */
export function paymentMethodsFromRows(payments: Row[], orders: Row[], since: string): MethodAmount[] {
  const orderDate = new Map(orders.map((o) => [o.order_id || o.id, o.created_at]))
  const out = new Map<string, number>()
  for (const p of payments) {
    if (!p.method && !p.amount) continue
    if (vnDayOf(p.paid_at || orderDate.get(p.order_id) || p.created_at) < since) continue
    const method = p.method || ''
    out.set(method, (out.get(method) ?? 0) + parseAmount(p.amount))
  }
  return [...out].map(([method, amount]) => ({ method, amount }))
}

/** Fallback when a shop records no payments: order paid amounts by payment_method. */
export function orderPaymentMethodsFromRows(orders: Row[], since: string): MethodAmount[] {
  const out = new Map<string, number>()
  for (const o of orders) {
    if (o.is_return === 'TRUE') continue
    if (vnDayOf(o.created_at) < since) continue
    const method = o.payment_method || 'cash'
    out.set(method, (out.get(method) ?? 0) + parseAmount(o.paid_amount ?? o.total_amount))
  }
  return [...out].map(([method, amount]) => ({ method, amount }))
}

export function resourceGroupsFromRows(orders: Row[], days: VnDays): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>()
  for (const o of orders) {
    if (o.is_return === 'TRUE') continue
    let resourceName = ''
    let resourceId = o.resource_id || ''
    if (o.metadata) {
      try {
        const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : o.metadata
        if (meta?.resource_name) resourceName = String(meta.resource_name)
        if (meta?.resource_id) resourceId = String(meta.resource_id)
      } catch {
        // ignore malformed metadata
      }
    }
    const key = resourceId || resourceName
    if (!key || key.toLowerCase().startsWith('takeaway')) continue

    let g = groups.get(key)
    if (!g) {
      groups.set(key, (g = { key, name: '', count: 0, revenue: 0, todayCount: 0, todayRevenue: 0, monthCount: 0, monthRevenue: 0 }))
    }
    if (resourceName > g.name) g.name = resourceName
    const revenue = parseAmount(o.total_amount)
    const day = vnDayOf(o.created_at)
    g.count++
    g.revenue += revenue
    if (day >= days.today) { g.todayCount++; g.todayRevenue += revenue }
    if (day >= days.monthStart) { g.monthCount++; g.monthRevenue += revenue }
  }
  return [...groups.values()]
}

// ── Assembly (shared by both paths) ──────────────────────────────────────────

export interface StatPeriod { count: number; revenue: number; debt: number }

/** orders/stats: every order counts (any status), returns = processed refunds this month. */
export function assembleOrderStats(buckets: DayBucket[], returns: ReturnsTotal, days: VnDays) {
  const empty = (): StatPeriod => ({ count: 0, revenue: 0, debt: 0 })
  const today = empty(), yesterday = empty(), week = empty(), month = empty()
  const add = (p: StatPeriod, b: DayBucket) => { p.count += b.count; p.revenue += b.revenue; p.debt += b.debt }

  for (const b of buckets) {
    if (b.day >= days.today) add(today, b)
    else if (b.day === days.yesterday) add(yesterday, b)
    if (b.day >= days.weekStart) add(week, b)
    if (b.day >= days.monthStart) add(month, b)
  }

  return {
    today,
    yesterday,
    week,
    month,
    returns: { count: returns.count, revenue: returns.refund, debt: 0 },
  }
}

export interface OverviewInputs {
  buckets: DayBucket[]
  returns: ReturnsTotal
  statusBreakdown: Record<string, number>
  productGroups: ProductGroup[]
  paymentMethods: MethodAmount[]
  orderPaymentMethods: MethodAmount[]
  resourceGroups: ResourceGroup[]
}

export function assembleOverview(input: OverviewInputs, resources: Row[], industryType: string, days: VnDays) {
  const sales = input.buckets.filter((b) => !b.isReturn)

  // ── Revenue by day: full current month and the last 30 days ──
  const revenueByDay: Record<string, number> = {}
  for (let d = days.seriesStart; d <= days.today; d = nextDay(d)) revenueByDay[d] = 0
  for (const b of sales) if (b.day in revenueByDay) revenueByDay[b.day] += b.revenue
  const revenueSeries = Object.entries(revenueByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }))

  // ── KPIs ──
  const sum = (from: string) => sales
    .filter((b) => b.day >= from)
    .reduce((acc, b) => ({ orders: acc.orders + b.count, revenue: acc.revenue + b.revenue, debt: acc.debt + b.debt }), { orders: 0, revenue: 0, debt: 0 })
  const kpi = {
    today: sum(days.today),
    month: sum(days.monthStart),
    returns: { count: input.returns.count, refund: input.returns.refund },
  }

  // ── Top products by revenue (excluding room/hour charges) ──
  const products = new Map<string, { name: string; revenue: number; qty: number }>()
  for (const g of input.productGroups) {
    if (isTimeChargeProduct(g.productId, g.productName)) continue
    const p = products.get(g.productId) ?? { name: '', revenue: 0, qty: 0 }
    if (g.productName > p.name) p.name = g.productName
    p.revenue += g.revenue
    p.qty += g.qty
    products.set(g.productId, p)
  }
  const topProducts = [...products]
    .map(([id, v]) => ({ id, name: v.name || id, revenue: v.revenue, qty: v.qty }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.id.localeCompare(b.id))
    .slice(0, 10)

  // ── Payment method breakdown (this month) ──
  const byMethod = (rows: MethodAmount[], fallback: string) => {
    const out: Record<string, number> = {}
    for (const r of rows) {
      const m = normalizePaymentMethod(r.method || fallback)
      out[m] = (out[m] ?? 0) + r.amount
    }
    return out
  }
  let paymentRevenue = byMethod(input.paymentMethods, 'unknown')
  if (Object.keys(paymentRevenue).length === 0) paymentRevenue = byMethod(input.orderPaymentMethods, 'cash')

  // ── Rooms / tables ──
  const resourceMap = new Map(resources.map((r) => [r.id, r.name]))
  const nameOf = (g: ResourceGroup) => g.name || resourceMap.get(g.key) || g.key
  const topResources = [...input.resourceGroups]
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.key.localeCompare(b.key))
    .slice(0, 10)
    .map((g) => ({ id: g.key, name: nameOf(g), count: g.count, revenue: g.revenue }))

  const best = (count: (g: ResourceGroup) => number, revenue: (g: ResourceGroup) => number) => {
    const top = input.resourceGroups
      .filter((g) => count(g) > 0)
      .sort((a, b) => revenue(b) - revenue(a) || a.key.localeCompare(b.key))[0]
    return top ? { id: top.key, name: nameOf(top), revenue: revenue(top), count: count(top) } : null
  }

  const config = getVerticalConfig(industryType)
  const occupied = resources.filter((r) => r.status === 'occupied')
  const resourceStats = {
    enabled: config.features.location_resource,
    resourceLabel: config.resourceLabel ?? 'Phòng/Bàn',
    totalResources: resources.length,
    activeResources: occupied.length,
    occupancyRate: resources.length > 0 ? (occupied.length / resources.length) * 100 : 0,
    mostProductiveToday: best((g) => g.todayCount, (g) => g.todayRevenue),
    mostProductiveMonth: best((g) => g.monthCount, (g) => g.monthRevenue),
    activeResourcesList: occupied.map((r) => ({ id: r.id, name: r.name, zone: r.zone })),
  }

  return {
    kpi,
    revenueSeries,
    topProducts,
    statusBreakdown: input.statusBreakdown,
    paymentRevenue,
    topResources,
    resourceStats,
  }
}

function nextDay(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}
