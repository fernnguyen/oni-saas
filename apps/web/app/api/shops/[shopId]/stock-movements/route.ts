import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { stockMovementCreateSchema } from '@/lib/validators/stockMovements'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import type { IDataConnector } from '@oni/adapters'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

const MOVEMENT_NO_PREFIX: Record<string, string> = {
  purchase_in:  'PN',   // Phiếu Nhập
  sale_out:     'PX',   // Phiếu Xuất
  return_in:    'PTH',  // Phiếu Trả Hàng
  transfer_in:  'CKV',  // Chuyển Kho Vào
  transfer_out: 'CKX',  // Chuyển Kho Xuất
  adjustment:   'PDK',  // Phiếu Điều Kho
}

function calcDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
  return qty // adjustment: signed
}

async function generateMovementNo(connector: IDataConnector, type: string): Promise<string> {
  const prefix = MOVEMENT_NO_PREFIX[type] ?? 'PKH'
  const result = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type } })
  const existing = result.data as Record<string, string>[]
  const nums = existing
    .map(r => r.movement_no)
    .filter((n): n is string => !!n && n.startsWith(`${prefix}-`))
    .map(n => parseInt(n.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const type = sp.get('type') ?? ''
    const product_id = sp.get('product_id') ?? ''
    const branch_id = sp.get('branch_id') ?? ''
    const filters: Record<string, string> = {}
    if (type) filters.type = type
    if (product_id) filters.product_id = product_id
    if (branch_id) filters.branch_id = branch_id

    const result = await shopCache(
      () => connector.list('stock-movements', { page, limit, search: search || undefined, filters, sortDesc: true }),
      ['stock-movements', shopId, String(page), String(limit), search, type, product_id, branch_id],
      { tags: [shopTag(shopId, 'stock-movements')], revalidate: cacheTTL.stockMovements }
    )

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET stock-movements')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json()
    // Extract POS-sync flag before schema parse (Zod strips unknown fields)
    const skipInventoryUpdate = body.skip_inventory_update === 'true'
    const data = stockMovementCreateSchema.parse(body)

    // When called from the POS sync worker, movement creation and inventory update
    // are handled as separate idempotent steps. The worker tracks each independently
    // via steps_done, so inventory is never silently lost on retry.
    if (skipInventoryUpdate) {
      // Idempotent: return existing movement if already created (same ref + product)
      if (data.reference_no) {
        const check = await connector.list('stock-movements', {
          page: 1, limit: 1,
          filters: { reference_no: data.reference_no, product_id: data.product_id },
        })
        if (check.data.length > 0) {
          return NextResponse.json(check.data[0], { status: 200 })
        }
      }
      const movNo = await generateMovementNo(connector, data.type)
      const created = await connector.create('stock-movements', {
        ...(data as unknown as Record<string, string>),
        movement_no: movNo,
      })
      invalidate(shopId, 'stock-movements')
      return NextResponse.json(created, { status: 201 })
    }

    // 1. Generate mã phiếu kho and create movement record
    const movementNo = await generateMovementNo(connector, data.type)
    const created = await connector.create('stock-movements', {
      ...(data as unknown as Record<string, string>),
      movement_no: movementNo,
    })

    // 2. Upsert inventory stock_qty
    // Sheets rows often store branch_id as empty string while callers pass a UUID.
    // Try the exact branch_id first, then fall back to empty-string branch_id so
    // sale_out movements (delta < 0) actually find and update the right row.
    const delta = calcDelta(data.type, parseFloat(data.qty))
    const branchId = data.branch_id ?? ''

    let invResult = await connector.list('inventory', {
      page: 1, limit: 1,
      filters: { product_id: data.product_id, branch_id: branchId },
    })
    if (invResult.data.length === 0 && branchId !== '') {
      invResult = await connector.list('inventory', {
        page: 1, limit: 1,
        filters: { product_id: data.product_id, branch_id: '' },
      })
    }
    if (invResult.data.length === 0) {
      invResult = await connector.list('inventory', {
        page: 1, limit: 1,
        filters: { product_id: data.product_id },
      })
    }

    if (invResult.data.length > 0) {
      const inv = invResult.data[0] as Record<string, string>
      const newQty = Math.max(0, parseFloat(inv.stock_qty || '0') + delta)
      await connector.update('inventory', inv.inventory_id as string, {
        stock_qty: String(newQty),
      })
    } else if (delta > 0) {
      // Create inventory row only for inbound movements.
      // cost_price is NOT stored here — Inventory tab may lack the column.
      await connector.create('inventory', {
        product_id: data.product_id,
        branch_id: '',
        stock_qty: String(delta),
        min_stock: '0',
        sku: data.sku || '',
      } as Record<string, string>)
    }

    // 3. Update product cost_price (Products tab always has this column).
    //    For inbound movements with a unit_cost, use the new cost as the product's cost price.
    //    This acts as a "last purchase price" — simple and practical for small shops.
    if (data.unit_cost && INBOUND_TYPES.includes(data.type)) {
      try {
        await connector.update('products', data.product_id, { cost_price: data.unit_cost })
        invalidate(shopId, 'products')
      } catch {
        // best-effort: don't fail nhập kho if product update fails
      }
    }

    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST stock-movements')
  }
}
