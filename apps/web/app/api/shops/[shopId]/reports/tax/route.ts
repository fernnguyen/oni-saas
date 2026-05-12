import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function buildTaxReport(orderItems: Row[], orders: Row[], period: { from: string; to: string }) {
  const fromMs = new Date(period.from).getTime()
  const toMs   = new Date(period.to).getTime() + 86_400_000 // inclusive end of day

  // Build order lookup for date + customer
  const orderMap = new Map<string, Row>()
  for (const o of orders) orderMap.set(o.order_id, o)

  const invoices: {
    order_id: string; order_no: string; date: string; customer_name: string;
    subtotal: number; tax_rate: number; tax_amount: number; total: number;
  }[] = []

  // Aggregate by order — one invoice row per order
  const byOrder = new Map<string, { tax: number; subtotal: number }>()

  for (const item of orderItems) {
    const order = orderMap.get(item.order_id)
    if (!order) continue
    const t = new Date(order.created_at || 0).getTime()
    if (t < fromMs || t > toMs) continue
    if (order.is_return === 'TRUE') continue

    const existing = byOrder.get(item.order_id) ?? { tax: 0, subtotal: 0 }
    existing.tax      += parseAmount(item.tax_amount)
    existing.subtotal += parseAmount(item.line_total) - parseAmount(item.tax_amount)
    byOrder.set(item.order_id, existing)
  }

  for (const [orderId, agg] of byOrder.entries()) {
    const order = orderMap.get(orderId)!
    invoices.push({
      order_id:      orderId,
      order_no:      order.order_no ?? '',
      date:          order.created_at?.slice(0, 10) ?? '',
      customer_name: order.customer_name ?? '',
      subtotal:      agg.subtotal,
      tax_rate:      agg.subtotal > 0 ? (agg.tax / agg.subtotal) * 100 : 0,
      tax_amount:    agg.tax,
      total:         agg.subtotal + agg.tax,
    })
  }

  invoices.sort((a, b) => a.date.localeCompare(b.date))

  const totalSubtotal  = invoices.reduce((s, i) => s + i.subtotal,   0)
  const totalTax       = invoices.reduce((s, i) => s + i.tax_amount, 0)
  const totalRevenue   = invoices.reduce((s, i) => s + i.total,      0)

  // Group by tax rate bucket
  const byRate: Record<string, { subtotal: number; tax: number }> = {}
  for (const inv of invoices) {
    const rate = String(Math.round(inv.tax_rate))
    if (!byRate[rate]) byRate[rate] = { subtotal: 0, tax: 0 }
    byRate[rate].subtotal += inv.subtotal
    byRate[rate].tax      += inv.tax_amount
  }

  return { invoices, totalSubtotal, totalTax, totalRevenue, byRate, period }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, userId } = await requireShopAccess(shopId, 'reports.view_shop')

    // ── plan_pro gate ────────────────────────────────────────────────────────
    const admin = getSupabaseAdminClient()
    const { data: shop } = await admin
      .from('shops_view')
      .select('tenant_id')
      .eq('id', shopId)
      .maybeSingle()

    if (shop) {
      const { data: sub } = await admin
        .from('subscriptions')
        .select('plans(code)')
        .eq('tenant_id', shop.tenant_id)
        .eq('status', 'active')
        .maybeSingle()

      const planCode = sub?.plans
        ? (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans as { code: string }).code
        : ''

      if (planCode !== 'plan_pro' && planCode !== 'plan_enterprise') {
        return NextResponse.json(
          { error: 'Tính năng báo cáo thuế chỉ dành cho gói Pro trở lên.', upgrade: true },
          { status: 403 }
        )
      }
    }

    const sp = req.nextUrl.searchParams
    const now  = new Date()
    const from = sp.get('from') ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const to   = sp.get('to')   ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const result = await shopCache(
      async () => {
        const [itemsResult, ordersResult] = await Promise.all([
          connector.list('order-items', { limit: 5000 }),
          connector.list('orders',      { limit: 5000 }),
        ])
        return buildTaxReport(itemsResult.data, ordersResult.data, { from, to })
      },
      ['reports-tax', shopId, from, to],
      { tags: [shopTag(shopId, 'orders')], revalidate: 300 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/tax')
  }
}
