import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { orderUpdateSchema } from '@/lib/validators/orders'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

// Returns the signed delta needed to REVERSE a movement (undo its inventory impact)
function calcReverseDelta(type: string, qty: number): number {
  if (type === 'sale_out' || type === 'transfer_out') return Math.abs(qty)   // undo outbound → restore
  if (type === 'purchase_in' || type === 'return_in' || type === 'transfer_in') return -Math.abs(qty) // undo inbound → reduce
  return 0 // adjustment: don't auto-reverse
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const row = await connector.findById('orders', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET order')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const data = orderUpdateSchema.parse(body)

    const updated = await connector.update('orders', id, data)
    invalidate(shopId, 'orders')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT order')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.delete')

    // Restore inventory: reverse all stock movements linked to this order
    const order = await connector.findById('orders', id)
    if (order) {
      const orderNo = (order as Record<string, string>).order_no ?? ''
      if (orderNo) {
        const mvResult = await connector.list('stock-movements', {
          page: 1, limit: 200,
          filters: { reference_no: orderNo },
        })
        for (const mv of mvResult.data as Record<string, string>[]) {
          const delta = calcReverseDelta(mv.type, parseFloat(mv.qty || '0'))
          if (delta === 0) continue

          // Three-fallback inventory lookup (branch_id may differ between POS and Sheets)
          const branchId = mv.branch_id ?? ''
          let invResult = await connector.list('inventory', {
            page: 1, limit: 1, filters: { product_id: mv.product_id, branch_id: branchId },
          })
          if (invResult.data.length === 0 && branchId !== '') {
            invResult = await connector.list('inventory', {
              page: 1, limit: 1, filters: { product_id: mv.product_id, branch_id: '' },
            })
          }
          if (invResult.data.length === 0) {
            invResult = await connector.list('inventory', {
              page: 1, limit: 1, filters: { product_id: mv.product_id },
            })
          }
          if (invResult.data.length > 0) {
            const inv = invResult.data[0] as Record<string, string>
            const newQty = Math.max(0, parseFloat(inv.stock_qty || '0') + delta)
            await connector.update('inventory', inv.inventory_id, { stock_qty: String(newQty) })
          }
        }
      }
    }

    await connector.delete('orders', id)
    invalidate(shopId, 'orders')
    invalidate(shopId, 'inventory')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE order')
  }
}
