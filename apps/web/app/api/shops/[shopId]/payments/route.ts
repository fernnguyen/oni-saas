export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { paymentCreateSchema } from '@/lib/validators/orders'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const order_id = sp.get('order_id') ?? ''
    const filters: Record<string, string> = {}
    if (order_id) filters.order_id = order_id

    const result = await connector.list('payments', { page, limit, filters })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET payments')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json()
    const data = paymentCreateSchema.parse(body)
    if (!data.paid_at) {
      data.paid_at = new Date().toISOString()
    }

    const created = await connector.create('payments', data)
    invalidate(shopId, 'payments')
    invalidate(shopId, 'orders')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST payments')
  }
}
