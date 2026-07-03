export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'debt.view')

    // Only owner/admin can run this fix
    if (!permissions.includes('owner') && !permissions.includes('admin')) {
      return NextResponse.json({ error: 'Only owner/admin can run debt fix' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const dryRun = sp.get('dry_run') !== 'false' // defaults to true

    // 1. Get all cashbook entries with category === 'debt_collection' and is_virtual !== 'TRUE'
    const cbRes = await connector.list('cashbook', { limit: 100000 })
    const debtCollections = cbRes.data.filter(
      (cb: Record<string, string>) =>
        cb.category === 'debt_collection' && cb.is_virtual !== 'TRUE'
    )

    // 2. Group by reference_id (customer_id)
    const byCustomer: Record<string, Array<Record<string, string>>> = {}
    for (const cb of debtCollections) {
      const cid = cb.reference_id
      if (!cid) continue
      if (!byCustomer[cid]) byCustomer[cid] = []
      byCustomer[cid].push(cb)
    }

    const report: Array<{
      customer_id: string
      customer_name: string
      totalOrderDebt: number
      currentCustomerDebt: number
      amountToReconcile: number
      ordersFixed: number
      details: Array<{
        order_id: string
        order_no: string
        oldDebt: number
        newDebt: number
        applied: number
      }>
    }> = []

    let totalFixed = 0
    let totalOrdersFixed = 0

    // 3. For each customer: get their orders sorted FIFO, get current customer debt
    for (const [customerId, collections] of Object.entries(byCustomer)) {
      const customer = await connector.findById('customers', customerId)
      if (!customer) continue

      const currentCustomerDebt = parseFloat(customer.debt_amount || '0')

      // Get all orders for this customer
      const ordersRes = await connector.list('orders', {
        filters: { customer_id: customerId },
        limit: 5000
      })

      const unpaidOrders = ordersRes.data
        .filter((o: Record<string, string>) => parseFloat(o.debt_amount || '0') > 0 && o.is_return !== 'TRUE' && o.status !== 'cancelled' && o.status !== 'failed')
        .sort((a: Record<string, string>, b: Record<string, string>) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )

      const totalOrderDebt = unpaidOrders.reduce(
        (sum: number, o: Record<string, string>) => sum + parseFloat(o.debt_amount || '0'),
        0
      )

      // 4. amountToReconcile = totalOrderDebt - currentCustomerDebt
      // This is the amount that was collected from customer but not applied to orders
      const amountToReconcile = totalOrderDebt - currentCustomerDebt
      if (amountToReconcile <= 0) continue

      // 5. Apply FIFO to orders
      const details: Array<{
        order_id: string
        order_no: string
        oldDebt: number
        newDebt: number
        applied: number
      }> = []

      let remaining = amountToReconcile
      for (const order of unpaidOrders) {
        if (remaining <= 0) break
        const orderDebt = parseFloat(order.debt_amount || '0')
        const applied = Math.min(remaining, orderDebt)
        const newOrderDebt = Math.max(0, orderDebt - applied)
        const newPaid = parseFloat(order.paid_amount || '0') + applied

        details.push({
          order_id: order.id || order.order_id,
          order_no: order.order_no || '',
          oldDebt: orderDebt,
          newDebt: newOrderDebt,
          applied
        })

        if (!dryRun) {
          const fallbackMethod = collections[collections.length - 1]?.method || 'cash'
          const parentCbId = collections[collections.length - 1]?.id || collections[collections.length - 1]?.transaction_id || 'FIX'
          const parentCbDate = collections[collections.length - 1]?.created_at || new Date().toISOString()

          const orderUpdates: Record<string, any> = {
            debt_amount: String(newOrderDebt),
            paid_amount: String(newPaid),
          }

          if (newOrderDebt === 0 && (order.payment_method === 'debt' || order.payment_method?.startsWith('debt-'))) {
            orderUpdates.payment_method = fallbackMethod
          }

          await connector.update('orders', order.id || order.order_id, orderUpdates)

          // Create payment record in the 'payments' table (audit trail)
          const paymentId = `DEBT-${(order.id || order.order_id).slice(-6)}-${Date.now()}`
          await connector.create('payments', {
            id: paymentId,
            order_id: order.id || order.order_id,
            order_no: order.order_no || '',
            method: fallbackMethod,
            amount: String(applied),
            reference_no: parentCbId,
            note: `Hệ thống phân bổ nợ cũ (Cashbook #${parentCbId.slice(-6)})`,
            paid_at: parentCbDate,
          })

          totalOrdersFixed++
        } else {
          totalOrdersFixed++
        }

        remaining -= applied
      }

      if (details.length > 0) {
        report.push({
          customer_id: customerId,
          customer_name: (customer.name as string) || '',
          totalOrderDebt,
          currentCustomerDebt,
          amountToReconcile,
          ordersFixed: details.length,
          details
        })
        totalFixed++
      }
    }

    if (!dryRun) {
      invalidate(shopId, 'orders')
    }

    return NextResponse.json({
      dry_run: dryRun,
      customers_affected: totalFixed,
      orders_fixed: totalOrdersFixed,
      report
    })
  } catch (e) {
    return handleApiError(e, 'GET fix-debt')
  }
}
