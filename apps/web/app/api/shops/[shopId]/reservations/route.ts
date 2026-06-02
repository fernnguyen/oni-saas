export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
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
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')))
    const status = sp.get('status') ?? ''
    const channel_id = sp.get('channel_id') ?? ''
    const resource_id = sp.get('resource_id') ?? ''

    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (channel_id) filters.channel_id = channel_id
    if (resource_id) filters.resource_id = resource_id

    const result = await connector.list('reservations', {
      page,
      limit,
      filters,
      sortDesc: true
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reservations')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json()
    
    // Scoping to shop/branch
    const data = {
      ...body,
      branch_id: shopId,
      created_by: user.email || 'system'
    }

    const created = await connector.create('reservations', data)
    invalidate(shopId, 'reservations')
    
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST reservations')
  }
}
