import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '@/app/api/shops/_helpers'
import { recalculateInProgressOrderTotals } from '@/lib/server/tableSessionReconciler'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'pos.use')

    const body = await req.json()
    const existingItem = await connector.findById('order-items', id).catch(() => null)

    // Only require orders.edit_price if unit_price or discount_amount is actually being modified
    const isPriceModified =
      body.unit_price !== undefined &&
      existingItem &&
      Number(body.unit_price) !== Number(existingItem.unit_price ?? body.unit_price)
    const isDiscountModified =
      body.discount_amount !== undefined &&
      existingItem &&
      Number(body.discount_amount) !== Number(existingItem.discount_amount ?? 0)

    if (isPriceModified || isDiscountModified) {
      if (!permissions.includes('orders.edit_price') && !permissions.includes('owner') && !permissions.includes('admin')) {
        return NextResponse.json({ error: 'Permission denied: requires orders.edit_price' }, { status: 403 })
      }
    }

    const updated = await connector.update('order-items', id, body)
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'orders')
    await recalculateInProgressOrderTotals(
      connector,
      shopId,
      String(updated.order_id || existingItem?.order_id || '')
    )

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
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    const existingItem = await connector.findById('order-items', id).catch(() => null)
    await connector.delete('order-items', id)
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'orders')
    if (existingItem?.order_id) {
      await recalculateInProgressOrderTotals(connector, shopId, String(existingItem.order_id))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE order-items')
  }
}
