import { NextRequest, NextResponse } from 'next/server'
import type { IDataConnector } from '@oni/adapters'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { listAllConnectorRows } from '@/lib/server/listAllConnectorRows'
import { ReportBusyError, runReport } from '@/lib/server/reports/reportGuard'
import {
  isPgDataError,
  queryOrderDays,
  queryOrderPaymentMethods,
  queryPaymentMethods,
  queryProcessedReturns,
  queryProductGroups,
  queryResourceGroups,
  queryStatusBreakdown,
  withReportTx,
} from '@/lib/server/reports/pgReportQueries'
import {
  assembleOverview,
  orderDaysFromRows,
  orderPaymentMethodsFromRows,
  paymentMethodsFromRows,
  processedReturnsFromRows,
  productGroupsFromRows,
  resourceGroupsFromRows,
  statusBreakdownFromRows,
  vnDays,
  type OverviewInputs,
  type VnDays,
} from '@/lib/server/reports/salesSummary'
import { handleApiError } from '../../../_helpers'

const CACHE_TTL_MS = 30_000

async function overviewInputs(connector: IDataConnector, days: VnDays): Promise<OverviewInputs> {
  try {
    const sql = await withReportTx(connector, async (tx) => ({
      buckets: await queryOrderDays(tx, days.seriesStart),
      returns: await queryProcessedReturns(tx, days.monthStart),
      statusBreakdown: await queryStatusBreakdown(tx),
      productGroups: await queryProductGroups(tx),
      paymentMethods: await queryPaymentMethods(tx, days.monthStart),
      orderPaymentMethods: await queryOrderPaymentMethods(tx, days.monthStart),
      resourceGroups: await queryResourceGroups(tx, days),
    }))
    if (sql) return sql
  } catch (e) {
    if (!isPgDataError(e)) throw e
    console.error('[reports/overview] SQL aggregate failed on bad data, using row fallback', e)
  }

  // Non-Postgres connectors: read every page (a fixed limit silently drops the newest rows)
  const [orders, returns, items, payments] = await Promise.all([
    listAllConnectorRows(connector, 'orders', { sortBy: 'created_at' }),
    // Tab Returns may not exist yet — fall back to empty gracefully
    listAllConnectorRows(connector, 'returns').catch(() => []),
    listAllConnectorRows(connector, 'order-items', { sortBy: 'created_at' }),
    listAllConnectorRows(connector, 'payments', { sortBy: 'created_at' }).catch(() => []),
  ])
  return {
    buckets: orderDaysFromRows(orders, days.seriesStart),
    returns: processedReturnsFromRows(returns, days.monthStart),
    statusBreakdown: statusBreakdownFromRows(orders),
    productGroups: productGroupsFromRows(items),
    paymentMethods: paymentMethodsFromRows(payments, orders, days.monthStart),
    orderPaymentMethods: orderPaymentMethodsFromRows(orders, days.monthStart),
    resourceGroups: resourceGroupsFromRows(orders, days),
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { shop, connector } = await requireShopAccess(shopId, 'reports.view_shop')
    const industryType = shop?.industry_type ?? 'retail'
    const fresh = req.nextUrl.searchParams.get('fresh') === '1'

    const result = await runReport(`reports-overview:${shopId}:${industryType}`, { ttlMs: CACHE_TTL_MS, fresh }, async () => {
      const days = vnDays()
      // Sequential on purpose: each guarded job holds at most one pool connection
      const inputs = await overviewInputs(connector, days)
      const resources = await listAllConnectorRows(connector, 'location-resources').catch(() => [])
      return assembleOverview(inputs, resources, industryType, days)
    })

    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof ReportBusyError) return NextResponse.json({ error: e.message }, { status: e.status })
    return handleApiError(e, 'GET reports/overview')
  }
}
