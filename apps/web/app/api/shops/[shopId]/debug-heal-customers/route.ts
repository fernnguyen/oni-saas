import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const customerId = req.nextUrl.searchParams.get('customerId')
    const { connector } = await requireShopAccess(shopId, 'customers.edit')

    // 1. Fetch all customers in this shop
    const customersRes = await connector.list('customers', { limit: 10000 })
    const customers = customersRes.data

    // 2. Fetch all customer branch stats
    const statsRes = await connector.list('customer-branch-stats', {
      limit: 10000,
      filters: { branch_id: shopId }
    })
    const statsMap = new Map<string, any>()
    for (const s of statsRes.data) {
      statsMap.set(s.customer_id, s)
    }

    // 3. Fetch all cashbook entries
    const cbRes = await connector.list('cashbook', { limit: 100000, filters: { branch_id: shopId } })
    const cbEntries = cbRes.data

    // 4. Fetch all orders (to get order debts)
    const ordersRes = await connector.list('orders', { limit: 100000, filters: { branch_id: shopId, status: 'completed' } })
    const orders = ordersRes.data

    let fixedCount = 0
    const fixedDetails = []

    const targetCustomers = customerId ? customers.filter((c: any) => c.id === customerId) : customers

    for (const c of targetCustomers) {
      if (c.id === 'C-DEFAULT-RETAIL') continue

      // Calculate True Debt
      // Initial Debt from virtual cashbook
      const virtualDebts = cbEntries.filter((cb: any) => cb.reference_id === c.id && cb.is_virtual === 'TRUE' && cb.method === 'debt' && cb.type === 'receipt')
      const initialDebt = virtualDebts.reduce((sum: number, cb: any) => sum + parseFloat(cb.amount || '0'), 0)

      // Added Debt from orders
      const customerOrders = orders.filter((o: any) => o.customer_id === c.id)
      const orderDebt = customerOrders.reduce((sum: number, o: any) => sum + parseFloat(o.debt_amount || '0'), 0)

      // Paid Debt from cashbook
      const paidDebts = cbEntries.filter((cb: any) => cb.reference_id === c.id && cb.is_virtual !== 'TRUE' && cb.category === 'debt_collection')
      const paidDebt = paidDebts.reduce((sum: number, cb: any) => sum + parseFloat(cb.amount || '0'), 0)

      const trueDebt = Math.max(0, initialDebt + orderDebt - paidDebt)

      // Compare with current debt
      const stats = statsMap.get(c.id)
      const currentStatsDebt = parseFloat(stats?.debt_amount || '0')
      const currentCustomerDebt = parseFloat(c.debt_amount || '0')

      // Calculate True Prepaid
      const virtualPrepaid = cbEntries.filter((cb: any) => cb.reference_id === c.id && cb.is_virtual === 'TRUE' && cb.category === 'prepaid_deposit')
      const initialPrepaid = virtualPrepaid.reduce((sum: number, cb: any) => sum + parseFloat(cb.amount || '0'), 0)

      const addedPrepaid = cbEntries.filter((cb: any) => cb.reference_id === c.id && cb.is_virtual !== 'TRUE' && cb.category === 'prepaid_deposit')
      const addedPrepaidSum = addedPrepaid.reduce((sum: number, cb: any) => sum + parseFloat(cb.amount || '0'), 0)

      const spentPrepaid = cbEntries.filter((cb: any) => cb.reference_id === c.id && (cb.method === 'prepaid' || cb.method?.startsWith('prepaid-')))
      const spentPrepaidSum = spentPrepaid.reduce((sum: number, cb: any) => sum + parseFloat(cb.amount || '0'), 0)

      const truePrepaid = Math.max(0, initialPrepaid + addedPrepaidSum - spentPrepaidSum)

      const currentStatsPrepaid = parseFloat(stats?.prepaid_balance || '0')
      const currentCustomerPrepaid = parseFloat(c.prepaid_balance || '0')

      const needsFix = currentStatsDebt !== trueDebt || currentCustomerDebt !== trueDebt || currentStatsPrepaid !== truePrepaid || currentCustomerPrepaid !== truePrepaid

      if (needsFix) {
        if (stats) {
          await connector.update('customer-branch-stats', stats.id, { debt_amount: String(trueDebt), prepaid_balance: String(truePrepaid) })
        }
        await connector.update('customers', c.id, { debt_amount: String(trueDebt), prepaid_balance: String(truePrepaid) })
        fixedCount++
        fixedDetails.push({
          id: c.id,
          name: c.name,
          old_stats_debt: currentStatsDebt,
          new_true_debt: trueDebt,
          old_stats_prepaid: currentStatsPrepaid,
          new_true_prepaid: truePrepaid
        })
      }
    }

    return NextResponse.json({ success: true, fixedCount, fixedDetails })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
