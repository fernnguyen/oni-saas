import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { RollbackContext } from '@oni/adapters'
import { resolveAndRecordPayment } from '@/lib/server/paymentFunds'
import { updateCustomerStats } from '@/lib/server/customerStats'
import crypto from 'crypto'

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
    const tenantHash = crypto.createHash('sha256').update(shop.tenant_id).digest('hex').substring(0, 8).toUpperCase()
    const searchPrefix = `PTH-${tenantHash}-`

    const existingMov = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'return_in' } })
    const pthNums = (existingMov.data as Record<string, string>[])
      .map(r => r.movement_no)
      .filter((n): n is string => typeof n === 'string' && n.startsWith(searchPrefix))
      .map(n => parseInt(n.slice(searchPrefix.length), 10))
      .filter(n => !isNaN(n))
    let pthCounter = pthNums.length > 0 ? Math.max(...pthNums) : 0

    const returnRef = r.return_no || r.return_id || id
    const branchId = r.branch_id || shopId

    // Resolve standard warehouse IDs for multi-warehouse routing
    const whList = await connector.list('warehouses', { limit: 100 })
    const whs = whList.data as any[]

    let saleWhId = whs.find(w => w.type === 'sale' && w.branch_id === branchId)?.id 
      || whs.find(w => w.type === 'sale')?.id 
      || whs.find(w => w.branch_id === branchId)?.id 
      || whs[0]?.id

    // Self-healing: auto-seed standard warehouse on-the-fly if missing
    if (!saleWhId && branchId) {
      const newWh = await connector.create('warehouses', {
        branch_id: branchId,
        name: 'Kho Kinh doanh (Bán lẻ)',
        type: 'sale',
        active: 'TRUE'
      })
      saleWhId = newWh.id
    }

    const generatedStockMovements: string[] = []
    for (const item of items) {
      const productData = await connector.findById('products', item.product_id).catch(() => null)
      const productType = (productData as any)?.product_type || 'simple'

      if (productType === 'modifier') {
        continue // Skip inventory deduction for modifier products
      }

      const qty   = parseFloat(item.qty_returned || '0')
      const delta = Math.abs(qty)

      pthCounter += 1
      const movementNo = `${searchPrefix}${String(pthCounter).padStart(3, '0')}`
      generatedStockMovements.push(movementNo)

      const createdMov = await connector.create('stock-movements', {
        type:         'return_in',
        movement_no:  movementNo,
        product_id:   item.product_id,
        sku:          item.sku ?? '',
        qty:          String(qty),
        unit_cost:    item.unit_price ?? '0',
        branch_id:    branchId,
        warehouse_id: saleWhId || '',
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
        filters: { product_id: item.product_id, branch_id: branchId },
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
        const newQty = oldQty + delta
        await connector.update('inventory', inv.inventory_id, { stock_qty: String(newQty) })
        tx.add(async () => {
          await connector.update('inventory', inv.inventory_id, { stock_qty: String(oldQty) }).catch(() => {})
        })
      } else {
        const createdInv = await connector.create('inventory', {
          product_id: item.product_id,
          branch_id:  branchId,
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

    // 5. Update linked order status → refunded or partially_refunded
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
    }

    // 5.5. Deduct debt / Log Cashbook refund
    let cashbookId = ''
    const totalRefund = parseFloat(r.total_refund || '0') || 0
    if (totalRefund > 0 && r.order_id) {
      const orderData = await connector.findById('orders', r.order_id).catch(() => null)
      const orderDebt = orderData ? (parseFloat((orderData as any).debt_amount || '0') || 0) : 0

      // 1. First deduct from this specific order's debt
      const appliedToOrderDebt = Math.min(totalRefund, orderDebt)
      const remainder = totalRefund - appliedToOrderDebt

      // 2. Fetch overall customer stats
      const customerId = r.customer_id
      let currentCustomerDebt = 0
      let currentCustomerPrepaid = 0
      let stats: any = null
      let customer: any = null

      if (customerId) {
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: customerId, branch_id: shopId }
        })
        stats = statsRes.data[0]
        customer = await connector.findById('customers', customerId)
        currentCustomerDebt = parseFloat(stats?.debt_amount ?? customer?.debt_amount ?? '0') || 0
        currentCustomerPrepaid = parseFloat(stats?.prepaid_balance ?? customer?.prepaid_balance ?? '0') || 0
      }

      // Calculate remaining customer debt after deducting specific order debt
      const customerRemainingDebt = Math.max(0, currentCustomerDebt - appliedToOrderDebt)
      
      let appliedToOtherDebt = 0
      let refundToPrepaid = 0
      let refundToCashOrBank = 0

      if (r.refund_method === 'store_credit') {
        // If refund method is store_credit, we first reduce customer's other debts
        appliedToOtherDebt = Math.min(remainder, customerRemainingDebt)
        // Any remaining amount after customer debt is fully wiped out goes to prepaid wallet balance
        refundToPrepaid = remainder - appliedToOtherDebt
      } else if (r.refund_method === 'cash' || r.refund_method === 'bank_transfer') {
        // If refund method is cash/bank transfer, the remainder actually leaves the shop's fund
        refundToCashOrBank = remainder
      }

      // Update Order Debt (original order)
      if (appliedToOrderDebt > 0) {
        const newOrderDebt = Math.max(0, orderDebt - appliedToOrderDebt)
        await connector.update('orders', r.order_id, { debt_amount: String(newOrderDebt) })
        tx.add(async () => {
          await connector.update('orders', r.order_id!, { debt_amount: String(orderDebt) }).catch(() => {})
        })
      }

      // Update Customer Stats (Debt / Prepaid)
      if (customerId && (appliedToOrderDebt > 0 || appliedToOtherDebt > 0 || refundToPrepaid > 0)) {
        const newCustomerDebt = Math.max(0, currentCustomerDebt - appliedToOrderDebt - appliedToOtherDebt)
        const newCustomerPrepaid = currentCustomerPrepaid + refundToPrepaid

        await updateCustomerStats(connector, customerId, shopId, {
          debt_amount: String(newCustomerDebt),
          prepaid_balance: String(newCustomerPrepaid)
        }, tx)
      }

      // Deduct from customer's other unpaid orders in FIFO order (oldest first)
      if (customerId && appliedToOtherDebt > 0) {
        try {
          const debtOrdersRes = await connector.list('orders', {
            filters: { customer_id: customerId },
            limit: 1000
          })
          const unpaidOrders = (debtOrdersRes.data as Record<string, string>[])
            .filter(o => o.order_id !== r.order_id && o.id !== r.order_id) // Exclude current order
            .filter(o => (parseFloat(o.debt_amount || '0') || 0) > 0 && o.is_return !== 'TRUE' && o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'refunded')
            .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

          let remainingToDeduct = appliedToOtherDebt
          for (const order of unpaidOrders) {
            if (remainingToDeduct <= 0) break
            const oDebt = parseFloat(order.debt_amount || '0') || 0
            const applied = Math.min(remainingToDeduct, oDebt)
            const newODebt = Math.max(0, oDebt - applied)

            const oId = order.id || order.order_id
            await connector.update('orders', oId, { debt_amount: String(newODebt) })
            tx.add(async () => {
              await connector.update('orders', oId, { debt_amount: String(oDebt) }).catch(() => {})
            })

            remainingToDeduct -= applied
          }
        } catch (err) {
          console.error('Failed to deduct other orders debt during return FIFO processing:', err)
        }
      }

      // Update Cashbook Fund (if money actually leaves the fund)
      if (refundToCashOrBank > 0) {
        try {
          const { fundId, balanceAfter } = await resolveAndRecordPayment(
            connector,
            shopId,
            { amount: refundToCashOrBank, method: r.refund_method, fund_id: r.fund_id },
            true, // isExpense = true (refunding to customer)
            tx
          )

          const cb = await connector.create('cashbook', {
            type:           'payment', // Phiếu chi
            amount:         String(refundToCashOrBank),
            method:         r.refund_method,
            category:       'refund',
            reference_id:   returnRef,
            reference_name: r.customer_name ?? '',
            note:           `Hoàn tiền phiếu trả hàng ${returnRef}${r.order_no ? ` (Đơn ${r.order_no})` : ''}`,
            employee_id:    processedBy,
            branch_id:      r.branch_id || shopId,
            fund_id:        fundId,
            balance_after_transaction: balanceAfter,
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

    const domainName = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'oni.vn'
    const tenantDomain = `${shop.slug}.${domainName}`
    const processedByEmail = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Hệ thống'
    
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

    dispatchNotification(shop.tenant_id, shopId, 'ORDER_RETURNED', {
      title: 'Khách trả hàng',
      message: `Phiếu trả hàng: ${returnRef}\nĐơn gốc: ${actualOrderNo}\nKhách hàng: ${customerName}\nHoàn tiền: ${totalRefund.toLocaleString('vi-VN')}đ${inventoryInfo}${cashbookText}${r.note ? `\nGhi chú: ${r.note}` : ''}\n\n📝 Người xử lý: ${processedByEmail} (${tenantDomain})`
    }).catch(err => console.error('Failed to dispatch ORDER_RETURNED:', err))

    invalidate(shopId, 'returns')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'cashbook')
    invalidate(shopId, 'payment-funds')
    invalidate(shopId, 'customers')

    return NextResponse.json(updated)
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST returns/process')
  }
}
