export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { shiftOpenSchema } from '@/lib/validators/shifts'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const user_id = searchParams.get('user_id') // email nhân viên
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Force strict branch filtering
    const filters: Record<string, string> = { branch_id: shopId }
    if (status) filters.status = status
    if (user_id) filters.user_id = user_id

    const result = await connector.list('shop-shifts', { page, limit, filters, sortDesc: true })
    const shifts = result.data as Record<string, any>[]

    // Real-time calculation for active/open shifts
    const openShifts = shifts.filter(s => s.status === 'open')
    if (openShifts.length > 0) {
      const cbRes = await connector.list('cashbook', {
        filters: { branch_id: shopId },
        limit: 100000
      })
      const cashbook = cbRes.data as Record<string, string>[]

      const parseTime = (timeStr: string | Date | undefined): number => {
        if (!timeStr) return 0
        const str = typeof timeStr === 'string' ? timeStr : timeStr.toISOString()
        if (str.includes('Z') || /[\+\-]\d{2}:?\d{2}$/.test(str)) {
          return new Date(str).getTime()
        }
        const formatted = str.replace(' ', 'T')
        return new Date(formatted + '+07:00').getTime()
      }

      for (const shift of openShifts) {
        const openedTime = parseTime(shift.opened_at)
        const currentTime = Date.now()

        const shiftTxs = cashbook.filter(cb => {
          const t = parseTime(cb.created_at)
          const isWithinTime = t >= openedTime && t <= currentTime
          const isSameEmployee = cb.employee_id === shift.user_id
          return isWithinTime && isSameEmployee
        })

        let cash_in = 0
        let cash_out = 0
        let bank_transfer = 0
        let card = 0
        let momo = 0

        for (const cb of shiftTxs) {
          const amount = parseFloat(cb.amount || '0')
          const rawMethod = (cb.method || 'cash').toLowerCase()
          const type = cb.type

          const isCash = rawMethod === 'cash'
          const isBank = ['bank_transfer', 'bank', 'banking'].includes(rawMethod)
          const isCard = ['card', 'card_pos', 'credit', 'debit'].includes(rawMethod)
          const isMomo = ['momo', 'zalopay', 'vnpay', 'wallet', 'moca', 'shopeepay'].includes(rawMethod)

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

        const openingCash = parseFloat(shift.opening_cash || '0')
        shift.expected_closing_cash = String(openingCash + cash_in - cash_out)
        shift.non_cash_revenue = JSON.stringify({
          bank_transfer,
          card,
          momo,
        })
      }
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET shifts')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user, permissions } = await requireShopAccess(shopId)

    if (!permissions.includes('cashbook.manage') && !permissions.includes('pos.use')) {
      return NextResponse.json(
        { error: 'Bạn không có quyền thực hiện tính năng này. Vui lòng liên hệ người quản trị.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const payload = shiftOpenSchema.parse(body)
    const userEmail = user.email || ''

    // Force strict branch scoping on write
    payload.branch_id = shopId

    // 1. Kiểm tra xem nhân viên đã có ca làm việc nào đang mở ở chi nhánh đó chưa
    const existingOpenShifts = await connector.list('shop-shifts', {
      filters: { branch_id: shopId, user_id: userEmail, status: 'open' },
      limit: 1
    })

    if (existingOpenShifts.total > 0) {
      return NextResponse.json(
        { error: 'Bạn đã có một ca làm việc đang mở. Vui lòng chốt ca cũ trước khi mở ca mới!' },
        { status: 400 }
      )
    }

    // 2. Tạo ca làm việc mới
    const createdShift = await connector.create('shop-shifts', {
      branch_id: shopId,
      user_id: userEmail,
      opened_at: new Date().toISOString(),
      status: 'open',
      opening_cash: String(payload.opening_cash),
      expected_closing_cash: String(payload.opening_cash), // Đầu ca expected = opening
      actual_closing_cash: '0',
      cash_variance: '0',
      non_cash_revenue: JSON.stringify({
        bank_transfer: 0,
        card: 0,
        momo: 0,
      }),
      active: 'TRUE',
    })

    invalidate(shopId, 'shop-shifts')
    return NextResponse.json(createdShift, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST shifts')
  }
}
