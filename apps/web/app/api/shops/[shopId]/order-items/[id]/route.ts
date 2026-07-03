import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '@/app/api/shops/_helpers'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    
    // Check permission for price changes
    if (body.unit_price !== undefined || body.discount_amount !== undefined) {
      if (!permissions.includes('orders.edit_price')) {
        return NextResponse.json({ error: 'Permission denied: requires orders.edit_price' }, { status: 403 })
      }
    }

    const updated = await connector.update('order-items', id, body)
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'orders')
    
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT order-items')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    await connector.delete('order-items', id)
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'orders')

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE order-items')
  }
}
