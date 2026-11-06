export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { listKitchenTickets } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../_helpers'

// GET /api/shops/:shopId/kitchen/tickets?station_id=&status=open|done|all&limit=
export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const tx = requireKitchenConnector(connector)
    const sp = req.nextUrl.searchParams
    const statusParam = sp.get('status')
    const status = statusParam === 'done' || statusParam === 'all' ? statusParam : 'open'
    const data = await listKitchenTickets(tx, shopId, {
      stationId: sp.get('station_id') || undefined,
      status,
      limit: Number(sp.get('limit') || 100),
    })
    return NextResponse.json({ data })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/tickets')
  }
}
