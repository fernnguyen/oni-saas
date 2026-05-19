export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { returnCreateSchema } from '@/lib/validators/returns'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.view')

    const sp = req.nextUrl.searchParams
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1'))
    const limit  = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const status = sp.get('status') ?? ''
    const order_id = sp.get('order_id') ?? ''
    const filters: Record<string, string> = {}
    if (status)   filters.status   = status
    if (order_id) filters.order_id = order_id

    let result
    try {
      const res = await connector.list('returns', { page, limit, search: search || undefined, filters, sortDesc: true })
      const filteredData = res.data.filter((r: any) => r.status !== 'deleted')
      result = { data: filteredData, total: filteredData.length }
    } catch {
      result = { data: [], total: 0 }
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET returns')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'returns.create')

    const body = await req.json()
    const data = returnCreateSchema.parse(body)

    // Find the original order to save its status
    if (data.order_id) {
      const order = await connector.findById('orders', data.order_id)
      if (order) {
        data.previous_order_status = (order as Record<string, string>).status || 'completed'
        // Update order status to returning
        await connector.update('orders', data.order_id, { status: 'returning' })
        invalidate(shopId, 'orders')
      }
    }

    const created = await connector.create('returns', data)
    invalidate(shopId, 'returns')

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST returns')
  }
}
