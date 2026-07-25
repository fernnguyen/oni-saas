import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { RollbackContext } from '@oni/adapters'
import { getGMT7Time, isTimeChargeProduct } from '@oni/core'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { isDateLocked } from '@/lib/server/taxLock'
import { resolveAndRecordPayment } from '@/lib/server/paymentFunds'
import { invalidate } from '@/lib/server/cache'

const schema = z.object({
  customer_id: z.string().trim().min(1).optional(),
  customer_name: z.string().trim().min(1).max(255).optional(),
  occurred_at: z.string().datetime({ offset: true }),
  note: z.string().trim().max(1000).optional().default(''),
  discount_amount: z.coerce.number().min(0).default(0),
  payment_method: z.enum(['cash', 'card', 'bank_transfer', 'momo', 'vnpay', 'zalopay']).default('cash'),
  fund_id: z.string().trim().min(1).optional(),
  payment_reference_no: z.string().trim().max(100).optional().default(''),
  items: z.array(z.object({
    product_id: z.string().trim().min(1),
    qty: z.coerce.number().positive().max(100000),
  })).min(1).max(200),
})

type Row = Record<string, string>

async function assertOwnerOrAdmin(userId: string, tenantId: string) {
  const admin = getSupabaseAdminClient()
  const { data: membership, error } = await admin
    .from('user_tenants')
    .select('role_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error || !membership?.role_id) return false

  const { data: role } = await admin
    .from('roles')
    .select('code')
    .eq('id', membership.role_id)
    .maybeSingle()
  return role?.code === 'owner' || role?.code === 'admin'
}

function idOf(row: Row) {
  return row.id || row.order_id || row.item_id || row.payment_id || row.transaction_id || row.movement_id || row.inventory_id || ''
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  let tx: RollbackContext | undefined
  try {
    const { shopId } = await params
    const { connector, shop, user } = await requireShopAccess(shopId, 'orders.create')

    if (!await assertOwnerOrAdmin(user.id, shop.tenant_id)) {
      return NextResponse.json({ message: 'Chỉ Owner hoặc Admin mới được ghi đơn thủ công.' }, { status: 403 })
    }

    const input = schema.safeParse(await req.json())
    if (!input.success) {
      return NextResponse.json({ message: 'Dữ liệu đơn thủ công không hợp lệ.', errors: input.error.flatten() }, { status: 400 })
    }

    const occurredAt = new Date(input.data.occurred_at)
    if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return NextResponse.json({ message: 'Ngày giờ hóa đơn không hợp lệ hoặc nằm trong tương lai.' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()
    const { data: settings } = await admin
      .from('shop_settings')
      .select('enable_manual_orders, allow_negative_stock')
      .eq('shop_id', shopId)
      .maybeSingle()
    if (settings?.enable_manual_orders === false) {
      return NextResponse.json({ message: 'Shop này đã tắt tính năng ghi đơn thủ công.' }, { status: 403 })
    }
    if (await isDateLocked(connector, shopId, occurredAt.toISOString())) {
      return NextResponse.json({ message: 'Kỳ thuế của ngày hóa đơn này đã bị khóa sổ.' }, { status: 400 })
    }

    tx = new RollbackContext()
    const products: Row[] = []
    for (const item of input.data.items) {
      const product = await connector.findById('products', item.product_id) as Row | null
      if (!product) return NextResponse.json({ message: `Không tìm thấy mặt hàng ${item.product_id}.` }, { status: 400 })
      products.push(product)
    }

    let customerId = input.data.customer_id || 'C-DEFAULT-RETAIL'
    let customerName = input.data.customer_name || 'Khách lẻ'
    if (input.data.customer_id) {
      const customer = await connector.findById('customers', input.data.customer_id) as Row | null
      if (!customer) return NextResponse.json({ message: 'Khách hàng đã chọn không tồn tại.' }, { status: 400 })
      customerName = input.data.customer_name || customer.name || customerName
    }

    const lines = input.data.items.map((item, index) => {
      const product = products[index]
      const unitPrice = Number(product.sell_price || product.price || 0)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Giá bán của ${product.name || item.product_id} không hợp lệ.`)
      return { item, product, unitPrice, gross: unitPrice * item.qty }
    })
    const subtotal = lines.reduce((sum, line) => sum + line.gross, 0)
    if (input.data.discount_amount > subtotal) {
      return NextResponse.json({ message: 'Giảm giá không thể lớn hơn tiền hàng.' }, { status: 400 })
    }

    const orderLines = lines.map((line, index) => {
      const discount = subtotal === 0 ? 0 : Number((input.data.discount_amount * line.gross / subtotal).toFixed(2))
      const taxable = line.gross - discount
      const taxRate = Number(line.product.tax_rate || 0)
      const taxAmount = Number((taxable * taxRate / 100).toFixed(2))
      return { ...line, lineNo: index + 1, discount, taxRate, taxAmount, total: taxable + taxAmount }
    })
    const taxAmount = orderLines.reduce((sum, line) => sum + line.taxAmount, 0)
    const totalAmount = Number((subtotal - input.data.discount_amount + taxAmount).toFixed(2))

    if (input.data.fund_id) {
      const funds = (await connector.list('payment-funds', {
        page: 1, limit: 100, filters: { branch_id: shopId, active: 'TRUE' },
      })).data as Row[]
      const selectedFund = funds.find((row) => idOf(row) === input.data.fund_id)
      if (!selectedFund) {
        return NextResponse.json({ message: 'Sổ quỹ nhận tiền không hợp lệ hoặc đã ngừng hoạt động.' }, { status: 400 })
      }
    }

    // Use the accounting time selected by the owner/admin as created_at. The
    // immutable entry time and actor stay in metadata/audit_logs for traceability.
    const created = await connector.create('orders', {
      status: 'completed', channel: 'manual',
      customer_id: customerId, customer_name: customerName, branch_id: shopId,
      employee_id: user.id, subtotal: String(subtotal), discount_amount: String(input.data.discount_amount),
      tax_amount: String(taxAmount), total_amount: String(totalAmount), paid_amount: String(totalAmount),
      debt_amount: '0', points_earned: '0', points_redeemed: '0', note: input.data.note,
      payment_method: input.data.payment_method, created_at: occurredAt.toISOString(),
      metadata: JSON.stringify({ entry_source: 'manual', recorded_at: getGMT7Time(), recorded_by: user.id, invoice_at: occurredAt.toISOString() }),
    }) as Row
    const orderId = created.order_id || created.id
    const orderNo = created.order_no || orderId
    if (!orderId) throw new Error('Không nhận được mã đơn hàng sau khi lưu.')
    tx.add(async () => { await connector.delete('orders', orderId).catch(() => {}) })

    const createdItems = await connector.batchCreate('order-items', orderLines.map((line) => ({
      order_id: orderId, order_no: orderNo, line_no: String(line.lineNo), product_id: line.item.product_id,
      sku: line.product.sku || '', product_name: line.product.name || '', qty: String(line.item.qty),
      unit_price: String(line.unitPrice), original_price: String(line.unitPrice), unit_cost: String(line.product.cost_price || 0),
      line_discount: String(line.discount), tax_rate: String(line.taxRate), tax_amount: String(line.taxAmount),
      tax_group: line.product.tax_group || '', line_total: String(line.total),
    }))) as Row[]
    tx.add(async () => { for (const item of createdItems) await connector.delete('order-items', idOf(item)).catch(() => {}) })

    const payment = await connector.create('payments', {
      id: `PAY-MANUAL-${orderId}`, order_id: orderId, order_no: orderNo, method: input.data.payment_method,
      amount: String(totalAmount), reference_no: input.data.payment_reference_no, note: 'Ghi nhận đơn thủ công', paid_at: occurredAt.toISOString(),
    }) as Row
    tx.add(async () => { await connector.delete('payments', idOf(payment)).catch(() => {}) })
    const fund = await resolveAndRecordPayment(connector, shopId, {
      amount: totalAmount,
      method: input.data.payment_method,
      fund_id: input.data.fund_id,
    }, false, tx)
    const cashbook = await connector.create('cashbook', {
      type: 'receipt', amount: String(totalAmount), method: input.data.payment_method, category: 'sales',
      reference_id: orderId, reference_name: customerName, note: `Thu tiền đơn thủ công ${orderNo}`,
      employee_id: user.id, branch_id: shopId, fund_id: fund.fundId, balance_after_transaction: fund.balanceAfter,
      created_at: occurredAt.toISOString(),
    }) as Row
    tx.add(async () => { await connector.delete('cashbook', idOf(cashbook)).catch(() => {}) })

    // Expand BOMs before changing stock, then make movements and inventory agree.
    const stockLines: Array<{ product: Row; qty: number; warehouseType: 'sale' | 'supply'; reason: string }> = []
    for (const line of orderLines) {
      if (isTimeChargeProduct(line.item.product_id, line.product.name)) continue
      if (line.product.has_bom === 'TRUE') {
        const bom = await connector.list('product-bom', { page: 1, limit: 1000, filters: { parent_product_id: line.item.product_id } })
        for (const component of bom.data as Row[]) {
          const componentProduct = await connector.findById('products', component.component_product_id) as Row | null
          if (componentProduct) stockLines.push({ product: componentProduct, qty: line.item.qty * Number(component.qty || 0), warehouseType: 'supply', reason: `Đơn thủ công ${orderNo}: ${line.product.name || 'BOM'}` })
        }
      } else {
        stockLines.push({ product: line.product, qty: line.item.qty, warehouseType: 'sale', reason: `Đơn thủ công ${orderNo}` })
      }
    }
    const warehouses = (await connector.list('warehouses', { page: 1, limit: 100 })).data as Row[]
    for (const stockLine of stockLines) {
      if (stockLine.qty <= 0) continue
      const warehouse = warehouses.find((row) => row.type === stockLine.warehouseType)
      const warehouseId = warehouse?.id || warehouse?.warehouse_id || ''
      const productId = stockLine.product.product_id || stockLine.product.id
      const inventoryRows = (await connector.list('inventory', { page: 1, limit: 20, filters: { product_id: productId, warehouse_id: warehouseId } })).data as Row[]
      const inventory = inventoryRows.find((row) => row.branch_id === shopId) || inventoryRows[0]
      const oldQty = Number(inventory?.stock_qty || 0)
      if (settings?.allow_negative_stock === false && oldQty < stockLine.qty) {
        throw new Error(`Không đủ tồn kho cho ${stockLine.product.name || productId}.`)
      }
      const nextQty = oldQty - stockLine.qty
      if (inventory) {
        const inventoryId = idOf(inventory)
        await connector.update('inventory', inventoryId, { stock_qty: String(nextQty) })
        tx.add(async () => { await connector.update('inventory', inventoryId, { stock_qty: String(oldQty) }).catch(() => {}) })
      } else {
        const createdInventory = await connector.create('inventory', { product_id: productId, branch_id: shopId, warehouse_id: warehouseId, stock_qty: String(nextQty), min_stock: '0', sku: stockLine.product.sku || '' }) as Row
        tx.add(async () => { await connector.delete('inventory', idOf(createdInventory)).catch(() => {}) })
      }
      const movement = await connector.create('stock-movements', {
        type: 'sale_out', movement_no: `PX-M-${orderNo}-${productId}`, product_id: productId, sku: stockLine.product.sku || '', qty: String(stockLine.qty),
        branch_id: shopId, warehouse_id: warehouseId, reference_no: orderNo, reason: stockLine.reason,
        employee_id: user.id, created_at: occurredAt.toISOString(),
      }) as Row
      tx.add(async () => { await connector.delete('stock-movements', idOf(movement)).catch(() => {}) })

      // Keep lot/expiry stock aligned with the aggregate inventory record. We
      // deliberately consume FIFO and never manufacture a negative batch; if
      // negative stock is allowed, only the aggregate row carries the deficit.
      const batches = (await connector.list('inventory-batches', {
        page: 1, limit: 100, filters: { product_id: productId, branch_id: shopId },
      })).data as Row[]
      let remaining = stockLine.qty
      for (const batch of batches.filter((row) => Number(row.stock_qty || 0) > 0).sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))) {
        if (remaining <= 0) break
        const before = Number(batch.stock_qty || 0)
        const used = Math.min(before, remaining)
        const batchId = idOf(batch)
        await connector.update('inventory-batches', batchId, { stock_qty: String(before - used) })
        tx.add(async () => { await connector.update('inventory-batches', batchId, { stock_qty: String(before) }).catch(() => {}) })
        remaining -= used
      }
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: shop.tenant_id, shop_id: shopId, user_id: user.id, action: 'orders.manual_create',
      metadata: { order_id: orderId, order_no: orderNo, occurred_at: occurredAt.toISOString(), total_amount: totalAmount, item_count: orderLines.length },
    })
    if (auditError) throw auditError
    invalidate(shopId, 'orders'); invalidate(shopId, 'order-items'); invalidate(shopId, 'payments'); invalidate(shopId, 'cashbook'); invalidate(shopId, 'inventory'); invalidate(shopId, 'stock-movements')
    return NextResponse.json({ order_id: orderId, order_no: orderNo }, { status: 201 })
  } catch (error) {
    await tx?.rollback().catch(() => {})
    console.error('[manual-orders]', error)
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Không thể ghi nhận đơn thủ công.' }, { status: 500 })
  }
}
