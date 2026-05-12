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
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json() as { product_id?: string; delta?: string; branch_id?: string }
    const { product_id, delta: deltaStr, branch_id = '' } = body

    if (!product_id || !deltaStr) {
      return NextResponse.json({ error: 'product_id and delta required' }, { status: 400 })
    }

    const delta = parseFloat(deltaStr)
    if (isNaN(delta) || delta === 0) {
      return NextResponse.json({ ok: true })
    }

    // Fetch all inventory for this product_id to minimize connector API calls (avoids sequential fallback queries)
    const invListResult = await connector.list('inventory', {
      page: 1, limit: 10, // get up to 10 branches
      filters: { product_id },
    })

    const allInv = invListResult.data as Record<string, string>[]
    let invRow = allInv.find(i => i.branch_id === branch_id)
    if (!invRow && branch_id !== '') {
      invRow = allInv.find(i => i.branch_id === '')
    }
    if (!invRow) {
      // fallback to any row if nothing matched
      invRow = allInv[0]
    }

    if (invRow) {
      const newQty = Math.max(0, parseFloat(invRow.stock_qty || '0') + delta)
      await connector.update('inventory', invRow.inventory_id as string, {
        stock_qty: String(newQty),
      })
    } else if (delta > 0) {
      await connector.create('inventory', {
        product_id,
        branch_id: '',
        stock_qty: String(delta),
        min_stock: '0',
        sku: '',
      } as Record<string, string>)
    }
    // delta < 0 with no inventory row: nothing to deduct, skip silently

    invalidate(shopId, 'inventory')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e, 'POST inventory/adjust')
  }
}
