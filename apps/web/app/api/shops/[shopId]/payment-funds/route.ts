export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { paymentFundCreateSchema } from '@/lib/validators/payment-funds'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const branch_id = searchParams.get('branch_id')

    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id

    const result = await connector.list('payment-funds', { page: 1, limit: 100, filters })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET payment-funds')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.funds.manage')

    const body = await req.json()
    const payload = paymentFundCreateSchema.parse(body)

    // Nếu đánh dấu mặc định, cần tắt mặc định ở các quỹ khác cùng chi nhánh
    if (payload.is_default) {
      const existingFunds = await connector.list('payment-funds', {
        filters: { branch_id: payload.branch_id, is_default: 'TRUE' },
        limit: 100,
      })
      const funds = existingFunds.data as Record<string, string>[]
      for (const fund of funds) {
        if (fund.id) {
          await connector.update('payment-funds', fund.id, { is_default: 'FALSE' })
        }
      }
    }

    const createdFund = await connector.create('payment-funds', {
      branch_id: payload.branch_id,
      name: payload.name,
      type: payload.type,
      account_number: payload.account_number ?? '',
      bank_name: payload.bank_name ?? '',
      initial_balance: String(payload.initial_balance),
      current_balance: String(payload.initial_balance),
      is_default: payload.is_default ? 'TRUE' : 'FALSE',
      active: 'TRUE',
    })

    invalidate(shopId, 'payment-funds')
    return NextResponse.json(createdFund, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST payment-funds')
  }
}
