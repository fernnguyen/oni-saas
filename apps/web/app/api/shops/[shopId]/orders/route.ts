import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { orderCreateSchema } from '@/lib/validators/orders'
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
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const status = sp.get('status') ?? ''
    const channel = sp.get('channel') ?? ''
    const customer_id = sp.get('customer_id') ?? ''
    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (channel) filters.channel = channel
    if (customer_id) filters.customer_id = customer_id

    const result = await shopCache(
      () => connector.list('orders', { page, limit, search: search || undefined, filters, sortDesc: true }),
      ['orders', shopId, String(page), String(limit), search, status, channel, customer_id],
      { tags: [shopTag(shopId, 'orders')], revalidate: cacheTTL.orders }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET orders')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json()
    const data = orderCreateSchema.parse(body)

    const created = await connector.create('orders', data)
    invalidate(shopId, 'orders')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST orders')
  }
}
