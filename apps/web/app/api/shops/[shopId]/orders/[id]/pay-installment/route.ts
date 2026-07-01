import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { updateCustomerStats } from '@/lib/server/customerStats'

import { getGMT7Time } from '@oni/core'


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

    const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random()*1000)}`

    const payData = {
      id: paymentId,
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
      category: 'prepaid_deposit',
      reference_id: orderId,
      reference_name: order.customer_name || '',
      note: `Thanh toán trước cho đơn ${order.order_no || orderId}${note ? ` - ${note}` : ''}`,
      employee_id: order.employee_id || '',
      branch_id: order.branch_id || '',
      date: getGMT7Time().split('T')[0],
    }

    // Ghi nhận tăng ví trả trước (prepaid_balance) của khách hàng
    const targetBranch = order.branch_id || shopId
    const customerId = order.customer_id
    if (customerId && !customerId.startsWith('virtual:')) {
      const statsRes = await connector.list('customer-branch-stats', {
        filters: { customer_id: customerId, branch_id: targetBranch }
      })
      const stats = statsRes.data[0]
      const customer = await connector.findById('customers', customerId)
      const currentPrepaid = parseFloat(stats?.prepaid_balance ?? customer?.prepaid_balance ?? '0')
      const newPrepaid = currentPrepaid + payAmount

      await updateCustomerStats(connector, customerId, targetBranch, {
        prepaid_balance: String(newPrepaid)
      })
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
    invalidate(shopId, 'customers')

    return NextResponse.json({ payment: createdPay, cashbook: createdCb, order: updatedOrder }, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST pay-installment')
  }
}
