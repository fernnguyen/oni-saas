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
    const sort_by = sp.get('sort_by') ?? ''
    const sort_order = sp.get('sort_order') ?? 'asc'
    const filters: Record<string, string> = {}
    if (customer_type) filters.customer_type = customer_type

    const result = await shopCache(
      async () => {
        // If sorting by custom columns, retrieve matching data in full, sort in memory, and then slice.
        if (sort_by && ['name', 'loyalty_points', 'prepaid_balance', 'debt_amount'].includes(sort_by)) {
          const res = await connector.list('customers', { page: 1, limit: 5000, search: search || undefined, filters })
          
          // Inject virtual Khach le if no search or matches search
          const s = search.toLowerCase()
          if (!s || 'khách lẻ'.includes(s) || 'khach le'.includes(s) || s === 'c-default-retail') {
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

          // Sort in memory
          res.data.sort((a: any, b: any) => {
            const aVal = a[sort_by] ?? ''
            const bVal = b[sort_by] ?? ''
            
            if (['loyalty_points', 'prepaid_balance', 'debt_amount'].includes(sort_by)) {
              const aNum = parseFloat(String(aVal)) || 0
              const bNum = parseFloat(String(bVal)) || 0
              return sort_order === 'asc' ? aNum - bNum : bNum - aNum
            } else {
              return sort_order === 'asc'
                ? String(aVal).localeCompare(String(bVal), 'vi', { numeric: true })
                : String(bVal).localeCompare(String(aVal), 'vi', { numeric: true })
            }
          })

          // Slice pagination
          const offset = (page - 1) * limit
          const slicedData = res.data.slice(offset, offset + limit)
          
          return {
            data: slicedData,
            total: res.total,
            page,
            limit
          }
        }

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
      ['customers', shopId, String(page), String(limit), search, customer_type, sort_by, sort_order],
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
    const parsed = customerCreateSchema.parse(body)

    // STRICT accounting integrity: override accounting & CRM statistics to '0' on creation
    const data = {
      ...parsed,
      prepaid_balance: '0',
      loyalty_points: '0',
      debt_amount: '0',
    } as any

    if (data.metadata) {
      data.metadata = JSON.stringify(data.metadata)
    }

    const created = await connector.create('customers', data)
    invalidate(shopId, 'customers')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST customers')
  }
}
