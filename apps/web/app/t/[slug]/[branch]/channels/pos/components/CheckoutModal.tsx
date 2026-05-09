'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  localDb,
  type LocalCustomer,
  type LocalOrder,
  type LocalOrderItem,
  type LocalPayment,
  type SyncQueueItem,
} from '@/lib/localDb/schema'
import { broadcastOrderCreated } from '@/lib/localDb/tabSync'
import { printBill } from '@/lib/pos/printBill'
import type { CartItem } from '@/hooks/useCart'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  items: CartItem[]
  subtotal: number
  discount_amount: number
  total: number
  note: string
  customer: LocalCustomer | null
  shopId: string
  branchId: string
  shopName: string
  employeeId: string
}

const METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'card', label: 'Thẻ' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'momo', label: 'MoMo' },
  { value: 'vnpay', label: 'VNPay' },
  { value: 'zalopay', label: 'ZaloPay' },
  { value: 'debt', label: 'Ghi nợ' },
]

interface PaymentRow {
  id: string
  method: string
  amount: string
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

function nextId() {
  return String(Date.now() + Math.random())
}

export function CheckoutModal({
  open,
  onClose,
  onSuccess,
  items,
  subtotal,
  discount_amount,
  total,
  note,
  customer,
  shopId,
  branchId,
  shopName,
  employeeId,
}: Props) {
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: nextId(), method: 'cash', amount: String(total) },
  ])
  const [saving, setSaving] = useState(false)

  // Reset payments when total changes or modal opens
  useEffect(() => {
    if (open) {
      setPayments([{ id: nextId(), method: 'cash', amount: String(total) }])
    }
  }, [open, total])

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining = total - totalPaid
  const cashRows = payments.filter((p) => p.method === 'cash')
  const cashChange = cashRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) - (total - payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))

  function updatePayment(id: string, field: 'method' | 'amount', value: string) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  function removePayment(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  function addPayment() {
    const leftover = Math.max(0, remaining)
    setPayments((prev) => [...prev, { id: nextId(), method: 'cash', amount: leftover > 0 ? String(leftover) : '' }])
  }

  function distributeRemaining() {
    setPayments((prev) => {
      if (prev.length === 0) return prev
      const othersPaid = prev.slice(0, -1).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      return prev.map((p, i) =>
        i === prev.length - 1 ? { ...p, amount: String(Math.max(0, total - othersPaid)) } : p
      )
    })
  }

  async function handleSubmit() {
    if (items.length === 0) return
    if (totalPaid < total) {
      toast.error(`Còn thiếu ${fmtVND(total - totalPaid)}`)
      return
    }

    setSaving(true)
    try {
      const local_id = crypto.randomUUID()
      const now = new Date().toISOString()

      const orderItems: LocalOrderItem[] = items.map((item) => ({
        local_id: crypto.randomUUID(),
        order_local_id: local_id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty: item.qty,
        unit_price: item.unit_price,
        cost_price: item.cost_price,
        discount_amount: item.discount_amount,
        line_total: item.line_total,
      }))

      const localPayments: LocalPayment[] = payments
        .filter((p) => parseFloat(p.amount) > 0)
        .map((p) => ({
          local_id: crypto.randomUUID(),
          order_local_id: local_id,
          method: p.method,
          amount: parseFloat(p.amount),
          reference_no: '',
          note: '',
        }))

      const actualPaid = Math.min(totalPaid, total)
      const order: LocalOrder = {
        local_id,
        sync_status: 'pending',
        customer_id: customer?.customer_id?.startsWith('virtual:') ? undefined : customer?.customer_id,
        customer_name: customer?.name,
        branch_id: branchId,
        employee_id: employeeId,
        subtotal,
        discount_amount,
        tax_amount: 0,
        total_amount: total,
        paid_amount: actualPaid,
        note,
        created_at: now,
        status: 'completed',
        items: orderItems,
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _embedded, ...orderWithoutItems } = order

      const syncItem: SyncQueueItem = {
        status: 'pending',
        entity: 'order',
        payload: {
          order: orderWithoutItems,
          items: orderItems,
          payments: localPayments,
          stockMovements: items.map((item) => ({
            type: 'sale_out',
            product_id: item.product_id,
            qty: -item.qty,
            branch_id: branchId,
            reference_no: local_id,
          })),
        },
        local_order_id: local_id,
        retry_count: 0,
        created_at: now,
      }

      await localDb.transaction(
        'rw',
        [localDb.orders, localDb.orderItems, localDb.payments, localDb.syncQueue, localDb.inventory],
        async () => {
          await localDb.orders.add(order)
          await localDb.orderItems.bulkAdd(orderItems)
          await localDb.payments.bulkAdd(localPayments)
          await localDb.syncQueue.add(syncItem)

          // Delta inventory — use put() with compound key from the record itself;
          // where().modify() can drop the transaction context between first() and modify().
          for (const item of items) {
            const inv = await localDb.inventory
              .where('product_id').equals(item.product_id)
              .first()
            if (inv) {
              await localDb.inventory.put({
                ...inv,
                stock_qty: Math.max(0, Number(inv.stock_qty) - item.qty),
              })
            }
          }
        }
      )

      broadcastOrderCreated(order)
      toast.success('Đơn hàng tạo thành công!')
      onSuccess() // close modal + clear cart first
      setTimeout(() => printBill({ order, items: orderItems, payments: localPayments, shopName }), 150)
    } catch (err) {
      console.error(err)
      toast.error('Tạo đơn thất bại')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) handleSubmit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payments, items])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Thanh toán đơn hàng</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Order summary */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {items.map((item) => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.product_name} × {item.qty}</span>
                  <span className="text-slate-900">{fmtVND(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-sm">
              {discount_amount > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Giảm giá:</span><span>−{fmtVND(discount_amount)}</span>
                </div>
              )}
              {customer && (
                <div className="flex justify-between text-slate-500">
                  <span>Khách hàng:</span><span>{customer.name}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 text-base">
                <span>Tổng cộng:</span>
                <span className="text-[#0268FF]">{fmtVND(total)}</span>
              </div>
            </div>
          </div>

          {/* Payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">PHƯƠNG THỨC THANH TOÁN</p>
              <button
                onClick={addPayment}
                className="text-xs text-[#0268FF] hover:underline"
              >
                + Thêm
              </button>
            </div>

            {payments.map((p, idx) => (
              <div key={p.id} className="flex gap-2">
                <select
                  value={p.method}
                  onChange={(e) => updatePayment(p.id, 'method', e.target.value)}
                  className="w-32 shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={p.amount}
                    onChange={(e) => updatePayment(p.id, 'amount', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm focus:border-[#0268FF] focus:outline-none"
                  />
                  {idx === payments.length - 1 && remaining > 0 && (
                    <button
                      onClick={distributeRemaining}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#0268FF] hover:underline"
                      title="Điền số tiền còn thiếu"
                    >
                      Điền
                    </button>
                  )}
                </div>
                {payments.length > 1 && (
                  <button
                    onClick={() => removePayment(p.id)}
                    className="shrink-0 rounded-lg border border-slate-200 px-2 text-slate-400 hover:border-red-200 hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {/* Summary row */}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Đã nhập:</span>
              <span className={remaining > 0 ? 'font-medium text-red-500' : 'font-medium text-green-600'}>
                {fmtVND(totalPaid)}
                {remaining > 0 && <span className="ml-2 text-xs">còn thiếu {fmtVND(remaining)}</span>}
                {remaining < 0 && cashRows.length > 0 && (
                  <span className="ml-2 text-xs text-slate-500">thối {fmtVND(Math.abs(cashChange))}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || items.length === 0 || remaining > 0}
            className="flex-1 rounded-xl bg-[#0268FF] py-2.5 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Đang xử lý...' : 'Hoàn tất · Ctrl+Enter'}
          </button>
        </div>
      </div>
    </div>
  )
}
