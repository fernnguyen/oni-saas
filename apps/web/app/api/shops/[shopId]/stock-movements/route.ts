export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { stockMovementCreateSchema } from '@/lib/validators/stockMovements'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import type { IDataConnector } from '@oni/adapters'
import { RollbackContext } from '@oni/adapters'

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
    const movement_no = sp.get('movement_no') ?? ''
    const filters: Record<string, string> = {}
    if (type) filters.type = type
    if (product_id) filters.product_id = product_id
    if (branch_id) filters.branch_id = branch_id
    if (movement_no) filters.movement_no = movement_no

    const result = await connector.list('stock-movements', { page, limit, search: search || undefined, filters, sortDesc: true })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET stock-movements')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)
    tx = new RollbackContext()

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
      const totalPaidAmt = data.payments.reduce((sum: number, p: { amount: string }) => sum + parseFloat(p.amount || '0'), 0)
      const movNo = (data as any).movement_no || await generateMovementNo(connector, data.type)
      const payload = {
        ...(data as unknown as Record<string, string>),
        discount: data.discount || '0',
        unit_cost: data.unit_cost || '0',
        paid_amount: String(totalPaidAmt),
        payments: JSON.stringify(data.payments),
        movement_no: movNo,
      }
      const created = await connector.create('stock-movements', payload)
      tx.add(async () => {
        await connector.delete('stock-movements', (created as any).movement_id).catch(() => {})
      })
      invalidate(shopId, 'stock-movements')
      return NextResponse.json(created, { status: 201 })
    }

    // 1. Generate mã phiếu kho and create movement record
    const movementNo = await generateMovementNo(connector, data.type)
    const totalPaidAmt = data.payments.reduce((sum: number, p: { amount: string }) => sum + parseFloat(p.amount || '0'), 0)
    const payload = {
      ...(data as unknown as Record<string, string>),
      discount: data.discount || '0',
      unit_cost: data.unit_cost || '0',
      paid_amount: String(totalPaidAmt),
      payments: JSON.stringify(data.payments),
      movement_no: movementNo,
    }
    const created = await connector.create('stock-movements', payload)
    tx.add(async () => {
      await connector.delete('stock-movements', (created as any).movement_id).catch(() => {})
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
        const inv = invResult.data[0] as any
        const oldQty = parseFloat(inv.stock_qty || '0')
        const newQty = Math.max(0, oldQty + delta)
        
        // Note: In a high-concurrency environment, this read-modify-write could cause a race condition.
        // A future enhancement would be to add an `increment` method to the IDataConnector.
        await connector.update('inventory', inv.inventory_id as string, {
          stock_qty: String(newQty),
        })
        tx.add(async () => {
          await connector.update('inventory', inv.inventory_id as string, { stock_qty: String(oldQty) }).catch(() => {})
        })
      } else if (delta > 0) {
        // Create inventory row only for inbound movements.
        const createdInv = await connector.create('inventory', {
          product_id: data.product_id,
          branch_id: '',
          stock_qty: String(delta),
          min_stock: '0',
          sku: data.sku || '',
        } as Record<string, string>)
        tx.add(async () => {
          await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
        })
      }

      // 3. Update product cost_price
      if (data.unit_cost && INBOUND_TYPES.includes(data.type)) {
        const prod = await connector.findById('products', data.product_id)
        const oldCost = prod ? (prod as any).cost_price : '0'
        await connector.update('products', data.product_id, { cost_price: data.unit_cost })
        tx.add(async () => {
          await connector.update('products', data.product_id, { cost_price: oldCost }).catch(() => {})
        })
        invalidate(shopId, 'products')
      }
    }

    // 4. Log cashbook payment and update supplier debt
    if (data.type === 'purchase_in') {
      const totalCost = parseFloat(data.unit_cost || '0') * Math.abs(parseFloat(data.qty || '0'))
      const discountAmt = parseFloat(data.discount || '0')
      const debtAmt = Math.max(0, totalCost - discountAmt - totalPaidAmt)

      // Add a note about discount if applicable
      if (discountAmt > 0) {
        const dNote = `Giảm giá: ${discountAmt.toLocaleString('vi-VN')}đ`
        data.reason = data.reason ? `${data.reason} | ${dNote}` : dNote
        
        // Let's also update the movement reason so it is recorded
        const oldReason = (created as any).reason || ''
        await connector.update('stock-movements', created.id as string, {
          reason: data.reason
        })
        tx.add(async () => {
          await connector.update('stock-movements', created.id as string, { reason: oldReason }).catch(() => {})
        })
      }

      let supplierName = 'Khách lẻ / Không xác định'
      if (data.supplier_id) {
        try {
          const supplier = await connector.findById('suppliers', data.supplier_id) as Record<string, string> | null
          if (supplier) {
            supplierName = supplier.name || 'Nhà cung cấp'
            
            if (debtAmt > 0 && data.workflow_status === 'completed') {
              const currentDebt = parseFloat(supplier.debt_amount || '0')
              await connector.update('suppliers', data.supplier_id, {
                debt_amount: String(currentDebt + debtAmt)
              })
              tx.add(async () => {
                await connector.update('suppliers', data.supplier_id, { debt_amount: String(currentDebt) }).catch(() => {})
              })
              invalidate(shopId, 'suppliers')
            }
          }
        } catch (err) {
          console.error('Failed to update supplier debt:', err)
        }
      }

      if (data.payments.length > 0 && data.payment_status !== 'unpaid') {
        for (const payment of data.payments) {
          const pAmt = parseFloat(payment.amount || '0')
          if (pAmt > 0) {
            const createdCb = await connector.create('cashbook', {
              type:           'payment',
              amount:         String(pAmt),
              method:         payment.method || 'cash',
              category:       'inventory',
              reference_id:   movementNo,
              reference_name: supplierName,
              note:           `Thanh toán phiếu nhập kho ${movementNo}`,
              employee_id:    data.employee_id || '',
              branch_id:      data.branch_id || '',
            })
            tx.add(async () => {
              await connector.delete('cashbook', (createdCb as any).transaction_id).catch(() => {})
            })
          }
        }
      }
    }

    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'inventory')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST stock-movements')
  }
}
