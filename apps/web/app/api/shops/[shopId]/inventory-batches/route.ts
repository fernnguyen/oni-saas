export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
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
    // Support large limits for offline POS hydration (up to 10000)
    const limit = Math.min(10000, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const branch_id = sp.get('branch_id') ?? ''
    const product_id = sp.get('product_id') ?? ''
    
    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id
    if (product_id) filters.product_id = product_id

    const result = await connector.list('inventory-batches', {
      page,
      limit,
      search: search || undefined,
      filters,
      sortDesc: false // we want oldest/earliest expiry or standard ordering
    })

    // Auto healing: Assign default warehouse to batches missing warehouse_id
    if (result.data && result.data.length > 0) {
      const itemsWithoutWarehouse = result.data.filter((b: any) => !b.warehouse_id)
      if (itemsWithoutWarehouse.length > 0) {
        const whRes = await connector.list('warehouses', { limit: 10 })
        if (whRes.data && whRes.data.length > 0) {
          const retailWh = whRes.data.find((w: any) => w.name && w.name.toLowerCase().includes('bán lẻ'))
          const defaultWarehouse = retailWh || whRes.data[0]
          
          if (defaultWarehouse && defaultWarehouse.id) {
            // Update on the fly for response
            result.data = result.data.map((b: any) => {
              if (!b.warehouse_id) {
                return { ...b, warehouse_id: defaultWarehouse.id }
              }
              return b
            })
            
            // Fire and forget background update
            Promise.all(itemsWithoutWarehouse.map((b: any) => 
              connector.update('inventory-batches', b.id, { warehouse_id: defaultWarehouse.id }).catch(() => {})
            )).catch(() => {})
          }
        }
      }
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET inventory-batches')
  }
}
