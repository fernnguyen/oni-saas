import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { stockMovementCreateSchema } from '@/lib/validators/stockMovements'
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
    const type = sp.get('type')
    if (type) filters.type = type
    const product_id = sp.get('product_id')
    if (product_id) filters.product_id = product_id
    const branch_id = sp.get('branch_id')
    if (branch_id) filters.branch_id = branch_id

    const result = await connector.list('stock-movements', { page, limit, search, filters })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET stock-movements')
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
    const data = stockMovementCreateSchema.parse(body)

    const created = await connector.create('stock-movements', data)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST stock-movements')
  }
}
