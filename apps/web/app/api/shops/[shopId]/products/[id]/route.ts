import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { productUpdateSchema } from '@/lib/validators/products'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import crypto from 'crypto'
import { prefixSku } from '@/lib/sku'

const PRODUCT_PRICE_PERMISSION = 'products.manage_prices'

function canManageProductPrices(permissions: string[]) {
  return permissions.includes(PRODUCT_PRICE_PERMISSION)
}

function stripProductPriceFields<T extends Record<string, any>>(payload: T): Omit<T, 'sell_price' | 'cost_price' | 'min_price'> {
  const { sell_price, cost_price, min_price, ...rest } = payload
  return rest
}

function stripUnitPriceFields<T extends Record<string, any>>(payload: T): Omit<T, 'sell_price' | 'cost_price'> {
  const { sell_price, cost_price, ...rest } = payload
  return rest
}

function hasOwnPriceField(payload: Record<string, any>, fields: string[]) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))
}

function hasProductPricePayload(productBody: Record<string, any>, variants: unknown) {
  if (hasOwnPriceField(productBody, ['sell_price', 'cost_price', 'min_price'])) return true
  if (Array.isArray(productBody.product_units) && productBody.product_units.some((unit) => hasOwnPriceField(unit, ['sell_price', 'cost_price']))) return true
  if (Array.isArray(variants) && variants.some((variant) => hasOwnPriceField(variant, ['sell_price', 'cost_price']))) return true
  return false
}

function maskCostPrice<T extends Record<string, any>>(product: T): T {
  const { cost_price, ...rest } = product
  return {
    ...rest,
    product_units: Array.isArray(product.product_units)
      ? product.product_units.map((unit: Record<string, any>) => {
          const { cost_price: _unitCostPrice, ...unitRest } = unit
          return unitRest
        })
      : product.product_units,
  } as unknown as T
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'products.view')
    const canSeeCostPrice = canManageProductPrices(permissions)

    let row = await connector.findById('products', id)
    if (!row) {
      const searchRes = await connector.list('products', {
        filters: { sku: id },
        limit: 1
      })
      if (searchRes.data && searchRes.data.length > 0) {
        row = searchRes.data[0]
      }
    }
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Fetch inventory for this product and branch to compute actual stock level
    const inventoryRes = await connector.list('inventory', {
      filters: { product_id: id, branch_id: shopId },
      limit: 1000
    })
    const inventories = inventoryRes.data as any[]
    const totalStock = inventories.reduce((sum, inv) => sum + (parseFloat(inv.stock_qty || '0') || 0), 0)
    row.stock_qty = String(totalStock)

    return NextResponse.json(canSeeCostPrice ? row : maskCostPrice(row))
  } catch (e) {
    return handleApiError(e, 'GET product')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, shop, permissions } = await requireShopAccess(shopId, 'products.edit')
    const canEditPrices = canManageProductPrices(permissions)
    const tenantId = shop.tenant_id
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()

    const body = await req.json()
    const { variants, ...productBody } = body
    if (!canEditPrices && hasProductPricePayload(productBody, variants)) {
      return NextResponse.json(
        { error: 'Bạn cần quyền quản lý giá bán và giá vốn để cập nhật dữ liệu giá.' },
        { status: 403 }
      )
    }
    const parsedData = productUpdateSchema.parse(productBody)
    const data = canEditPrices ? parsedData : stripProductPriceFields(parsedData)

    if (data.sku) {
      data.sku = prefixSku(data.sku, tenantHash)
    }

    await connector.update('products', id, data)

    // ── Sync variant children if this is a variant_parent update ────
    if (data.product_type === 'variant_parent' && Array.isArray(variants)) {
      const optionName = (() => {
        try { return JSON.parse(data.variant_options || '{}').option_name ?? 'Variant' }
        catch { return 'Variant' }
      })()

      // Fetch existing children
      const existing = await connector.list('products', {
        page: 1, limit: 500, filters: { parent_id: id }
      })
      const existingChildren = existing.data as Record<string, string>[]
      const existingIds = new Set(existingChildren.map((c) => c.product_id || c.id))

      // Classify variants from payload
      const incomingIds = new Set(
        (variants as Array<{ id?: string }>).filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id!)
      )

      // Delete removed children
      for (const child of existingChildren) {
        const childId = child.product_id || child.id
        if (!incomingIds.has(childId)) {
          await connector.delete('products', childId).catch(() => {})
        }
      }

      // Update or create each incoming variant
      for (const v of variants as Array<{ id?: string; value: string; sku: string; sell_price: string; cost_price: string; barcode: string }>) {
        const childPayload = {
          name: data.name ?? '',
          product_type: 'variant_child',
          parent_id: id,
          variant_options: JSON.stringify({ [optionName]: v.value }),
          sku: prefixSku(v.sku || '', tenantHash),
          ...(canEditPrices ? {
            sell_price: v.sell_price || '0',
            cost_price: v.cost_price || '0',
          } : {}),
          barcode: v.barcode || '',
          active: 'TRUE',
        }
        if (v.id && existingIds.has(v.id)) {
          await connector.update('products', v.id, childPayload)
        } else {
          await connector.create('products', {
            ...childPayload,
            category_id: data.category_id ?? '',
            unit: data.unit ?? '',
            min_price: canEditPrices ? parsedData.min_price ?? '0' : '0',
            stock_track: 'TRUE',
            image_url: data.image_url ?? '',
            description: data.description ?? '',
          })
        }
      }
    }

    // ── Sync Unit Conversions ─────────────────────────────────────────
    if (Array.isArray(body.product_units)) {
      const incomingUnits = body.product_units
      
      const existingUnitsRes = await connector.list('product-units', {
        limit: 1000, filters: { product_id: id }
      })
      const existingUnits = existingUnitsRes.data as Record<string, string>[]
      const existingUnitIds = new Set(existingUnits.map(u => u.unit_id || u.id))
      
      const incomingUnitIds = new Set(
        incomingUnits.filter((u: any) => u.id && existingUnitIds.has(u.id)).map((u: any) => u.id)
      )

      // Delete removed units
      for (const unit of existingUnits) {
        const uid = unit.unit_id || unit.id
        if (!incomingUnitIds.has(uid)) {
          await connector.delete('product-units', uid as string).catch(() => {})
        }
      }

      // Update or Create units
      for (const u of incomingUnits) {
        const unitPayloadWithPrices = {
          product_id: id,
          unit_name: u.unit_name,
          conversion_rate: String(u.conversion_rate),
          barcode: u.barcode || '',
          sell_price: String(u.sell_price || '0'),
          cost_price: String(u.cost_price || '0'),
        }
        const unitPayload = canEditPrices ? unitPayloadWithPrices : stripUnitPriceFields(unitPayloadWithPrices)

        if (u.id && existingUnitIds.has(u.id)) {
          await connector.update('product-units', u.id, unitPayload)
        } else {
          await connector.create('product-units', unitPayload)
        }
      }
    }

    invalidate(shopId, 'products')
    const updated = await connector.findById('products', id)
    return NextResponse.json(canEditPrices || !updated ? updated : maskCostPrice(updated))
  } catch (e) {
    return handleApiError(e, 'PUT product')
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.delete')

    await connector.delete('products', id)
    invalidate(shopId, 'products')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE product')
  }
}
