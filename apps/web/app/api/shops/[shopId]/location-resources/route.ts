export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { resourceCreateSchema } from '@/lib/validators/resources'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')))

    // Force strict branch filtering
    const result = await connector.list('location-resources', { 
      page, 
      limit, 
      filters: { branch_id: shopId },
      sortDesc: false 
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET location-resources')
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
    const data = resourceCreateSchema.parse(body)

    // Force strict branch scoping on write
    data.branch_id = shopId

    const created = await connector.create('location-resources', data)
    invalidate(shopId, 'location-resources')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST location-resources')
  }
}
