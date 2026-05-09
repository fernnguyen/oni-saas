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

    // Three fallbacks to handle branch_id mismatches between POS (UUID) and Sheets (empty string)
    let invResult = await connector.list('inventory', {
      page: 1, limit: 1,
      filters: { product_id, branch_id },
    })
    if (invResult.data.length === 0 && branch_id !== '') {
      invResult = await connector.list('inventory', {
        page: 1, limit: 1,
        filters: { product_id, branch_id: '' },
      })
    }
    if (invResult.data.length === 0) {
      invResult = await connector.list('inventory', {
        page: 1, limit: 1,
        filters: { product_id },
      })
    }

    if (invResult.data.length > 0) {
      const inv = invResult.data[0] as Record<string, string>
      const newQty = Math.max(0, parseFloat(inv.stock_qty || '0') + delta)
      await connector.update('inventory', inv.inventory_id as string, {
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
