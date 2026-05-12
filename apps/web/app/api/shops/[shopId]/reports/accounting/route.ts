import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function buildAccounting(orders: Row[], returns: Row[], payments: Row[], customers: Row[]) {
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
    months[k].revenue += parseAmount(o.paid_amount ?? o.total_amount)
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
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v, net: v.revenue - v.refund }))

  // ── Payment method breakdown (all time) ──────────────────────────────────
  const paymentBreakdown: Record<string, number> = {}
  for (const p of payments) {
    const method = p.method || 'unknown'
    paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + parseAmount(p.amount)
  }

  // ── Outstanding debt (customers where debt_amount > 0) ──────────────────────
  const debtCustomers = customers
    .filter((c) => parseAmount(c.debt_amount) > 0)
    .map((c) => ({
      customer_id:   c.customer_id,
      customer_name: c.name,
      phone:         c.phone,
      debt_amount:   c.debt_amount,
    }))
    .sort((a, b) => parseAmount(b.debt_amount) - parseAmount(a.debt_amount))
    .slice(0, 50)

  const totalDebt = customers.reduce((s, c) => s + parseAmount(c.debt_amount), 0)

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalRevenue = orders
    .filter((o) => o.is_return !== 'TRUE')
    .reduce((s, o) => s + parseAmount(o.total_amount), 0)
  const totalRefund  = returns.reduce((s, r) => s + parseAmount(r.total_refund), 0)
  const totalNet     = totalRevenue - totalRefund

  return { monthlySeries, paymentBreakdown, debtCustomers, totalDebt, totalRevenue, totalRefund, totalNet }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'reports.view_shop')

    const result = await shopCache(
      async () => {
        const [ordersResult, returnsResult, paymentsResult, customersResult] = await Promise.all([
          connector.list('orders',   { limit: 5000 }),
          // Tab Returns may not exist yet — fall back to empty gracefully
          connector.list('returns',  { limit: 2000 }).catch(() => ({ data: [], total: 0 })),
          connector.list('payments', { limit: 5000 }),
          connector.list('customers', { limit: 5000 }),
        ])
        return buildAccounting(ordersResult.data, returnsResult.data, paymentsResult.data, customersResult.data)
      },
      ['reports-accounting', shopId],
      { tags: [shopTag(shopId, 'orders'), shopTag(shopId, 'returns')], revalidate: 300 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/accounting')
  }
}
