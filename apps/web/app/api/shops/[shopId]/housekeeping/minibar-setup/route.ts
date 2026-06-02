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
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const resource_id = sp.get('resource_id')

    if (!resource_id) {
      return NextResponse.json({ error: 'Missing resource_id parameter' }, { status: 400 })
    }

    const result = await connector.list('minibar-setup', {
      filters: { resource_id, branch_id: shopId },
      limit: 100
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET minibar-setup')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json() // Array of setup items
    const items = Array.isArray(body) ? body : [body]

    const createdItems = []
    for (const item of items) {
      const data = {
        ...item,
        branch_id: shopId
      }
      
      // Check if it already exists to overwrite or create new
      const existing = await connector.list('minibar-setup', {
        filters: { resource_id: item.resource_id, product_id: item.product_id, branch_id: shopId },
        limit: 1
      })

      if (existing.total > 0) {
        const updated = await connector.update('minibar-setup', existing.data[0].id, {
          standard_qty: String(item.standard_qty)
        })
        createdItems.push(updated)
      } else {
        const created = await connector.create('minibar-setup', data)
        
        // Also initialize room current stock
        await connector.create('room-minibar-stock', {
          resource_id: item.resource_id,
          product_id: item.product_id,
          current_qty: String(item.standard_qty),
          branch_id: shopId
        })
        
        createdItems.push(created)
      }
    }

    invalidate(shopId, 'minibar-setup')
    return NextResponse.json(createdItems, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST minibar-setup')
  }
}
