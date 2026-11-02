import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { openTableSession, requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { tableSyncErrorResponse } from '../_respond'

// POST /api/shops/:shopId/table-sessions/open – idempotent by client session_id
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.create')
    const txConnector = await requireTableSyncV2(shopId, connector)
    const body = await req.json()
    const result = await openTableSession(txConnector, shopId, {
      ...body,
      employee_id: body?.employee_id || user.email || '',
    })
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (e) {
    return tableSyncErrorResponse(e, 'POST table-sessions/open')
  }
}
