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
    const branch_id = searchParams.get('branch_id')
    const status = searchParams.get('status')
    const user_id = searchParams.get('user_id') // email nhân viên
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id
    if (status) filters.status = status
    if (user_id) filters.user_id = user_id

    const result = await connector.list('shop-shifts', { page, limit, filters, sortDesc: true })
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
    const { connector, user } = await requireShopAccess(shopId, 'cashbook.manage')

    const body = await req.json()
    const payload = shiftOpenSchema.parse(body)
    const userEmail = user.email || ''

    // 1. Kiểm tra xem nhân viên đã có ca làm việc nào đang mở ở chi nhánh đó chưa
    const existingOpenShifts = await connector.list('shop-shifts', {
      filters: { branch_id: payload.branch_id, user_id: userEmail, status: 'open' },
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
      branch_id: payload.branch_id,
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
