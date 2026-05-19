import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { productCreateSchema } from '@/lib/validators/products'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'

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

    const filters: Record<string, string> = {}
    if (category_id) filters.category_id = category_id
    if (active && active !== 'ALL') filters.active = active
    if (product_type) filters.product_type = product_type
    if (exclude_product_type) filters.exclude_product_type = exclude_product_type
    if (parent_id) filters.parent_id = parent_id

    const result = await shopCache(
      () => connector.list('products', { page, limit, search: search || undefined, filters, sortDesc: true }),
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
    const { connector } = await requireShopAccess(shopId, 'products.create')

    const body = await req.json()
    const { variants, ...productBody } = body

    const data = productCreateSchema.parse(productBody)

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
        sku: v.sku || '',
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
    invalidate(shopId, 'products')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST products')
  }
}
