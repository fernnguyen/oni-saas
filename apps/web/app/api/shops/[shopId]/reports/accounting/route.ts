import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function buildAccounting(orders: Row[], returns: Row[], payments: Row[]) {
  const now        = new Date()
  const months: Record<string, { revenue: number; refund: number; debt: number; orders: number }> = {}

  // Build last 12 months keys
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months[k] = { revenue: 0, refund: 0, debt: 0, orders: 0 }
  }

  for (const o of orders) {
    if (o.is_return === 'TRUE') continue
    const d = new Date(o.created_at || 0)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!(k in months)) continue
    months[k].revenue += parseAmount(o.total_amount)
    months[k].debt    += parseAmount(o.debt_amount)
    months[k].orders  += 1
  }

  for (const r of returns) {
    const d = new Date(r.created_at || 0)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!(k in months)) continue
    months[k].refund += parseAmount(r.total_refund)
  }

  const monthlySeries = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.revenue - v.refund }))

  // ── Payment method breakdown (all time) ──────────────────────────────────
  const paymentBreakdown: Record<string, number> = {}
  for (const p of payments) {
    const method = p.method || 'unknown'
    paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + parseAmount(p.amount)
  }

  // ── Outstanding debt (orders where debt_amount > 0) ──────────────────────
  const debtOrders = orders
    .filter((o) => parseAmount(o.debt_amount) > 0 && o.status !== 'cancelled')
    .map((o) => ({
      order_id:      o.order_id,
      order_no:      o.order_no,
      customer_name: o.customer_name,
      total_amount:  o.total_amount,
      debt_amount:   o.debt_amount,
      created_at:    o.created_at,
    }))
    .sort((a, b) => parseAmount(b.debt_amount) - parseAmount(a.debt_amount))
    .slice(0, 50)

  const totalDebt = debtOrders.reduce((s, o) => s + parseAmount(o.debt_amount), 0)

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalRevenue = orders
    .filter((o) => o.is_return !== 'TRUE')
    .reduce((s, o) => s + parseAmount(o.total_amount), 0)
  const totalRefund  = returns.reduce((s, r) => s + parseAmount(r.total_refund), 0)
  const totalNet     = totalRevenue - totalRefund

  return { monthlySeries, paymentBreakdown, debtOrders, totalDebt, totalRevenue, totalRefund, totalNet }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const result = await shopCache(
      async () => {
        const [ordersResult, returnsResult, paymentsResult] = await Promise.all([
          connector.list('orders',   { limit: 5000 }),
          // Tab Returns may not exist yet — fall back to empty gracefully
          connector.list('returns',  { limit: 2000 }).catch(() => ({ data: [], total: 0 })),
          connector.list('payments', { limit: 5000 }),
        ])
        return buildAccounting(ordersResult.data, returnsResult.data, paymentsResult.data)
      },
      ['reports-accounting', shopId],
      { tags: [shopTag(shopId, 'orders'), shopTag(shopId, 'returns')], revalidate: 300 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/accounting')
  }
}
