import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { productCreateSchema } from '@/lib/validators/products'
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
    const search = sp.get('search') ?? undefined

    const filters: Record<string, string> = {}
    const category_id = sp.get('category_id')
    if (category_id) filters.category_id = category_id
    const active = sp.get('active')
    if (active) filters.active = active

    const result = await connector.list('products', { page, limit, search, filters })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET products')
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
    const data = productCreateSchema.parse(body)

    const created = await connector.create('products', data)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST products')
  }
}
