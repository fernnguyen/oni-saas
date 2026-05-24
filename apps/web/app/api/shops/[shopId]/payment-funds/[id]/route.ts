import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string, id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.funds.manage')

    const body = await req.json()
    const { name, type, account_number, bank_name, initial_balance, is_default, active } = body

    // If is_default is TRUE, we must set other funds to is_default = FALSE
    if (is_default === true || is_default === 'TRUE') {
      const currentFund = await connector.findById('payment-funds', id)
      if (currentFund && currentFund.branch_id) {
        const existingFunds = await connector.list('payment-funds', {
          filters: { branch_id: currentFund.branch_id, is_default: 'TRUE' },
          limit: 100,
        })
        const funds = existingFunds.data as Record<string, string>[]
        for (const fund of funds) {
          if (fund.id && fund.id !== id) {
            await connector.update('payment-funds', fund.id, { is_default: 'FALSE' })
          }
        }
      }
    }

    const updatePayload: Record<string, any> = {}
    if (name !== undefined) updatePayload.name = name
    if (type !== undefined) updatePayload.type = type
    if (account_number !== undefined) updatePayload.account_number = account_number
    if (bank_name !== undefined) updatePayload.bank_name = bank_name
    if (initial_balance !== undefined) {
      updatePayload.initial_balance = String(initial_balance)
      updatePayload.current_balance = String(initial_balance)
    }
    if (is_default !== undefined) {
      updatePayload.is_default = (is_default === true || is_default === 'TRUE' || is_default === 'true') ? 'TRUE' : 'FALSE'
    }
    if (active !== undefined) {
      updatePayload.active = (active === true || active === 'TRUE' || active === 'true') ? 'TRUE' : 'FALSE'
    }

    const updated = await connector.update('payment-funds', id, updatePayload)

    invalidate(shopId, 'payment-funds')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT payment-funds')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string, id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.funds.manage')

    // Mark as inactive (active: 'FALSE')
    await connector.update('payment-funds', id, { active: 'FALSE' })

    invalidate(shopId, 'payment-funds')
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE payment-funds')
  }
}
