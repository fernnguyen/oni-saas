import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'customers.edit')

    const body = await req.json() as { amount: number; method: string; note?: string; employee_id?: string; branch_id?: string }
    const { amount, method, note, employee_id, branch_id } = body

    if (amount <= 0) {
      return NextResponse.json({ error: 'Số tiền nạp phải lớn hơn 0' }, { status: 400 })
    }

    const customer = await connector.findById('customers', id)
    if (!customer) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 })
    }

    const currentPrepaid = parseFloat((customer.prepaid_balance as string) || '0')
    const newPrepaid = currentPrepaid + amount

    // Update customer prepaid balance
    await connector.update('customers', id, {
      prepaid_balance: String(newPrepaid)
    })

    // Create cashbook entry
    await connector.create('cashbook', {
      type: 'receipt',
      amount: String(amount),
      method: method,
      category: 'prepaid_deposit',
      reference_id: id,
      reference_name: (customer.name as string) || '',
      note: note || `Nạp tiền ví trả trước cho khách hàng ${customer.name}`,
      employee_id: employee_id || '',
      branch_id: branch_id || '',
    })

    invalidate(shopId, 'customers')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({ prepaid_balance: newPrepaid })
  } catch (e) {
    return handleApiError(e, 'POST customer deposit')
  }
}
