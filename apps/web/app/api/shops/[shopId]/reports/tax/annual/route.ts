import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { shopTag, shopCache } from '@/lib/server/cache'
import { listAllConnectorRows } from '@/lib/server/listAllConnectorRows'
import { handleApiError } from '../../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function parseDateInVietnam(value: string | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return new Date(time + 7 * 60 * 60 * 1_000)
}

function orderTaxDate(order: Row) {
  return order.channel === 'manual'
    ? order.created_at
    : order.updated_at || order.created_at
}

function buildAnnualTaxReport(orders: Row[], returns: Row[], year: number) {
  const monthlyRevenue: Record<string, number> = {}
  for (let i = 1; i <= 12; i++) {
    monthlyRevenue[i.toString()] = 0
  }

  let yearToDateRevenue = 0

  for (const o of orders) {
    if (o.status !== 'completed' || o.is_return === 'TRUE') continue

    const date = parseDateInVietnam(orderTaxDate(o))
    if (!date || date.getUTCFullYear() !== year) continue

    const month = (date.getUTCMonth() + 1).toString()
    const total = parseAmount(o.total_amount)

    monthlyRevenue[month] += total
    yearToDateRevenue += total
  }

  let totalReturns = 0
  for (const item of returns) {
    if (item.status !== 'completed' && item.status !== 'approved') continue
    const date = parseDateInVietnam(item.processed_at || item.created_at)
    if (!date || date.getUTCFullYear() !== year) continue

    const month = (date.getUTCMonth() + 1).toString()
    const refund = parseAmount(item.total_refund)
    monthlyRevenue[month] -= refund
    yearToDateRevenue -= refund
    totalReturns += refund
  }

  return {
    year,
    monthlyRevenue,
    yearToDateRevenue: Math.max(0, yearToDateRevenue),
    totalReturns,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'reports.view_shop')

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
    const year = parseInt(sp.get('year') ?? new Date().getFullYear().toString(), 10)

    const result = await shopCache(
      async () => {
        const [orders, returns] = await Promise.all([
          listAllConnectorRows(connector, 'orders'),
          listAllConnectorRows(connector, 'returns').catch(() => []),
        ])
        return buildAnnualTaxReport(orders, returns, year)
      },
      ['reports-tax-annual', shopId, year.toString()],
      { tags: [shopTag(shopId, 'orders')], revalidate: 300 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/tax/annual')
  }
}
