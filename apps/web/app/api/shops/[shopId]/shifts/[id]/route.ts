export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { shiftCloseSchema } from '@/lib/validators/shifts'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.manage')

    const body = await req.json()
    const payload = shiftCloseSchema.parse(body)

    // 1. Lấy thông tin ca làm việc hiện tại
    const shift = await connector.findById('shop-shifts', id)
    if (!shift) {
      return NextResponse.json({ error: 'Không tìm thấy ca làm việc này' }, { status: 404 })
    }

    // Chống gian lận: Nếu ca đã đóng (status = 'closed'), khóa vĩnh viễn không cho sửa đổi
    if (shift.status === 'closed') {
      return NextResponse.json(
        { error: 'Ca làm việc này đã được chốt và đóng trước đó. Không được phép chỉnh sửa số liệu ca làm việc đã đóng!' },
        { status: 400 }
      )
    }

    const openedTime = new Date(shift.opened_at).getTime()
    const closedTime = Date.now()

    // 2. Tính toán chính xác expected_closing_cash & non_cash_revenue phát sinh trong ca
    // Quét orders
    const ordersRes = await connector.list('orders', {
      filters: { branch_id: shift.branch_id },
      limit: 5000
    })
    const orders = (ordersRes.data as Record<string, string>[]).filter(o => {
      const t = new Date(o.created_at || '').getTime()
      return t >= openedTime && t <= closedTime
    })

    // Quét cashbook
    const cbRes = await connector.list('cashbook', {
      filters: { branch_id: shift.branch_id },
      limit: 5000
    })
    const cashbook = (cbRes.data as Record<string, string>[]).filter(cb => {
      const t = new Date(cb.created_at || '').getTime()
      return t >= openedTime && t <= closedTime
    })

    let cash_in = 0
    let cash_out = 0
    let bank_transfer = 0
    let card = 0
    let momo = 0

    // Tổng hợp doanh thu đơn hàng
    for (const order of orders) {
      const paid = parseFloat(order.paid_amount || '0')
      const method = order.payment_method || 'cash'
      
      if (method === 'cash') {
        cash_in += paid
      } else if (method === 'bank_transfer') {
        bank_transfer += paid
      } else if (method === 'card') {
        card += paid
      } else if (method === 'momo') {
        momo += paid
      }
    }

    // Tổng hợp phiếu thu chi cashbook khác (bỏ qua 'sales' tránh trùng lặp)
    for (const cb of cashbook) {
      if (cb.category === 'sales') continue

      const amount = parseFloat(cb.amount || '0')
      const method = cb.method || 'cash'
      const type = cb.type // 'receipt' | 'payment'

      if (type === 'receipt') {
        if (method === 'cash') cash_in += amount
        else if (method === 'bank_transfer') bank_transfer += amount
        else if (method === 'card') card += amount
        else if (method === 'momo') momo += amount
      } else if (type === 'payment') {
        if (method === 'cash') cash_out += amount
        else if (method === 'bank_transfer') bank_transfer -= amount
        else if (method === 'card') card -= amount
        else if (method === 'momo') momo -= amount
      }
    }

    const openingCash = parseFloat(shift.opening_cash || '0')
    const expectedClosingCash = openingCash + cash_in - cash_out
    const actualClosingCash = payload.actual_closing_cash
    const variance = actualClosingCash - expectedClosingCash

    // 3. Cập nhật đóng ca
    const updatedShift = await connector.update('shop-shifts', id, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      expected_closing_cash: String(expectedClosingCash),
      actual_closing_cash: String(actualClosingCash),
      cash_variance: String(variance),
      non_cash_revenue: JSON.stringify({
        bank_transfer,
        card,
        momo,
      }),
      note: payload.note ?? '',
    })

    invalidate(shopId, 'shop-shifts')
    return NextResponse.json(updatedShift)
  } catch (e) {
    return handleApiError(e, 'PUT shift close')
  }
}
