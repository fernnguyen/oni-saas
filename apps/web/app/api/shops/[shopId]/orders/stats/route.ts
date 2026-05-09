import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function computeStats(rows: Row[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart  = todayStart - 6 * 24 * 60 * 60 * 1000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const today   = { count: 0, revenue: 0 }
  const week    = { count: 0, revenue: 0 }
  const month   = { count: 0, revenue: 0 }
  const returns = { count: 0, revenue: 0 }

  for (const row of rows) {
    const t = new Date(row.created_at || 0).getTime()
    const amount = parseFloat(row.total_amount || '0')
    const isReturn = row.is_return === 'TRUE'

    if (t >= todayStart) { today.count++;   today.revenue   += amount }
    if (t >= weekStart)  { week.count++;    week.revenue    += amount }
    if (t >= monthStart) { month.count++;   month.revenue   += amount }
    if (isReturn)        { returns.count++; returns.revenue += amount }
  }

  return { today, week, month, returns }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const result = await shopCache(
      async () => {
        const all = await connector.list('orders', { limit: 5000 })
        return computeStats(all.data)
      },
      ['orders-stats', shopId],
      { tags: [shopTag(shopId, 'orders')], revalidate: 60 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET orders/stats')
  }
}
