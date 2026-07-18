import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import crypto from 'crypto'
import { prefixSku } from '@/lib/sku'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    // Require products.create permission
    const { connector, shop } = await requireShopAccess(shopId, 'products.create')
    const tenantId = shop.tenant_id
    const branchId = shopId

    const body = await req.json()
    const { products } = body
    let warehouse_id = body.warehouse_id || ''

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Invalid products payload' }, { status: 400 })
    }

    if (!warehouse_id) {
      const whRes = await connector.list('warehouses', {
        filters: { type: 'sale' },
        limit: 1
      });
      if (whRes.total > 0) {
        warehouse_id = whRes.data[0].id;
      }
    }

    const pgConnector = connector as any
    const pool = pgConnector.pool

    if (pool) {
      // PostgreSQL optimized transaction flow
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const categoryCache = new Map<string, string>()

        const getOrCreateCategory = async (catStr: string) => {
          if (!catStr) return null
          const trimmed = catStr.trim()
          if (trimmed === '') return null
          if (categoryCache.has(trimmed)) return categoryCache.get(trimmed)!

          const parts = trimmed.split('>>').map(p => p.trim()).filter(Boolean)
          let parentId: string | null = null

          for (const part of parts) {
            const cacheKey: string = `${parentId ?? 'root'}>>${part}`
            if (categoryCache.has(cacheKey)) {
              parentId = categoryCache.get(cacheKey)!
              continue
            }

            const res: any = await client.query(
              `SELECT id FROM categories WHERE name = $1 AND (parent_id = $2 OR (parent_id IS NULL AND $2 IS NULL)) AND tenant_id = $3 AND branch_id = $4 AND active != 'FALSE' LIMIT 1`,
              [part, parentId, tenantId, branchId]
            )

            if (res.rows.length > 0) {
              parentId = res.rows[0].id
            } else {
              const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()
              const randomIdSuffix = crypto.randomUUID().substring(0, 8).toUpperCase()
              const newCatId = `CAT-${tenantHash}-${randomIdSuffix}`

              await client.query(
                `INSERT INTO categories (id, tenant_id, branch_id, name, parent_id, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'TRUE', NOW(), NOW())`,
                [newCatId, tenantId, branchId, part, parentId]
              )
              parentId = newCatId
            }
            categoryCache.set(cacheKey, parentId as string)
          }

          return parentId
        }

        const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()
        const pdkSearchPrefix = `PDK-${tenantHash}-`

        // Count existing PDK movements to generate sequential PDK numbers
        const pdkCountRes = await client.query(
          `SELECT movement_no FROM stock_movements WHERE tenant_id = $1 AND branch_id = $2 AND type = 'adjustment' AND movement_no LIKE $3`,
          [tenantId, branchId, `${pdkSearchPrefix}%`]
        )
        const pdkNums = pdkCountRes.rows
          .map((r: any) => r.movement_no as string)
          .filter((n: string | null | undefined): n is string => !!n && n.startsWith(pdkSearchPrefix))
          .map((n: string) => parseInt(n.slice(pdkSearchPrefix.length), 10))
          .filter((n: number) => !isNaN(n))
        let pdkCounter = pdkNums.length > 0 ? Math.max(...pdkNums) : 0

        for (const p of products) {
          const sku = p.sku ? String(p.sku).trim() : ''
          if (!sku) continue
          const prefixedSku = prefixSku(sku, tenantHash)

          const categoryId = p.categoryStr ? await getOrCreateCategory(p.categoryStr) : null

          // Overwrite Strategy: Check if SKU exists
          const existingRes = await client.query(
            `SELECT id FROM products WHERE sku = $1 AND tenant_id = $2 AND branch_id = $3 LIMIT 1`,
            [prefixedSku, tenantId, branchId]
          )

          let productId: string
          const hasExisting = existingRes.rows.length > 0
          const metadataStr = p.metadata ? JSON.stringify(p.metadata) : null

          if (hasExisting) {
            productId = existingRes.rows[0].id
            // Overwrite main product fields
            await client.query(
              `UPDATE products SET 
                name = $1, 
                barcode = $2, 
                category_id = $3, 
                unit = $4, 
                sell_price = $5, 
                cost_price = $6, 
                min_price = $7, 
                description = $8, 
                image_url = $9, 
                stock_qty = $10, 
                metadata = $11, 
                weight = $12, 
                active = $13, 
                updated_at = NOW() 
              WHERE id = $14 AND tenant_id = $15 AND branch_id = $16`,
              [
                p.name,
                p.barcode || '',
                categoryId,
                p.unit || '',
                p.sell_price || '0',
                p.cost_price || '0',
                p.min_stock || '0',
                p.description || '',
                p.image_url || '',
                p.stock_qty || '0',
                metadataStr,
                p.weight || '',
                p.active === 'FALSE' ? 'FALSE' : 'TRUE',
                productId,
                tenantId,
                branchId
              ]
            )

            // Clean up child tables to prepare for new insertion
            await client.query(`DELETE FROM product_units WHERE product_id = $1 AND tenant_id = $2`, [productId, tenantId])
            await client.query(`DELETE FROM inventory_batches WHERE product_id = $1 AND tenant_id = $2 AND branch_id = $3`, [productId, tenantId, branchId])
            await client.query(`DELETE FROM inventory WHERE product_id = $1 AND tenant_id = $2 AND branch_id = $3`, [productId, tenantId, branchId])
          } else {
            // Create new product
            productId = `P-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`

            await client.query(
              `INSERT INTO products (
                id, tenant_id, branch_id, name, sku, barcode, category_id, unit, 
                sell_price, cost_price, min_price, description, image_url, stock_qty, metadata, 
                weight, active, created_at, updated_at, product_type, has_bom
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 
                $9, $10, $11, $12, $13, $14, $15, 
                $16, $17, NOW(), NOW(), 'simple', 'FALSE'
              )`,
              [
                productId,
                tenantId,
                branchId,
                p.name,
                prefixedSku,
                p.barcode || '',
                categoryId,
                p.unit || '',
                p.sell_price || '0',
                p.cost_price || '0',
                p.min_stock || '0',
                p.description || '',
                p.image_url || '',
                p.stock_qty || '0',
                metadataStr,
                p.weight || '',
                p.active === 'FALSE' ? 'FALSE' : 'TRUE'
              ]
            )
          }

          // Insert product units
          if (Array.isArray(p.product_units) && p.product_units.length > 0) {
            for (const u of p.product_units) {
              const unitId = `PU-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
              await client.query(
                `INSERT INTO product_units (
                  id, tenant_id, product_id, unit_name, conversion_rate, barcode, sell_price, cost_price, 
                  active, created_at, updated_at, is_base_unit
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, 
                  'TRUE', NOW(), NOW(), 'FALSE'
                )`,
                [
                  unitId,
                  tenantId,
                  productId,
                  u.unit_name,
                  String(u.conversion_rate),
                  u.barcode || '',
                  String(u.sell_price || '0'),
                  String(u.cost_price || '0')
                ]
              )
            }
          }

          // Insert inventory batches
          if (Array.isArray(p.inventory_batches) && p.inventory_batches.length > 0) {
            for (const b of p.inventory_batches) {
              const batchId = `IB-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
              await client.query(
                `INSERT INTO inventory_batches (
                  id, tenant_id, branch_id, product_id, batch_no, expiry_date, stock_qty, 
                  active, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, 
                  'TRUE', NOW(), NOW()
                )`,
                [
                  batchId,
                  tenantId,
                  branchId,
                  productId,
                  b.batch_no,
                  b.expiry_date,
                  String(b.stock_qty)
                ]
              )
            }
          }

          // Insert inventory record
          const invId = `INV-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
          await client.query(
            `INSERT INTO inventory (
              id, tenant_id, branch_id, product_id, sku, stock_qty, min_stock, unit_cost, 
              active, created_at, updated_at, last_updated, warehouse_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, 
              'TRUE', NOW(), NOW(), NOW(), $9
            )`,
            [
              invId,
              tenantId,
              branchId,
              productId,
              prefixedSku,
              p.stock_qty || '0',
              p.min_stock || '0',
              p.cost_price || '0',
              warehouse_id || null
            ]
          )

          // Insert stock movements (inventory adjustment history/stock card audit trail)
          if (parseFloat(p.stock_qty || '0') > 0) {
            pdkCounter += 1
            const movementNo = `${pdkSearchPrefix}${String(pdkCounter).padStart(3, '0')}`
            const smId = `SM-${tenantHash}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
            await client.query(
              `INSERT INTO stock_movements (
                id, tenant_id, branch_id, product_id, sku, type, movement_no, qty, unit_cost, reason, created_at, updated_at, active, warehouse_id
              ) VALUES (
                $1, $2, $3, $4, $5, 'adjustment', $6, $7, $8, 'Nhập tồn kho ban đầu từ file Excel KiotViet', NOW(), NOW(), 'TRUE', $9
              )`,
              [smId, tenantId, branchId, productId, prefixedSku, movementNo, String(p.stock_qty), String(p.cost_price || '0'), warehouse_id || null]
            )
          }
        }

        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } else {
      // Fallback cross-connector logic using standard IDataConnector
      const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()
      for (const p of products) {
        const sku = p.sku ? String(p.sku).trim() : ''
        if (!sku) continue
        const prefixedSku = prefixSku(sku, tenantHash)

        // 1. Check existing
        const existing = await connector.list('products', {
          page: 1,
          limit: 1,
          filters: { sku: prefixedSku }
        })

        let categoryId: string | null = null
        if (p.categoryStr) {
          const parts = p.categoryStr.split('>>').map((s: string) => s.trim()).filter(Boolean)
          let lastCatId: string | null = null
          for (const part of parts) {
            const catRes = await connector.list('categories', {
              page: 1,
              limit: 1,
              filters: { name: part, parent_id: lastCatId ?? '' }
            })
            if (catRes.data.length > 0) {
              lastCatId = catRes.data[0].id || (catRes.data[0] as any).category_id
            } else {
              const newCat = await connector.create('categories', {
                name: part,
                parent_id: lastCatId ?? ''
              })
              lastCatId = newCat.id || (newCat as any).category_id
            }
          }
          categoryId = lastCatId
        }

        const productPayload = {
          name: p.name,
          sku: prefixedSku,
          barcode: p.barcode || '',
          category_id: categoryId || '',
          unit: p.unit || '',
          sell_price: p.sell_price || '0',
          cost_price: p.cost_price || '0',
          min_price: p.min_stock || '0',
          weight: p.weight || '',
          description: p.description || '',
          image_url: p.image_url || '',
          stock_qty: p.stock_qty || '0',
          metadata: p.metadata ? JSON.stringify(p.metadata) : '',
          active: p.active === 'FALSE' ? 'FALSE' : 'TRUE',
        }

        let productId: string
        if (existing.data.length > 0) {
          const matched = existing.data[0]
          productId = matched.id || (matched as any).product_id
          await connector.update('products', productId, productPayload)

          // Clear existing units & batches if possible
          // Connector API does not support bulk deletes easily unless custom delete method, so standard fallback is overwrite
        } else {
          const created = await connector.create('products', productPayload)
          productId = created.id || (created as any).product_id
        }

        // Insert units
        if (Array.isArray(p.product_units) && p.product_units.length > 0) {
          const unitsData = p.product_units.map((u: any) => ({
            product_id: productId,
            unit_name: u.unit_name,
            conversion_rate: String(u.conversion_rate),
            barcode: u.barcode || '',
            sell_price: String(u.sell_price || '0'),
            cost_price: String(u.cost_price || '0'),
            active: 'TRUE',
          }))
          await connector.batchCreate('product-units', unitsData)
        }

        // Insert batches
        if (Array.isArray(p.inventory_batches) && p.inventory_batches.length > 0) {
          const batchesData = p.inventory_batches.map((b: any) => ({
            product_id: productId,
            branch_id: branchId,
            batch_no: b.batch_no,
            expiry_date: b.expiry_date,
            stock_qty: String(b.stock_qty),
            active: 'TRUE',
          }))
          await connector.batchCreate('inventory-batches', batchesData)
        }

        // Insert standard inventory entry
        await connector.create('inventory', {
          product_id: productId,
          sku: prefixedSku,
          branch_id: branchId,
          stock_qty: p.stock_qty || '0',
          min_stock: p.min_stock || '0',
          unit_cost: p.cost_price || '0',
          active: 'TRUE',
          last_updated: new Date().toISOString(),
          warehouse_id: warehouse_id || undefined
        })

        // Insert stock movements in fallback path (inventory adjustment history/stock card audit trail)
        if (parseFloat(p.stock_qty || '0') > 0) {
          const pdkRes = await connector.list('stock-movements', {
            page: 1, limit: 5000,
            filters: { type: 'adjustment' }
          })
          const pdkSearchPrefix = `PDK-${tenantHash}-`
          const existingSM = pdkRes.data as Record<string, string>[]
          const nums = existingSM
            .map(r => r.movement_no)
            .filter((n): n is string => !!n && n.startsWith(pdkSearchPrefix))
            .map(n => parseInt(n.slice(pdkSearchPrefix.length), 10))
            .filter(n => !isNaN(n))
          const nextVal = nums.length > 0 ? Math.max(...nums) + 1 : 1
          const movementNo = `${pdkSearchPrefix}${String(nextVal).padStart(3, '0')}`

          await connector.create('stock-movements', {
            product_id: productId,
            sku: prefixedSku,
            branch_id: branchId,
            type: 'adjustment',
            movement_no: movementNo,
            qty: String(p.stock_qty),
            unit_cost: String(p.cost_price || '0'),
            active: 'TRUE',
            reason: 'Nhập tồn kho ban đầu từ file Excel KiotViet',
            warehouse_id: warehouse_id || undefined
          })
        }
      }
    }

    // Invalidate next cache
    invalidate(shopId, 'products')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'categories')

    return NextResponse.json({ success: true, count: products.length })
  } catch (e) {
    return handleApiError(e, 'POST products/import')
  }
}
