import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopCache, shopTag } from '@/lib/server/cache'
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
    const search = sp.get('search') ?? ''
    const branch_id = sp.get('branch_id') ?? ''
    const product_id = sp.get('product_id') ?? ''
    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id
    if (product_id) filters.product_id = product_id

    const result = await shopCache(
      () => connector.list('inventory', { page, limit, search: search || undefined, filters }),
      ['inventory', shopId, String(page), String(limit), search, branch_id, product_id],
      { tags: [shopTag(shopId, 'inventory')], revalidate: cacheTTL.inventory }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET inventory')
  }
}
