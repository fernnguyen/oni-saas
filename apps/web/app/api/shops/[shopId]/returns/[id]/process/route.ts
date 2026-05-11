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

    // 3. For each item: create stock-movement type=return_in
    //    Generate movement_no sequentially using existing PTH- prefix records.
    const existingMov = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'return_in' } })
    const pthNums = (existingMov.data as Record<string, string>[])
      .map(r => r.movement_no)
      .filter((n): n is string => typeof n === 'string' && n.startsWith('PTH-'))
      .map(n => parseInt(n.slice(4), 10))
      .filter(n => !isNaN(n))
    let pthCounter = pthNums.length > 0 ? Math.max(...pthNums) : 0

    const returnRef = r.return_no ?? r.return_id ?? id

    for (const item of items) {
      const qty   = parseFloat(item.qty_returned || '0')
      const delta = Math.abs(qty)

      pthCounter += 1
      const movementNo = `PTH-${String(pthCounter).padStart(3, '0')}`

      await connector.create('stock-movements', {
        type:         'return_in',
        movement_no:  movementNo,
        product_id:   item.product_id,
        sku:          item.sku ?? '',
        qty:          String(qty),
        unit_cost:    item.unit_price ?? '0',
        branch_id:    '',
        reference_no: returnRef,
        employee_id:  processedBy,
        reason:       `Trả hàng từ ${returnRef}`,
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

    // 5. Update linked order → refunded
    if (r.order_id) {
      await connector.update('orders', r.order_id, { status: 'refunded' })
      invalidate(shopId, 'orders')
    }

    invalidate(shopId, 'returns')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')

    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'POST returns/process')
  }
}
