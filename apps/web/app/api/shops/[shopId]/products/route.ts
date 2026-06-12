import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { productCreateSchema } from '@/lib/validators/products'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import crypto from 'crypto'
import { prefixSku } from '@/lib/sku'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'products.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(2000, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const category_id = sp.get('category_id') ?? ''
    const active = sp.get('active') ?? ''
    const product_type = sp.get('product_type') ?? ''
    const parent_id = sp.get('parent_id') ?? ''
    const exclude_product_type = sp.get('exclude_product_type') ?? ''
    const nocache = sp.get('nocache') === 'true' || sp.get('bypassCache') === 'true'

    const filters: Record<string, string> = {}
    if (category_id) filters.category_id = category_id
    if (active && active !== 'ALL') {
      filters.active = active.toUpperCase() === 'TRUE' || active === 'true' ? 'TRUE' : 'FALSE'
    }
    if (product_type) filters.product_type = product_type
    if (exclude_product_type) filters.exclude_product_type = exclude_product_type
    if (parent_id) filters.parent_id = parent_id

    const fetchProducts = async () => {
      const prodResult = await connector.list('products', { page, limit, search: search || undefined, filters, sortDesc: true })
      
      if (search) {
        const unitSearchRes = await connector.list('product-units', { search })
        const unitProductIds = Array.from(new Set(unitSearchRes.data.map(u => u.product_id)))
        const existingIds = new Set(prodResult.data.map((p: any) => p.id || p.product_id))
        const extraIds = unitProductIds.filter(id => !existingIds.has(id))
        
        if (extraIds.length > 0) {
          const extraProds = await connector.list('products', { filters: { ...filters, id: extraIds as any }, limit: 100 })
          prodResult.data.push(...extraProds.data)
          prodResult.total += extraProds.data.length
        }
      }

      if (prodResult.data.length > 0) {
        // Fetch product units in parallel or bulk. Since we might have many products, we'll fetch all active units for this shop.
        // Note: In a real app we'd filter by product_ids, but for simplicity we fetch the first 5000 units.
        const unitsResult = await connector.list('product-units', { limit: 5000 })
        const unitsByProduct = unitsResult.data.reduce((acc: Record<string, any[]>, unit: any) => {
          acc[unit.product_id] = acc[unit.product_id] || []
          acc[unit.product_id].push(unit)
          return acc
        }, {})

        // Fetch inventory records to aggregate actual stock quantity per product for this branch
        const inventoryRes = await connector.list('inventory', {
          filters: { branch_id: shopId },
          limit: 10000
        })
        const inventories = inventoryRes.data as any[]
        const stockByProduct = inventories.reduce((acc: Record<string, number>, inv: any) => {
          const pId = inv.product_id
          const qty = parseFloat(inv.stock_qty || '0')
          acc[pId] = (acc[pId] || 0) + (isNaN(qty) ? 0 : qty)
          return acc
        }, {})

        prodResult.data = prodResult.data.map((p: any) => {
          const pId = p.id || p.product_id
          const computedStock = stockByProduct[pId] !== undefined ? String(stockByProduct[pId]) : (p.stock_qty || '0')
          return {
            ...p,
            stock_qty: computedStock,
            product_units: unitsByProduct[pId] || []
          }
        })
      }
      return prodResult
    }

    const result = nocache
      ? await fetchProducts()
      : await shopCache(
          fetchProducts,
          ['products', shopId, String(page), String(limit), search, category_id, active, product_type, parent_id],
          { tags: [shopTag(shopId, 'products')], revalidate: cacheTTL.products }
        )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET products')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, shop } = await requireShopAccess(shopId, 'products.create')
    const tenantId = shop.tenant_id
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()

    const body = await req.json()
    const { variants, ...productBody } = body

    const data = productCreateSchema.parse(productBody)
    if (data.sku) {
      data.sku = prefixSku(data.sku, tenantHash)
    }

    // ── Case A: Variant parent with children ──────────────────────────
    if (data.product_type === 'variant_parent' && Array.isArray(variants) && variants.length > 0) {
      // 1. Create the parent
      const parent = await connector.create('products', data) as Record<string, string>
      const parentId = parent.product_id || parent.id

      // 2. Resolve option_name from variant_options JSON
      const optionName = (() => {
        try { return JSON.parse(data.variant_options || '{}').option_name ?? 'Variant' }
        catch { return 'Variant' }
      })()

      // 3. Batch create children
      const childrenData = (variants as Array<{
        value: string; sku: string; sell_price: string; cost_price: string; barcode: string
      }>).map((v) => ({
        name: data.name,
        category_id: data.category_id ?? '',
        unit: data.unit ?? '',
        product_type: 'variant_child',
        parent_id: parentId,
        variant_options: JSON.stringify({ [optionName]: v.value }),
        sku: prefixSku(v.sku || '', tenantHash),
        sell_price: v.sell_price || '0',
        cost_price: v.cost_price || '0',
        min_price: data.min_price ?? '0',
        barcode: v.barcode || '',
        stock_track: 'TRUE',
        active: 'TRUE',
        image_url: data.image_url ?? '',
        description: data.description ?? '',
      }))

      await connector.batchCreate('products', childrenData)
      invalidate(shopId, 'products')
      return NextResponse.json(parent, { status: 201 })
    }

    // ── Case B: Simple product (unchanged flow) ───────────────────────
    const created = await connector.create('products', data)
    
    // ── Unit Conversions ──────────────────────────────────────────────
    if (Array.isArray(body.product_units) && body.product_units.length > 0) {
      const unitsData = body.product_units.map((u: any) => ({
        product_id: created.id || (created as any).product_id,
        unit_name: u.unit_name,
        conversion_rate: u.conversion_rate,
        barcode: u.barcode || '',
        sell_price: u.sell_price || '0',
        cost_price: u.cost_price || '0',
      }))
      await connector.batchCreate('product-units', unitsData)
    }

    invalidate(shopId, 'products')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST products')
  }
}
