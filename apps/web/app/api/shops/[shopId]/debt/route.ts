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
      
      // Self-healing for negative debt: convert negative debt to positive prepaid balance
      let hasHealed = false
      for (const c of all.data) {
        const d = parseFloat(c.debt_amount || '0')
        if (d < 0) {
          const absD = Math.abs(d)
          const currentPrepaid = parseFloat(c.prepaid_balance || '0')
          const newPrepaid = currentPrepaid + absD
          
          c.debt_amount = '0'
          c.prepaid_balance = String(newPrepaid)
          
          // Persist the correction to DB in the background
          void connector.update('customers', c.id || c.customer_id, {
            debt_amount: '0',
            prepaid_balance: String(newPrepaid)
          }).catch(err => console.error(`Self-healing debt route failed for customer ${c.id}:`, err))
          
          hasHealed = true
        }
      }
      
      if (hasHealed) {
        const { invalidate } = await import('@/lib/server/cache')
        invalidate(shopId, 'customers')
      }

      const withDebt = all.data.filter(c => parseFloat(c.debt_amount || '0') > 0)
      
      if (withDebt.length > 0) {
        withDebt.forEach(c => {
          let metaDebtDays = 0
          if (c.metadata) {
            try {
              const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata
              if (meta.debt_days) metaDebtDays = Number(meta.debt_days)
            } catch (e) {}
          }
          c.debt_days = String(metaDebtDays || c.debt_days || '0')
        })
      }

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
