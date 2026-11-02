import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getTableSyncChanges, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../_respond'

// GET /api/shops/:shopId/table-sessions/changes?since=<seq>&limit=<n> – change feed for catch-up
export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')
    const txConnector = await requireTableSyncV2(shopId, connector)
    const since = Number(req.nextUrl.searchParams.get('since') || 0)
    const limit = Number(req.nextUrl.searchParams.get('limit') || 500)
    return NextResponse.json(await getTableSyncChanges(txConnector, shopId, since, limit))
  } catch (e) {
    return tableSyncErrorResponse(e, 'GET table-sessions/changes')
  }
}
