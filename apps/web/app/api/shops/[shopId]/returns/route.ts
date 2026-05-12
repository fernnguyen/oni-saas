import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { returnCreateSchema } from '@/lib/validators/returns'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.view')

    const sp = req.nextUrl.searchParams
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1'))
    const limit  = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const status = sp.get('status') ?? ''
    const order_id = sp.get('order_id') ?? ''
    const filters: Record<string, string> = {}
    if (status)   filters.status   = status
    if (order_id) filters.order_id = order_id

    const result = await shopCache(
      () => connector.list('returns', { page, limit, search: search || undefined, filters, sortDesc: true })
              .catch(() => ({ data: [], total: 0 })),
      ['returns', shopId, String(page), String(limit), search, status, order_id],
      { tags: [shopTag(shopId, 'returns')], revalidate: cacheTTL.returns }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET returns')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.create')

    const body = await req.json()
    const data = returnCreateSchema.parse(body)

    const created = await connector.create('returns', data)
    invalidate(shopId, 'returns')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST returns')
  }
}
