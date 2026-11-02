import { NextRequest, NextResponse } from 'next/server'
import type { IDataConnector } from '@oni/adapters'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { listAllConnectorRows } from '@/lib/server/listAllConnectorRows'
import { ReportBusyError, runReport } from '@/lib/server/reports/reportGuard'
import { isPgDataError, queryOrderDays, queryProcessedReturns, withReportTx } from '@/lib/server/reports/pgReportQueries'
import { assembleOrderStats, orderDaysFromRows, processedReturnsFromRows, vnDays } from '@/lib/server/reports/salesSummary'
import { handleApiError } from '../../../_helpers'

const CACHE_TTL_MS = 30_000

async function computeStats(connector: IDataConnector) {
  const days = vnDays()
  const since = days.weekStart < days.monthStart ? days.weekStart : days.monthStart

  try {
    const sql = await withReportTx(connector, async (tx) => ({
      buckets: await queryOrderDays(tx, since),
      returns: await queryProcessedReturns(tx, days.monthStart),
    }))
    if (sql) return assembleOrderStats(sql.buckets, sql.returns, days)
  } catch (e) {
    if (!isPgDataError(e)) throw e
    console.error('[orders/stats] SQL aggregate failed on bad data, using row fallback', e)
  }

  // Non-Postgres connectors: read every page (a fixed limit silently drops the newest orders)
  const [orders, returns] = await Promise.all([
    listAllConnectorRows(connector, 'orders', { sortBy: 'created_at' }),
    listAllConnectorRows(connector, 'returns').catch(() => []),
  ])
  return assembleOrderStats(orderDaysFromRows(orders, since), processedReturnsFromRows(returns, days.monthStart), days)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')
    const fresh = req.nextUrl.searchParams.get('fresh') === '1'

    const result = await runReport(`orders-stats:${shopId}`, { ttlMs: CACHE_TTL_MS, fresh }, () => computeStats(connector))
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof ReportBusyError) return NextResponse.json({ error: e.message }, { status: e.status })
    return handleApiError(e, 'GET orders/stats')
  }
}
