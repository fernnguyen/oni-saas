export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenActorOf } from '@/lib/server/kitchen/actor'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { markTicketItemUnavailable, setTicketItemStatus, setVoidOutcome } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../../_helpers'

// PATCH { ready: true|false } – tick one dish done / undo (also undoes "hết món").
// PATCH { unavailable: true, sold_out_today?: boolean } – the kitchen cannot make it ("Hết món").
// PATCH { void_outcome: 'stopped'|'made'|null } – answer a cancel line: "Dừng kịp" / "Đã làm rồi" (waste).
// Returns the whole ticket.
const schema = z.union([
  z.object({ ready: z.boolean() }),
  z.object({ unavailable: z.literal(true), sold_out_today: z.boolean().optional() }),
  z.object({ void_outcome: z.enum(['stopped', 'made']).nullable() }),
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shopId: string; itemId: string }> }) {
  try {
    const { shopId, itemId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'pos.use')
    const body = schema.parse(await req.json())
    const tx = requireKitchenConnector(connector)
    const ticket = 'void_outcome' in body
      ? await setVoidOutcome(tx, shopId, itemId, body.void_outcome, kitchenActorOf(user))
      : 'unavailable' in body
        ? await markTicketItemUnavailable(tx, shopId, itemId, { soldOutToday: body.sold_out_today })
        : await setTicketItemStatus(tx, shopId, itemId, body.ready)
    return ticket ? NextResponse.json(ticket) : NextResponse.json({ error: 'Không tìm thấy món' }, { status: 404 })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PATCH kitchen/item')
  }
}
