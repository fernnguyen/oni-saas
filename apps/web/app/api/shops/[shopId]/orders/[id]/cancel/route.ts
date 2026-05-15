import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { RollbackContext } from '@oni/adapters'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function calcReverseDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return -Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return Math.abs(qty)
  return 0
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId, id } = await params
    const { connector, user, shop } = await requireShopAccess(shopId, 'orders.delete')
    tx = new RollbackContext()

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || 'Không rõ'

    const order = await connector.findById('orders', id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'Đơn hàng đã được hủy trước đó' }, { status: 400 })
    }

    const orderNo = (order as Record<string, string>).order_no ?? id
    // 1. Process Cashbook refund (Idempotent)
    const paidAmount = parseFloat((order as Record<string, string>).paid_amount || '0')
    if (paidAmount > 0) {
      const existingCb = await connector.list('cashbook', {
        page: 1, limit: 10, filters: { reference_id: id, type: 'payment', category: 'refund' }
      })
      const alreadyRefunded = existingCb.data.some((cb: any) => cb.note && cb.note.includes('Điều chỉnh tiền hủy đơn hàng'))
      
      if (!alreadyRefunded) {
        const createdCb = await connector.create('cashbook', {
          type: 'payment',
          amount: String(paidAmount),
          method: 'cash',
          category: 'refund',
          reference_id: id,
          reference_name: (order as Record<string, string>).customer_name || 'Khách lẻ',
          note: `Điều chỉnh tiền hủy đơn hàng ${orderNo} - Lý do: ${reason}`,
          employee_id: user.id,
          branch_id: (order as Record<string, string>).branch_id || '',
          created_at: new Date().toISOString()
        })
        tx.add(async () => {
          await connector.delete('cashbook', (createdCb as any).transaction_id).catch(() => {})
        })
      }
    }

    // 2. Reverse inventory and stock movements (Idempotent)
    if (orderNo) {
      const mvResult = await connector.list('stock-movements', {
        page: 1, limit: 200,
        filters: { reference_no: orderNo },
      })
      
      const existingCancelMvs = await connector.list('stock-movements', {
        page: 1, limit: 200,
        filters: { reference_no: orderNo, type: 'return_in' }
      })

      const existingMovAll = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'return_in' } })
      const pthNums = (existingMovAll.data as Record<string, string>[])
        .map(r => r.movement_no)
        .filter((n): n is string => typeof n === 'string' && n.startsWith('PTH-'))
        .map(n => parseInt(n.slice(4), 10))
        .filter(n => !isNaN(n))
      let pthCounter = pthNums.length > 0 ? Math.max(...pthNums) : 0

      for (const mv of mvResult.data as Record<string, string>[]) {
        const delta = calcReverseDelta(mv.type, parseFloat(mv.qty || '0'))
        if (delta === 0) continue

        const alreadyRestored = existingCancelMvs.data.some((ex: any) => 
          ex.product_id === mv.product_id && 
          parseFloat(ex.qty || '0') === delta &&
          ex.reason && ex.reason.includes('Điều chỉnh kho do hủy')
        )

        if (!alreadyRestored) {
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
            const oldQty = parseFloat(inv.stock_qty || '0')
            const newQty = Math.max(0, oldQty + delta)
            await connector.update('inventory', inv.inventory_id, { stock_qty: String(newQty) })
            tx.add(async () => {
              await connector.update('inventory', inv.inventory_id, { stock_qty: String(oldQty) }).catch(() => {})
            })
          }

          pthCounter += 1
          const movementNo = `PTH-${String(pthCounter).padStart(3, '0')}`

          const createdMv = await connector.create('stock-movements', {
            type: 'return_in',
            movement_no: movementNo,
            product_id: mv.product_id,
            qty: String(delta),
            branch_id: branchId,
            reference_no: orderNo,
            employee_id: user.id,
            reason: `Điều chỉnh kho do hủy đơn hàng ${orderNo} - Lý do: ${reason}`,
            created_at: new Date().toISOString()
          })
          tx.add(async () => {
            await connector.delete('stock-movements', (createdMv as any).movement_id).catch(() => {})
          })
        }
      }
    }

    // 2.5 Process Debt reversal
    // Since debt reduction doesn't have an audit table, we do it right before marking the order as cancelled
    // to minimize the window where a failure could cause duplicate debt reduction.
    const debtAmount = parseFloat((order as Record<string, string>).debt_amount || '0')
    const customerId = (order as Record<string, string>).customer_id
    if (debtAmount > 0 && customerId) {
      const customer = await connector.findById('customers', customerId)
      if (customer) {
        const currentDebt = parseFloat((customer.debt_amount as string) || '0')
        const newDebt = Math.max(0, currentDebt - debtAmount)
        await connector.update('customers', customerId, { debt_amount: String(newDebt) })
        tx.add(async () => {
          await connector.update('customers', customerId, { debt_amount: String(currentDebt) }).catch(() => {})
        })
        invalidate(shopId, 'customers')
      }
    }

    // 3. Update order status to cancelled (Done last to act as commit!)
    const oldNote = (order as Record<string, string>).note || ''
    const oldStatus = (order as Record<string, string>).status || 'completed'
    const updatedNote = oldNote ? `${oldNote}\n[Hủy] ${reason}` : `[Hủy] ${reason}`
    await connector.update('orders', id, { status: 'cancelled', note: updatedNote })
    tx.add(async () => {
      await connector.update('orders', id, { status: oldStatus, note: oldNote }).catch(() => {})
    })

    const domainName = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'oni.vn'
    const cancelledBy = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Hệ thống'
    const totalAmount = Number((order as Record<string, string>).total_amount || 0)

    dispatchNotification(shop.tenant_id, 'ORDER_CANCELLED', {
      title: 'Đơn hàng bị hủy',
      message: `Mã đơn: ${orderNo}\nKhách hàng: ${(order as Record<string, string>).customer_name || 'Khách lẻ'}\nTổng tiền: ${totalAmount.toLocaleString('vi-VN')}đ\nLý do hủy: ${reason}\n\n📝 Người hủy: ${cancelledBy} (${domainName})`,
    }).catch(err => console.error('Failed to dispatch ORDER_CANCELLED:', err))

    invalidate(shopId, 'orders')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'cashbook')
    invalidate(shopId, 'stock-movements')
    return NextResponse.json({ success: true })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'CANCEL order')
  }
}
