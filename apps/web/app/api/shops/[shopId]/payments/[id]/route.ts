import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, user, permissions } = await requireShopAccess(shopId, 'orders.edit')

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

    // Fetch the order to get the correct created_at time
    const order = await connector.findById('orders', payment.order_id) as Record<string, any> | null
    if (!order) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng tương ứng' }, { status: 404 })
    }

    // 1.5. Kiểm tra giới hạn 30 phút kể từ lúc tạo đơn hàng
    const orderCreatedAt = new Date(order.created_at || payment.created_at).getTime()
    const isOvertime = (Date.now() - orderCreatedAt) > (30 * 60 * 1000) // 30 phút
    const isManager = permissions.includes('payments.force_edit')

    if (isOvertime && !isManager) {
      return NextResponse.json({ 
        error: 'Đơn hàng đã được tạo quá 30 phút, không thể thay đổi thông tin thanh toán. Vui lòng hủy đơn và tạo lại.' 
      }, { status: 400 })
    }

    // 1.6. Kiểm tra quản lý ca (Shift Management)
    const admin = getSupabaseAdminClient()
    const { data: settings } = await admin
      .from('shop_settings')
      .select('enable_shift_management')
      .eq('shop_id', shopId)
      .maybeSingle()

    const isShiftEnabled = settings?.enable_shift_management ?? false
    if (isShiftEnabled) {
      const cashierEmail = payment.cashier_id || ''
      const paymentTimeStr = payment.created_at || payment.paid_at

      if (cashierEmail && paymentTimeStr) {
        const shiftsRes = await connector.list('shop-shifts', {
          filters: { branch_id: payment.branch_id || order.branch_id || '', user_id: cashierEmail }
        })

        const parseTime = (timeStr: string | Date | undefined): number => {
          if (!timeStr) return 0
          const str = typeof timeStr === 'string' ? timeStr : timeStr.toISOString()
          if (str.includes('Z') || /[\+\-]\d{2}:?\d{2}$/.test(str)) {
            return new Date(str).getTime()
          }
          const formatted = str.replace(' ', 'T')
          return new Date(formatted + '+07:00').getTime()
        }

        const pTime = parseTime(paymentTimeStr)

        const matchingShift = (shiftsRes.data || []).find((shift: any) => {
          const openTime = parseTime(shift.opened_at)
          const closeTime = shift.closed_at ? parseTime(shift.closed_at) : Date.now()
          return pTime >= openTime && pTime <= closeTime
        })

        if (matchingShift) {
          // A. Nếu ca đã chốt đóng -> chặn cứng, không cho sửa
          if (matchingShift.status === 'closed') {
            return NextResponse.json({ 
              error: 'Không thể sửa phương thức thanh toán vì ca làm việc của giao dịch này đã chốt và đóng.' 
            }, { status: 400 })
          }

          // B. Nếu ca đang mở nhưng người sửa không phải chủ ca và không phải quản lý
          if (matchingShift.user_id !== user.email && !isManager) {
            return NextResponse.json({ 
              error: 'Bạn không phải chủ ca của giao dịch này. Chỉ chủ ca hoặc Quản lý mới có quyền chỉnh sửa.' 
            }, { status: 403 })
          }
        }
      }
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
