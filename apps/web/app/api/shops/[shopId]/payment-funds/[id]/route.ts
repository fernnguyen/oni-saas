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

    // 1. Verify the payment fund exists and belongs to the active branch
    const currentFund = await connector.findById('payment-funds', id)
    if (!currentFund || currentFund.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy quỹ tiền trong chi nhánh này.' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { name, type, account_number, account_name, bank_name, initial_balance, is_default, active, qr_template } = body

    // If is_default is TRUE, we must set other funds of the same type to is_default = FALSE
    if (is_default === true || is_default === 'TRUE') {
      const targetType = type || currentFund.type
      const existingFunds = await connector.list('payment-funds', {
        filters: { branch_id: shopId, is_default: 'TRUE', type: targetType },
        limit: 100,
      })
      const funds = existingFunds.data as Record<string, string>[]
      for (const fund of funds) {
        if (fund.id && fund.id !== id) {
          await connector.update('payment-funds', fund.id, { is_default: 'FALSE' })
        }
      }
    }

    const updatePayload: Record<string, any> = {}
    if (name !== undefined) updatePayload.name = name
    if (type !== undefined) updatePayload.type = type
    if (account_number !== undefined) updatePayload.account_number = account_number
    if (bank_name !== undefined) updatePayload.bank_name = bank_name
    if (is_default !== undefined) {
      updatePayload.is_default = (is_default === true || is_default === 'TRUE' || is_default === 'true') ? 'TRUE' : 'FALSE'
    }
    if (active !== undefined) {
      updatePayload.active = (active === true || active === 'TRUE' || active === 'true') ? 'TRUE' : 'FALSE'
    }
    if (account_name !== undefined) updatePayload.account_name = account_name
    if (qr_template !== undefined) updatePayload.qr_template = qr_template

    // Force strict branch scoping on payload
    updatePayload.branch_id = shopId

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

    // 1. Verify the payment fund exists and belongs to the active branch
    const currentFund = await connector.findById('payment-funds', id)
    if (!currentFund || currentFund.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy quỹ tiền trong chi nhánh này.' },
        { status: 404 }
      )
    }

    // Mark as inactive (active: 'FALSE')
    await connector.update('payment-funds', id, { active: 'FALSE' })

    invalidate(shopId, 'payment-funds')
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE payment-funds')
  }
}
