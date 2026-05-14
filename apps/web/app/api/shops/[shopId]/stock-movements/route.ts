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

    if (data.workflow_status === 'completed') {
      // 2. Upsert inventory stock_qty
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
        await connector.create('inventory', {
          product_id: data.product_id,
          branch_id: '',
          stock_qty: String(delta),
          min_stock: '0',
          sku: data.sku || '',
        } as Record<string, string>)
      }

      // 3. Update product cost_price
      if (data.unit_cost && INBOUND_TYPES.includes(data.type)) {
        try {
          await connector.update('products', data.product_id, { cost_price: data.unit_cost })
          invalidate(shopId, 'products')
        } catch {
          // best-effort: don't fail nhập kho if product update fails
        }
      }
    }

    // 4. Log cashbook payment if paid
    if (data.type === 'purchase_in' && data.payment_status && data.payment_status !== 'unpaid') {
      const paidAmt = parseFloat(data.paid_amount || '0')
      if (paidAmt > 0) {
        try {
          // If there is a supplier ID, we could fetch their name, but for now we just log the ID
          const supplierName = data.supplier_id ? `Nhà cung cấp` : 'Khách lẻ / Không xác định'
          await connector.create('cashbook', {
            type:           'payment',
            amount:         String(paidAmt),
            method:         data.payment_method || 'cash',
            category:       'inventory',
            reference_id:   movementNo,
            reference_name: supplierName,
            note:           `Thanh toán phiếu nhập kho ${movementNo}`,
            employee_id:    data.employee_id || '',
            branch_id:      data.branch_id || '',
          })
        } catch (err) {
          console.error('Failed to log cashbook for stock movement:', err)
        }
      }
    }

    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST stock-movements')
  }
}
