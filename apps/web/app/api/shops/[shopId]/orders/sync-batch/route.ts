import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { RollbackContext } from '@oni/adapters'
import crypto from 'crypto'
import { updateCustomerStats } from '@/lib/server/customerStats'
import { getSystemTaxGroupsCached } from '@/app/api/tax-groups/route'

const INBOUND_TYPES = ['purchase_in', 'p2p_purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

import { getGMT7Time, isTimeChargeProduct } from '@oni/core'

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
  original_price?: number
  discount_amount: number
  discount_pct?: number
  line_total: number
  // ── Variant / Modifier context (Sprint 1) ────────────────────────────────
  variant_label?: string    // "Size L" — denormalized, for bill display
  modifiers?: string        // JSON string: [{group, option, price_adj}]
  modifier_total?: number   // Sum of price_adj (default 0)
  // ── Unit Conversion ──────────────────────────────────────────────
  unit_id?: string
  unit_name?: string
  conversion_rate?: number
  tax_rate?: string
  tax_amount?: number
  tax_group?: string
  tax_vat_rate?: string
  tax_pit_rate?: string
}

interface SyncPayment {
  id?: string
  method: string
  amount: number
  reference_no?: string
  note?: string
  fund_id?: string
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
  channel?: string
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
  payment_method?: string
  shift_id?: string
  created_at?: string
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

    const { checkFeatureAccess } = await import('@/lib/server/features')
    const hasCrmAccess = await checkFeatureAccess(shop.tenant_id, 'crm')

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

    const { local_order_id, server_order_id, order, items, payments, stock_movements: rawStockMovements } = body

    let systemTaxGroups = await getSystemTaxGroupsCached().catch(() => [])
    if (!systemTaxGroups || systemTaxGroups.length === 0) {
      systemTaxGroups = [
        { id: '1', code: 'phan_phoi', name: 'Phân phối, cung cấp hàng hóa', vat_rate: 1.0, pit_rate: 0.5, active: true },
        { id: '2', code: 'dich_vu', name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', vat_rate: 5.0, pit_rate: 2.0, active: true },
        { id: '3', code: 'san_xuat', name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', vat_rate: 3.0, pit_rate: 1.5, active: true },
        { id: '4', code: 'khac', name: 'Hoạt động kinh doanh khác', vat_rate: 2.0, pit_rate: 1.0, active: true }
      ]
    }

    // --- KIỂM TRA KHÓA SỔ THUẾ (TAX LOCKDOWN) ---
    const { isDateLocked } = await import('@/lib/server/taxLock')
    const orderDate = order.created_at || getGMT7Time()
    if (await isDateLocked(connector, shopId, orderDate)) {
      return NextResponse.json(
        { error: 'Kỳ thuế của ngày này đã bị khóa sổ. Không thể tạo hoặc đồng bộ đơn hàng!' },
        { status: 400 }
      )
    }

    // Filter out time charge products / non-inventory items from stock movements
    const stock_movements = (rawStockMovements || []).filter((mv: any) => {
      const matchingItem = items.find(it => it.product_id === mv.product_id)
      return !isTimeChargeProduct(mv.product_id, matchingItem?.product_name)
    })

    // ── Step 1: Find or create order ──
    let serverId = server_order_id ?? ''
    let orderNo = ''

    if (serverId) {
      let actualOrder = null
      try {
        actualOrder = await connector.findById('orders', serverId)
      } catch (e) {
        // Ignore syntax errors for ID format if serverId is actually a local ID
      }

      if (actualOrder) {
        // It's a valid order_id!
        orderNo = (actualOrder as Record<string, string>).order_no || ''
      } else {
        // It might be a local ID sent as server_order_id. Let's try to find it by reference_no.
        const matched = await connector.list('orders', {
          page: 1, limit: 1,
          filters: { reference_no: serverId },
        })
        if (matched.data.length > 0) {
          serverId = (matched.data[0] as Record<string, string>).order_id
          orderNo = (matched.data[0] as Record<string, string>).order_no || ''
        } else {
          // If neither order_id nor reference_no matched, it doesn't exist on server.
          serverId = ''
        }
      }
    }

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
    const isRetailGuest = !order.customer_name || ['khách lẻ', 'khach le', 'khách mua lẻ', 'khach mua le'].includes(order.customer_name.trim().toLowerCase());
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

    // Determine the consolidated payment method
    let paymentMethod = order.payment_method
    if (!paymentMethod) {
      if (payments && payments.length > 0) {
        if (payments.length === 1) {
          paymentMethod = payments[0].method
        } else {
          const uniqueMethods = Array.from(new Set(payments.map(p => p.method).filter(Boolean)))
          paymentMethod = uniqueMethods.join(', ').substring(0, 50)
        }
      } else {
        paymentMethod = 'cash'
      }
    }

    // Tra cứu ca đang mở của nhân viên nếu shift_id không được truyền lên (ví dụ Checkout từ Web POS)
    let resolvedShiftId = order.shift_id || ''
    if (!resolvedShiftId && order.branch_id && order.employee_id) {
      try {
        const shiftsRes = await connector.list('shop-shifts', {
          filters: { branch_id: order.branch_id, user_id: order.employee_id, status: 'open' },
          limit: 1
        })
        if (shiftsRes.total > 0) {
          resolvedShiftId = (shiftsRes.data[0] as Record<string, string>).id || ''
        }
      } catch (err) {
        console.warn('Lỗi tự động tra cứu ca làm việc trong sync-batch:', err)
      }
    }

    if (!serverId) {
      isNewOrder = true
      
      const { enforceLimit } = await import('@/lib/server/planLimits')
      await enforceLimit('max_orders_per_month', { tenantId: shop.tenant_id }, shop.tenant_id)
      
      const createData: Record<string, string> = {
        status:          order.status,
        channel:         order.channel ?? 'pos',
        customer_id:     finalCustomerId,
        customer_name:   order.customer_name ?? '',
        branch_id:       order.branch_id     ?? '',
        employee_id:     order.employee_id   ?? '',
        subtotal:        String(order.subtotal),
        discount_amount: String(order.discount_amount),
        tax_amount:      String(order.tax_amount),
        total_amount:    String(order.total_amount),
        paid_amount:     String(
          payments && payments.length > 0
            ? payments.reduce((sum, p) => p.method !== 'debt' && !p.method?.startsWith('debt-') ? sum + Number(p.amount) : sum, 0)
            : order.paid_amount
        ),
        debt_amount:     String(
          payments && payments.length > 0
            ? Math.max(0, Number(order.total_amount) - payments.reduce((sum, p) => p.method !== 'debt' && !p.method?.startsWith('debt-') ? sum + Number(p.amount) : sum, 0))
            : (order.debt_amount ?? 0)
        ),
        points_earned:   String(order.points_earned ?? 0),
        points_redeemed: String(order.points_redeemed ?? 0),
        note:            order.note ?? '',
        payment_method:  paymentMethod ?? 'cash',
        reference_no:    local_order_id ?? '',
        shift_id:        resolvedShiftId,
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
        paid_amount:     String(
          payments && payments.length > 0
            ? payments.reduce((sum, p) => p.method !== 'debt' && !p.method?.startsWith('debt-') ? sum + Number(p.amount) : sum, 0)
            : order.paid_amount
        ),
        debt_amount:     String(
          payments && payments.length > 0
            ? Math.max(0, Number(order.total_amount) - payments.reduce((sum, p) => p.method !== 'debt' && !p.method?.startsWith('debt-') ? sum + Number(p.amount) : sum, 0))
            : (order.debt_amount ?? 0)
        ),
        points_earned:   String(order.points_earned ?? 0),
        points_redeemed: String(order.points_redeemed ?? 0),
        note:            order.note ?? '',
        payment_method:  paymentMethod ?? 'cash',
      }
      if (local_order_id) {
        updateData.reference_no = local_order_id
      }
      if (resolvedShiftId) {
        updateData.shift_id = resolvedShiftId
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

      // Fallback calculations for missing tax fields
      let taxRate: string = it.tax_rate || '0'
      let taxGroup: string = it.tax_group || ''
      let taxAmount: number = it.tax_amount || 0

      if (!taxRate || !taxGroup) {
        try {
          const product = await connector.findById('products', it.product_id)
          if (product) {
            taxRate = taxRate || product.tax_rate || '0'
            taxGroup = taxGroup || product.tax_group || ''
          }
          if (product && product.category_id && (!taxRate || !taxGroup)) {
            const category = await connector.findById('categories', product.category_id)
            if (category) {
              taxRate = taxRate || category.tax_rate || '0'
              taxGroup = taxGroup || category.tax_group || ''
            }
          }
        } catch (err) {
          console.error('Failed to resolve fallback tax configuration for sync item:', err)
        }
      }

      taxRate = taxRate || '0'
      taxGroup = taxGroup || ''

      if (taxAmount === undefined || taxAmount === null || taxAmount === 0 || String(taxAmount) === '0') {
        const rateVal = parseFloat(taxRate) || 0
        const totalVal = parseFloat(String(it.line_total)) || 0
        taxAmount = (totalVal * rateVal) / 100
      }

      // Resolve tax_vat_rate and tax_pit_rate snapshots
      let taxVatRate = (it.tax_vat_rate !== undefined && it.tax_vat_rate !== null) ? String(it.tax_vat_rate) : undefined
      let taxPitRate = (it.tax_pit_rate !== undefined && it.tax_pit_rate !== null) ? String(it.tax_pit_rate) : undefined

      if (taxGroup && (taxVatRate === undefined || taxPitRate === undefined)) {
        try {
          const matchedGroup = systemTaxGroups.find(
            (g: any) =>
              g.code === taxGroup ||
              g.name === taxGroup ||
              (taxGroup === 'Phân phối, cung cấp hàng hóa' && g.code === 'phan_phoi') ||
              (taxGroup === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu' && g.code === 'dich_vu') ||
              (taxGroup === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu' && g.code === 'san_xuat') ||
              (taxGroup === 'Hoạt động kinh doanh khác' && g.code === 'khac')
          )
          if (matchedGroup) {
            taxGroup = matchedGroup.code // Normalize to code
            taxVatRate = String(matchedGroup.vat_rate)
            taxPitRate = String(matchedGroup.pit_rate)
          }
        } catch (e) {
          console.error('Failed to resolve sync-batch tax group snapshots:', e)
        }
      }

      taxVatRate = taxVatRate && taxVatRate !== 'null' ? taxVatRate : '0'
      taxPitRate = taxPitRate && taxPitRate !== 'null' ? taxPitRate : '0'

      itemsToCreate.push({
        order_id:       serverId,
        order_no:       orderNo,
        line_no:        String(i + 1),
        product_id:     it.product_id,
        sku:            it.sku ?? '',
        product_name:   it.product_name,
        qty:            String(it.qty),
        unit_price:     String(it.unit_price),
        original_price: String(it.original_price ?? it.unit_price),
        line_discount:  String(it.discount_amount),
        tax_rate:       String(taxRate),
        tax_amount:     String(taxAmount),
        tax_group:      taxGroup,
        tax_vat_rate:   taxVatRate,
        tax_pit_rate:   taxPitRate,
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
    // Query existing payments only if we have a valid server-side order ID.
    // If serverId is empty at this point (brand-new order), there are no existing payments yet.
    const existingPayIds = new Set<string>()
    if (serverId) {
      const existingPays = await connector.list('payments', {
        page: 1, limit: 100,
        filters: { order_id: serverId },
      })
      ;(existingPays.data as Record<string, string>[]).forEach((r) => {
        if (r.payment_id) existingPayIds.add(r.payment_id)
        if (r.id) existingPayIds.add(r.id)
      })
    }

    // Fetch and resolve default payment funds for this branch
    // NOTE: do NOT add branch_id to filters here — the connector already scopes by branchId.
    // Adding it again causes double-filter which can return 0 rows even when funds exist.
    const branchId = order.branch_id ?? ''
    const fundsRes = await connector.list('payment-funds', { limit: 200 })
    let funds = fundsRes.data as Record<string, string>[]

    // Self-healing: auto-seed only missing fund types — never overwrite existing ones.
    // Check per type so a retry can't create duplicates.
    if (branchId) {
      const hasCash   = funds.some(f => f.type === 'cash')
      const hasBank   = funds.some(f => f.type === 'bank')
      const hasWallet = funds.some(f => f.type === 'wallet')
      const anyMissing = !hasCash || !hasBank || !hasWallet

      if (anyMissing) {
        const newFunds: Record<string, string>[] = []

        if (!hasCash) {
          const f = await connector.create('payment-funds', {
            branch_id: branchId,
            name: 'Quỹ tiền mặt tại quầy',
            type: 'cash',
            account_number: '',
            bank_name: '',
            initial_balance: '0',
            current_balance: '0',
            is_default: 'FALSE',
            active: 'TRUE',
          }) as Record<string, string>
          newFunds.push(f)
        }

        if (!hasBank) {
          const f = await connector.create('payment-funds', {
            branch_id: branchId,
            name: 'Tài khoản ngân hàng mặc định',
            type: 'bank',
            account_number: '',
            bank_name: '',
            initial_balance: '0',
            current_balance: '0',
            is_default: 'FALSE',
            active: 'TRUE',
          }) as Record<string, string>
          newFunds.push(f)
        }

        if (!hasWallet) {
          const f = await connector.create('payment-funds', {
            branch_id: branchId,
            name: 'Ví điện tử (Momo, ZaloPay...)',
            type: 'wallet',
            account_number: '',
            bank_name: '',
            initial_balance: '0',
            current_balance: '0',
            is_default: 'FALSE',
            active: 'TRUE',
          }) as Record<string, string>
          newFunds.push(f)
        }

        if (newFunds.length > 0) {
          funds = [...funds, ...newFunds]
          invalidate(shopId, 'payment-funds')
        }
      }
    }

    const defaultCashFund = funds.find(f => f.type === 'cash' && f.is_default === 'TRUE') || funds.find(f => f.type === 'cash')
    const defaultBankFund = funds.find(f => f.type === 'bank' && f.is_default === 'TRUE') || funds.find(f => f.type === 'bank')
    const defaultWalletFund = funds.find(f => f.type === 'wallet' && f.is_default === 'TRUE') || funds.find(f => f.type === 'wallet')
    const fallbackFund = funds.find(f => f.is_default === 'TRUE') || funds[0]

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

      if (pay.method !== 'debt' && !pay.method?.startsWith('debt-')) {
        const isRefund = Number(pay.amount) < 0
        const amount = Math.abs(Number(pay.amount))
        
        // Find matching payment fund (either explicit fund_id from client, or smart matching by type)
        const targetFund = pay.fund_id
          ? (funds.find(f => f.id === pay.fund_id) || fallbackFund)
          : (pay.method === 'cash' || pay.method?.startsWith('cash-')
              ? (defaultCashFund || fallbackFund)
              : (['momo', 'zalopay', 'vnpay', 'wallet'].includes(pay.method) || pay.method?.startsWith('momo-') || pay.method?.startsWith('zalopay-') || pay.method?.startsWith('vnpay-') || pay.method?.startsWith('prepaid-')
                  ? (defaultWalletFund || defaultBankFund || defaultCashFund || fallbackFund)
                  : (defaultBankFund || defaultCashFund || fallbackFund)))

        let fundId = ''
        let balanceAfter = ''

        if (targetFund) {
          fundId = targetFund.id
          const currentBalance = parseFloat(targetFund.current_balance || '0')
          const nextBalance = isRefund ? currentBalance - amount : currentBalance + amount
          balanceAfter = String(nextBalance)

          // Update local memory balance in case of multiple transactions in same batch
          const oldBalance = targetFund.current_balance || '0'
          targetFund.current_balance = balanceAfter

          // Update fund balance in the database
          await connector.update('payment-funds', targetFund.id, {
            current_balance: balanceAfter
          })

          // Register transaction rollback to restore original balance if error occurs
          tx.add(async () => {
            await connector.update('payment-funds', targetFund!.id, {
              current_balance: oldBalance
            }).catch(() => {})
          })
        }

        cashbookToCreate.push({
          type:           isRefund ? 'expense' : 'receipt',
          amount:         String(amount),
          method:         pay.method,
          category:       isRefund ? 'refund' : 'sales',
          reference_id:   serverId,
          reference_name: order.customer_name ?? '',
          note:           isRefund ? `Hoàn tiền thừa đơn hàng ${orderNo || serverId}` : `Thanh toán đơn hàng ${orderNo || serverId}`,
          employee_id:    order.employee_id ?? '',
          branch_id:      order.branch_id ?? '',
          fund_id:        fundId,
          balance_after_transaction: balanceAfter,
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

    // Resolve standard warehouse IDs for multi-warehouse routing
    const whList = await connector.list('warehouses', { limit: 100 })
    const whs = whList.data as any[]

    let saleWhId = whs.find(w => w.type === 'sale')?.id
    let supplyWhId = whs.find(w => w.type === 'supply')?.id

    // Self-healing: auto-seed standard warehouses on-the-fly if missing
    if (!saleWhId && branchId) {
      const newWh = await connector.create('warehouses', {
        branch_id: branchId,
        name: 'Kho Kinh doanh (Bán lẻ)',
        type: 'sale',
        active: 'TRUE'
      })
      saleWhId = newWh.id
    }
    if (!supplyWhId && branchId) {
      const newWh = await connector.create('warehouses', {
        branch_id: branchId,
        name: 'Kho Vật tư & Tiêu hao',
        type: 'supply',
        active: 'TRUE'
      })
      supplyWhId = newWh.id
    }

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
              warehouse_id: supplyWhId || '', // Decapitate raw materials strictly from WH-SUPPLY
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
          warehouse_id: saleWhId || '', // Decapitate finished commercial goods strictly from WH-SALE
          reference_no: movRef,
          created_at:   getGMT7Time(),
        })
      }
    }

    if (movsToCreate.length > 0) {
      const createdMovs = await connector.batchCreate('stock-movements', movsToCreate)
      tx.add(async () => {
        for (const mov of createdMovs) {
          await connector.delete('stock-movements', mov.movement_id || mov.id).catch(() => {})
        }
      })

      // Update current stock quantities in the inventory table
      for (const mov of createdMovs) {
        const qtyToDeduct = Math.abs(parseFloat(mov.qty || '0'))
        if (qtyToDeduct === 0) continue

        const pid = mov.product_id
        const targetBranchId = mov.branch_id ?? branchId
        const sku = mov.sku ?? ''
        const targetWhId = mov.warehouse_id || saleWhId || ''

        // Query existing inventory for this product and resolved warehouse
        const invListResult = await connector.list('inventory', {
          page: 1, limit: 10,
          filters: { product_id: pid, warehouse_id: targetWhId }
        })
        const allInv = invListResult.data as Record<string, string>[]
        let invRow = allInv.find(i => i.branch_id === targetBranchId) || allInv[0]

        // Self-healing: if no inventory record is found in this specific warehouse, but a legacy 'default' or empty warehouse record exists, upgrade it dynamically on the fly
        if (!invRow && targetWhId) {
          const legacyInvRes = await connector.list('inventory', {
            page: 1, limit: 10,
            filters: { product_id: pid }
          })
          const legacyInvs = legacyInvRes.data as Record<string, string>[]
          const legacyRow = legacyInvs.find(i => !i.warehouse_id || i.warehouse_id === '' || i.warehouse_id === 'default')
          if (legacyRow) {
            console.log(`[SELF-HEALING] Dynamically upgrading inventory row ${legacyRow.id || (legacyRow as any).inventory_id} to warehouse ${targetWhId}`)
            const legacyRowId = legacyRow.id || (legacyRow as any).inventory_id
            await connector.update('inventory', legacyRowId, {
              warehouse_id: targetWhId
            })
            invRow = { ...legacyRow, warehouse_id: targetWhId }
          }
        }

        if (invRow) {
          const oldQty = parseFloat(invRow.stock_qty || '0')
          const newQty = oldQty - qtyToDeduct
          await connector.update('inventory', (invRow.inventory_id || invRow.id) as string, {
            stock_qty: String(newQty)
          })
          tx.add(async () => {
            await connector.update('inventory', (invRow!.inventory_id || invRow!.id) as string, { stock_qty: String(oldQty) }).catch(() => {})
          })
        } else {
          // Create a new inventory record in the resolved warehouse with negative stock
          const createdInv = await connector.create('inventory', {
            product_id: pid,
            branch_id: targetBranchId || '',
            warehouse_id: targetWhId,
            stock_qty: String(-qtyToDeduct),
            min_stock: '0',
            sku: sku || ''
          } as Record<string, string>)
          tx.add(async () => {
            await connector.delete('inventory', (createdInv as any).inventory_id || (createdInv as any).id).catch(() => {})
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
          const targetBranch = branchId || shopId
          const statsRes = await connector.list('customer-branch-stats', {
            filters: { customer_id: order.customer_id, branch_id: targetBranch }
          })
          const stats = statsRes.data[0]
          
          // 1. Debt amount
          const currentDebt = parseFloat(stats?.debt_amount ?? customer.debt_amount ?? '0')
          if (order.debt_amount && Number(order.debt_amount) > 0) {
            const newDebt = currentDebt + Number(order.debt_amount)
            updates.debt_amount = String(newDebt)
          }

          // 2. Loyalty points (Tích điểm & Tiêu điểm)
          const currentPoints = parseFloat(stats?.loyalty_points ?? customer.loyalty_points ?? '0')
          const earned = hasCrmAccess ? Number(order.points_earned || 0) : 0
          const redeemed = hasCrmAccess ? Number(order.points_redeemed || 0) : 0
          if (earned > 0 || redeemed > 0) {
            const newPoints = Math.max(0, currentPoints + earned - redeemed)
            updates.loyalty_points = String(newPoints)
          }

          // 3. Prepaid balance
          const currentPrepaid = parseFloat(stats?.prepaid_balance ?? customer.prepaid_balance ?? '0')
          const prepaidSpent = payments
            .filter((p) => p.method === 'prepaid' || p.method?.startsWith('prepaid-'))
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
          const currentType = (customer.customer_type || 'retail').trim()

          // Exclude manual segments (wholesale, staff, vip) and check if CRM is enabled globally
          const isLegacyGroup = ['wholesale', 'staff', 'vip'].includes(currentType.toLowerCase())
          const crmEnabled = settings.loyalty_points_enabled !== false && hasCrmAccess

          if (crmEnabled && !isLegacyGroup) {
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

            // --- NEVER DOWNGRADE & UPGRADE-ONLY POLICY ---
            // If they are currently at retail, they can be upgraded to any tier.
            // If they are currently at a tier, they can ONLY be upgraded to a tier with a HIGHER threshold.
            if (newType !== currentType) {
              let shouldUpdate = false

              if (currentType.toLowerCase() === 'retail') {
                shouldUpdate = true
              } else {
                // Find threshold of current tier
                const currentTierObj = dynamicTiers.find(t => t.name.toLowerCase() === currentType.toLowerCase())
                const newTierObj = dynamicTiers.find(t => t.name.toLowerCase() === newType.toLowerCase())
                
                if (currentTierObj && newTierObj) {
                  // Upgrade only: new tier threshold must be strictly greater than current tier threshold
                  if (Number(newTierObj.threshold) > Number(currentTierObj.threshold)) {
                    shouldUpdate = true
                  }
                } else if (!currentTierObj && newTierObj) {
                  // If current tier is some custom string but not in list, allow setting newType if it's not retail
                  if (newType !== 'retail') {
                    shouldUpdate = true
                  }
                }
              }

              if (shouldUpdate) {
                updates.customer_type = newType
              }
            }
          }

          // Apply updates to both customers table and customer-branch-stats
          if (Object.keys(updates).length > 0) {
            await updateCustomerStats(connector, order.customer_id, branchId || shopId, updates, tx)
            invalidate(shopId, 'customers')
          }
        }
      } catch (err) {
        console.error('Failed to update customer CRM:', err)
      }
    }

    // --- Auto Release Table Logic ---
    if (order.status === 'completed' && order.metadata) {
      try {
        const metaObj = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata
        const resourceId = metaObj?.resource_id
        if (resourceId && !resourceId.startsWith('takeaway')) {
          const resource = await connector.findById('location-resources', resourceId)
          if (resource) {
            const currentOrderId = resource.current_order_id
            if (!currentOrderId || currentOrderId === serverId || currentOrderId === local_order_id) {
              const releaseStatus = settings?.skip_cleaning_process ? 'available' : 'dirty'
              const currentMeta = typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : (resource.metadata || {})
              await connector.update('location-resources', resourceId, {
                status: releaseStatus,
                current_order_id: '',
                metadata: JSON.stringify({ ...currentMeta, last_checkout_time: new Date().toISOString() })
              })
              invalidate(shopId, 'location-resources')
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-release location resource:', err)
      }
    }

    // --- Auto Occupy Table Logic ---
    if (order.status === 'in_progress' && order.metadata) {
      try {
        const metaObj = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata
        const resourceId = metaObj?.resource_id
        if (resourceId && !resourceId.startsWith('takeaway')) {
          const resource = await connector.findById('location-resources', resourceId)
          if (resource) {
            const checkInVal = metaObj.check_in || getGMT7Time()
            await connector.update('location-resources', resourceId, {
              status: 'occupied',
              current_order_id: serverId,
              metadata: JSON.stringify({
                ...typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : (resource.metadata || {}),
                check_in: checkInVal,
                guests_list: metaObj.guests_list || [],
                num_guests: metaObj.num_guests || 1,
                rental_type: metaObj.rental_type || 'hourly',
              })
            })
            invalidate(shopId, 'location-resources')
          }
        }
      } catch (err) {
        console.error('Failed to auto-occupy location resource:', err)
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
      const path = `/${shop.slug}/orders?search=${orderNo || serverId}`;
      dispatchNotification(shop.tenant_id, shopId, 'ORDER_CREATED', {
        title: `📦 Đơn hàng mới (POS) - ${shop.name}`,
        message,
        url: path,
        data: {
          order_id: serverId,
          order_no: orderNo || serverId
        }
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
