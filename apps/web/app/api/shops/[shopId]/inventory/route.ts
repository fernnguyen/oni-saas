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
    let warehouse_id = sp.get('warehouse_id') ?? ''

    // Auto-fallback: if warehouse_id is not specified, resolve the branch's primary sales warehouse ID (code: 'sale')
    if (!warehouse_id) {
      const whRes = await connector.list('warehouses', {
        filters: { code: 'sale' },
        limit: 1
      });
      if (whRes.total > 0) {
        warehouse_id = whRes.data[0].id;
      }
    }

    // 1. Fetch all active products for the branch/shop
    const productFilters: Record<string, string> = { active: 'TRUE' }
    if (branch_id) productFilters.branch_id = branch_id
    if (product_id) productFilters.product_id = product_id

    const productsRes = await connector.list('products', { 
      filters: productFilters,
      limit: 10000 
    })
    const products = productsRes.data as any[]

    // 2. Fetch all inventory records for the resolved warehouse_id
    const inventoryFilters: Record<string, string> = {}
    if (branch_id) inventoryFilters.branch_id = branch_id
    if (product_id) inventoryFilters.product_id = product_id
    if (warehouse_id) inventoryFilters.warehouse_id = warehouse_id

    const inventoryRes = await connector.list('inventory', {
      filters: inventoryFilters,
      limit: 10000
    })
    const inventories = inventoryRes.data as any[]

    // Map existing inventories by product_id
    const inventoryMap = new Map<string, any>()
    for (const inv of inventories) {
      inventoryMap.set(inv.product_id, inv)
    }

    // 3. Merge products and inventories: synthesize virtual 0-stock rows for products without database stock records
    const mergedData: any[] = []
    const seenProductIds = new Set<string>()

    for (const product of products) {
      const pId = product.product_id || product.id
      seenProductIds.add(pId)

      const inv = inventoryMap.get(pId)
      if (inv) {
        mergedData.push({
          ...inv,
          product_name: product.name,
          product_code: product.barcode || product.sku,
          sku: product.sku,
          barcode: product.barcode,
          sell_price: product.sell_price,
          cost_price: product.cost_price,
          unit: product.unit,
        })
      } else {
        // Create virtualized default 0-stock row
        mergedData.push({
          id: `inv-virtual-${pId}`,
          inventory_id: `inv-virtual-${pId}`,
          product_id: pId,
          sku: product.sku,
          barcode: product.barcode,
          variant_id: product.variant_id || '',
          branch_id: product.branch_id || branch_id,
          warehouse_id: warehouse_id,
          stock_qty: '0',
          min_stock: '0',
          unit_cost: product.cost_price || '0',
          last_received_at: null,
          last_updated: null,
          product_name: product.name,
          product_code: product.barcode || product.sku,
          sell_price: product.sell_price,
          cost_price: product.cost_price,
          unit: product.unit,
        })
      }
    }

    // Append any orphaned inventories (associated with inactive products, etc.)
    for (const inv of inventories) {
      if (!seenProductIds.has(inv.product_id)) {
        mergedData.push(inv)
      }
    }

    // 4. Perform in-memory search filtering if query is provided
    let filteredData = mergedData
    if (search) {
      const q = search.toLowerCase()
      filteredData = mergedData.filter((row: any) => {
        return (
          String(row.product_name || '').toLowerCase().includes(q) ||
          String(row.sku || '').toLowerCase().includes(q) ||
          String(row.barcode || '').toLowerCase().includes(q) ||
          String(row.product_id || '').toLowerCase().includes(q)
        )
      })
    }

    // 5. Paginate manually
    const total = filteredData.length
    const start = (page - 1) * limit
    const paginatedData = filteredData.slice(start, start + limit)

    return NextResponse.json({
      data: paginatedData,
      total,
      page,
      limit
    })
  } catch (e) {
    return handleApiError(e, 'GET inventory')
  }
}

