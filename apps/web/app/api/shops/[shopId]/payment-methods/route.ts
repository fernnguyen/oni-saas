export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { paymentMethodCreateSchema } from '@/lib/validators/payment-methods'

function generateCodeFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9_]/g, '_') // Replace special chars and spaces with _
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_+|_+$/g, '') // Trim underscores
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const active = searchParams.get('active')

    // Force strict branch filtering
    const filters: Record<string, string> = { branch_id: shopId }
    if (active) {
      filters.active = active.toUpperCase()
    } else {
      filters.active = 'ALL'
    }

    let result = await connector.list('payment-methods', { page: 1, limit: 100, filters })

    // Auto-seed default methods if none exists for this branch
    if (result.total === 0) {
      const defaults = [
        { id: `cash-${shopId}`, name: 'Tiền mặt', type: 'cash', code: 'cash', is_default: 'TRUE' },
        { id: `bank_transfer-${shopId}`, name: 'Chuyển khoản', type: 'bank', code: 'bank_transfer', is_default: 'TRUE' },
        { id: `card-${shopId}`, name: 'Thẻ ATM / POS', type: 'bank', code: 'card', is_default: 'FALSE' },
        { id: `momo-${shopId}`, name: 'Ví MoMo', type: 'wallet', code: 'momo', is_default: 'TRUE' },
        { id: `zalopay-${shopId}`, name: 'Ví ZaloPay', type: 'wallet', code: 'zalopay', is_default: 'FALSE' },
        { id: `vnpay-${shopId}`, name: 'Ví VNPay', type: 'wallet', code: 'vnpay', is_default: 'FALSE' },
        { id: `prepaid-${shopId}`, name: 'Ví trả trước', type: 'prepaid', code: 'prepaid', is_default: 'TRUE' },
        { id: `debt-${shopId}`, name: 'Ghi nợ', type: 'debt', code: 'debt', is_default: 'TRUE' },
      ]

      for (const item of defaults) {
        await connector.create('payment-methods', {
          id: item.id,
          branch_id: shopId,
          name: item.name,
          type: item.type,
          code: item.code,
          is_default: item.is_default,
          active: 'TRUE',
        })
      }

      // Query again to get the newly seeded methods
      result = await connector.list('payment-methods', { page: 1, limit: 100, filters })
      invalidate(shopId, 'payment-methods')
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET payment-methods')
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
    const payload = paymentMethodCreateSchema.parse(body)

    // Force strict branch scoping on write
    payload.branch_id = shopId

    const baseId = payload.id?.trim() || generateCodeFromName(payload.name)
    if (!baseId) {
      return NextResponse.json({ error: 'Mã phương thức thanh toán không hợp lệ!' }, { status: 400 })
    }
    const cleanId = `${baseId}-${shopId}`

    // Check duplicates by ID or Code
    const existingList = await connector.list('payment-methods', {
      filters: { branch_id: shopId },
      limit: 100
    })
    const existing = existingList.data as Record<string, string>[]
    if (existing.some((e) => e.id === cleanId)) {
      return NextResponse.json({ error: 'Mã phương thức thanh toán này đã tồn tại!' }, { status: 400 })
    }
    if (existing.some((e) => e.code === payload.code)) {
      return NextResponse.json({ error: 'Mã code lưu ở db này đã được sử dụng!' }, { status: 400 })
    }

    // Nếu đánh dấu mặc định, cần tắt mặc định ở các phương thức khác cùng chi nhánh của loại hình này
    if (payload.is_default) {
      const existingMethods = await connector.list('payment-methods', {
        filters: { branch_id: shopId, type: payload.type, is_default: 'TRUE' },
        limit: 100,
      })
      const methods = existingMethods.data as Record<string, string>[]
      for (const method of methods) {
        if (method.id) {
          await connector.update('payment-methods', method.id, { is_default: 'FALSE' })
        }
      }
    }

    const createdMethod = await connector.create('payment-methods', {
      id: cleanId,
      branch_id: shopId,
      name: payload.name,
      type: payload.type,
      code: payload.code,
      is_default: payload.is_default ? 'TRUE' : 'FALSE',
      active: 'TRUE',
    })

    invalidate(shopId, 'payment-methods')
    return NextResponse.json(createdMethod, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST payment-methods')
  }
}
