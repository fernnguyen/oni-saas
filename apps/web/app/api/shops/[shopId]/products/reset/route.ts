import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    // Check products.delete permission for dangerous wipe operation
    const { connector, shop } = await requireShopAccess(shopId, 'products.delete')
    const tenantId = shop.tenant_id
    const branchId = shopId

    const pgConnector = connector as any
    const pool = pgConnector.pool

    if (pool) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // 1. Delete product units referencing products in this branch/tenant
        await client.query(
          `DELETE FROM product_units 
           WHERE product_id IN (SELECT id FROM products WHERE branch_id = $1 AND tenant_id = $2)`,
          [branchId, tenantId]
        )

        // 2. Delete inventory batches in this branch/tenant
        await client.query(
          `DELETE FROM inventory_batches WHERE branch_id = $1 AND tenant_id = $2`,
          [branchId, tenantId]
        )

        // 3. Delete inventory records in this branch/tenant
        await client.query(
          `DELETE FROM inventory WHERE branch_id = $1 AND tenant_id = $2`,
          [branchId, tenantId]
        )

        // 4. Delete stock movements in this branch/tenant
        await client.query(
          `DELETE FROM stock_movements WHERE branch_id = $1 AND tenant_id = $2`,
          [branchId, tenantId]
        )

        // 5. Delete products in this branch/tenant
        await client.query(
          `DELETE FROM products WHERE branch_id = $1 AND tenant_id = $2`,
          [branchId, tenantId]
        )

        // 6. Delete categories in this tenant that are no longer referenced by any remaining products (e.g. from other branches)
        await client.query(
          `DELETE FROM categories 
           WHERE tenant_id = $1 
             AND id NOT IN (
               SELECT DISTINCT category_id 
               FROM products 
               WHERE tenant_id = $1 AND category_id IS NOT NULL
             )`,
          [tenantId]
        )

        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } else {
      // Fallback cross-connector logic
      const listRes = await connector.list('products', { limit: 10000 })
      for (const p of listRes.data) {
        const pid = p.id || (p as any).product_id
        await connector.delete('products', pid)
      }

      const catRes = await connector.list('categories', { limit: 10000 })
      for (const c of catRes.data) {
        const cid = c.id || (c as any).category_id
        await connector.delete('categories', cid)
      }
    }

    // Invalidate next cache
    invalidate(shopId, 'products')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'categories')

    return NextResponse.json({ success: true, message: 'All products, inventory, and categories in this branch/tenant have been reset' })
  } catch (e) {
    return handleApiError(e, 'POST products/reset')
  }
}
