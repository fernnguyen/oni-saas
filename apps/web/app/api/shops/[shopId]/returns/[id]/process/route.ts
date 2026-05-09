import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'

// POST /api/shops/[shopId]/returns/[id]/process
// Chuyển trạng thái phiếu trả hàng sang 'processed':
//   1. Lấy danh sách return-items
//   2. Với mỗi item: tạo stock-movement type=return_in → kho tự động tăng
//   3. Cập nhật status phiếu trả thành 'processed'
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)
    const body = await req.json().catch(() => ({}))
    const processedBy: string = body.processed_by ?? ''

    // 1. Load return header
    const ret = await connector.findById('returns', id)
    if (!ret) return NextResponse.json({ error: 'Phiếu trả hàng không tồn tại' }, { status: 404 })

    const r = ret as Record<string, string>
    if (r.status === 'processed') {
      return NextResponse.json({ error: 'Phiếu đã được xử lý trước đó' }, { status: 409 })
    }
    if (r.status === 'rejected') {
      return NextResponse.json({ error: 'Phiếu đã bị từ chối, không thể xử lý' }, { status: 409 })
    }

    // 2. Load return items
    const itemsResult = await connector.list('return-items', {
      page: 1,
      limit: 200,
      filters: { return_id: id },
    })
    const items = itemsResult.data as Record<string, string>[]

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Phiếu trả hàng chưa có sản phẩm. Hãy thêm sản phẩm trước khi xử lý.' },
        { status: 422 }
      )
    }

    // 3. For each item: POST to stock-movements (return_in) — reuse that route's inventory logic
    //    We call the internal connector directly to avoid HTTP overhead and stay atomic.
    const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']

    for (const item of items) {
      const qty   = parseFloat(item.qty_returned || '0')
      const delta = Math.abs(qty) // return_in is always inbound

      // Create the movement record
      await connector.create('stock-movements', {
        type:         'return_in',
        product_id:   item.product_id,
        sku:          item.sku ?? '',
        qty:          String(qty),
        unit_cost:    item.unit_price ?? '0',
        branch_id:    '',
        reference_no: r.return_no ?? id,
        employee_id:  processedBy,
        reason:       `Trả hàng: ${r.return_no ?? id}`,
      })

      // Update inventory (same logic as stock-movements POST)
      let invResult = await connector.list('inventory', {
        page: 1, limit: 1,
        filters: { product_id: item.product_id, branch_id: '' },
      })
      if (invResult.data.length === 0) {
        invResult = await connector.list('inventory', {
          page: 1, limit: 1,
          filters: { product_id: item.product_id },
        })
      }

      if (invResult.data.length > 0) {
        const inv = invResult.data[0] as Record<string, string>
        const newQty = Math.max(0, parseFloat(inv.stock_qty || '0') + delta)
        await connector.update('inventory', inv.inventory_id, { stock_qty: String(newQty) })
      } else {
        await connector.create('inventory', {
          product_id: item.product_id,
          branch_id:  '',
          stock_qty:  String(delta),
          min_stock:  '0',
          sku:        item.sku ?? '',
        })
      }
    }

    // 4. Mark return as processed
    const now = new Date().toISOString()
    const updated = await connector.update('returns', id, {
      status:       'processed',
      processed_by: processedBy,
      processed_at: now,
    })

    invalidate(shopId, 'returns')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')

    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'POST returns/process')
  }
}
