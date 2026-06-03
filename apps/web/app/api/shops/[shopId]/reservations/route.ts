export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { updateCustomerStats } from '@/lib/server/customerStats'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')))
    const status = sp.get('status') ?? ''
    const channel_id = sp.get('channel_id') ?? ''
    const resource_id = sp.get('resource_id') ?? ''

    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (channel_id) filters.channel_id = channel_id
    if (resource_id) filters.resource_id = resource_id

    const result = await connector.list('reservations', {
      page,
      limit,
      filters,
      sortDesc: true
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reservations')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json()
    const { payments, ...reservationData } = body

    let finalCustomerId = reservationData.customer_id ?? ''
    
    // Auto-create customer if name is provided but ID is virtual or empty
    const isRetailGuest = !reservationData.customer_name || reservationData.customer_name.trim().toLowerCase() === 'khách lẻ' || reservationData.customer_name.trim().toLowerCase() === 'khach le';
    if (isRetailGuest) {
      finalCustomerId = 'C-DEFAULT-RETAIL'
      reservationData.customer_name = 'Khách lẻ'
    } else if (!finalCustomerId || finalCustomerId.startsWith('virtual:')) {
      const newCustomer = await connector.create('customers', {
        name: reservationData.customer_name,
        phone: reservationData.customer_phone || '',
        branch_id: shopId,
        prepaid_balance: '0',
        loyalty_points: '0',
        debt_amount: '0'
      })
      finalCustomerId = (newCustomer as any).id || (newCustomer as any).customer_id || ''
    }
    
    // Scoping to shop/branch
    const data = {
      ...reservationData,
      customer_id: finalCustomerId,
      branch_id: shopId,
      created_by: user.email || 'system'
    }

    const created = await connector.create('reservations', data)
    const reservationId = created.id || (created as any).reservation_id

    // Fallback cho tương thích ngược nếu chỉ gửi deposit_amount
    const legacyPayments = []
    if (!payments && parseFloat(data.deposit_amount || '0') > 0) {
      legacyPayments.push({
        fund_id: data.deposit_fund_id || '',
        amount: parseFloat(data.deposit_amount),
        method: 'cash'
      })
    }
    const finalPayments = payments && Array.isArray(payments) ? payments : legacyPayments

    // Xử lý ghi nhận các khoản thanh toán đặt cọc
    let totalDeposit = 0
    if (finalPayments.length > 0) {
      for (const pay of finalPayments) {
        const payAmount = parseFloat(String(pay.amount || '0'))
        if (payAmount <= 0) continue
        totalDeposit += payAmount

        // 1. Tạo phiếu thu tương ứng trong Sổ quỹ
        await connector.create('cashbook', {
          type: 'receipt',
          amount: String(payAmount),
          method: pay.method || 'bank_transfer',
          category: 'prepaid_deposit',
          reference_id: finalCustomerId,
          reference_name: data.customer_name || 'Khách lẻ',
          note: `[Đặt cọc phòng] Thu tiền đặt giữ chỗ #${data.reservation_no}${pay.reference_no ? ` (${pay.reference_no})` : ''}`,
          employee_id: user.email || 'system',
          branch_id: shopId,
          fund_id: pay.fund_id || '',
          is_virtual: 'FALSE',
        })

        // 2. Cập nhật số dư tài khoản quỹ
        if (pay.fund_id) {
          const fund = await connector.findById('payment-funds', pay.fund_id)
          if (fund) {
            const currentFundBalance = parseFloat(fund.current_balance || '0')
            await connector.update('payment-funds', pay.fund_id, {
              current_balance: String(currentFundBalance + payAmount)
            })
          }
        }
      }

      // 3. Cập nhật số dư trả trước của khách hàng
      const customerId = data.customer_id
      if (customerId && !customerId.startsWith('virtual:') && totalDeposit > 0) {
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: customerId, branch_id: shopId }
        })
        const stats = statsRes.data[0]
        const currentPrepaid = parseFloat(stats?.prepaid_balance || '0')
        const newPrepaid = currentPrepaid + totalDeposit

        await updateCustomerStats(connector, customerId, shopId, {
          prepaid_balance: String(newPrepaid)
        })
      }
    }

    invalidate(shopId, 'reservations')
    if (finalPayments.length > 0) {
      invalidate(shopId, 'cashbook')
      invalidate(shopId, 'payment-funds')
      invalidate(shopId, 'customers')
    }
    
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST reservations')
  }
}
