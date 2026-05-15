import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { RollbackContext } from '@oni/adapters'

// POST /api/shops/[shopId]/returns/[id]/process
// Chuyển trạng thái phiếu trả hàng sang 'processed':
//   1. Lấy danh sách return-items
//   2. Với mỗi item: tạo stock-movement type=return_in → kho tự động tăng
//   3. Cập nhật status phiếu trả thành 'processed'
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId, id } = await params
    const { connector, shop, user } = await requireShopAccess(shopId, 'returns.approve')
    tx = new RollbackContext()
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

    const returnRef = r.return_no || r.return_id || id

    const generatedStockMovements: string[] = []
    for (const item of items) {
      const qty   = parseFloat(item.qty_returned || '0')
      const delta = Math.abs(qty)

      pthCounter += 1
      const movementNo = `PTH-${String(pthCounter).padStart(3, '0')}`
      generatedStockMovements.push(movementNo)

      const createdMov = await connector.create('stock-movements', {
        type:         'return_in',
        movement_no:  movementNo,
        product_id:   item.product_id,
        sku:          item.sku ?? '',
        qty:          String(qty),
        unit_cost:    item.unit_price ?? '0',
        branch_id:    '',
        reference_no: r.order_id || returnRef,
        employee_id:  processedBy,
        reason:       `Trả hàng từ ${returnRef}${r.note ? ` - Ghi chú: ${r.note}` : ''}`,
      })
      tx.add(async () => {
        await connector.delete('stock-movements', (createdMov as any).movement_id).catch(() => {})
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
        const oldQty = parseFloat(inv.stock_qty || '0')
        const newQty = Math.max(0, oldQty + delta)
        await connector.update('inventory', inv.inventory_id, { stock_qty: String(newQty) })
        tx.add(async () => {
          await connector.update('inventory', inv.inventory_id, { stock_qty: String(oldQty) }).catch(() => {})
        })
      } else {
        const createdInv = await connector.create('inventory', {
          product_id: item.product_id,
          branch_id:  '',
          stock_qty:  String(delta),
          min_stock:  '0',
          sku:        item.sku ?? '',
        })
        tx.add(async () => {
          await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
        })
      }
    }

    // 4. Mark return as processed
    const now = new Date().toISOString()
    const previousStatus = r.status || 'pending'
    const updated = await connector.update('returns', id, {
      status:       'processed',
      processed_by: processedBy,
      processed_at: now,
    })
    tx.add(async () => {
      await connector.update('returns', id, {
        status: previousStatus,
        processed_by: '',
        processed_at: '',
      }).catch(() => {})
    })

    // 4.5. Log Cashbook payment if a refund is issued
    let cashbookId = ''
    if (r.refund_method !== 'none' && r.refund_method !== 'store_credit') {
      const refundAmount = parseFloat(r.total_refund || '0')
      if (refundAmount > 0) {
        try {
          const cb = await connector.create('cashbook', {
            type:           'payment', // Phiếu chi
            amount:         String(refundAmount),
            method:         r.refund_method,
            category:       'other',
            reference_id:   returnRef,
            reference_name: r.customer_name ?? '',
            note:           `Hoàn tiền phiếu trả hàng ${returnRef}${r.order_no ? ` (Đơn ${r.order_no})` : ''}`,
            employee_id:    processedBy,
            branch_id:      '',
          })
          cashbookId = (cb as Record<string, string>).transaction_id || ''
          tx.add(async () => {
            await connector.delete('cashbook', cashbookId).catch(() => {})
          })
        } catch (err) {
          console.error('Failed to log cashbook for return refund:', err)
        }
      }
    }

    // 5. Update linked order → refunded or partially_refunded
    if (r.order_id) {
      const allReturnsResult = await connector.list('returns', { limit: 100, filters: { order_id: r.order_id } })
      const allReturns = allReturnsResult.data as Record<string, string>[]
      const validReturns = allReturns.filter(ret => ret.status === 'processed' || ret.return_id === id)
      
      let totalReturnedQty = 0
      for (const vRet of validReturns) {
        const vItemsResult = await connector.list('return-items', { limit: 500, filters: { return_id: vRet.return_id! } })
        const vItems = vItemsResult.data as Record<string, string>[]
        totalReturnedQty += vItems.reduce((acc, item) => acc + parseInt(item.qty_returned || '0', 10), 0)
      }
      
      const orderItemsResult = await connector.list('order-items', { limit: 500, filters: { order_id: r.order_id } })
      const orderItems = orderItemsResult.data as Record<string, string>[]
      const totalPurchasedQty = orderItems.reduce((acc, item) => acc + parseInt(item.qty || '0', 10), 0)
      
      const newStatus = totalReturnedQty >= totalPurchasedQty ? 'refunded' : 'partially_refunded'
      
      const previousOrderStatus = (r as any).previous_order_status || 'completed'
      await connector.update('orders', r.order_id, { status: newStatus })
      tx.add(async () => {
        await connector.update('orders', r.order_id!, { status: previousOrderStatus }).catch(() => {})
      })
      invalidate(shopId, 'orders')
    }

    const domainName = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'oni.vn'
    const tenantDomain = `${shop.slug}.${domainName}`
    const processedByEmail = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Hệ thống'
    const totalRefund = Number(r.total_refund || 0)
    
    let actualOrderNo = r.order_no || r.order_id || 'Không có'
    if (r.order_id && (!r.order_no || r.order_no === '')) {
      try {
        const orderData = await connector.findById('orders', r.order_id)
        if (orderData) {
          actualOrderNo = (orderData as any).order_no || r.order_id
        }
      } catch (err) {
        console.error('Failed to fetch order for return payload:', err)
      }
    }

    const customerName = r.customer_name || 'Khách lẻ'
    
    // Build extra details
    const stockMovementsText = generatedStockMovements.length > 0 ? `Đã tạo phiếu nhập kho ${generatedStockMovements.map(m => `#${m}`).join(', ')}` : ''
    const cashbookText = cashbookId ? `\nSổ quỹ: Đã tạo phiếu chi #${cashbookId}` : (r.refund_method !== 'none' && r.refund_method !== 'store_credit' && totalRefund > 0 ? `\nSổ quỹ: Đã tạo phiếu chi hoàn tiền` : '')
    const inventoryInfo = stockMovementsText ? `\nKho hàng: ${stockMovementsText}` : ''

    dispatchNotification(shop.tenant_id, 'ORDER_RETURNED', {
      title: 'Khách trả hàng',
      message: `Phiếu trả hàng: ${returnRef}\nĐơn gốc: ${actualOrderNo}\nKhách hàng: ${customerName}\nHoàn tiền: ${totalRefund.toLocaleString('vi-VN')}đ${inventoryInfo}${cashbookText}${r.note ? `\nGhi chú: ${r.note}` : ''}\n\n📝 Người xử lý: ${processedByEmail} (${tenantDomain})`
    }).catch(err => console.error('Failed to dispatch ORDER_RETURNED:', err))

    invalidate(shopId, 'returns')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'cashbook')

    return NextResponse.json(updated)
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST returns/process')
  }
}
