import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'
import { updateCustomerStats } from '@/lib/server/customerStats'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'customers.edit')

    const body = await req.json() as { 
      amount: number 
      method: string 
      note?: string 
      employee_id?: string 
      branch_id?: string 
      fund_id?: string 
      auto_deduct_debt?: boolean 
    }
    const { amount, method, note, employee_id, branch_id, fund_id, auto_deduct_debt } = body

    if (amount <= 0) {
      return NextResponse.json({ error: 'Số tiền nạp phải lớn hơn 0' }, { status: 400 })
    }

    const customer = await connector.findById('customers', id)
    if (!customer) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 })
    }

    const targetBranch = branch_id || shopId
    const statsRes = await connector.list('customer-branch-stats', {
      filters: { customer_id: id, branch_id: targetBranch }
    })
    const stats = statsRes.data[0]

    const currentPrepaid = parseFloat(stats?.prepaid_balance ?? customer.prepaid_balance ?? '0')
    const currentDebt = parseFloat(stats?.debt_amount ?? customer.debt_amount ?? '0')

    let debtPayment = 0
    let prepaidDeposit = amount

    if (auto_deduct_debt && currentDebt > 0) {
      debtPayment = Math.min(amount, currentDebt)
      prepaidDeposit = amount - debtPayment
    }

    const newPrepaid = currentPrepaid + prepaidDeposit
    const newDebt = Math.max(0, currentDebt - debtPayment)

    // Update customer prepaid balance and outstanding debt in both shared and branch tables
    await updateCustomerStats(connector, id, branch_id || shopId, {
      prepaid_balance: String(newPrepaid),
      debt_amount: String(newDebt)
    })

    // Update payment fund balance if provided
    if (fund_id) {
      const fund = await connector.findById('payment-funds', fund_id)
      if (fund) {
        const currentFundBalance = parseFloat(fund.current_balance || '0')
        await connector.update('payment-funds', fund_id, {
          current_balance: String(currentFundBalance + amount)
        })
      }
    }

    // Create cashbook entries
    // If debtPayment > 0, create a receipt of category debt_collection
    if (debtPayment > 0) {
      await connector.create('cashbook', {
        type: 'receipt',
        amount: String(debtPayment),
        method: method,
        category: 'debt_collection',
        reference_id: id,
        reference_name: (customer.name as string) || '',
        note: `[Khấu trừ nợ tự động] ${note || `Thu nợ khách hàng ${customer.name}`}`,
        employee_id: employee_id || '',
        branch_id: branch_id || '',
        fund_id: fund_id || '',
      })
    }

    // If prepaidDeposit > 0, create a receipt of category prepaid_deposit
    if (prepaidDeposit > 0) {
      await connector.create('cashbook', {
        type: 'receipt',
        amount: String(prepaidDeposit),
        method: method,
        category: 'prepaid_deposit',
        reference_id: id,
        reference_name: (customer.name as string) || '',
        note: `[Nạp ví trả trước] ${note || `Nạp tiền ví trả trước cho khách hàng ${customer.name}`}`,
        employee_id: employee_id || '',
        branch_id: branch_id || '',
        fund_id: fund_id || '',
      })
    }

    invalidate(shopId, 'customers')
    invalidate(shopId, 'cashbook')
    if (fund_id) {
      invalidate(shopId, 'payment-funds')
    }

    return NextResponse.json({ prepaid_balance: newPrepaid, debt_amount: newDebt })
  } catch (e) {
    return handleApiError(e, 'POST customer deposit')
  }
}
