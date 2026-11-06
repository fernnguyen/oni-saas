export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { setTicketItemStatus } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../../_helpers'

// PATCH { ready: true|false } – tick one dish done / undo. Returns the whole ticket.
const schema = z.object({ ready: z.boolean() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shopId: string; itemId: string }> }) {
  try {
    const { shopId, itemId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const { ready } = schema.parse(await req.json())
    const ticket = await setTicketItemStatus(requireKitchenConnector(connector), shopId, itemId, ready)
    return ticket ? NextResponse.json(ticket) : NextResponse.json({ error: 'Không tìm thấy món' }, { status: 404 })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PATCH kitchen/item')
  }
}
