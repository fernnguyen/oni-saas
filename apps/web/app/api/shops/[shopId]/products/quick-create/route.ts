import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'
import {
  buildQuickCreateMetadata,
  normalizeProductLookup,
  type QuickCreateSource,
} from '@oni/core'

const quickCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  barcode: z.string().trim().max(255).optional().default(''),
  unit: z.string().trim().min(1).max(50).default('Cái'),
  sell_price: z.coerce.number().finite().min(0),
  cost_price: z.coerce.number().finite().min(0).default(0),
  min_price: z.coerce.number().finite().min(0).default(0),
  category_id: z.string().trim().max(255).optional().default(''),
  image_url: z.string().trim().max(4000).optional().default(''),
  source: z.enum(['pos_quick_web', 'pos_quick_mobile']).default('pos_quick_web'),
})

type ProductRow = Record<string, any>

function productId(product: ProductRow): string {
  return String(product.id || product.product_id || '')
}

function publicProduct(product: ProductRow) {
  return {
    ...product,
    id: productId(product),
    product_id: productId(product),
  }
}

function canQuickCreate(permissions: string[]) {
  return permissions.includes('products.create') || permissions.includes('orders.create')
}

async function findExistingBarcode(connector: Awaited<ReturnType<typeof requireShopAccess>>['connector'], barcode: string) {
  const [productBarcode, productSku, unitBarcode, unitSku] = await Promise.all([
    connector.list('products', { filters: { barcode }, limit: 10 }),
    connector.list('products', { filters: { sku: barcode }, limit: 10 }),
    connector.list('product-units', { filters: { barcode }, limit: 10 }),
    connector.list('product-units', { filters: { sku: barcode }, limit: 10 }),
  ])
  const normalizedBarcode = normalizeProductLookup(barcode)
  const matchingProduct = [...productBarcode.data, ...productSku.data].find((product: ProductRow) =>
    normalizeProductLookup(String(product.barcode || '')) === normalizedBarcode ||
    normalizeProductLookup(String(product.sku || '')) === normalizedBarcode
  ) as ProductRow | undefined
  const matchingUnit = [...unitBarcode.data, ...unitSku.data].find((unit: ProductRow) =>
    normalizeProductLookup(String(unit.barcode || '')) === normalizedBarcode ||
    normalizeProductLookup(String(unit.sku || '')) === normalizedBarcode
  ) as ProductRow | undefined

  if (matchingProduct) return matchingProduct
  if (!matchingUnit?.product_id) return null
  return await connector.findById('products', String(matchingUnit.product_id)) as ProductRow | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId)
    if (!canQuickCreate(permissions)) {
      return NextResponse.json({ error: 'Bạn không có quyền tạo nhanh sản phẩm từ bán hàng.' }, { status: 403 })
    }

    const query = req.nextUrl.searchParams.get('q')?.trim() || ''
    if (query.length < 2) return NextResponse.json({ data: [] })
    const result = await connector.list('products', { search: query, limit: 5 })
    return NextResponse.json({ data: (result.data as ProductRow[]).map(publicProduct) })
  } catch (error) {
    return handleApiError(error, 'GET quick-create product suggestions')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, shop, permissions } = await requireShopAccess(shopId)
    if (!canQuickCreate(permissions)) {
      return NextResponse.json({ error: 'Bạn không có quyền tạo nhanh sản phẩm từ bán hàng.' }, { status: 403 })
    }

    const { enforceLimit } = await import('@/lib/server/planLimits')
    await enforceLimit('max_products', { tenantId: shop.tenant_id }, shop.tenant_id)

    const input = quickCreateSchema.parse(await req.json())
    const source = input.source as QuickCreateSource
    const barcode = input.barcode.trim()

    // Barcode is a shop-wide identifier. Search explicitly (not via product text search,
    // which intentionally only indexes name/SKU) across base products and unit barcodes.
    if (barcode) {
      const existing = await findExistingBarcode(connector, barcode)
      if (existing) {
        return NextResponse.json({
          error: 'BARCODE_EXISTS',
          existing_product: publicProduct(existing),
        }, { status: 409 })
      }
    }

    // The UI uses this list as a soft warning. It must never block a valid new item.
    const suggestions = input.name.length >= 2
      ? (await connector.list('products', { search: input.name, limit: 5 })).data
          .map((product: ProductRow) => publicProduct(product))
          .filter((product: ProductRow) => normalizeProductLookup(product.name || '') !== '')
      : []

    const created = await connector.create('products', {
      name: input.name,
      barcode,
      unit: input.unit,
      category_id: input.category_id,
      sell_price: String(Math.round(input.sell_price)),
      cost_price: String(Math.round(input.cost_price)),
      min_price: String(Math.round(input.min_price)),
      stock_track: 'TRUE',
      active: 'TRUE',
      product_type: 'simple',
      image_url: input.image_url,
      metadata: JSON.stringify(buildQuickCreateMetadata(source)),
    }) as ProductRow

    invalidate(shopId, 'products')
    return NextResponse.json({
      product: publicProduct(created),
      suggestions,
      review_status: 'pending',
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'POST quick-create product')
  }
}
