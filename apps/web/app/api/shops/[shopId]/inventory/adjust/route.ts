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
    const { connector } = await requireShopAccess(shopId, 'inventory.create')

    const body = await req.json() as { product_id?: string; delta?: string; branch_id?: string }
    const { product_id, delta: deltaStr, branch_id = '' } = body

    if (!product_id || !deltaStr) {
      return NextResponse.json({ error: 'product_id and delta required' }, { status: 400 })
    }

    const delta = parseFloat(deltaStr)
    if (isNaN(delta) || delta === 0) {
      return NextResponse.json({ ok: true })
    }

    // Recursive helper to adjust inventory, expanding BOM products
    async function adjustInventoryRecursively(pid: string, amount: number) {
      try {
        const prod = await connector.findById('products', pid)
        if (prod && prod.has_bom === 'TRUE') {
          const bomRes = await connector.list('product-bom', {
            page: 1,
            limit: 1000,
            filters: { parent_product_id: pid }
          })
          const components = bomRes.data as Record<string, any>[]

          for (const comp of components) {
            const compId = comp.component_product_id
            const compQtyFactor = parseFloat(comp.qty || '0')
            const compDelta = amount * compQtyFactor

            if (!isNaN(compDelta) && compDelta !== 0) {
              await adjustInventoryRecursively(compId, compDelta)
            }
          }
        } else {
          // Standard product inventory adjustment
          const invListResult = await connector.list('inventory', {
            page: 1, limit: 10,
            filters: { product_id: pid },
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
            const newQty = parseFloat(invRow.stock_qty || '0') + amount
            await connector.update('inventory', invRow.inventory_id as string, {
              stock_qty: String(newQty),
            })
          } else {
            await connector.create('inventory', {
              product_id: pid,
              branch_id: branch_id || '',
              stock_qty: String(amount),
              min_stock: '0',
              sku: '',
            } as Record<string, string>)
          }
        }
      } catch (err) {
        console.error(`Failed to adjust inventory for product ${pid}:`, err)
      }
    }

    await adjustInventoryRecursively(product_id, delta)

    invalidate(shopId, 'inventory')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e, 'POST inventory/adjust')
  }
}
