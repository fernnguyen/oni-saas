export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { listUnavailableProducts, setProductUnavailable } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../_helpers'

// Today's "Tạm hết" list (GMT+7 business day) for this branch.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)
    return NextResponse.json({ data: await listUnavailableProducts(requireKitchenConnector(connector), shopId) })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/unavailable')
  }
}

// POST { product_id, product_name?, unavailable: boolean } – mark sold out for today / available again.
const schema = z.object({
  product_id: z.string().min(1).max(255),
  product_name: z.string().max(255).optional(),
  unavailable: z.boolean(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const body = schema.parse(await req.json())
    const data = await setProductUnavailable(requireKitchenConnector(connector), shopId, body, body.unavailable)
    return NextResponse.json({ data })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'POST kitchen/unavailable')
  }
}
