export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopCache, shopTag } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'inventory.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const branch_id = sp.get('branch_id') ?? ''
    const product_id = sp.get('product_id') ?? ''
    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id
    if (product_id) filters.product_id = product_id

    if (search) {
      // 1. Get products matching search query
      const productsRes = await connector.list('products', { search, limit: 2000 })
      const matchingProductIds = productsRes.data.map((p: any) => p.product_id || p.id)

      // 2. Also search product units by barcode or unit name
      try {
        const unitSearchRes = await connector.list('product-units', { search, limit: 1000 })
        const unitProductIds = unitSearchRes.data.map((u: any) => u.product_id)
        for (const id of unitProductIds) {
          if (id && !matchingProductIds.includes(id)) {
            matchingProductIds.push(id)
          }
        }
      } catch (err) {
        console.error('Failed to search product-units:', err)
      }

      // 3. Get all inventory rows
      const allInventory = await connector.list('inventory', { limit: 5000, filters, sortDesc: true })

      // 4. Filter inventory rows
      const q = search.toLowerCase()
      const filtered = allInventory.data.filter((row: any) => {
        if (matchingProductIds.includes(row.product_id)) return true
        return Object.values(row).some(v => String(v).toLowerCase().includes(q))
      })

      // 5. Paginate manually
      const total = filtered.length
      const start = (page - 1) * limit
      const paginatedData = filtered.slice(start, start + limit)

      return NextResponse.json({
        data: paginatedData,
        total,
        page,
        limit
      })
    } else {
      const result = await connector.list('inventory', { page, limit, filters, sortDesc: true })
      return NextResponse.json(result)
    }
  } catch (e) {
    return handleApiError(e, 'GET inventory')
  }
}

