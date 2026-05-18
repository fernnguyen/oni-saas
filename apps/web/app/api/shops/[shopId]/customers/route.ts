import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { customerCreateSchema } from '@/lib/validators/customers'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'customers.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const customer_type = sp.get('customer_type') ?? ''
    const filters: Record<string, string> = {}
    if (customer_type) filters.customer_type = customer_type

    const result = await shopCache(
      async () => {
        const res = await connector.list('customers', { page, limit, search: search || undefined, filters })
        
        // Inject virtual Khach le if no search or matches search
        const s = search.toLowerCase()
        if (!s || 'khách lẻ'.includes(s) || 'khach le'.includes(s) || s === 'c-default-retail') {
          // If not already returned by DB (which shouldn't happen anymore but just in case)
          const exists = res.data.some((c: any) => c.customer_id === 'C-DEFAULT-RETAIL')
          if (!exists) {
            res.data.unshift({
              id: 'C-DEFAULT-RETAIL',
              customer_id: 'C-DEFAULT-RETAIL',
              name: 'Khách lẻ',
              phone: '',
              email: '',
              address: '',
              customer_type: 'retail',
              credit_limit: '0',
              debt_amount: '0',
              note: 'Khách hàng mặc định của hệ thống'
            })
            res.total += 1
          }
        }
        return res
      },
      ['customers', shopId, String(page), String(limit), search, customer_type],
      { tags: [shopTag(shopId, 'customers')], revalidate: cacheTTL.customers }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET customers')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'customers.create')

    const body = await req.json()
    const data = customerCreateSchema.parse(body)

    const created = await connector.create('customers', data)
    invalidate(shopId, 'customers')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST customers')
  }
}
