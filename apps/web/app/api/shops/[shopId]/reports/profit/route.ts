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
    let f = new Date(`${dateRange.from}T00:00:00Z`).getTime() - tzOffset
    let t = new Date(`${dateRange.to}T23:59:59.999Z`).getTime() - tzOffset
    if (isNaN(f)) f = 0
    if (isNaN(t)) t = Infinity
    if (f > t) {
      const tmp = f
      f = t - 86_400_000 + 1
      t = tmp + 86_400_000 - 1
    }
    // Cap to max 93 days (approx 3 months)
    const MAX_RANGE_MS = 93 * 86_400_000
    if (t - f > MAX_RANGE_MS) {
      f = t - MAX_RANGE_MS
    }
    fromMs = f
    toMs = t
  }
  
  const inRange = (isoString: string) => {
    if (!dateRange) return true
    const t = new Date(isoString).getTime()
    return t >= fromMs && t <= toMs
  }

  // Filter qualifying sales orders: exclude cancelled orders and return-only orders.
  // Standardized to created_at (transaction sale time) to match Orders list and Dashboard.
  const salesOrders = orders.filter(o => {
    if (o.status === 'cancelled' || o.is_return === 'TRUE') return false
    const dateStr = o.created_at || ''
    return inRange(dateStr)
  })
  const salesOrderIds = new Set(salesOrders.map(o => o.order_id || o.id))

  // Create products map for COGS fallback
  const productMap = new Map<string, Row>()
  for (const p of products) {
    productMap.set(p.product_id || p.id, p)
  }

  // Group order items by order_id for O(1) retrieval
  const itemsByOrderId = new Map<string, Row[]>()
  for (const item of orderItems) {
    const orderId = item.order_id
    if (!orderId || !salesOrderIds.has(orderId)) continue
    let list = itemsByOrderId.get(orderId)
    if (!list) {
      list = []
      itemsByOrderId.set(orderId, list)
    }
    list.push(item)
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
      if (k) {
        seriesMap[k] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
      }
      curr += 86_400_000
    }
  }

  const ensureSeriesDay = (dKey: string) => {
    if (!seriesMap[dKey]) {
      seriesMap[dKey] = { gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
    }
    return seriesMap[dKey]
  }

  let totalCogs = 0
  let totalDiscounts = 0
  let totalExpenses = 0
  let totalReturns = 0

  const expensesBreakdown: Record<string, number> = {}
  const cogsBreakdown: Record<string, { name: string, cogs: number, qty: number }> = {}

  // 1. Process Sales Orders & their Items
  for (const order of salesOrders) {
    const orderId = order.order_id || order.id
    const dateStr = order.created_at || new Date().toISOString()
    const dKey = dayKey(dateStr)
    const dayData = ensureSeriesDay(dKey)

    const items = itemsByOrderId.get(orderId) || []

    const orderTotal = parseAmount(order.total_amount)
    const orderDiscount = parseAmount(order.discount_amount)

    let itemLineDiscounts = 0
    let orderCogs = 0

    for (const item of items) {
      const qty = parseAmount(item.qty)
      let unitCost = parseAmount(item.unit_cost)

      if (unitCost === 0 && item.product_id) {
        const product = productMap.get(item.product_id)
        if (product) {
          unitCost = parseAmount(product.cost_price)
        }
      }

      const itemCogs = qty * unitCost
      orderCogs += itemCogs

      const lineDiscount = parseAmount(item.line_discount || item.discount_amount)
      itemLineDiscounts += lineDiscount

      if (item.product_id) {
        if (!cogsBreakdown[item.product_id]) {
          cogsBreakdown[item.product_id] = { name: item.product_name || item.product_id, cogs: 0, qty: 0 }
        }
        cogsBreakdown[item.product_id].cogs += itemCogs
        cogsBreakdown[item.product_id].qty += qty
      }
    }

    const totalOrderDiscount = orderDiscount + itemLineDiscounts
    // Gross revenue is net total + all discounts applied
    const grossRev = orderTotal + totalOrderDiscount

    dayData.gross_revenue += grossRev
    dayData.discounts += totalOrderDiscount
    dayData.cogs += orderCogs

    totalCogs += orderCogs
    totalDiscounts += totalOrderDiscount
  }

  // 2. Process Returns
  for (const ret of returns) {
    if (ret.status !== 'completed' && ret.status !== 'approved') continue 
    const dateStr = ret.processed_at || ret.created_at || new Date().toISOString()
    if (!inRange(dateStr)) continue
    
    const dKey = dayKey(dateStr)
    const dayData = ensureSeriesDay(dKey)
    
    const refund = parseAmount(ret.total_refund)
    dayData.returns += refund
    totalReturns += refund
  }

  // 3. Process Expenses (Cashbook)
  for (const cb of cashbook) {
    const type = cb.type?.toLowerCase()
    if (type === 'payment' || type === 'expense') {
      const category = cb.category || 'Khác'
      const catLower = category.toLowerCase()
      if (
        catLower.includes('refund') ||
        catLower === 'hoàn tiền' ||
        catLower === 'import' ||
        catLower === 'inventory' ||
        catLower === 'inventory_payment' ||
        catLower === 'inventory_receipt' ||
        catLower === 'debt_payment'
      ) {
        continue
      }
      
      const dateStr = cb.date || cb.created_at || new Date().toISOString()
      if (!inRange(dateStr)) continue
      
      const dKey = dayKey(dateStr)
      const dayData = ensureSeriesDay(dKey)
      const amount = parseAmount(cb.amount)

      dayData.expenses += amount
      totalExpenses += amount
      expensesBreakdown[category] = (expensesBreakdown[category] || 0) + amount
    }
  }

  // 4. Aggregate Series
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
    // Sort descending by created_at to prioritize the latest data
    const [ordersResult, returnsResult, itemsResult, cashbookResult, productsResult] = await Promise.all([
      connector.list('orders',      { limit: 10000, sortBy: 'created_at', sortDesc: true }),
      connector.list('returns',     { limit: 5000, sortBy: 'created_at', sortDesc: true }).catch(() => ({ data: [], total: 0 })),
      connector.list('order-items', { limit: 20000 }),
      connector.list('cashbook',    { limit: 10000, sortBy: 'created_at', sortDesc: true }).catch(() => ({ data: [], total: 0 })),
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
