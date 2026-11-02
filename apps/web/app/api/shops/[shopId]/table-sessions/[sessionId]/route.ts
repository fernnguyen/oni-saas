import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getTableSessionSnapshot, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../_respond'

// GET /api/shops/:shopId/table-sessions/:sessionId – session + order + active items + cursor
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string; sessionId: string }> }) {
  try {
    const { shopId, sessionId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')
    const txConnector = await requireTableSyncV2(shopId, connector)
    return NextResponse.json(await getTableSessionSnapshot(txConnector, shopId, sessionId))
  } catch (e) {
    return tableSyncErrorResponse(e, 'GET table-sessions/:id')
  }
}
