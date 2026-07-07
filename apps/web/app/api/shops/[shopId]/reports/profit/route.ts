import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, any>

function parseAmount(v: string | number | undefined | null) { 
  if (v === undefined || v === null || v === '') return 0
  const parsed = parseFloat(String(v))
  return isNaN(parsed) ? 0 : parsed
}

function dayKey(isoDate: string) {
  try {
    const d = new Date(isoDate || Date.now())
    const local = new Date(d.getTime() + 7 * 60 * 60 * 1000)
    return local.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function buildProfitReport(orders: Row[], orderItems: Row[], products: Row[], cashbook: Row[], returns: Row[], dateRange?: { from: string, to: string }) {
  const tzOffset = 7 * 60 * 60 * 1000 // Vietnam is UTC+7

  let fromMs = 0
  let toMs = Infinity
  if (dateRange) {
    // Treat from and to as Vietnam local time, convert to UTC ms
    fromMs = new Date(`${dateRange.from}T00:00:00Z`).getTime() - tzOffset
    toMs = new Date(`${dateRange.to}T23:59:59.999Z`).getTime() - tzOffset
  }
  
  const inRange = (isoString: string) => {
    if (!dateRange) return true
    const t = new Date(isoString).getTime()
    return t >= fromMs && t <= toMs
  }

  // Filter completed orders
  const completedOrders = orders.filter(o => {
    if (o.status !== 'completed' || o.is_return === 'TRUE') return false
    const dateStr = o.updated_at || o.created_at || new Date().toISOString()
    return inRange(dateStr)
  })
  const completedOrderIds = new Set(completedOrders.map(o => o.order_id || o.id))

  // Create products map for COGS fallback
  const productMap = new Map<string, Row>()
  for (const p of products) {
    productMap.set(p.product_id || p.id, p)
  }

  // Time series mapping
  const seriesMap: Record<string, {
    gross_revenue: number,
    discounts: number,
    returns: number,
    net_revenue: number,
    cogs: number,
    gross_profit: number,
    expenses: number,
    net_profit: number
  }> = {}

  // Fill empty days in range
  if (dateRange) {
    let curr = fromMs
    while (curr <= toMs) {
      const k = dayKey(new Date(curr).toISOString())
      seriesMap[k] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
      curr += 86_400_000
    }
  }

  let totalGrossRevenue = 0
  let totalDiscounts = 0
  let totalReturns = 0
  let totalCogs = 0
  let totalExpenses = 0

  const expensesBreakdown: Record<string, number> = {}
  const cogsBreakdown: Record<string, { name: string, cogs: number, qty: number }> = {}

  // 1. Process Orders & Order Items
  for (const item of orderItems) {
    const orderId = item.order_id
    if (!completedOrderIds.has(orderId)) continue

    const order = completedOrders.find(o => (o.order_id || o.id) === orderId)
    const dateStr = order?.updated_at || order?.created_at || new Date().toISOString()
    const dKey = dayKey(dateStr)

    if (!seriesMap[dKey]) {
      seriesMap[dKey] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
    }

    const qty = parseAmount(item.qty)
    const lineTotal = parseAmount(item.line_total)
    let unitCost = parseAmount(item.unit_cost)

    if (unitCost === 0 && item.product_id) {
      const product = productMap.get(item.product_id)
      if (product) {
        unitCost = parseAmount(product.cost_price)
      }
    }

    const cogs = qty * unitCost
    const lineDiscount = parseAmount(item.line_discount)

    const grossRev = parseAmount(item.unit_price) * qty

    totalCogs += cogs
    
    seriesMap[dKey].gross_revenue += grossRev
    seriesMap[dKey].cogs += cogs

    if (item.product_id) {
      if (!cogsBreakdown[item.product_id]) {
        cogsBreakdown[item.product_id] = { name: item.product_name, cogs: 0, qty: 0 }
      }
      cogsBreakdown[item.product_id].cogs += cogs
      cogsBreakdown[item.product_id].qty += qty
    }
  }

  // 2. Process Order-Level Discounts
  for (const o of completedOrders) {
    const dateStr = o.updated_at || o.created_at || new Date().toISOString()
    const dKey = dayKey(dateStr)
    const discount = parseAmount(o.discount_amount)
    
    if (!seriesMap[dKey]) {
      seriesMap[dKey] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
    }
    
    seriesMap[dKey].discounts += discount
    totalDiscounts += discount
  }

  // 3. Process Returns
  for (const ret of returns) {
    if (ret.status !== 'completed' && ret.status !== 'approved') continue 
    const dateStr = ret.processed_at || ret.created_at || new Date().toISOString()
    if (!inRange(dateStr)) continue
    
    const dKey = dayKey(dateStr)
    
    if (!seriesMap[dKey]) {
      seriesMap[dKey] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
    }
    
    const refund = parseAmount(ret.total_refund)
    seriesMap[dKey].returns += refund
    totalReturns += refund
  }

  // 4. Process Expenses (Cashbook)
  for (const cb of cashbook) {
    const type = cb.type?.toLowerCase()
    if (type === 'payment' || type === 'expense') {
      const category = cb.category || 'Khác'
      if (category.toLowerCase().includes('refund') || category.toLowerCase() === 'hoàn tiền') continue
      
      const dateStr = cb.date || cb.created_at || new Date().toISOString()
      if (!inRange(dateStr)) continue
      
      const dKey = dayKey(dateStr)
      const amount = parseAmount(cb.amount)

      if (!seriesMap[dKey]) {
        seriesMap[dKey] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
      }
      
      seriesMap[dKey].expenses += amount
      totalExpenses += amount
      expensesBreakdown[category] = (expensesBreakdown[category] || 0) + amount
    }
  }

  // 5. Aggregate Series
  const series = Object.entries(seriesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      const net_revenue = data.gross_revenue - data.discounts - data.returns
      const gross_profit = net_revenue - data.cogs
      const net_profit = gross_profit - data.expenses
      return {
        date,
        ...data,
        net_revenue,
        gross_profit,
        net_profit
      }
    })

  // Calculate totals
  const totalGrossRevForCalc = series.reduce((sum, s) => sum + s.gross_revenue, 0)
  const netRevenue = totalGrossRevForCalc - totalDiscounts - totalReturns
  const grossProfit = netRevenue - totalCogs
  const netProfit = grossProfit - totalExpenses

  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0
  const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0

  return {
    kpi: {
      gross_revenue: totalGrossRevForCalc,
      discounts: totalDiscounts,
      returns: totalReturns,
      net_revenue: netRevenue,
      cogs: totalCogs,
      gross_profit: grossProfit,
      operating_expenses: totalExpenses,
      net_profit: netProfit,
      gross_margin_pct: grossMarginPct,
      net_margin_pct: netMarginPct
    },
    series,
    expenses_breakdown: Object.entries(expensesBreakdown).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    cogs_breakdown: Object.entries(cogsBreakdown).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.cogs - a.cogs).slice(0, 20)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { shop, connector } = await requireShopAccess(shopId, 'reports.view_shop')

    const searchParams = req.nextUrl.searchParams
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')

    // Local PSQL queries using connector
    // Currently fetching all, we can optimize with date filters later if needed
    const [ordersResult, returnsResult, itemsResult, cashbookResult, productsResult] = await Promise.all([
      connector.list('orders',      { limit: 10000 }),
      connector.list('returns',     { limit: 5000 }).catch(() => ({ data: [], total: 0 })),
      connector.list('order-items', { limit: 20000 }),
      connector.list('cashbook',    { limit: 10000 }).catch(() => ({ data: [], total: 0 })),
      connector.list('products',    { limit: 5000 }).catch(() => ({ data: [], total: 0 })),
    ])

    const result = buildProfitReport(
      ordersResult.data,
      itemsResult.data,
      productsResult.data,
      cashbookResult.data,
      returnsResult.data,
      fromDate && toDate ? { from: fromDate, to: toDate } : undefined
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/profit')
  }
}
