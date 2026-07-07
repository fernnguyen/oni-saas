export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'debt.view')

    if (!permissions.includes('debt.view') && !permissions.includes('customers.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const customer_id = sp.get('customer_id')

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const allOrders = await connector.list('orders', {
      filters: { customer_id },
      limit: 5000
    })

    const withDebt = allOrders.data
      .filter((o: Record<string, string>) => parseFloat(o.debt_amount || '0') > 0 && o.is_return !== 'TRUE' && o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'refunded')
      .sort((a: Record<string, string>, b: Record<string, string>) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      )

    const totalDebt = withDebt.reduce(
      (sum: number, o: Record<string, string>) => sum + parseFloat(o.debt_amount || '0'),
      0
    )

    return NextResponse.json({
      data: withDebt,
      total: withDebt.length,
      totalDebt
    })
  } catch (e) {
    return handleApiError(e, 'GET orders debt')
  }
}
