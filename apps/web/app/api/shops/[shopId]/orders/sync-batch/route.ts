import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { RollbackContext } from '@oni/adapters'
import crypto from 'crypto'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

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
  // ── Variant / Modifier context (Sprint 1) ────────────────────────────────
  variant_label?: string    // "Size L" — denormalized, for bill display
  modifiers?: string        // JSON string: [{group, option, price_adj}]
  modifier_total?: number   // Sum of price_adj (default 0)
  // ── Unit Conversion ──────────────────────────────────────────────
  unit_id?: string
  unit_name?: string
  conversion_rate?: number
}

interface SyncPayment {
  id?: string
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
  points_earned?: number
  points_redeemed?: number
  note?: string
  metadata?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId } = await params
    const { connector, shop, user } = await requireShopAccess(shopId, 'orders.create')
    tx = new RollbackContext()

    const admin = getSupabaseAdminClient()
    const { data: settingsData } = await admin
      .from('shop_settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle()
    const settings = settingsData || {}

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
    let finalCustomerId = order.customer_id ?? ''

    // Auto-create customer if name is provided but no ID
    const isRetailGuest = !order.customer_name || order.customer_name.trim().toLowerCase() === 'khách lẻ' || order.customer_name.trim().toLowerCase() === 'khach le';
    if (isRetailGuest) {
      finalCustomerId = 'C-DEFAULT-RETAIL'
      order.customer_name = 'Khách lẻ'
    } else if (!finalCustomerId) {
      const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata || '{}') : (order.metadata || {})
      const newCustomer = await connector.create('customers', {
        name: order.customer_name ?? '',
        phone: meta.customer_phone || ''
      })
      finalCustomerId = (newCustomer as Record<string, string>).customer_id || ''
    }

    if (!serverId) {
      isNewOrder = true
      const createData: Record<string, string> = {
        status:          order.status,
        channel:         'pos',
        customer_id:     finalCustomerId,
        customer_name:   order.customer_name ?? '',
        branch_id:       order.branch_id     ?? '',
        employee_id:     order.employee_id   ?? '',
        subtotal:        String(order.subtotal),
        discount_amount: String(order.discount_amount),
        tax_amount:      String(order.tax_amount),
        total_amount:    String(order.total_amount),
        paid_amount:     String(order.paid_amount),
        debt_amount:     String(order.debt_amount ?? 0),
        points_earned:   String(order.points_earned ?? 0),
        points_redeemed: String(order.points_redeemed ?? 0),
        note:            order.note ?? '',
        reference_no:    local_order_id ?? '',
        created_at:      getGMT7Time(),
      }
      if (order.metadata !== undefined) {
        createData.metadata = order.metadata
      }
      const created = await connector.create('orders', createData)
      serverId = (created as Record<string, string>).order_id
      orderNo = (created as Record<string, string>).order_no ?? ''
      
      tx.add(async () => { await connector.delete('orders', serverId) })
    } else {
      // Update existing order totals when checking out from a session (TableMapPOS)
      const updateData: Record<string, string> = {
        status:          order.status,
        customer_id:     finalCustomerId,
        customer_name:   order.customer_name ?? '',
        subtotal:        String(order.subtotal),
        discount_amount: String(order.discount_amount),
        tax_amount:      String(order.tax_amount),
        total_amount:    String(order.total_amount),
        paid_amount:     String(order.paid_amount),
        debt_amount:     String(order.debt_amount ?? 0),
        points_earned:   String(order.points_earned ?? 0),
        points_redeemed: String(order.points_redeemed ?? 0),
        note:            order.note ?? '',
      }
      if (local_order_id) {
        updateData.reference_no = local_order_id
      }
      if (order.metadata !== undefined) {
        updateData.metadata = order.metadata
      }
      await connector.update('orders', serverId, updateData)
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
        order_id:       serverId,
        order_no:       orderNo,
        line_no:        String(i + 1),
        product_id:     it.product_id,
        sku:            it.sku ?? '',
        product_name:   it.product_name,
        qty:            String(it.qty),
        unit_price:     String(it.unit_price),
        line_discount:  String(it.discount_amount),
        line_total:     String(it.line_total),
        // ── Variant / Modifier context (Sprint 1) ───────────────────────
        variant_label:  it.variant_label ?? '',
        modifiers:      typeof it.modifiers === 'object' ? JSON.stringify(it.modifiers) : (it.modifiers ?? ''),
        modifier_total: String(it.modifier_total ?? 0),
        // ── Unit Conversion ──────────────────────────────────────────────
        unit_id:        it.unit_id ?? '',
        unit_name:      it.unit_name ?? '',
        conversion_rate:String(it.conversion_rate ?? 1),
      })
    }
    if (itemsToCreate.length > 0) {
      const createdItems = await connector.batchCreate('order-items', itemsToCreate)
      tx.add(async () => {
        // delete newly created items
        for (const item of createdItems) {
          await connector.delete('order-items', item.item_id).catch(() => {})
        }
      })
    }

    // ── Step 3: Payments — dedup by id ──
    const existingPays = await connector.list('payments', {
      page: 1, limit: 100,
      filters: { order_id: serverId },
    })
    const existingPayIds = new Set(
      (existingPays.data as Record<string, string>[]).map((r) => r.id)
    )

    const paysToCreate = []
    const cashbookToCreate = []
    for (const pay of payments) {
      if (pay.id && existingPayIds.has(pay.id)) continue
      
      const newPayId = pay.id || `PAY-${Date.now()}-${Math.floor(Math.random()*1000)}`
      paysToCreate.push({
        id:           newPayId,
        order_id:     serverId,
        order_no:     orderNo,
        method:       pay.method,
        amount:       String(pay.amount),
        reference_no: pay.reference_no ?? '',
        note:         pay.note ?? '',
        paid_at:      getGMT7Time(),
      })

      if (pay.method !== 'debt') {
        const isRefund = Number(pay.amount) < 0
        cashbookToCreate.push({
          type:           isRefund ? 'expense' : 'receipt',
          amount:         String(Math.abs(Number(pay.amount))),
          method:         pay.method,
          category:       isRefund ? 'refund' : 'sales',
          reference_id:   serverId,
          reference_name: order.customer_name ?? '',
          note:           isRefund ? `Hoàn tiền thừa đơn hàng ${orderNo || serverId}` : `Thanh toán đơn hàng ${orderNo || serverId}`,
          employee_id:    order.employee_id ?? '',
          branch_id:      order.branch_id ?? '',
        })
      }
    }
    
    if (paysToCreate.length > 0) {
      const createdPays = await connector.batchCreate('payments', paysToCreate)
      tx.add(async () => {
        for (const p of createdPays) {
          await connector.delete('payments', p.payment_id || p.id).catch(() => {})
        }
      })
    }
    if (cashbookToCreate.length > 0) {
      const createdCb = await connector.batchCreate('cashbook', cashbookToCreate)
      tx.add(async () => {
        for (const cb of createdCb) {
          await connector.delete('cashbook', cb.transaction_id || cb.id).catch(() => {})
        }
      })
    }

    // ── Step 4: Stock movements — dedup then create with movement_no ──
    // reference_no = order_no (ORD-001) so the movement traces back to its source order.
    // Dedup uses the same reference_no that will be written (consistent key).
    const movRef = orderNo || serverId || ''

    const tenantHash = crypto.createHash('sha256').update(shop.tenant_id).digest('hex').substring(0, 8).toUpperCase()
    const searchPrefix = `PX-${tenantHash}-`

    // Pre-count existing PX movements to generate sequential movement_no
    const existingPX = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type: 'sale_out' } })
    const pxNums = (existingPX.data as Record<string, string>[])
      .map(r => r.movement_no)
      .filter((n): n is string => typeof n === 'string' && n.startsWith(searchPrefix))
      .map(n => parseInt(n.slice(searchPrefix.length), 10))
      .filter(n => !isNaN(n))
    let pxCounter = pxNums.length > 0 ? Math.max(...pxNums) : 0

    const existingMovs = await connector.list('stock-movements', {
      page: 1, limit: 100,
      filters: { reference_no: movRef }
    })
    const existingMovProductIds = new Set(
      (existingMovs.data as Record<string, string>[]).map(r => r.product_id)
    )

    // Fetch product details to identify which ones have BOM activated
    const productIdsInMovements = Array.from(new Set(stock_movements.map(mv => mv.product_id)))
    const productsInMovements: Record<string, any>[] = []
    for (const pid of productIdsInMovements) {
      try {
        const p = await connector.findById('products', pid)
        if (p) {
          productsInMovements.push(p)
        }
      } catch (err) {
        console.error('Failed to fetch product in sync-batch stock-movements step:', err)
      }
    }
    const productMap = new Map<string, Record<string, any>>(
      productsInMovements.map(p => [p.product_id || p.id, p])
    )

    const movsToCreate = []
    for (const mv of stock_movements) {
      const product = productMap.get(mv.product_id)

      if (product?.has_bom === 'TRUE') {
        // Query active BOM components for this parent
        try {
          const bomRes = await connector.list('product-bom', {
            page: 1,
            limit: 1000,
            filters: { parent_product_id: mv.product_id }
          })
          const components = bomRes.data as Record<string, any>[]
          const parentName = product.name || 'Thành phẩm'

          for (const comp of components) {
            const compId = comp.component_product_id
            if (existingMovProductIds.has(compId)) continue

            pxCounter += 1
            const movementNo = `${searchPrefix}${String(pxCounter).padStart(3, '0')}`
            const compQty = Math.abs(mv.qty) * parseFloat(comp.qty || '0')

            // Fetch component SKU
            let compSku = ''
            try {
              const compProd = await connector.findById('products', compId)
              if (compProd) {
                compSku = (compProd.sku as string) || ''
              }
            } catch (skuErr) {
              console.error('Failed to fetch component product for SKU:', skuErr)
            }

            movsToCreate.push({
              type:         mv.type,
              movement_no:  movementNo,
              product_id:   compId,
              sku:          compSku,
              qty:          String(compQty),
              branch_id:    mv.branch_id ?? '',
              reference_no: movRef,
              reason:       `Trừ kho nguyên liệu phục vụ món: ${parentName} x ${Math.abs(mv.qty)}`,
              created_at:   getGMT7Time(),
            })
          }
        } catch (bomErr) {
          console.error('Failed to expand BOM stock movements inside sync-batch:', bomErr)
        }
      } else {
        // Standard non-BOM product
        if (existingMovProductIds.has(mv.product_id)) continue

        pxCounter += 1
        const movementNo = `${searchPrefix}${String(pxCounter).padStart(3, '0')}`

        movsToCreate.push({
          type:         mv.type,
          movement_no:  movementNo,
          product_id:   mv.product_id,
          sku:          product?.sku || '',
          qty:          String(Math.abs(mv.qty)),
          branch_id:    mv.branch_id ?? '',
          reference_no: movRef,
          created_at:   getGMT7Time(),
        })
      }
    }

    if (movsToCreate.length > 0) {
      const createdMovs = await connector.batchCreate('stock-movements', movsToCreate)
      tx.add(async () => {
        for (const mov of createdMovs) {
          await connector.delete('stock-movements', mov.movement_id).catch(() => {})
        }
      })

      // Update current stock quantities in the inventory table
      for (const mov of createdMovs) {
        const qtyToDeduct = Math.abs(parseFloat(mov.qty || '0'))
        if (qtyToDeduct === 0) continue

        const pid = mov.product_id
        const branchId = mov.branch_id ?? ''
        const sku = mov.sku ?? ''

        // Query existing inventory for this product
        const invListResult = await connector.list('inventory', {
          page: 1, limit: 10,
          filters: { product_id: pid }
        })
        const allInv = invListResult.data as Record<string, string>[]
        let invRow = allInv.find(i => i.branch_id === branchId)
        if (!invRow && branchId !== '') {
          invRow = allInv.find(i => i.branch_id === '')
        }
        if (!invRow) {
          invRow = allInv[0]
        }

        if (invRow) {
          const oldQty = parseFloat(invRow.stock_qty || '0')
          const newQty = oldQty - qtyToDeduct
          await connector.update('inventory', invRow.inventory_id as string, {
            stock_qty: String(newQty)
          })
          tx.add(async () => {
            await connector.update('inventory', invRow.inventory_id as string, { stock_qty: String(oldQty) }).catch(() => {})
          })
        } else {
          // Create a new inventory record with negative stock (no Math.max(0) capping)
          const createdInv = await connector.create('inventory', {
            product_id: pid,
            branch_id: branchId || '',
            stock_qty: String(-qtyToDeduct),
            min_stock: '0',
            sku: sku || ''
          } as Record<string, string>)
          tx.add(async () => {
            await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
          })
        }
      }
    }

    // ── Step 5: Update Customer CRM, Debt & Fetch Info ──
    let customerPhone = ''
    if (isNewOrder && order.customer_id) {
      try {
        const customer = await connector.findById('customers', order.customer_id)
        if (customer) {
          customerPhone = (customer.phone as string) || ''
          
          const updates: Record<string, string> = {}
          
          // 1. Debt amount
          const currentDebt = parseFloat((customer.debt_amount as string) || '0')
          if (order.debt_amount && Number(order.debt_amount) > 0) {
            const newDebt = currentDebt + Number(order.debt_amount)
            updates.debt_amount = String(newDebt)
          }

          // 2. Loyalty points (Tích điểm & Tiêu điểm)
          const currentPoints = parseFloat((customer.loyalty_points as string) || '0')
          const earned = Number(order.points_earned || 0)
          const redeemed = Number(order.points_redeemed || 0)
          if (earned > 0 || redeemed > 0) {
            const newPoints = Math.max(0, currentPoints + earned - redeemed)
            updates.loyalty_points = String(newPoints)
          }

          // 3. Prepaid balance
          const currentPrepaid = parseFloat((customer.prepaid_balance as string) || '0')
          const prepaidSpent = payments
            .filter((p) => p.method === 'prepaid')
            .reduce((s, p) => s + Number(p.amount), 0)
          if (prepaidSpent > 0) {
            const newPrepaid = Math.max(0, currentPrepaid - prepaidSpent)
            updates.prepaid_balance = String(newPrepaid)
          }

          // 4. Automatic Membership Tiers (3 years evaluation)
          // Sum up completed orders in the last N years
          const evaluationYears = Number(settings?.tier_evaluation_years || 3)
          const minDate = new Date()
          minDate.setFullYear(minDate.getFullYear() - evaluationYears)
          const minDateString = minDate.toISOString().split('T')[0] // YYYY-MM-DD

          // Fetch all customer orders
          const customerOrders = await connector.list('orders', {
            page: 1, limit: 1000,
            filters: { customer_id: order.customer_id, status: 'completed' }
          })
          
          const recentTotal = (customerOrders.data as Record<string, string>[])
            .filter(o => {
              const orderDate = o.created_at || ''
              return orderDate >= minDateString
            })
            .reduce((sum, o) => sum + parseFloat(o.total_amount || '0'), 0)
          
          // Determine new tier
          let newType = 'retail'
          const dynamicTiers = (settings?.membership_tiers || []) as { name: string; threshold: number; discount: number }[]

          if (dynamicTiers && dynamicTiers.length > 0) {
            // Sort tiers by threshold DESC (highest threshold first)
            const sortedTiers = [...dynamicTiers].sort((a, b) => Number(b.threshold) - Number(a.threshold))
            const matchingTier = sortedTiers.find(t => recentTotal >= Number(t.threshold))
            if (matchingTier) {
              newType = matchingTier.name
            } else {
              newType = 'retail'
            }
          } else {
            // Fallback to legacy hardcoded levels
            const tierGold = Number(settings?.tier_gold_threshold || 35000000)
            const tierSilver = Number(settings?.tier_silver_threshold || 15000000)
            const tierBronze = Number(settings?.tier_bronze_threshold || 5000000)

            if (recentTotal >= tierGold) {
              newType = 'gold'
            } else if (recentTotal >= tierSilver) {
              newType = 'silver'
            } else if (recentTotal >= tierBronze) {
              newType = 'bronze'
            }
          }

          if (newType !== (customer.customer_type || 'retail')) {
            updates.customer_type = newType
          }

          // Apply updates
          if (Object.keys(updates).length > 0) {
            await connector.update('customers', order.customer_id, updates)
            tx.add(async () => {
              // Rollback update logic
              const rollbackObj: Record<string, string> = {}
              if (updates.debt_amount !== undefined) rollbackObj.debt_amount = String(currentDebt)
              if (updates.loyalty_points !== undefined) rollbackObj.loyalty_points = String(currentPoints)
              if (updates.prepaid_balance !== undefined) rollbackObj.prepaid_balance = String(currentPrepaid)
              if (updates.customer_type !== undefined) rollbackObj.customer_type = String(customer.customer_type || 'retail')
              
              await connector.update('customers', order.customer_id!, rollbackObj).catch(() => {})
            })
            invalidate(shopId, 'customers')
          }
        }
      } catch (err) {
        console.error('Failed to update customer CRM:', err)
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
        
        if ((it as any).variant_label && !((it as any).modifiers?.length)) {
          txt = `${i + 1}. ${it.product_name}\n   • ${(it as any).variant_label}\n   ${it.qty} x ${unitPrice}đ = ${itemTotal}đ`;
        }
        
        if ((it as any).modifiers) {
          try {
             const parsed = typeof (it as any).modifiers === 'string' ? JSON.parse((it as any).modifiers) : (it as any).modifiers;
             if (Array.isArray(parsed) && parsed.length > 0) {
               const mods = parsed.map((m: any) => m.option).join(', ');
               const modTotal = Number((it as any).modifier_total || 0);
               txt = `${i + 1}. ${it.product_name}\n   • ${mods}${modTotal > 0 ? ` (+${modTotal.toLocaleString('vi-VN')}đ)` : ''}\n   ${it.qty} x ${unitPrice}đ = ${itemTotal}đ`;
             }
          } catch {}
        }
        
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

    return NextResponse.json({ order_id: serverId, order_no: orderNo || serverId }, { status: 201 })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST orders/sync-batch')
  }
}
