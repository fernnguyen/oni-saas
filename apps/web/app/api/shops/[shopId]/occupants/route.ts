export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const reservation_id = sp.get('reservation_id') ?? ''
    const order_id = sp.get('order_id') ?? ''
    const resource_id = sp.get('resource_id') ?? ''

    const filters: Record<string, string> = { branch_id: shopId }
    if (reservation_id) filters.reservation_id = reservation_id
    if (order_id) filters.order_id = order_id
    if (resource_id) filters.resource_id = resource_id

    const result = await connector.list('resource_occupants', {
      limit: 200,
      filters,
      sortDesc: false
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET occupants')
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
    const data = {
      ...body,
      branch_id: shopId
    }

    if (!data.guest_name || !data.guest_name.trim()) {
      return NextResponse.json({ error: 'Tên khách lưu trú không được để trống' }, { status: 400 })
    }

    const created = await connector.create('resource_occupants', data)
    invalidate(shopId, 'resource_occupants')
    
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST occupants')
  }
}
