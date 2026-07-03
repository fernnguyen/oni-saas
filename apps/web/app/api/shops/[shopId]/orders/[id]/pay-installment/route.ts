import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { updateCustomerStats } from '@/lib/server/customerStats'
import { RollbackContext } from '@oni/adapters'
import { resolveAndRecordPayment } from '@/lib/server/paymentFunds'

import { getGMT7Time } from '@oni/core'


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId, id: orderId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')
    tx = new RollbackContext()

    const body = await req.json()
    const { method, amount, reference_no, note, fund_id } = body

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

    // Resolve fund and update balance
    const { fundId, balanceAfter } = await resolveAndRecordPayment(
      connector,
      shopId,
      { amount: payAmount, method, fund_id },
      false, // isExpense = false (receipt of payment increases balance)
      tx
    )

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
      fund_id: fundId,
      balance_after_transaction: balanceAfter,
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
      }, tx)
    }

    const createdPay = await connector.create('payments', payData)
    tx.add(async () => {
      await connector.delete('payments', createdPay.id || createdPay.payment_id).catch(() => {})
    })

    const createdCb = await connector.create('cashbook', cashbookData)
    tx.add(async () => {
      await connector.delete('cashbook', createdCb.transaction_id || createdCb.id).catch(() => {})
    })

    const updatedOrder = await connector.update('orders', orderId, {
      paid_amount: String(newPaidAmount),
    })
    tx.add(async () => {
      await connector.update('orders', orderId, { paid_amount: String(currentPaid) }).catch(() => {})
    })

    invalidate(shopId, 'orders')
    invalidate(shopId, 'payments')
    invalidate(shopId, 'cashbook')
    invalidate(shopId, 'customers')
    invalidate(shopId, 'payment-funds')

    return NextResponse.json({ payment: createdPay, cashbook: createdCb, order: updatedOrder }, { status: 201 })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST pay-installment')
  }
}
