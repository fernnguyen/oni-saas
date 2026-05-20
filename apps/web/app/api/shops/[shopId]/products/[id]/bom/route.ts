import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.view')

    // Retrieve active BOM items for this parent product
    const res = await connector.list('product-bom', {
      page: 1,
      limit: 1000,
      filters: { parent_product_id: id }
    })

    return NextResponse.json(res.data)
  } catch (e) {
    return handleApiError(e, 'GET product bom')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.edit')

    const body = await req.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be an array of BOM items' }, { status: 400 })
    }

    // Get all existing BOM items (active and inactive) for comparison
    const existing = await connector.list('product-bom', {
      page: 1,
      limit: 1000,
      filters: { parent_product_id: id, active: 'ALL' }
    })
    const existingItems = existing.data as Record<string, string>[]

    const incomingItems = body as Array<{ component_product_id: string; qty: string }>
    const incomingComponentIds = new Set(incomingItems.map(item => item.component_product_id))

    // 1. Reconciliation: Update existing items or reactivate them
    for (const incoming of incomingItems) {
      const existingMatch = existingItems.find(
        ext => ext.component_product_id === incoming.component_product_id
      )

      if (existingMatch) {
        // If it exists, update quantity and ensure active is TRUE
        const existingId = existingMatch.bom_id || existingMatch.id
        await connector.update('product-bom', existingId, {
          qty: String(incoming.qty),
          active: 'TRUE'
        })
      } else {
        // If it does not exist, create a new BOM entry
        await connector.create('product-bom', {
          parent_product_id: id,
          component_product_id: incoming.component_product_id,
          qty: String(incoming.qty),
          active: 'TRUE'
        })
      }
    }

    // 2. Reconciliation: Deactivate (soft delete) items that are not in the incoming payload
    for (const ext of existingItems) {
      if (!incomingComponentIds.has(ext.component_product_id) && ext.active !== 'FALSE') {
        const existingId = ext.bom_id || ext.id
        await connector.delete('product-bom', existingId).catch(() => {})
      }
    }

    // Invalidate product caches
    invalidate(shopId, 'products')

    // Return the updated list
    const updated = await connector.list('product-bom', {
      page: 1,
      limit: 1000,
      filters: { parent_product_id: id }
    })

    return NextResponse.json(updated.data)
  } catch (e) {
    return handleApiError(e, 'POST product bom')
  }
}
