export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'inventory.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    // Support large limits for offline POS hydration (up to 10000)
    const limit = Math.min(10000, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const branch_id = sp.get('branch_id') ?? ''
    const product_id = sp.get('product_id') ?? ''
    
    const filters: Record<string, string> = {}
    if (branch_id) filters.branch_id = branch_id
    if (product_id) filters.product_id = product_id

    const result = await connector.list('inventory-batches', {
      page,
      limit,
      search: search || undefined,
      filters,
      sortDesc: false // we want oldest/earliest expiry or standard ordering
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET inventory-batches')
  }
}
