export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'returns.create')

    // Only owner/admin can run this fix
    if (!permissions.includes('owner') && !permissions.includes('admin')) {
      return NextResponse.json({ error: 'Only owner/admin can run this fix' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const dryRun = sp.get('dry_run') !== 'false' // defaults to true

    // 1. Fetch returns for this shop
    const returnsRes = await connector.list('returns', { limit: 5000, filters: { branch_id: shopId } })
    const returns = returnsRes.data as Record<string, any>[]

    // 2. Fetch stock movements for this shop (plus any with blank branch_id)
    const movementsRes = await connector.list('stock-movements', { limit: 10000 })
    const allMovements = movementsRes.data as Record<string, any>[]
    const returnMovements = allMovements.filter(
      m => m.type === 'return_in' && (!m.branch_id || m.branch_id === '' || m.branch_id === shopId)
    )

    // 3. Fetch warehouses
    const warehousesRes = await connector.list('warehouses', { limit: 100, filters: { branch_id: shopId } })
    const warehouses = warehousesRes.data as Record<string, any>[]

    // 4. Fetch inventory
    const inventoryRes = await connector.list('inventory', { limit: 10000 })
    const allInventory = inventoryRes.data as Record<string, any>[]

    // Resolve warehouse
    let saleWh = warehouses.find(w => w.type === 'sale')
    let saleWhId = saleWh?.id
    if (!saleWhId) {
      saleWh = warehouses[0]
      saleWhId = saleWh?.id
    }

    // Auto-seed standard warehouse if missing
    if (!saleWhId) {
      if (!dryRun) {
        const newWh = await connector.create('warehouses', {
          branch_id: shopId,
          name: 'Kho Kinh doanh (Bán lẻ)',
          type: 'sale',
          active: 'TRUE'
        })
        saleWhId = newWh.id
        warehouses.push(newWh)
      } else {
        saleWhId = 'PENDING-AUTO-CREATE-WH'
      }
    }

    const report: Array<{
      movement_no: string
      reference_no: string
      product_id: string
      qty: number
      empty_inventory_qty_before?: number
      empty_inventory_qty_after?: number
      target_inventory_qty_before?: number
      target_inventory_qty_after?: number
      status: string
    }> = []

    const corruptedMovements = returnMovements.filter(m => !m.branch_id || !m.warehouse_id)

    for (const mov of corruptedMovements) {
      // Match with a return
      const matchingReturn = returns.find(r => 
        r.return_id === mov.reference_no || 
        r.return_no === mov.reference_no ||
        r.order_id === mov.reference_no
      )

      if (!matchingReturn) {
        continue
      }

      const qty = Math.abs(parseFloat(mov.qty || '0'))

      // Find and update inventory
      const emptyBranchInv = allInventory.find(i => i.product_id === mov.product_id && (!i.branch_id || i.branch_id === ''))
      const targetBranchInv = allInventory.find(i => i.product_id === mov.product_id && i.branch_id === shopId)

      let emptyBefore = 0
      let emptyAfter = 0
      if (emptyBranchInv) {
        emptyBefore = parseFloat(emptyBranchInv.stock_qty || '0')
        emptyAfter = Math.max(0, emptyBefore - qty)
        if (!dryRun) {
          await connector.update('inventory', emptyBranchInv.inventory_id, { stock_qty: String(emptyAfter) })
          emptyBranchInv.stock_qty = String(emptyAfter)
        }
      }

      let targetBefore = 0
      let targetAfter = qty
      if (targetBranchInv) {
        targetBefore = parseFloat(targetBranchInv.stock_qty || '0')
        targetAfter = targetBefore + qty
        if (!dryRun) {
          await connector.update('inventory', targetBranchInv.inventory_id, { stock_qty: String(targetAfter) })
          targetBranchInv.stock_qty = String(targetAfter)
        }
      } else {
        if (!dryRun) {
          const newInv = await connector.create('inventory', {
            product_id: mov.product_id,
            branch_id: shopId,
            stock_qty: String(qty),
            min_stock: '0',
            sku: mov.sku || '',
          })
          allInventory.push(newInv)
        }
      }

      if (!dryRun) {
        await connector.update('stock-movements', mov.movement_id || mov.id, {
          branch_id: shopId,
          warehouse_id: saleWhId
        })
      }

      report.push({
        movement_no: mov.movement_no,
        reference_no: mov.reference_no,
        product_id: mov.product_id,
        qty,
        empty_inventory_qty_before: emptyBranchInv ? emptyBefore : undefined,
        empty_inventory_qty_after: emptyBranchInv ? emptyAfter : undefined,
        target_inventory_qty_before: targetBranchInv ? targetBefore : 0,
        target_inventory_qty_after: targetAfter,
        status: dryRun ? 'Will repair' : 'Repaired'
      })
    }

    if (!dryRun && report.length > 0) {
      invalidate(shopId, 'stock-movements')
      invalidate(shopId, 'inventory')
    }

    return NextResponse.json({
      dry_run: dryRun,
      total_scanned_movements: returnMovements.length,
      corrupted_movements_found: corruptedMovements.length,
      repaired_movements: report.length,
      report
    })
  } catch (e) {
    return handleApiError(e, 'GET fix-return-stock')
  }
}
