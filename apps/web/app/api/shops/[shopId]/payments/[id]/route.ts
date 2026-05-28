import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const { method: newMethod, fund_id: newFundId } = body

    if (!newMethod) {
      return NextResponse.json({ error: 'Phương thức thanh toán mới là bắt buộc' }, { status: 400 })
    }

    // 1. Fetch the payment record
    const payment = await connector.findById('payments', id) as Record<string, any> | null
    if (!payment) {
      return NextResponse.json({ error: 'Không tìm thấy bản ghi thanh toán' }, { status: 404 })
    }

    const orderId = payment.order_id
    const oldMethod = payment.method
    const amountVal = Math.abs(parseFloat(payment.amount || '0'))
    const isRefund = parseFloat(payment.amount || '0') < 0

    // 2. Fetch the funds list to find old and new funds
    const fundsRes = await connector.list('payment-funds', { page: 1, limit: 100 })
    const fundsList = (fundsRes.data || []) as Record<string, any>[]

    const newFund = fundsList.find(f => f.id === newFundId)
    if (newFundId && !newFund) {
      return NextResponse.json({ error: 'Không tìm thấy Quỹ đích mới' }, { status: 400 })
    }

    // 3. Find the corresponding cashbook entry
    // It should have reference_id = orderId, method = oldMethod, and matching amount
    const cashbookRes = await connector.list('cashbook', {
      page: 1,
      limit: 100,
      filters: { reference_id: orderId }
    })
    const cashbookList = (cashbookRes.data || []) as Record<string, any>[]
    
    const matchingCb = cashbookList.find(cb => 
      cb.method === oldMethod && 
      Math.abs(parseFloat(cb.amount || '0')) === amountVal &&
      (isRefund ? cb.type === 'expense' : cb.type === 'receipt')
    )

    // 4. Update the payment method on the payments table
    await connector.update('payments', id, { method: newMethod })

    // 5. Update cashbook and Sổ Quỹ fund balances if a cashbook record matches
    if (matchingCb) {
      const oldFundId = matchingCb.fund_id
      const oldFund = fundsList.find(f => f.id === oldFundId)

      // Re-balance Sổ Quỹ Fund Balances
      // A. Revert old fund balance
      if (oldFund) {
        const currentBal = parseFloat(oldFund.current_balance || '0')
        // if it was a refund (expense), reverting means adding it back
        // if it was a payment (receipt), reverting means subtracting it
        const revertedBal = isRefund ? currentBal + amountVal : currentBal - amountVal
        await connector.update('payment-funds', oldFund.id, {
          current_balance: String(revertedBal)
        })
      }

      // B. Update new fund balance
      let newBalanceAfter = ''
      if (newFund) {
        const currentBal = parseFloat(newFund.current_balance || '0')
        // if it is a refund (expense), subtract it from new fund
        // if it is a payment (receipt), add it to new fund
        const nextBal = isRefund ? currentBal - amountVal : currentBal + amountVal
        newBalanceAfter = String(nextBal)
        await connector.update('payment-funds', newFund.id, {
          current_balance: newBalanceAfter
        })
      }

      // C. Update cashbook transaction record itself
      const cashbookUpdate: Record<string, string> = {
        method: newMethod,
        fund_id: newFundId || ''
      }
      if (newBalanceAfter) {
        cashbookUpdate.balance_after_transaction = newBalanceAfter
      }
      
      await connector.update('cashbook', matchingCb.transaction_id || matchingCb.id, cashbookUpdate)
    }

    // Invalidate caches
    invalidate(shopId, 'payments')
    invalidate(shopId, 'orders')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'PUT payment')
  }
}
