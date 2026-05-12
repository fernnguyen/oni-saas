import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { returnUpdateSchema } from '@/lib/validators/returns'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.view')

    const row = await connector.findById('returns', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET return')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.create')

    const oldRet = await connector.findById('returns', id)
    const body = await req.json()
    const data = returnUpdateSchema.parse(body)

    const updated = await connector.update('returns', id, data)
    
    // Revert order status if return is rejected
    if (data.status === 'rejected' && oldRet) {
      const r = oldRet as Record<string, string>
      if (r.order_id) {
        await connector.update('orders', r.order_id, { status: r.previous_order_status || 'completed' })
        invalidate(shopId, 'orders')
      }
    }

    invalidate(shopId, 'returns')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT return')
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.create')

    const ret = await connector.findById('returns', id)
    if (ret) {
      const r = ret as Record<string, string>
      // Only allow deleting pending/rejected returns — processed ones have inventory impact
      if (r.status === 'processed') {
        return NextResponse.json(
          { error: 'Không thể xóa phiếu trả hàng đã xử lý. Hãy tạo phiếu điều chỉnh kho thay thế.' },
          { status: 409 }
        )
      }

      // If pending and deleted, we must revert the order status
      if (r.order_id && r.status === 'pending') {
        await connector.update('orders', r.order_id, { status: r.previous_order_status || 'completed' })
        invalidate(shopId, 'orders')
      }
    }

    await connector.update('returns', id, { status: 'deleted' })
    invalidate(shopId, 'returns')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE return')
  }
}
