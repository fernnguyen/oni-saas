export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'

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
    const type = sp.get('type') ?? 'customer' // 'customer' or 'supplier'

    let result
    if (type === 'supplier') {
      const all = await connector.list('suppliers', { limit: 5000 })
      const withDebt = all.data.filter(s => parseFloat(s.debt_amount || '0') > 0)
      withDebt.sort((a, b) => parseFloat(b.debt_amount || '0') - parseFloat(a.debt_amount || '0'))
      result = {
        data: withDebt,
        total: withDebt.length,
        totalDebt: withDebt.reduce((sum, s) => sum + parseFloat(s.debt_amount || '0'), 0)
      }
    } else {
      const all = await connector.list('customers', { limit: 5000 })
      const withDebt = all.data.filter(c => parseFloat(c.debt_amount || '0') > 0)
      withDebt.sort((a, b) => parseFloat(b.debt_amount || '0') - parseFloat(a.debt_amount || '0'))
      result = {
        data: withDebt,
        total: withDebt.length,
        totalDebt: withDebt.reduce((sum, c) => sum + parseFloat(c.debt_amount || '0'), 0)
      }
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET customers debt')
  }
}
