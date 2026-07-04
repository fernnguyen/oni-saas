import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { categoryCreateSchema } from '@/lib/validators/categories'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'products.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(10000, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''

    const result = await shopCache(
      () => connector.list('categories', { page, limit, search: search || undefined, sortDesc: true }),
      ['categories', shopId, String(page), String(limit), search],
      { tags: [shopTag(shopId, 'categories')], revalidate: cacheTTL.categories }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET categories')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'products.create')

    const body = await req.json()
    const data = categoryCreateSchema.parse(body)

    const created = await connector.create('categories', data)
    invalidate(shopId, 'categories')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST categories')
  }
}
