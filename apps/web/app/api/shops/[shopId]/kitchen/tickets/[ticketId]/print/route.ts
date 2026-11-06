export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { markTicketPrinted } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../../../_helpers'

// POST { claim?: boolean } – record a print and return the ticket to render.
// claim: true (auto-print) → `claimed` is true only for the first device; others must not print.
export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string; ticketId: string }> }) {
  try {
    const { shopId, ticketId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const body = await req.json().catch(() => ({}))
    const { ticket, claimed } = await markTicketPrinted(requireKitchenConnector(connector), shopId, ticketId, { claim: body?.claim === true })
    return ticket
      ? NextResponse.json({ ticket, claimed })
      : NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'POST kitchen/ticket/print')
  }
}
