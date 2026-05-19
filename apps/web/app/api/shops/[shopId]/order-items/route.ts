export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { orderItemCreateSchema } from '@/lib/validators/orders'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100')))
    const order_id = sp.get('order_id') ?? ''
    const filters: Record<string, string> = { active: 'TRUE' }
    if (order_id) filters.order_id = order_id

    const result = await connector.list('order-items', { page, limit, filters })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET order-items')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const data = orderItemCreateSchema.parse(body)

    const created = await connector.create('order-items', data)
    invalidate(shopId, 'order-items')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST order-items')
  }
}
