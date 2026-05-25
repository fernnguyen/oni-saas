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

    // Hàm chuẩn hóa thời gian: hỗ trợ chuỗi UTC (có Z hoặc múi giờ) và chuỗi GMT+7 không có Z (được sinh ra bởi getGMT7Time() của adapter)
    const parseTime = (timeStr: string | Date | undefined): number => {
      if (!timeStr) return 0
      const str = typeof timeStr === 'string' ? timeStr : timeStr.toISOString()
      if (str.includes('Z') || /[\+\-]\d{2}:?\d{2}$/.test(str)) {
        return new Date(str).getTime()
      }
      const formatted = str.replace(' ', 'T')
      return new Date(formatted + '+07:00').getTime()
    }

    const openedTime = parseTime(shift.opened_at)
    const closedTime = Date.now()

    console.log(`[Shift Close] ID: ${id}, Branch: ${shift.branch_id}, Opened: ${shift.opened_at} (${new Date(openedTime).toISOString()}), Closed: ${new Date(closedTime).toISOString()}`)

    // 2. Tính toán chính xác expected_closing_cash & non_cash_revenue phát sinh trong ca
    // Quét cashbook (Nguồn dữ liệu duy nhất ghi nhận toàn bộ dòng tiền: bán hàng, hoàn tiền, thu chi khác)
    const cbRes = await connector.list('cashbook', {
      filters: { branch_id: shift.branch_id },
      limit: 100000 // Lấy tối đa 100k dòng lịch sử
    })
    const cashbook = (cbRes.data as Record<string, string>[]).filter(cb => {
      const t = parseTime(cb.created_at)
      return t >= openedTime && t <= closedTime
    })

    console.log(`[Shift Close] Total cashbook records in DB: ${cbRes.data.length}, Filtered in shift: ${cashbook.length}`)

    let cash_in = 0
    let cash_out = 0
    let bank_transfer = 0
    let card = 0
    let momo = 0 // Bao gồm Momo, ZaloPay, VNPay, và ví điện tử khác

    for (const cb of cashbook) {
      const amount = parseFloat(cb.amount || '0')
      const rawMethod = (cb.method || 'cash').toLowerCase()
      const type = cb.type // 'receipt' | 'payment' | 'expense'

      const isCash = rawMethod === 'cash'
      const isBank = ['bank_transfer', 'bank', 'banking'].includes(rawMethod)
      const isCard = ['card', 'card_pos', 'credit', 'debit'].includes(rawMethod)
      const isMomo = ['momo', 'zalopay', 'vnpay', 'wallet', 'moca', 'shopeepay'].includes(rawMethod)

      console.log(`[Shift Close] Cashbook item: ID=${cb.id || cb.transaction_id}, Type=${type}, Method=${rawMethod}, Amount=${amount}`)

      if (type === 'receipt') {
        if (isCash) {
          cash_in += amount
        } else if (isBank) {
          bank_transfer += amount
        } else if (isCard) {
          card += amount
        } else if (isMomo) {
          momo += amount
        }
      } else if (type === 'payment' || type === 'expense') {
        if (isCash) {
          cash_out += amount
        } else if (isBank) {
          bank_transfer -= amount
        } else if (isCard) {
          card -= amount
        } else if (isMomo) {
          momo -= amount
        }
      }
    }

    console.log(`[Shift Close] Calculated Revenue: Cash In=${cash_in}, Cash Out=${cash_out}, Bank=${bank_transfer}, Card=${card}, Momo/Wallet=${momo}`)

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
