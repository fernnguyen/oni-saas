import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenActorOf } from '@/lib/server/kitchen/actor'
import { cancelTableSession, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../../_respond'

// POST /api/shops/:shopId/table-sessions/:sessionId/cancel – only when the session holds nothing
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string; sessionId: string }> }) {
  try {
    const { shopId, sessionId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.create')
    const txConnector = await requireTableSyncV2(shopId, connector)
    const body = await req.json().catch(() => ({}))
    // actor comes from the session, never from the body
    return NextResponse.json(await cancelTableSession(txConnector, shopId, sessionId, body || {}, { actor: kitchenActorOf(user) }))
  } catch (e) {
    return tableSyncErrorResponse(e, 'POST table-sessions/cancel')
  }
}
