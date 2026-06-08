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

    // 1. Verify the payment method exists and belongs to the active branch
    const currentMethod = await connector.findById('payment-methods', id)
    if (!currentMethod || currentMethod.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy phương thức thanh toán trong chi nhánh này.' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { name, type, code, is_default, active } = body

    // Validate duplicate code
    if (code !== undefined && code !== currentMethod.code) {
      const existingList = await connector.list('payment-methods', {
        filters: { branch_id: shopId },
        limit: 100
      })
      const existing = existingList.data as Record<string, string>[]
      if (existing.some((e) => e.code === code && e.id !== id)) {
        return NextResponse.json(
          { error: 'Mã code lưu ở db này đã được sử dụng!' },
          { status: 400 }
        )
      }
    }

    // If is_default is TRUE, we must set other methods of the same type to is_default = FALSE
    if (is_default === true || is_default === 'TRUE') {
      const targetType = type || currentMethod.type
      const existingMethods = await connector.list('payment-methods', {
        filters: { branch_id: shopId, type: targetType, is_default: 'TRUE' },
        limit: 100,
      })
      const methods = existingMethods.data as Record<string, string>[]
      for (const method of methods) {
        if (method.id && method.id !== id) {
          await connector.update('payment-methods', method.id, { is_default: 'FALSE' })
        }
      }
    }

    const updatePayload: Record<string, any> = {}
    if (name !== undefined) updatePayload.name = name
    if (type !== undefined) updatePayload.type = type
    if (code !== undefined) updatePayload.code = code
    if (is_default !== undefined) {
      updatePayload.is_default = (is_default === true || is_default === 'TRUE' || is_default === 'true') ? 'TRUE' : 'FALSE'
    }
    if (active !== undefined) {
      const activeVal = (active === true || active === 'TRUE' || active === 'true') ? 'TRUE' : 'FALSE'
      if (activeVal === 'FALSE' && (is_default === true || currentMethod.is_default === 'TRUE')) {
        return NextResponse.json(
          { error: 'Không thể vô hiệu hóa phương thức thanh toán mặc định. Vui lòng đặt phương thức khác làm mặc định trước.' },
          { status: 400 }
        )
      }
      updatePayload.active = activeVal
    }

    // Force strict branch scoping on payload
    updatePayload.branch_id = shopId

    const updated = await connector.update('payment-methods', id, updatePayload)

    invalidate(shopId, 'payment-methods')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT payment-methods')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string, id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.funds.manage')

    // 1. Verify the payment method exists and belongs to the active branch
    const currentMethod = await connector.findById('payment-methods', id)
    if (!currentMethod || currentMethod.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy phương thức thanh toán trong chi nhánh này.' },
        { status: 404 }
      )
    }

    // Protect default method from deletion/disable
    if (currentMethod.is_default === 'TRUE') {
      return NextResponse.json(
        { error: 'Không thể vô hiệu hóa/xóa phương thức thanh toán mặc định. Vui lòng đặt phương thức khác làm mặc định trước.' },
        { status: 400 }
      )
    }

    // Mark as inactive (active: 'FALSE')
    await connector.update('payment-methods', id, { active: 'FALSE' })

    invalidate(shopId, 'payment-methods')
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE payment-methods')
  }
}
