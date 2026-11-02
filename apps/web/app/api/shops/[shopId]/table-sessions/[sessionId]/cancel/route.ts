import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { cancelTableSession, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../../_respond'

// POST /api/shops/:shopId/table-sessions/:sessionId/cancel – only when the session holds nothing
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string; sessionId: string }> }) {
  try {
    const { shopId, sessionId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.create')
    const txConnector = await requireTableSyncV2(shopId, connector)
    const body = await req.json().catch(() => ({}))
    return NextResponse.json(await cancelTableSession(txConnector, shopId, sessionId, body || {}))
  } catch (e) {
    return tableSyncErrorResponse(e, 'POST table-sessions/cancel')
  }
}
