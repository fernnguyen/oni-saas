import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

// ── Pure aggregation — works on any connector's raw rows ─────────────────────

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function dayKey(isoDate: string) {
  // Returns 'YYYY-MM-DD' for grouping
  try { return isoDate.slice(0, 10) } catch { return '' }
}

function buildOverview(orders: Row[], returns: Row[], orderItems: Row[], payments: Row[]) {
  const now     = new Date()
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day30   = todayMs - 29 * 86_400_000

  // ── Revenue by day (last 30 days) ────────────────────────────────────────
  const revenueByDay: Record<string, number> = {}
  for (let d = 0; d < 30; d++) {
    const k = new Date(todayMs - d * 86_400_000).toISOString().slice(0, 10)
    revenueByDay[k] = 0
  }

  for (const o of orders) {
    if (o.is_return === 'TRUE') continue
    const t = new Date(o.created_at || 0).getTime()
    if (t < day30) continue
    const k = dayKey(o.created_at)
    if (k in revenueByDay) revenueByDay[k] += parseAmount(o.paid_amount ?? o.total_amount)
  }

  const revenueSeries = Object.entries(revenueByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }))

  // ── Top products by revenue ───────────────────────────────────────────────
  const productRevenue: Record<string, { name: string; revenue: number; qty: number }> = {}
  for (const item of orderItems) {
    const pid = item.product_id
    if (!pid) continue
    if (!productRevenue[pid]) {
      productRevenue[pid] = { name: item.product_name || pid, revenue: 0, qty: 0 }
    }
    productRevenue[pid].revenue += parseAmount(item.line_total)
    productRevenue[pid].qty     += parseAmount(item.qty)
  }
  const topProducts = Object.entries(productRevenue)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // ── Order status breakdown ────────────────────────────────────────────────
  const statusBreakdown: Record<string, number> = {}
  for (const o of orders) {
    const s = o.status || 'unknown'
    statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1
  }

  // ── Payment method breakdown (from payments, this month) ───────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const paymentRevenue: Record<string, number> = {}

  if (payments && payments.length > 0) {
    const orderDateMap = new Map(orders.map(o => [o.order_id, o.created_at]))
    
    for (const p of payments) {
      if (!p.method && !p.amount) continue;
      const orderDate = orderDateMap.get(p.order_id)
      const t = new Date(p.created_at || p.paid_at || orderDate || 0).getTime()
      if (t < monthStart) continue
      const method = p.method || 'unknown'
      paymentRevenue[method] = (paymentRevenue[method] ?? 0) + parseAmount(p.amount)
    }
  } 
  
  if (Object.keys(paymentRevenue).length === 0) {
    for (const o of orders) {
      const t = new Date(o.created_at || 0).getTime()
      if (t < monthStart || o.is_return === 'TRUE') continue
      const method = o.payment_method || 'cash'
      paymentRevenue[method] = (paymentRevenue[method] ?? 0) + parseAmount(o.paid_amount ?? o.total_amount)
    }
  }

  // ── Returns summary ───────────────────────────────────────────────────────
  const returnCount   = returns.length
  const returnRevenue = returns.reduce((s, r) => s + parseAmount(r.total_refund), 0)

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const salesOrders = orders.filter((o) => o.is_return !== 'TRUE')
  const todayOrders = salesOrders.filter((o) => new Date(o.created_at || 0).getTime() >= todayMs)
  const monthOrders = salesOrders.filter((o) => new Date(o.created_at || 0).getTime() >= monthStart)

  const kpi = {
    today: {
      orders:  todayOrders.length,
      revenue: todayOrders.reduce((s, o) => s + parseAmount(o.paid_amount ?? o.total_amount), 0),
    },
    month: {
      orders:  monthOrders.length,
      revenue: monthOrders.reduce((s, o) => s + parseAmount(o.paid_amount ?? o.total_amount), 0),
    },
    returns: { count: returnCount, refund: returnRevenue },
  }

  return { kpi, revenueSeries, topProducts, statusBreakdown, paymentRevenue }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const result = await shopCache(
      async () => {
        const [ordersResult, returnsResult, itemsResult, paymentsResult] = await Promise.all([
          connector.list('orders',      { limit: 5000 }),
          // Tab Returns may not exist yet — fall back to empty gracefully
          connector.list('returns',     { limit: 1000 }).catch(() => ({ data: [], total: 0 })),
          connector.list('order-items', { limit: 5000 }),
          connector.list('payments',    { limit: 5000 }).catch(() => ({ data: [], total: 0 })),
        ])
        return buildOverview(ordersResult.data, returnsResult.data, itemsResult.data, paymentsResult.data)
      },
      ['reports-overview', shopId],
      { tags: [shopTag(shopId, 'orders'), shopTag(shopId, 'returns')], revalidate: 120 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/overview')
  }
}
