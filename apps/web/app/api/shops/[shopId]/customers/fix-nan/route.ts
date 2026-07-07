export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { updateCustomerStats } from '@/lib/server/customerStats'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId, 'customers.edit')

    // Only owner/admin can run this fix
    if (!permissions.includes('owner') && !permissions.includes('admin')) {
      return NextResponse.json({ error: 'Only owner/admin can run this fix' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const dryRun = sp.get('dry_run') !== 'false' // defaults to true

    // 1. Get all customers
    const customersRes = await connector.list('customers', { limit: 10000 })
    const allCustomers = customersRes.data as Record<string, string>[]

    // 2. Get customer branch stats
    const statsRes = await connector.list('customer-branch-stats', {
      limit: 10000,
      filters: { branch_id: shopId }
    })
    const statsList = statsRes.data as Record<string, string>[]

    // 3. Find customer IDs with NaN values
    const nanCustomerIds = new Set<string>()
    for (const c of allCustomers) {
      if (c.debt_amount === 'NaN' || c.prepaid_balance === 'NaN' || c.loyalty_points === 'NaN') {
        nanCustomerIds.add(c.id || c.customer_id)
      }
    }
    for (const s of statsList) {
      if (s.debt_amount === 'NaN' || s.prepaid_balance === 'NaN' || s.loyalty_points === 'NaN') {
        nanCustomerIds.add(s.customer_id)
      }
    }

    const report: Array<{
      customer_id: string
      customer_name: string
      corrupted_fields: string[]
      correct_debt: number
      updates: Record<string, string>
    }> = []

    // 4. Recalculate and update if dryRun = false
    for (const cid of nanCustomerIds) {
      const customer = allCustomers.find(cust => (cust.id || cust.customer_id) === cid)
      if (!customer) continue

      const stats = statsList.find(s => s.customer_id === cid)
      const customerName = (customer.name as string) || ''

      const currentDebtStr = stats?.debt_amount ?? customer.debt_amount ?? '0'
      const currentPrepaidStr = stats?.prepaid_balance ?? customer.prepaid_balance ?? '0'
      const currentPointsStr = stats?.loyalty_points ?? customer.loyalty_points ?? '0'

      const corrupted_fields: string[] = []
      if (currentDebtStr === 'NaN') corrupted_fields.push('debt_amount')
      if (currentPrepaidStr === 'NaN') corrupted_fields.push('prepaid_balance')
      if (currentPointsStr === 'NaN') corrupted_fields.push('loyalty_points')

      // Recalculate correct debt from active orders
      const ordersRes = await connector.list('orders', {
        filters: { customer_id: cid },
        limit: 5000
      })
      const activeOrders = (ordersRes.data as Record<string, string>[]).filter(
        o => o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'refunded' && o.is_return !== 'TRUE'
      )
      const correctDebt = activeOrders.reduce((sum, o) => sum + (parseFloat(o.debt_amount || '0') || 0), 0)

      // Recalculate correct loyalty points from active orders
      const correctPoints = activeOrders.reduce((sum, o) => {
        const earned = parseFloat(o.points_earned || '0') || 0
        const redeemed = parseFloat(o.points_redeemed || '0') || 0
        return sum + earned - redeemed
      }, 0)
      const finalPoints = Math.max(0, correctPoints)

      const updates: Record<string, string> = {}
      if (currentDebtStr === 'NaN') {
        updates.debt_amount = String(correctDebt)
      }
      if (currentPrepaidStr === 'NaN') {
        updates.prepaid_balance = '0'
      }
      if (currentPointsStr === 'NaN') {
        updates.loyalty_points = String(finalPoints)
      }

      if (Object.keys(updates).length > 0) {
        if (!dryRun) {
          await updateCustomerStats(connector, cid, shopId, updates)
        }
        report.push({
          customer_id: cid,
          customer_name: customerName,
          corrupted_fields,
          correct_debt: correctDebt,
          updates
        })
      }
    }

    if (!dryRun && report.length > 0) {
      invalidate(shopId, 'customers')
    }

    return NextResponse.json({
      dry_run: dryRun,
      total_scanned_customers: allCustomers.length,
      corrupted_customers_found: report.length,
      report
    })
  } catch (e) {
    return handleApiError(e, 'GET fix-nan-debt')
  }
}