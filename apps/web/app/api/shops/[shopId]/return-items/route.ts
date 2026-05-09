import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { returnItemCreateSchema } from '@/lib/validators/returns'
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
    const page      = Math.max(1, parseInt(sp.get('page')  ?? '1'))
    const limit     = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100')))
    const return_id = sp.get('return_id') ?? ''
    const filters: Record<string, string> = {}
    if (return_id) filters.return_id = return_id

    const result = await shopCache(
      () => connector.list('return-items', { page, limit, filters }).catch(() => ({ data: [], total: 0 })),
      ['return-items', shopId, String(page), String(limit), return_id],
      { tags: [shopTag(shopId, 'returns')], revalidate: cacheTTL.returns }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET return-items')
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
    const data = returnItemCreateSchema.parse(body)

    const created = await connector.create('return-items', data)
    invalidate(shopId, 'returns')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST return-items')
  }
}
