import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function calcDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
  return qty
}

interface SyncItem {
  product_id: string
  sku?: string
  product_name: string
  qty: number
  unit_price: number
  discount_amount: number
  line_total: number
}

interface SyncPayment {
  method: string
  amount: number
  reference_no?: string
  note?: string
}

interface SyncMovement {
  type: string
  product_id: string
  qty: number
  branch_id?: string
  reference_no?: string
}

interface SyncOrder {
  status: string
  customer_id?: string
  customer_name?: string
  branch_id?: string
  employee_id?: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  debt_amount?: number
  note?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, shop, user } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json() as {
      local_order_id: string
      server_order_id?: string
      order: SyncOrder
      items: SyncItem[]
      payments: SyncPayment[]
      stock_movements: SyncMovement[]
    }

    const { local_order_id, server_order_id, order, items, payments, stock_movements } = body

    // ── Step 1: Find or create order ──
    let serverId = server_order_id ?? ''
    let orderNo = ''

    if (!serverId && local_order_id) {
      // Idempotency check: if a previous call created the order but the client
      // never received the response (e.g. F5 mid-request), find it by reference_no.
      // Requires an Orders tab with a "reference_no" column; silently falls back
      // to creating a new order if the column is absent.
      const existing = await connector.list('orders', {
        page: 1, limit: 1,
        filters: { reference_no: local_order_id },
      })
      if (existing.data.length > 0) {
        const row = existing.data[0] as Record<string, string>
        serverId = row.order_id
        orderNo = row.order_no ?? ''
      }
    }

    let isNewOrder = false
    if (!serverId) {
      isNewOrder = true
      const created = await connector.create('orders', {
        status:          order.status,
        channel:         'pos',
        customer_id:     order.customer_id   ?? '',
        customer_name:   order.customer_name ?? '',
        branch_id:       order.branch_id     ?? '',
        employee_id:     order.employee_id   ?? '',
        subtotal:        String(order.subtotal),
        discount_amount: String(order.discount_amount),
        tax_amount:      String(order.tax_amount),
        total_amount:    String(order.total_amount),
        paid_amount:     String(order.paid_amount),
        debt_amount:     String(order.debt_amount ?? 0),
        note:            order.note ?? '',
        reference_no:    local_order_id ?? '',
      } as Record<string, string>)
      serverId = (created as Record<string, string>).order_id
      orderNo = (created as Record<string, string>).order_no ?? ''
    }

    // If we reused an existing order and don't have order_no yet, fetch it
    if (!orderNo && serverId) {
      const row = await connector.list('orders', {
        page: 1, limit: 1,
        filters: { order_id: serverId },
      })
      if (row.data.length > 0) {
        orderNo = (row.data[0] as Record<string, string>).order_no ?? ''
      }
    }

    // ── Step 2: Order items — dedup by product_id ──
    const existingItems = await connector.list('order-items', {
      page: 1, limit: 200,
      filters: { order_id: serverId },
    })
    const existingProductIds = new Set(
      (existingItems.data as Record<string, string>[]).map((r) => r.product_id)
    )

    const itemsToCreate = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (existingProductIds.has(it.product_id)) continue
      itemsToCreate.push({
        order_id:      serverId,
        order_no:      orderNo,
        line_no:       String(i + 1),
        product_id:    it.product_id,
        sku:           it.sku ?? '',
        product_name:  it.product_name,
        qty:           String(it.qty),
        unit_price:    String(it.unit_price),
        line_discount: String(it.discount_amount),
        line_total:    String(it.line_total),
      })
    }
    if (itemsToCreate.length > 0) {
      await connector.batchCreate('order-items', itemsToCreate)
    }

    // ── Step 3: Payments — dedup by method ──
    const existingPays = await connector.list('payments', {
      page: 1, limit: 50,
      filters: { order_id: serverId },
    })
    const serverPaid = (existingPays.data as Record<string, string>[])
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0)
    const localPaid = payments.reduce((s, p) => s + p.amount, 0)

    if (serverPaid < localPaid - 0.01 || payments.some(p => p.method === 'debt')) {
      const existingMethods = new Set(
        (existingPays.data as Record<string, string>[]).map((r) => r.method)
      )
      const paysToCreate = []
      const cashbookToCreate = []
      for (const pay of payments) {
        if (existingMethods.has(pay.method)) continue
        paysToCreate.push({
          order_id:     serverId,
          order_no:     orderNo,
          method:       pay.method,
          amount:       String(pay.amount),
          reference_no: pay.reference_no ?? '',
          note:         pay.note ?? '',
          paid_at:      new Date().toISOString(),
        })

        if (pay.method !== 'debt') {
          cashbookToCreate.push({
            type:           'receipt',
            amount:         String(pay.amount),
            method:         pay.method,
            category:       'sales',
            reference_id:   serverId,
            reference_name: order.customer_name ?? '',
            note:           `Thanh toán đơn hàng ${orderNo || serverId}`,
            employee_id:    order.employee_id ?? '',
            branch_id:      order.branch_id ?? '',
          })
        }
      }
      if (paysToCreate.length > 0) {
        await connector.batchCreate('payments', paysToCreate)
      }
      if (cashbookToCreate.length > 0) {
        await connector.batchCreate('cashbook', cashbookToCreate).catch(err => {
          console.error('Failed to log cashbook for payment:', err)
        })
      }
    }

    // ── Step 4: Stock movements — dedup then create with movement_no ──
    // reference_no = order_no (ORD-001) so the movement traces back to its source order.
    // Dedup uses the same reference_no that will be written (consistent key).
    const movRef = orderNo || serverId || ''

    // Pre-count existing PX movements to generate sequential movement_no
    const existingPX = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'sale_out' } })
    const pxNums = (existingPX.data as Record<string, string>[])
      .map(r => r.movement_no)
      .filter((n): n is string => typeof n === 'string' && n.startsWith('PX-'))
      .map(n => parseInt(n.slice(3), 10))
      .filter(n => !isNaN(n))
    let pxCounter = pxNums.length > 0 ? Math.max(...pxNums) : 0

    const existingMovs = await connector.list('stock-movements', {
      page: 1, limit: 100,
      filters: { reference_no: movRef }
    })
    const existingMovProductIds = new Set(
      (existingMovs.data as Record<string, string>[]).map(r => r.product_id)
    )

    const movsToCreate = []
    for (const mv of stock_movements) {
      if (existingMovProductIds.has(mv.product_id)) continue

      pxCounter += 1
      const movementNo = `PX-${String(pxCounter).padStart(3, '0')}`

      movsToCreate.push({
        type:         mv.type,
        movement_no:  movementNo,
        product_id:   mv.product_id,
        qty:          String(Math.abs(mv.qty)),
        branch_id:    mv.branch_id ?? '',
        reference_no: movRef,
      })
    }
    if (movsToCreate.length > 0) {
      await connector.batchCreate('stock-movements', movsToCreate)
    }

    // ── Step 5: Update Customer Debt & Fetch Info ──
    let customerPhone = ''
    if (isNewOrder && order.customer_id) {
      try {
        const customer = await connector.findById('customers', order.customer_id)
        if (customer) {
          customerPhone = (customer.phone as string) || ''
          
          if (order.debt_amount && Number(order.debt_amount) > 0) {
            const currentDebt = parseFloat((customer.debt_amount as string) || '0')
            const newDebt = currentDebt + Number(order.debt_amount)
            await connector.update('customers', order.customer_id, {
              debt_amount: String(newDebt)
            })
            invalidate(shopId, 'customers')
          }
        }
      } catch (err) {
        console.error('Failed to fetch customer:', err)
      }
    }

    invalidate(shopId, 'orders')
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'payments')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'cashbook')

    if (isNewOrder) {
      // Format items
      const itemsList = items.map((it, i) => {
        const itemTotal = Number(it.line_total).toLocaleString('vi-VN');
        const unitPrice = Number(it.unit_price).toLocaleString('vi-VN');
        let txt = `${i + 1}. ${it.product_name}\n   ${it.qty} x ${unitPrice}đ = ${itemTotal}đ`;
        if (Number(it.discount_amount) > 0) {
          txt += ` (Giảm: ${Number(it.discount_amount).toLocaleString('vi-VN')}đ)`;
        }
        return txt;
      }).join('\n');

      const paymentMethodMap: Record<string, string> = {
        cash: 'Tiền mặt',
        card: 'Quẹt thẻ',
        bank_transfer: 'Chuyển khoản',
        momo: 'MoMo',
        vnpay: 'VNPay',
        zalopay: 'ZaloPay',
        debt: 'Ghi nợ'
      };

      let paidText = '';
      if (payments.length === 0) {
        paidText = `${Number(order.paid_amount).toLocaleString('vi-VN')}đ`;
      } else if (payments.length === 1) {
        const p = payments[0];
        const methodName = paymentMethodMap[p.method] || p.method;
        paidText = `${Number(p.amount).toLocaleString('vi-VN')}đ (${methodName})`;
      } else {
        paidText = '\n' + payments.map(p => {
          const methodName = paymentMethodMap[p.method] || p.method;
          return `- ${Number(p.amount).toLocaleString('vi-VN')}đ (${methodName})`;
        }).join('\n');
      }

      const customerDisplay = order.customer_name 
        ? `${order.customer_name}${customerPhone ? ` (${customerPhone})` : ''}` 
        : 'Khách lẻ';

      const admin = getSupabaseAdminClient();
      const { data: tenant } = await admin.from('tenants').select('slug').eq('id', shop.tenant_id).maybeSingle();
      const domainName = tenant?.slug ? `${tenant.slug}.oni.vn` : 'oni.vn';
      const creatorEmail = user?.email || 'Unknown';

      const message = `Mã đơn: #${orderNo || serverId}
Khách hàng: ${customerDisplay}
${order.note ? `Ghi chú: ${order.note}\n` : ''}
🛍 MẶT HÀNG:
${itemsList}

💰 THANH TOÁN:
Tiền hàng: ${Number(order.subtotal).toLocaleString('vi-VN')}đ
Giảm giá: ${Number(order.discount_amount).toLocaleString('vi-VN')}đ
Tổng cộng: ${Number(order.total_amount).toLocaleString('vi-VN')}đ
Đã thu: ${paidText}
Còn nợ: ${Number(order.debt_amount || 0).toLocaleString('vi-VN')}đ

📝 Người tạo phiếu: ${creatorEmail} (${domainName})`;

      // Dispatch notification asynchronously without blocking response
      dispatchNotification(shop.tenant_id, 'ORDER_CREATED', {
        title: `📦 Đơn hàng mới (POS) - ${shop.name}`,
        message,
      }).catch(console.error);
    }

    return NextResponse.json({ order_id: serverId, order_no: orderNo }, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST orders/sync-batch')
  }
}
