export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { cashbookCreateSchema } from '@/lib/validators/cashbook'
import { RollbackContext } from '@oni/adapters'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { updateCustomerStats } from '@/lib/server/customerStats'
import { getGMT7Time } from '@oni/core'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const type = searchParams.get('type')
    const branch_id = searchParams.get('branch_id')
    const reference_id = searchParams.get('reference_id')
    const fund_id = searchParams.get('fund_id')
    const from_date = searchParams.get('from_date')
    const to_date = searchParams.get('to_date')
    const search = searchParams.get('search')
    const is_virtual_query = searchParams.get('is_virtual') // 'TRUE' | 'FALSE' | 'all'
    const department_id = searchParams.get('department_id')

    // --- TÍNH TOÁN SỐ DƯ ĐỘNG (Đầu kỳ, phát sinh, cuối kỳ) ---
    // 1. Lấy tất cả tài khoản quỹ để tính tổng initial_balance
    const fundsRes = await connector.list('payment-funds', {
      filters: branch_id ? { branch_id } : {},
      limit: 100
    })
    const funds = (fundsRes.data as Record<string, string>[]).filter(f => !fund_id || f.id === fund_id)
    const totalInitialBalance = funds.reduce((sum, f) => sum + parseFloat(f.initial_balance || '0'), 0)

    // 2. Lấy toàn bộ lịch sử giao dịch để tính toán lũy kế và lọc
    const allCbRes = await connector.list('cashbook', {
      filters: branch_id ? { branch_id } : {},
      limit: 100000 // Tối đa 100k dòng để tính toán chính xác
    })
    const allTransactions = allCbRes.data as Record<string, string>[]

    // Lọc theo quỹ được chọn
    const filteredTransactions = allTransactions.filter(tx => !fund_id || tx.fund_id === fund_id)

    let opening_balance = totalInitialBalance
    let total_receipt = 0
    let total_payment = 0

    const fromTime = from_date ? new Date(from_date + 'T00:00:00').getTime() : 0
    const toTime = to_date ? new Date(to_date + 'T23:59:59.999').getTime() : Infinity

    for (const tx of filteredTransactions) {
      if (tx.is_virtual === 'TRUE') continue;
      const txTime = new Date(tx.created_at || '').getTime()
      const amount = parseFloat(tx.amount || '0')

      if (txTime < fromTime) {
        if (tx.type === 'receipt') {
          opening_balance += amount
        } else if (tx.type === 'payment') {
          opening_balance -= amount
        }
      } else if (txTime >= fromTime && txTime <= toTime) {
        if (tx.type === 'receipt') {
          total_receipt += amount
        } else if (tx.type === 'payment') {
          total_payment += amount
        }
      }
    }

    const closing_balance = opening_balance + total_receipt - total_payment

    // Lọc và phân trang danh sách hiển thị khớp với khoảng thời gian và các bộ lọc khác
    const searchLower = search ? search.toLowerCase() : ''
    const finalTransactions = filteredTransactions.filter(tx => {
      const txTime = new Date(tx.created_at || '').getTime()
      const inDateRange = txTime >= fromTime && txTime <= toTime
      
      const matchesType = !type || tx.type === type
      const matchesReference = !reference_id || tx.reference_id === reference_id
      
      const matchesSearch = !searchLower || 
        (tx.transaction_id || '').toLowerCase().includes(searchLower) ||
        (tx.note || '').toLowerCase().includes(searchLower) ||
        (tx.reference_name || '').toLowerCase().includes(searchLower)
        
      let matchesVirtual = true;
      if (is_virtual_query === 'TRUE') {
        matchesVirtual = tx.is_virtual === 'TRUE';
      } else if (is_virtual_query === 'all') {
        matchesVirtual = true;
      } else {
        matchesVirtual = tx.is_virtual !== 'TRUE';
      }

      const matchesDept = !department_id || tx.department_id === department_id;

      return inDateRange && matchesType && matchesReference && matchesSearch && matchesVirtual && matchesDept
    })

    // Sắp xếp các giao dịch theo thời gian giảm dần (mới nhất lên đầu)
    const sortedTransactions = [...finalTransactions].sort((a, b) => {
      const timeA = new Date(a.created_at || '').getTime()
      const timeB = new Date(b.created_at || '').getTime()
      return timeB - timeA
    })

    const total = sortedTransactions.length
    const paginatedData = sortedTransactions.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      data: paginatedData,
      total,
      page,
      limit,
      opening_balance: String(opening_balance),
      total_receipt: String(total_receipt),
      total_payment: String(total_payment),
      closing_balance: String(closing_balance)
    })
  } catch (e) {
    return handleApiError(e, 'GET cashbook')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId } = await params
    const { connector, user, shop, permissions } = await requireShopAccess(shopId, 'cashbook.manage')
    tx = new RollbackContext()

    const body = await req.json()
    const payload = cashbookCreateSchema.parse(body)
    const branchId = payload.branch_id || shopId

    // --- KIỂM TRA CA LÀM VIỆC (SHIFT MANAGEMENT) ---
    const admin = getSupabaseAdminClient()
    const { data: settings } = await admin
      .from('shop_settings')
      .select('enable_shift_management')
      .eq('shop_id', shopId)
      .maybeSingle()

    const isShiftEnabled = settings?.enable_shift_management ?? false
    let activeShift: Record<string, string> | null = null

    if (isShiftEnabled) {
      const isBypassShift = permissions.includes('cashbook.shift.manage')

      if (!isBypassShift) {
        const userEmail = user.email || ''
        
        const shiftsRes = await connector.list('shop-shifts', {
          filters: { branch_id: branchId, user_id: userEmail, status: 'open' },
          limit: 1
        })
        
        if (shiftsRes.total === 0) {
          return NextResponse.json(
            { error: 'Yêu cầu mở ca làm việc: Vui lòng mở ca làm việc tại POS trước khi thực hiện thu/chi!' },
            { status: 400 }
          )
        }
        activeShift = shiftsRes.data[0]
      }
    }

    // --- XỬ LÝ QUỸ THANH TOÁN (FUND) ---
    let selectedFundId = payload.fund_id

    // Nếu không truyền fund_id, tìm quỹ mặc định
    if (!selectedFundId) {
      const fundsRes = await connector.list('payment-funds', {
        filters: { branch_id: branchId },
        limit: 100
      })
      const funds = fundsRes.data as Record<string, string>[]
      const defaultFund = funds.find(f => f.is_default === 'TRUE') || funds[0]

      if (defaultFund) {
        selectedFundId = defaultFund.id
      } else {
        // Phòng vệ chiều sâu: Nếu chưa có bất kỳ quỹ nào, tự động tạo 1 quỹ tiền mặt mặc định
        const newDefaultFund = await connector.create('payment-funds', {
          branch_id: branchId,
          name: 'Quỹ tiền mặt mặc định',
          type: 'cash',
          initial_balance: '0',
          current_balance: '0',
          is_default: 'TRUE',
          active: 'TRUE',
        })
        selectedFundId = newDefaultFund.id
      }
    }

    // Lấy thông tin quỹ hiện tại để cập nhật số dư
    const fund = await connector.findById('payment-funds', selectedFundId!)
    if (!fund) throw new Error('Không tìm thấy tài khoản quỹ thanh toán')

    const currentFundBalance = parseFloat(fund.current_balance || '0')
    const amountFloat = payload.amount
    let newFundBalance = currentFundBalance

    if (payload.type === 'receipt') {
      newFundBalance = currentFundBalance + amountFloat
    } else if (payload.type === 'payment') {
      newFundBalance = currentFundBalance - amountFloat
    }

    // Cập nhật số dư tài khoản quỹ
    await connector.update('payment-funds', selectedFundId!, {
      current_balance: String(newFundBalance)
    })
    tx.add(async () => {
      await connector.update('payment-funds', selectedFundId!, {
        current_balance: String(currentFundBalance)
      }).catch(() => {})
    })

    // --- TẠO PHIẾU THU/CHI ---
    const createdCb = await connector.create('cashbook', {
      type: payload.type,
      amount: String(payload.amount),
      method: payload.method,
      category: payload.category,
      reference_id: payload.reference_id ?? '',
      reference_name: payload.reference_name ?? '',
      note: payload.note ?? '',
      branch_id: branchId,
      employee_id: payload.employee_id ?? user.email ?? '',
      fund_id: selectedFundId!,
      balance_after_transaction: String(newFundBalance),
      department_id: payload.department_id ?? '',
      is_virtual: 'FALSE',
    })
    tx.add(async () => {
      await connector.delete('cashbook', (createdCb as any).transaction_id || (createdCb as any).id).catch(() => {})
    })

    const parentId = (createdCb as any).transaction_id || (createdCb as any).id;

    // --- XỬ LÝ PHÂN BỔ CHI PHÍ DÙNG CHUNG ---
    if (payload.apply_allocation) {
      let rules: Array<{ department_id: string; percentage: number }> = [];

      if (payload.custom_rules && payload.custom_rules.length > 0) {
        rules = payload.custom_rules;
      } else if (payload.allocation_template_id) {
        const template = await connector.findById('cost-allocation-templates', payload.allocation_template_id);
        if (template) {
          const rawRules = template.rules;
          if (typeof rawRules === 'string') {
            try { rules = JSON.parse(rawRules); } catch (e) { console.error('Failed to parse rules:', e); }
          } else if (Array.isArray(rawRules)) {
            rules = rawRules as any;
          }
        }
      }

      if (rules.length > 0) {
        for (const rule of rules) {
          const allocatedAmount = Math.round((payload.amount * rule.percentage) / 100);
          if (allocatedAmount > 0) {
            const virtualCb = await connector.create('cashbook', {
              type: payload.type,
              amount: String(allocatedAmount),
              method: payload.method,
              category: payload.category,
              reference_id: payload.reference_id ?? '',
              reference_name: payload.reference_name ?? '',
              note: `${payload.note ?? ''} (Phân bổ ${rule.percentage}% cho ${rule.department_id})`,
              branch_id: branchId,
              employee_id: payload.employee_id ?? user.email ?? '',
              fund_id: selectedFundId!,
              balance_after_transaction: String(newFundBalance),
              department_id: rule.department_id,
              parent_transaction_id: parentId,
              is_virtual: 'TRUE',
            });
            tx.add(async () => {
              await connector.delete('cashbook', (virtualCb as any).transaction_id || (virtualCb as any).id).catch(() => {});
            });
          }
        }
      }
    }

    // Cập nhật expected_closing_cash của ca nếu giao dịch bằng tiền mặt
    if (isShiftEnabled && activeShift && (payload.method === 'cash' || payload.method?.startsWith('cash-'))) {
      const currentExpected = parseFloat(activeShift.expected_closing_cash || '0')
      const amountFloat = payload.amount
      let newExpected = currentExpected

      if (payload.type === 'receipt') {
        newExpected = currentExpected + amountFloat
      } else if (payload.type === 'payment') {
        newExpected = currentExpected - amountFloat
      }

      await connector.update('shop-shifts', activeShift.id, {
        expected_closing_cash: String(newExpected)
      })
      tx.add(async () => {
        await connector.update('shop-shifts', activeShift.id!, {
          expected_closing_cash: String(currentExpected)
        }).catch(() => {})
      })
    }

    // If this is a debt collection, reduce customer debt
    if (payload.category === 'debt_collection' && payload.reference_id) {
      const targetBranch = branchId || shopId
      const statsRes = await connector.list('customer-branch-stats', {
        filters: { customer_id: payload.reference_id, branch_id: targetBranch }
      })
      const stats = statsRes.data[0]
      const customer = await connector.findById('customers', payload.reference_id)
      const currentDebt = parseFloat(stats?.debt_amount ?? customer?.debt_amount ?? '0') || 0

      if (currentDebt <= 0) {
        return NextResponse.json(
          { error: 'Khách hàng hiện không có nợ cần thu!' },
          { status: 400 }
        )
      }

      if (payload.amount > currentDebt) {
        return NextResponse.json(
          { error: `Số tiền thu nợ (${payload.amount.toLocaleString('vi-VN')}đ) không được vượt quá dư nợ hiện tại (${currentDebt.toLocaleString('vi-VN')}đ)!` },
          { status: 400 }
        )
      }

      const newDebt = Math.max(0, currentDebt - payload.amount)
      await updateCustomerStats(connector, payload.reference_id, targetBranch, {
        debt_amount: String(newDebt)
      }, tx)

      // ── GẠCH NỢ THEO HÓA ĐƠN ──
      let remaining = payload.amount

      if (payload.order_allocations && payload.order_allocations.length > 0) {
        // Mode: Per-order — apply to specific selected orders (FIFO within selection)
        for (const alloc of payload.order_allocations) {
          if (remaining <= 0) break
          const order = await connector.findById('orders', alloc.order_id)
          if (!order) continue
          
          const orderDebt = parseFloat(order.debt_amount || '0')
          if (orderDebt <= 0) continue
          
          const applied = Math.min(remaining, orderDebt, alloc.amount)
          const newOrderDebt = Math.max(0, orderDebt - applied)
          const newPaid = parseFloat(order.paid_amount || '0') + applied
          
          const orderUpdates: Record<string, any> = {
            debt_amount: String(newOrderDebt),
            paid_amount: String(newPaid),
          }
          
          // If order is fully paid, update payment_method from 'debt' to actual method
          if (newOrderDebt === 0 && (order.payment_method === 'debt' || order.payment_method?.startsWith('debt-'))) {
            orderUpdates.payment_method = payload.method
          }
          
          await connector.update('orders', alloc.order_id, orderUpdates)
          tx.add(async () => {
            await connector.update('orders', alloc.order_id, {
              debt_amount: String(orderDebt),
              paid_amount: order.paid_amount,
              payment_method: order.payment_method,
            }).catch(() => {})
          })

          const paymentId = `DEBT-${alloc.order_id.slice(-6)}-${Date.now()}`
          const isMobile = payload.note && payload.note.includes('(Mobile:');
          const payRecord = await connector.create('payments', {
            id: paymentId,
            order_id: alloc.order_id,
            order_no: order.order_no || '',
            method: payload.method,
            amount: String(applied),
            reference_no: parentId,
            note: `Thu nợ qua sổ quỹ #${parentId}${isMobile ? ' (Mobile)' : ''}`,
            paid_at: getGMT7Time(),
          })
          tx.add(async () => {
            await connector.delete('payments', payRecord.id || payRecord.payment_id).catch(() => {})
          })
          
          remaining -= applied
        }
      }

      // Fallback: Mode Basic/FIFO auto OR left-over remaining amount from conflict
      if (remaining > 0) {
        const debtOrdersRes = await connector.list('orders', {
          filters: { customer_id: payload.reference_id },
          limit: 5000
        })
        const unpaidOrders = debtOrdersRes.data
          .filter((o: Record<string, string>) => parseFloat(o.debt_amount || '0') > 0 && o.is_return !== 'TRUE' && o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'refunded')
          .sort((a: Record<string, string>, b: Record<string, string>) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        
        if (unpaidOrders.length > 0) {
          for (const order of unpaidOrders) {
            if (remaining <= 0) break
            const orderDebt = parseFloat(order.debt_amount || '0')
            const applied = Math.min(remaining, orderDebt)
            const newOrderDebt = Math.max(0, orderDebt - applied)
            const newPaid = parseFloat(order.paid_amount || '0') + applied
            
            const orderUpdates: Record<string, any> = {
              debt_amount: String(newOrderDebt),
              paid_amount: String(newPaid),
            }
            
            if (newOrderDebt === 0 && (order.payment_method === 'debt' || order.payment_method?.startsWith('debt-'))) {
              orderUpdates.payment_method = payload.method
            }
            
            await connector.update('orders', order.id, orderUpdates)
            tx.add(async () => {
              await connector.update('orders', order.id, {
                debt_amount: String(orderDebt),
                paid_amount: order.paid_amount,
                payment_method: order.payment_method,
              }).catch(() => {})
            })

            // Create payment record for this order (audit trail)
            const paymentId = `DEBT-${order.id.slice(-6)}-${Date.now()}`
            const isMobile = payload.note && payload.note.includes('(Mobile:');
            const payRecord = await connector.create('payments', {
              id: paymentId,
              order_id: order.id,
              order_no: order.order_no || '',
              method: payload.method,
              amount: String(applied),
              reference_no: parentId,
              note: `Thu nợ tự động (FIFO) qua sổ quỹ #${parentId}${isMobile ? ' (Mobile)' : ''}`,
              paid_at: getGMT7Time(),
            })
            tx.add(async () => {
              await connector.delete('payments', payRecord.id || payRecord.payment_id).catch(() => {})
            })
            
            remaining -= applied
          }
        }
      }
      invalidate(shopId, 'orders')
      invalidate(shopId, 'payments')
      invalidate(shopId, 'customers')
    }

    // If this is a debt payment, reduce supplier debt
    if (payload.category === 'debt_payment' && payload.reference_id) {
      const supplier = await connector.findById('suppliers', payload.reference_id)
      if (supplier) {
        const currentDebt = parseFloat((supplier.debt_amount as string) || '0')
        const newDebt = Math.max(0, currentDebt - payload.amount)
        await connector.update('suppliers', payload.reference_id, {
          debt_amount: String(newDebt)
        })
        tx.add(async () => {
          await connector.update('suppliers', payload.reference_id!, { debt_amount: String(currentDebt) }).catch(() => {})
        })
        invalidate(shopId, 'suppliers')
      }
    }

    invalidate(shopId, 'cashbook')
    invalidate(shopId, 'payment-funds')
    return NextResponse.json(createdCb, { status: 201 })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST cashbook')
  }
}
