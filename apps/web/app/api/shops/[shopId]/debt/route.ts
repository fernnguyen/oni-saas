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
        const now = Date.now()
        await Promise.all(withDebt.map(async (c) => {
          try {
            const cid = c.id || c.customer_id
            const ordersRes = await connector.list('orders', {
              filters: { customer_id: cid },
              limit: 500
            })
            const unpaid = ordersRes.data.filter((o: any) => parseFloat(o.debt_amount || '0') > 0 && o.is_return !== 'TRUE' && o.status !== 'cancelled' && o.status !== 'failed')
            if (unpaid.length > 0) {
              const oldest = unpaid.reduce((acc: any, cur: any) => 
                new Date(cur.created_at).getTime() < new Date(acc.created_at).getTime() ? cur : acc
              )
              c.debt_days = String(Math.floor((now - new Date(oldest.created_at).getTime()) / 86400000))
            } else {
              c.debt_days = c.debt_days || '0'
            }
          } catch (err) {
            console.error(`Failed to fetch orders for debt_days for customer ${c.id}:`, err)
            c.debt_days = c.debt_days || '0'
          }
        }))
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
