export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

// Recalculates and updates the total_amount, subtotal, and debt_amount for an order
async function recalculateOrderTotals(connector: any, orderId: string) {
  const itemsResult = await connector.list('order-items', {
    filters: { order_id: orderId },
    limit: 200
  })
  
  const items = itemsResult.data || []
  let subtotal = 0
  for (const item of items) {
    const qty = parseFloat(item.qty || '0')
    const price = parseFloat(item.unit_price || '0')
    subtotal += qty * price
  }

  const order = await connector.findById('orders', orderId)
  if (!order) return

  const discount = parseFloat(order.discount_amount || '0')
  const shipping = parseFloat(order.shipping_fee || '0')
  const tax = parseFloat(order.tax_amount || '0')
  
  const totalAmount = Math.max(0, subtotal - discount + shipping + tax)
  const paidAmount = parseFloat(order.paid_amount || '0')
  const debtAmount = Math.max(0, totalAmount - paidAmount)

  await connector.update('orders', orderId, {
    subtotal: String(subtotal),
    total_amount: String(totalAmount),
    debt_amount: String(debtAmount)
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const { action, sourceOrderIds, targetOrderId, splits, deposits } = body

    if (action === 'merge') {
      // MERGE ACTION: Merge items of multiple source orders into a target order
      if (!sourceOrderIds || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
        return NextResponse.json({ error: 'Thiếu danh sách đơn hàng nguồn' }, { status: 400 })
      }
      
      let finalTargetId = targetOrderId
      let targetOrder: any

      if (!finalTargetId) {
        // If targetOrderId is not provided, create a new master order
        const targetNoSeq = 'ORD-GRP-' + Date.now()
        targetOrder = await connector.create('orders', {
          status: 'in_progress',
          order_no: targetNoSeq,
          customer_id: body.customer_id || 'C-DEFAULT-RETAIL',
          customer_name: body.customer_name || 'Khách đoàn',
          branch_id: shopId,
          employee_id: user.email || 'system',
          subtotal: '0',
          discount_amount: '0',
          total_amount: '0',
          paid_amount: '0',
          created_at: getGMT7Time()
        })
        finalTargetId = targetOrder.id
      } else {
        targetOrder = await connector.findById('orders', finalTargetId)
      }

      if (!targetOrder) {
        return NextResponse.json({ error: 'Đơn hàng đích không tồn tại' }, { status: 400 })
      }

      // Re-parent all items from source orders to the target order
      for (const srcId of sourceOrderIds) {
        if (srcId === finalTargetId) continue
        
        const itemsResult = await connector.list('order-items', {
          filters: { order_id: srcId },
          limit: 200
        })
        const items = itemsResult.data || []

        for (const item of items) {
          await connector.update('order-items', item.id, {
            order_id: finalTargetId,
            order_no: targetOrder.order_no
          })
        }

        // Cancel / Mark source order as merged
        await connector.update('orders', srcId, {
          status: 'cancelled',
          note: `Đã gộp vào đơn hàng #${targetOrder.order_no}`
        })

        // Free up the resource linked to the source order
        const srcOrderObj = await connector.findById('orders', srcId)
        if (srcOrderObj && srcOrderObj.resource_id) {
          await connector.update('location-resources', srcOrderObj.resource_id, {
            status: 'available',
            current_order_id: null as any
          })
        }
      }

      // Recalculate target order totals
      await recalculateOrderTotals(connector, finalTargetId)

      invalidate(shopId, 'orders')
      invalidate(shopId, 'order-items')
      invalidate(shopId, 'location-resources')

      return NextResponse.json({ success: true, mergedOrderId: finalTargetId })
    } 
    
    if (action === 'split') {
      // SPLIT ACTION: Move specific items from a source order to specific target orders
      if (!splits || !Array.isArray(splits)) {
        return NextResponse.json({ error: 'Thiếu dữ liệu phân tách (splits)' }, { status: 400 })
      }

      const affectedOrderIds = new Set<string>()

      for (const entry of splits) {
        const { targetOrderId: tgtId, itemIds } = entry
        if (!tgtId || !itemIds || !Array.isArray(itemIds)) continue

        const targetOrder = await connector.findById('orders', tgtId)
        if (!targetOrder) continue

        affectedOrderIds.add(tgtId)

        for (const itemId of itemIds) {
          await connector.update('order-items', itemId, {
            order_id: tgtId,
            order_no: targetOrder.order_no
          })
        }
      }

      // Update deposit allocations if provided
      if (deposits && Array.isArray(deposits)) {
        for (const dep of deposits) {
          const { orderId, amount } = dep
          const targetOrd = await connector.findById('orders', orderId)
          if (!targetOrd) continue

          affectedOrderIds.add(orderId)

          // Update order metadata or deposit field
          let meta = {}
          try {
            meta = typeof targetOrd.metadata === 'string' ? JSON.parse(targetOrd.metadata) : (targetOrd.metadata || {})
          } catch {}

          const updatedMeta = {
            ...meta,
            deposit_amount: String(amount)
          }

          await connector.update('orders', orderId, {
            metadata: JSON.stringify(updatedMeta)
          })
        }
      }

      // Recalculate totals for all affected orders
      if (body.sourceOrderId) {
        affectedOrderIds.add(body.sourceOrderId)
      }
      for (const orderId of affectedOrderIds) {
        await recalculateOrderTotals(connector, orderId)
      }

      invalidate(shopId, 'orders')
      invalidate(shopId, 'order-items')

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })
  } catch (e) {
    return handleApiError(e, 'POST split-merge orders')
  }
}
