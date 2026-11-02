import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { applyTableSessionOps, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../../_respond'

// POST /api/shops/:shopId/table-sessions/:sessionId/ops – batch of idempotent delta ops
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string; sessionId: string }> }) {
  try {
    const { shopId, sessionId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.create')
    const txConnector = await requireTableSyncV2(shopId, connector)
    const body = await req.json()
    const result = await applyTableSessionOps(txConnector, shopId, {
      sessionId,
      deviceId: String(body?.device_id || ''),
      ops: Array.isArray(body?.ops) ? body.ops : [],
    })
    return NextResponse.json(result)
  } catch (e) {
    return tableSyncErrorResponse(e, 'POST table-sessions/ops')
  }
}
