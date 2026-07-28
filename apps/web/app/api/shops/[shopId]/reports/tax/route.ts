import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { shopTag, shopCache } from '@/lib/server/cache'
import { listAllConnectorRows } from '@/lib/server/listAllConnectorRows'
import { asTaxPeriodType, getTaxPeriodRange } from '@/lib/taxReporting'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function orderTaxDate(order: Row) {
  return order.channel === 'manual'
    ? order.created_at
    : order.updated_at || order.created_at
}

function dateKeyInVietnam(value: string | undefined) {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  return new Date(time + 7 * 60 * 60 * 1_000).toISOString().slice(0, 10)
}

function buildTaxReport(
  orderItems: Row[],
  orders: Row[],
  returns: Row[],
  period: { from: string; to: string }
) {
  const vietnamOffset = 7 * 60 * 60 * 1_000
  const fromMs = new Date(`${period.from}T00:00:00Z`).getTime() - vietnamOffset
  const toMs = new Date(`${period.to}T23:59:59.999Z`).getTime() - vietnamOffset

  // Build order lookup for date + customer
  const orderMap = new Map<string, Row>()
  for (const o of orders) orderMap.set(o.order_id || o.id, o)

  const invoices: {
    order_id: string; order_no: string; date: string; customer_name: string;
    subtotal: number; tax_rate: number; tax_amount: number; total: number;
  }[] = []

  // Aggregate by order — one invoice row per order
  const byOrder = new Map<string, { tax: number; subtotal: number }>()

  for (const item of orderItems) {
    const order = orderMap.get(item.order_id)
    if (!order) continue
    const t = new Date(orderTaxDate(order) || 0).getTime()
    if (t < fromMs || t > toMs) continue
    if (order.status !== 'completed' || order.is_return === 'TRUE') continue

    const orderId = order.order_id || order.id
    const existing = byOrder.get(orderId) ?? { tax: 0, subtotal: 0 }
    existing.tax      += parseAmount(item.tax_amount)
    existing.subtotal += parseAmount(item.line_total) - parseAmount(item.tax_amount)
    byOrder.set(orderId, existing)
  }

  for (const order of orders) {
    const orderId = order.order_id || order.id
    const t = new Date(orderTaxDate(order) || 0).getTime()
    if (
      !orderId ||
      t < fromMs ||
      t > toMs ||
      order.status !== 'completed' ||
      order.is_return === 'TRUE'
    ) {
      continue
    }

    const agg = byOrder.get(orderId) ?? { tax: 0, subtotal: 0 }
    const total = parseAmount(order.total_amount)
    const tax = Math.min(agg.tax, total)
    invoices.push({
      order_id:      orderId,
      order_no:      order.order_no ?? '',
      date:          dateKeyInVietnam(orderTaxDate(order)),
      customer_name: order.customer_name ?? '',
      subtotal:      Math.max(0, total - tax),
      tax_rate:      total - tax > 0 ? (tax / (total - tax)) * 100 : 0,
      tax_amount:    tax,
      total,
    })
  }

  let totalReturns = 0
  for (const item of returns) {
    if (item.status !== 'completed' && item.status !== 'approved') continue
    const dateValue = item.processed_at || item.created_at
    const t = new Date(dateValue || 0).getTime()
    if (t < fromMs || t > toMs) continue

    const refund = parseAmount(item.total_refund)
    if (refund <= 0) continue
    totalReturns += refund
    invoices.push({
      order_id: item.return_id || `return-${invoices.length + 1}`,
      order_no: item.return_no || '',
      date: dateKeyInVietnam(dateValue),
      customer_name: item.customer_name || '',
      subtotal: -refund,
      tax_rate: 0,
      tax_amount: 0,
      total: -refund,
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

  return { invoices, totalSubtotal, totalTax, totalRevenue, totalReturns, byRate, period }
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
    const now = new Date()
    const anchor = sp.get('anchor') ?? now.toISOString().slice(0, 10)
    const { data: taxSettings } = await admin
      .from('shop_settings')
      .select('tax_period_type')
      .eq('shop_id', shopId)
      .maybeSingle()
    const periodType = asTaxPeriodType(
      taxSettings?.tax_period_type ?? sp.get('periodType')
    )
    const period = getTaxPeriodRange(periodType, anchor)
    const from = period.from
    const to = period.to

    const result = await shopCache(
      async () => {
        const [orderItems, orders, returns] = await Promise.all([
          listAllConnectorRows(connector, 'order-items'),
          listAllConnectorRows(connector, 'orders'),
          listAllConnectorRows(connector, 'returns').catch(() => []),
        ])
        return buildTaxReport(orderItems, orders, returns, period)
      },
      ['reports-tax', shopId, periodType, from, to],
      { tags: [shopTag(shopId, 'orders')], revalidate: 300 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/tax')
  }
}
