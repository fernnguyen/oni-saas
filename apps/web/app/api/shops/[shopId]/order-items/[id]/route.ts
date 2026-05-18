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
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    // Optional: add validation here

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
