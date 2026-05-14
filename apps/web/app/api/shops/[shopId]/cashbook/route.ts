import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate, shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { cashbookCreateSchema } from '@/lib/validators/cashbook'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const type = searchParams.get('type')
    const branch_id = searchParams.get('branch_id')

    const filters: Record<string, string> = {}
    if (type) filters.type = type
    if (branch_id) filters.branch_id = branch_id

    const cacheKey = ['cashbook', shopId, page, limit, type, branch_id].join(':')
    const result = await shopCache(
      () => connector.list('cashbook', { page, limit, filters, sortDesc: true }),
      [cacheKey],
      { tags: [shopTag(shopId, 'cashbook')], revalidate: 3600 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET cashbook')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions, user, shop } = await requireShopAccess(shopId, 'cashbook.manage')

    const body = await req.json()
    const payload = cashbookCreateSchema.parse(body)

    const created = await connector.create('cashbook', {
      type: payload.type,
      amount: String(payload.amount),
      method: payload.method,
      category: payload.category,
      reference_id: payload.reference_id ?? '',
      reference_name: payload.reference_name ?? '',
      note: payload.note ?? '',
      branch_id: payload.branch_id ?? '',
      employee_id: payload.employee_id ?? user.email ?? '',
    })

    // If this is a debt collection, reduce customer debt
    if (payload.category === 'debt_collection' && payload.reference_id) {
      try {
        const customer = await connector.findById('customers', payload.reference_id)
        if (customer) {
          const currentDebt = parseFloat((customer.debt_amount as string) || '0')
          const newDebt = Math.max(0, currentDebt - payload.amount)
          await connector.update('customers', payload.reference_id, {
            debt_amount: String(newDebt)
          })
          invalidate(shopId, 'customers')
        }
      } catch (err) {
        console.error('Failed to update customer debt:', err)
      }
    }

    // If this is a debt payment, reduce supplier debt
    if (payload.category === 'debt_payment' && payload.reference_id) {
      try {
        const supplier = await connector.findById('suppliers', payload.reference_id)
        if (supplier) {
          const currentDebt = parseFloat((supplier.debt_amount as string) || '0')
          const newDebt = Math.max(0, currentDebt - payload.amount)
          await connector.update('suppliers', payload.reference_id, {
            debt_amount: String(newDebt)
          })
          invalidate(shopId, 'suppliers')
        }
      } catch (err) {
        console.error('Failed to update supplier debt:', err)
      }
    }

    invalidate(shopId, 'cashbook')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST cashbook')
  }
}
