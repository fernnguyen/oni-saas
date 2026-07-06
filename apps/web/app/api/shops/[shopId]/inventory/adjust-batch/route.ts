export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { RollbackContext, type IDataConnector } from '@oni/adapters'

import crypto from 'crypto'

const MOVEMENT_NO_PREFIX = 'PDK'

import { getGMT7Time } from '@oni/core'


async function generateMovementNo(connector: IDataConnector, tenantId: string): Promise<string> {
  const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()
  const searchPrefix = `${MOVEMENT_NO_PREFIX}-${tenantHash}-`
  const result = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'adjustment' } })
  const existing = result.data as Record<string, string>[]
  const nums = existing
    .map(r => r.movement_no)
    .filter((n): n is string => !!n && n.startsWith(searchPrefix))
    .map(n => parseInt(n.slice(searchPrefix.length), 10))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${searchPrefix}${String(next).padStart(3, '0')}`
}

interface AdjustItem {
  product_id?: string
  qty: string          // delta (e.g. +10 or -5)
  unit_cost?: string
  batch_no?: string
  expiry_date?: string
  
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
    const { connector, shop, userId } = await requireShopAccess(shopId, 'products.create')
    tx = new RollbackContext()

    const body = await req.json() as {
      branch_id: string
      warehouse_id?: string
      reason?: string
      reference_no?: string
      items: AdjustItem[]
    }

    const { branch_id = '', warehouse_id = '', reason = '', reference_no = '', items = [] } = body

    if (items.length === 0) {
      return NextResponse.json({ error: 'Danh sách sản phẩm trống.' }, { status: 400 })
    }

    // 1. Generate sequential PDK movement_no
    const movementNo = await generateMovementNo(connector, shop.tenant_id)
    const finalReferenceNo = reference_no.trim() || movementNo

    // Cache to prevent duplicate category lookups/creates within this request
    const categoryCache = new Map<string, string>()

    const processedItems: {
      productId: string
      qty: number
      unitCost: string
      sku: string
      batch_no?: string
      expiry_date?: string
    }[] = []

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
        const productSku = isTempSku ? '' : (item.sku || '')

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
        sku: finalSku,
        batch_no: item.batch_no,
        expiry_date: item.expiry_date
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
        warehouse_id: warehouse_id, // Save warehouse ID directly in the ledger!
        reference_no: finalReferenceNo,
        reason: reason,
        batch_no: pItem.batch_no || '', // Capture batch_no directly in movement ledger
        employee_id: userId,
        created_at: getGMT7Time()
      }

      const createdSM = await connector.create('stock-movements', smPayload)
      tx.add(async () => {
        await connector.delete('stock-movements', (createdSM as any).movement_id || (createdSM as any).id).catch(() => {})
      })

      // Fetch existing inventory for the branch and warehouse
      const invListResult = await connector.list('inventory', {
        page: 1, limit: 10,
        filters: { product_id: pItem.productId, warehouse_id: warehouse_id }
      })
      const allInv = invListResult.data as Record<string, string>[]
      let invRow = allInv[0]

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
          warehouse_id: warehouse_id || 'sale',
          stock_qty: String(Math.max(0, pItem.qty)),
          min_stock: '0',
          sku: sku || ''
        } as Record<string, string>)
        tx.add(async () => {
          await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
        })
      }

      // Update inventory batches if a specific batch number is targeted
      if (pItem.batch_no) {
        const batchListResult = await connector.list('inventory-batches', {
          page: 1,
          limit: 10,
          filters: {
            product_id: pItem.productId,
            branch_id: branch_id || '',
            batch_no: pItem.batch_no
          }
        })
        const allBatches = batchListResult.data as Record<string, string>[]
        const batchRow = allBatches[0]

        if (batchRow) {
          const oldBatchQty = parseFloat(batchRow.stock_qty || '0')
          const newBatchQty = Math.max(0, oldBatchQty + pItem.qty)
          await connector.update('inventory-batches', (batchRow.batch_id || batchRow.id) as string, {
            stock_qty: String(newBatchQty)
          })
          tx.add(async () => {
            await connector.update('inventory-batches', (batchRow.batch_id || batchRow.id) as string, {
              stock_qty: String(oldBatchQty)
            }).catch(() => {})
          })
        } else {
          // Auto create batch if not found
          const tenantHash = crypto.createHash('sha256').update(shop.tenant_id).digest('hex').substring(0, 8).toUpperCase()
          const batchId = `IB-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
          await connector.create('inventory-batches', {
            id: batchId,
            product_id: pItem.productId,
            branch_id: branch_id || '',
            batch_no: pItem.batch_no,
            expiry_date: pItem.expiry_date || new Date().toISOString().split('T')[0],
            stock_qty: String(Math.max(0, pItem.qty))
          })
          tx.add(async () => {
            await connector.delete('inventory-batches', batchId).catch(() => {})
          })
        }
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
    invalidate(shopId, 'inventory-batches')
    invalidate(shopId, 'stock-movements')

    return NextResponse.json({ ok: true, movement_no: movementNo })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST inventory/adjust-batch')
  }
}
