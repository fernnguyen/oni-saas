import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'customers.view')

    if (!permissions.includes('debt.view') && !permissions.includes('customers.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const result = await shopCache(
      async () => {
        // Fetch all customers to filter and sort
        const all = await connector.list('customers', { limit: 5000 })
        const withDebt = all.data.filter(c => parseFloat(c.debt_amount || '0') > 0)
        
        // Sort by highest debt amount by default
        withDebt.sort((a, b) => parseFloat(b.debt_amount || '0') - parseFloat(a.debt_amount || '0'))
        
        return {
          data: withDebt,
          total: withDebt.length,
          totalDebt: withDebt.reduce((sum, c) => sum + parseFloat(c.debt_amount || '0'), 0)
        }
      },
      ['customers-debt', shopId],
      { tags: [shopTag(shopId, 'customers')], revalidate: 3600 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET customers debt')
  }
}
