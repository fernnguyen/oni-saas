export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { RollbackContext, type IDataConnector } from '@oni/adapters'

const MOVEMENT_NO_PREFIX = 'PDK'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

async function generateMovementNo(connector: IDataConnector): Promise<string> {
  const result = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'adjustment' } })
  const existing = result.data as Record<string, string>[]
  const nums = existing
    .map(r => r.movement_no)
    .filter((n): n is string => !!n && n.startsWith(`${MOVEMENT_NO_PREFIX}-`))
    .map(n => parseInt(n.slice(MOVEMENT_NO_PREFIX.length + 1), 10))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${MOVEMENT_NO_PREFIX}-${String(next).padStart(3, '0')}`
}

interface AdjustItem {
  product_id?: string
  qty: string          // delta (e.g. +10 or -5)
  unit_cost?: string
  
  is_new?: boolean
  product_name?: string
  category_name?: string
  sell_price?: string
  min_price?: string
  sku?: string
  unit?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'products.create')
    tx = new RollbackContext()

    const body = await req.json() as {
      branch_id: string
      reason?: string
      reference_no?: string
      items: AdjustItem[]
    }

    const { branch_id = '', reason = '', reference_no = '', items = [] } = body

    if (items.length === 0) {
      return NextResponse.json({ error: 'Danh sách sản phẩm trống.' }, { status: 400 })
    }

    // 1. Generate sequential PDK movement_no
    const movementNo = await generateMovementNo(connector)

    // Cache to prevent duplicate category lookups/creates within this request
    const categoryCache = new Map<string, string>()

    const processedItems: { productId: string; qty: number; unitCost: string; sku: string }[] = []

    for (const item of items) {
      let productId = item.product_id
      let finalSku = item.sku || ''

      // Case A: Create new product inline
      if (item.is_new) {
        if (!item.product_name || !item.product_name.trim()) {
          return NextResponse.json({ error: 'Tên sản phẩm trống cho dòng sản phẩm mới.' }, { status: 400 })
        }

        // Prevent duplicate product names within the database
        const existingProdRes = await connector.list('products', { page: 1, limit: 50, search: item.product_name })
        const matchedProd = (existingProdRes.data as Record<string, string>[]).find(
          p => p.name?.toLowerCase().trim() === item.product_name?.toLowerCase().trim()
        )
        if (matchedProd) {
          return NextResponse.json({ error: `Sản phẩm "${item.product_name}" đã tồn tại trên hệ thống để tránh trùng lặp.` }, { status: 400 })
        }

        // Prevent duplicate SKU
        if (item.sku && item.sku.trim()) {
          const existingSkuRes = await connector.list('products', { page: 1, limit: 10, filters: { sku: item.sku } })
          if (existingSkuRes.data.length > 0) {
            return NextResponse.json({ error: `Mã SKU "${item.sku}" đã được sử dụng.` }, { status: 400 })
          }
        }

        // Resolve or create category inline
        let categoryId = ''
        if (item.category_name && item.category_name.trim()) {
          const catNameTrimmed = item.category_name.trim()
          const catNameLower = catNameTrimmed.toLowerCase()

          if (categoryCache.has(catNameLower)) {
            categoryId = categoryCache.get(catNameLower)!
          } else {
            const catRes = await connector.list('categories', { page: 1, limit: 100, search: catNameTrimmed })
            const existingCat = (catRes.data as Record<string, string>[]).find(
              c => c.name?.toLowerCase().trim() === catNameLower
            )
            if (existingCat) {
              categoryId = existingCat.category_id || existingCat.id
              categoryCache.set(catNameLower, categoryId)
            } else {
              const createdCat = await connector.create('categories', {
                name: catNameTrimmed,
                active: 'TRUE'
              })
              categoryId = (createdCat as any).category_id || (createdCat as any).id
              categoryCache.set(catNameLower, categoryId)
              tx.add(async () => {
                await connector.delete('categories', categoryId).catch(() => {})
              })
            }
          }
        }

        // Create the product
        const isTempSku = !item.sku || item.sku.startsWith('TEMP-') || item.sku.match(/^P-\d{13}-\d+$/)
        const productSku = isTempSku ? '' : item.sku

        const createdProduct = await connector.create('products', {
          name: item.product_name.trim(),
          sku: productSku,
          category_id: categoryId,
          sell_price: item.sell_price || '0',
          cost_price: item.unit_cost || '0',
          min_price: item.min_price || '0',
          stock_track: 'TRUE',
          active: 'TRUE',
          unit: item.unit || 'Cái'
        }) as Record<string, string>

        productId = createdProduct.product_id || createdProduct.id
        finalSku = createdProduct.sku || createdProduct.id
        tx.add(async () => {
          await connector.delete('products', productId!).catch(() => {})
        })
      }

      if (!productId) {
        return NextResponse.json({ error: 'Không xác định được ID sản phẩm.' }, { status: 400 })
      }

      const qtyVal = parseFloat(item.qty)
      if (isNaN(qtyVal)) {
        return NextResponse.json({ error: 'Số lượng điều chỉnh không hợp lệ.' }, { status: 400 })
      }

      processedItems.push({
        productId,
        qty: qtyVal,
        unitCost: item.unit_cost || '0',
        sku: finalSku
      })
    }

    // 2. Create stock movements and update inventory quantities
    for (const pItem of processedItems) {
      // Find SKU if not set
      let sku = pItem.sku
      if (!sku) {
        const prod = await connector.findById('products', pItem.productId)
        sku = prod ? (prod as any).sku : ''
      }

      // Create Stock Movement record
      const smPayload = {
        type: 'adjustment',
        movement_no: movementNo,
        product_id: pItem.productId,
        sku: sku || '',
        qty: String(pItem.qty),
        unit_cost: pItem.unitCost,
        branch_id: branch_id,
        reference_no: reference_no,
        reason: reason,
        created_at: getGMT7Time()
      }

      const createdSM = await connector.create('stock-movements', smPayload)
      tx.add(async () => {
        await connector.delete('stock-movements', (createdSM as any).movement_id).catch(() => {})
      })

      // Fetch existing inventory for the branch
      const invListResult = await connector.list('inventory', {
        page: 1, limit: 10,
        filters: { product_id: pItem.productId }
      })
      const allInv = invListResult.data as Record<string, string>[]
      let invRow = allInv.find(i => i.branch_id === branch_id)
      if (!invRow && branch_id !== '') {
        invRow = allInv.find(i => i.branch_id === '')
      }
      if (!invRow) {
        invRow = allInv[0]
      }

      if (invRow) {
        const oldQty = parseFloat(invRow.stock_qty || '0')
        const newQty = Math.max(0, oldQty + pItem.qty)
        await connector.update('inventory', invRow.inventory_id as string, {
          stock_qty: String(newQty)
        })
        tx.add(async () => {
          await connector.update('inventory', invRow.inventory_id as string, { stock_qty: String(oldQty) }).catch(() => {})
        })
      } else {
        const createdInv = await connector.create('inventory', {
          product_id: pItem.productId,
          branch_id: branch_id || '',
          stock_qty: String(Math.max(0, pItem.qty)),
          min_stock: '0',
          sku: sku || ''
        } as Record<string, string>)
        tx.add(async () => {
          await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
        })
      }

      // Update product cost_price if adjusted with a valid cost price
      if (pItem.unitCost && parseFloat(pItem.unitCost) > 0) {
        const prod = await connector.findById('products', pItem.productId)
        if (prod) {
          const oldCost = (prod as any).cost_price || '0'
          await connector.update('products', pItem.productId, { cost_price: pItem.unitCost })
          tx.add(async () => {
            await connector.update('products', pItem.productId, { cost_price: oldCost }).catch(() => {})
          })
        }
      }
    }

    // Invalidate caches
    invalidate(shopId, 'products')
    invalidate(shopId, 'categories')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'stock-movements')

    return NextResponse.json({ ok: true, movement_no: movementNo })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST inventory/adjust-batch')
  }
}
