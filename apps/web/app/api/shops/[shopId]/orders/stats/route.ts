import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function computeStats(rows: Row[]) {
  const tzOffset = 7 * 60 * 60 * 1000 // Vietnam is UTC+7
  const now = new Date()
  const localNow = new Date(now.getTime() + tzOffset)
  
  const todayStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())).getTime() - tzOffset
  
  // Week starts 6 days before today
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000
  
  const monthStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1)).getTime() - tzOffset

  const today   = { count: 0, revenue: 0, debt: 0 }
  const week    = { count: 0, revenue: 0, debt: 0 }
  const month   = { count: 0, revenue: 0, debt: 0 }
  const returns = { count: 0, revenue: 0, debt: 0 }

  for (const row of rows) {
    const t = new Date(row.created_at || 0).getTime()
    const amount = parseFloat(row.total_amount || '0')
    const debtAmount = parseFloat(row.debt_amount || '0')
    const isReturn = row.is_return === 'TRUE'

    if (t >= todayStart) { today.count++;   today.revenue   += amount; today.debt += debtAmount }
    if (t >= weekStart)  { week.count++;    week.revenue    += amount; week.debt += debtAmount }
    if (t >= monthStart) { month.count++;   month.revenue   += amount; month.debt += debtAmount }
    if (isReturn)        { returns.count++; returns.revenue += amount; returns.debt += debtAmount }
  }

  return { today, week, month, returns }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const all = await connector.list('orders', { limit: 5000 })
    const result = computeStats(all.data)

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET orders/stats')
  }
}
