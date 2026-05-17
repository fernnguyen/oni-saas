import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  return new Date(utc + 3600000 * 7).toISOString()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id: orderId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const { method, amount, reference_no, note } = body

    if (!method || !amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
    }

    const orderRow = await connector.findById('orders', orderId)
    if (!orderRow) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 })
    }

    const order = orderRow as Record<string, string>
    const payAmount = Number(amount)
    const currentPaid = Number(order.paid_amount || '0')
    const newPaidAmount = currentPaid + payAmount

    const payData = {
      order_id: orderId,
      order_no: order.order_no || '',
      method: method,
      amount: String(payAmount),
      reference_no: reference_no || '',
      note: note || '',
      paid_at: getGMT7Time(),
    }

    const cashbookData = {
      type: 'receipt',
      amount: String(payAmount),
      method: method,
      category: 'sales',
      reference_id: orderId,
      reference_name: order.customer_name || '',
      note: `Thanh toán đợt cho đơn ${order.order_no || orderId}${note ? ` - ${note}` : ''}`,
      employee_id: order.employee_id || '',
      branch_id: order.branch_id || '',
      date: getGMT7Time().split('T')[0],
    }

    const [createdPay, createdCb] = await Promise.all([
      connector.create('payments', payData),
      connector.create('cashbook', cashbookData),
    ])

    const updatedOrder = await connector.update('orders', orderId, {
      paid_amount: String(newPaidAmount),
    })

    invalidate(shopId, 'orders')
    invalidate(shopId, 'payments')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({ payment: createdPay, cashbook: createdCb, order: updatedOrder }, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST pay-installment')
  }
}
