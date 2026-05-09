import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { customerCreateSchema } from '@/lib/validators/customers'
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
    const search = sp.get('search') ?? ''
    const customer_type = sp.get('customer_type') ?? ''
    const filters: Record<string, string> = {}
    if (customer_type) filters.customer_type = customer_type

    const result = await shopCache(
      () => connector.list('customers', { page, limit, search: search || undefined, filters }),
      ['customers', shopId, String(page), String(limit), search, customer_type],
      { tags: [shopTag(shopId, 'customers')], revalidate: cacheTTL.customers }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET customers')
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
    const data = customerCreateSchema.parse(body)

    const created = await connector.create('customers', data)
    invalidate(shopId, 'customers')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST customers')
  }
}
