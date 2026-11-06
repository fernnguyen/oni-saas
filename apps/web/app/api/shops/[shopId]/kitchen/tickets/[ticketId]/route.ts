export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { getKitchenTicket, setTicketDone } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../../_helpers'

type Ctx = { params: Promise<{ shopId: string; ticketId: string }> }
const notFound = () => NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, ticketId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const ticket = await getKitchenTicket(requireKitchenConnector(connector), shopId, ticketId)
    return ticket ? NextResponse.json(ticket) : notFound()
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/ticket')
  }
}

// PATCH { done: true } → all pending items ready + ticket done; { done: false } → reopen
const patchSchema = z.object({ done: z.boolean() })

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, ticketId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const { done } = patchSchema.parse(await req.json())
    const ticket = await setTicketDone(requireKitchenConnector(connector), shopId, ticketId, done)
    return ticket ? NextResponse.json(ticket) : notFound()
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PATCH kitchen/ticket')
  }
}
