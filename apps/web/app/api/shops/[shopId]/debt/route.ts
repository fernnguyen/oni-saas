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
    const { shop, connector, permissions } = await requireShopAccess(shopId, 'debt.view')

    if (!permissions.includes('debt.view') && !permissions.includes('customers.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'customer' // 'customer' or 'supplier'
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
    const limit = parseInt(sp.get('limit') ?? '5000', 10)
    const search = sp.get('search') ?? ''
    const sort = sp.get('sort') ?? 'debt_amount_desc'

    // Helper functions for mapping, filtering and sorting in-memory
    const mapDebtDays = (items: any[]) => {
      items.forEach(c => {
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

    const searchLower = search.toLowerCase()
    const filterAndSort = (items: any[]) => {
      let filtered = items.filter(c => parseFloat(c.debt_amount || '0') > 0)

      if (searchLower) {
        filtered = filtered.filter(c => 
          (c.name || '').toLowerCase().includes(searchLower) ||
          (c.phone || '').includes(searchLower)
        )
      }

      filtered.sort((a, b) => {
        if (sort === 'debt_amount_asc') {
          return parseFloat(a.debt_amount || '0') - parseFloat(b.debt_amount || '0')
        } else if (sort === 'debt_amount_desc') {
          return parseFloat(b.debt_amount || '0') - parseFloat(a.debt_amount || '0')
        } else if (sort === 'debt_days_asc') {
          return (Number(a.debt_days || 0)) - (Number(b.debt_days || 0))
        } else { // debt_days_desc
          return (Number(b.debt_days || 0)) - (Number(a.debt_days || 0))
        }
      })

      return filtered
    }

    let result
    if (type === 'supplier') {
      const all = await connector.list('suppliers', { limit: 5000 })
      mapDebtDays(all.data)
      const filtered = filterAndSort(all.data)
      const offset = (page - 1) * limit
      const paginatedData = filtered.slice(offset, offset + limit)

      result = {
        data: paginatedData,
        total: filtered.length,
        totalDebt: filtered.reduce((sum, s) => sum + parseFloat(s.debt_amount || '0'), 0)
      }
    } else {
      const all = await connector.list('customers', { limit: 5000 })
      
      // Self-healing for negative debt
      let hasHealed = false
      for (const c of all.data) {
        const d = parseFloat(c.debt_amount || '0')
        if (d < 0) {
          const absD = Math.abs(d)
          const currentPrepaid = parseFloat(c.prepaid_balance || '0')
          const newPrepaid = currentPrepaid + absD
          
          c.debt_amount = '0'
          c.prepaid_balance = String(newPrepaid)
          
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

      mapDebtDays(all.data)
      const filtered = filterAndSort(all.data)
      const offset = (page - 1) * limit
      const paginatedData = filtered.slice(offset, offset + limit)

      result = {
        data: paginatedData,
        total: filtered.length,
        totalDebt: filtered.reduce((sum, c) => sum + parseFloat(c.debt_amount || '0'), 0)
      }
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET customers debt')
  }
}
