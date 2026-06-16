import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, shopCache } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

type Row = Record<string, string>

function parseAmount(v: string | undefined) { return parseFloat(v ?? '0') || 0 }

function dayKey(isoDate: string) {
  try { return isoDate.slice(0, 10) } catch { return '' }
}

const INBOUND_TYPES = ['purchase_in', 'p2p_purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function buildInventoryReport(inventory: Row[], movements: Row[], products: Row[]) {
  const now = new Date()
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day30 = todayMs - 29 * 86_400_000

  // 1. Current Stock KPI
  const productMap = new Map(products.map(p => [p.id, p]))
  let totalStockQty = 0
  let totalStockValue = 0

  for (const inv of inventory) {
    const qty = parseAmount(inv.stock_qty)
    const pid = inv.product_id
    const prod = productMap.get(pid)
    
    // cost_price can be from inventory or product
    let cost = parseAmount(inv.cost_price)
    if (cost === 0 && prod) {
      cost = parseAmount(prod.cost_price)
    }

    totalStockQty += qty
    totalStockValue += qty * cost
  }

  // 2. Movements proportion (Tỷ lệ các loại phiếu)
  // We'll count the number of transactions and the total volume (qty)
  const movementProportion: Record<string, { count: number; qty: number }> = {}
  
  let todayMovements = 0
  let monthMovements = 0

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  // 3. Activity Series (last 30 days)
  const activitySeriesMap: Record<string, { in: number; out: number }> = {}
  for (let d = 0; d < 30; d++) {
    const k = new Date(todayMs - d * 86_400_000).toISOString().slice(0, 10)
    activitySeriesMap[k] = { in: 0, out: 0 }
  }

  for (const mov of movements) {
    const t = new Date(mov.created_at || 0).getTime()
    
    // KPI counters
    if (t >= todayMs) todayMovements++
    if (t >= monthStart) monthMovements++

    // Proportion (all time or this month? usually all data or this month. Let's do this month)
    if (t >= monthStart) {
      const type = mov.type || 'unknown'
      if (!movementProportion[type]) {
        movementProportion[type] = { count: 0, qty: 0 }
      }
      movementProportion[type].count += 1
      movementProportion[type].qty += Math.abs(parseAmount(mov.qty))
    }

    // Series (last 30 days)
    if (t >= day30) {
      const k = dayKey(mov.created_at)
      if (activitySeriesMap[k]) {
        const qty = Math.abs(parseAmount(mov.qty))
        if (INBOUND_TYPES.includes(mov.type)) {
          activitySeriesMap[k].in += qty
        } else if (OUTBOUND_TYPES.includes(mov.type)) {
          activitySeriesMap[k].out += qty
        } else if (mov.type === 'adjustment') {
          // Adjustment can be positive or negative
          const realQty = parseAmount(mov.qty)
          if (realQty > 0) activitySeriesMap[k].in += realQty
          else activitySeriesMap[k].out += Math.abs(realQty)
        }
      }
    }
  }

  const activitySeries = Object.entries(activitySeriesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }))

  const kpi = {
    totalQty: totalStockQty,
    totalValue: totalStockValue,
    todayMovements,
    monthMovements
  }

  // 4. Top Inbound Products and Outbound Ratio
  const productStats: Record<string, { inQty: number; outQty: number }> = {}

  for (const mov of movements) {
    const pid = mov.product_id
    if (!pid) continue
    
    if (!productStats[pid]) {
      productStats[pid] = { inQty: 0, outQty: 0 }
    }

    const qty = Math.abs(parseAmount(mov.qty))
    if (INBOUND_TYPES.includes(mov.type)) {
      productStats[pid].inQty += qty
    } else if (OUTBOUND_TYPES.includes(mov.type)) {
      productStats[pid].outQty += qty
    } else if (mov.type === 'adjustment') {
      const realQty = parseAmount(mov.qty)
      if (realQty > 0) productStats[pid].inQty += realQty
      else productStats[pid].outQty += Math.abs(realQty)
    }
  }

  const topProducts = Object.entries(productStats)
    .map(([pid, stats]) => {
      const prod = productMap.get(pid)
      return {
        id: pid,
        name: prod?.name || pid,
        inQty: stats.inQty,
        outQty: stats.outQty
      }
    })
    .sort((a, b) => b.inQty - a.inQty)
    .slice(0, 10)

  return { kpi, movementProportion, activitySeries, topProducts }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'inventory.view')

    const result = await shopCache(
      async () => {
        const [inventoryRes, movementsRes, productsRes] = await Promise.all([
          connector.list('inventory',       { limit: 5000 }),
          connector.list('stock-movements', { limit: 5000 }),
          connector.list('products',        { limit: 5000 })
        ])
        return buildInventoryReport(inventoryRes.data, movementsRes.data, productsRes.data)
      },
      ['reports-inventory', shopId],
      { tags: [shopTag(shopId, 'inventory'), shopTag(shopId, 'stock-movements'), shopTag(shopId, 'products')], revalidate: 120 }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET reports/inventory')
  }
}
