'use client'
import { useEffect, useState, useMemo } from 'react'
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
import { CustomerSearch } from './CustomerSearch'
import { useQuery } from '@tanstack/react-query'

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
  onCustomerChange: (c: LocalCustomer | null) => void
  shopId: string
  branchId: string
  shopName: string
  employeeId: string
  isOnline: boolean
  autoPrintReceipt: boolean
  orderId?: string
  metadata?: Record<string, any>
  orderPaidAmount?: number
  customCheckoutTime?: string
  hourlyRate?: number
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

export function fmtDateTimeVN(d: Date) {
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  const mo = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${hh}:${mm} ${dd}/${mo}`
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
  onCustomerChange,
  shopId,
  branchId,
  shopName,
  employeeId,
  isOnline,
  autoPrintReceipt,
  orderId,
  metadata,
  orderPaidAmount = 0,
  customCheckoutTime,
  hourlyRate = 0,
}: Props) {
  const [localCustomer, setLocalCustomer] = useState(customer)
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: nextId(), method: 'cash', amount: String(total - discount_amount - orderPaidAmount) },
  ])
  const [saving, setSaving] = useState(false)
  const [localNote, setLocalNote] = useState(note)
  const [localDiscount, setLocalDiscount] = useState(discount_amount)
  const [isEditingDiscount, setIsEditingDiscount] = useState(false)
  const [discountInput, setDiscountInput] = useState(String(discount_amount))
  const [localCheckoutTime, setLocalCheckoutTime] = useState('')
  const [isEditingCheckout, setIsEditingCheckout] = useState(false)
  const [checkoutInput, setCheckoutInput] = useState('')

  // Recalculate time charge when checkout time changes
  const computedItems = useMemo(() => {
    if (!metadata?.check_in || hourlyRate <= 0) return items
    const checkInDate = new Date(metadata.check_in)
    const effectiveCheckout = localCheckoutTime ? new Date(localCheckoutTime) : (customCheckoutTime ? new Date(customCheckoutTime) : new Date())
    const diffSec = Math.max(0, Math.floor((effectiveCheckout.getTime() - checkInDate.getTime()) / 1000))
    const newBillableHours = Math.ceil(diffSec / 3600)
    const newTimeCharge = newBillableHours * hourlyRate
    const h = Math.floor(diffSec / 3600)
    const m = Math.floor((diffSec % 3600) / 60)
    const durationLabel = `${h}h ${m}p`
    return items.map(item => {
      if (item.product_id === 'TIME_CHARGE') {
        return { ...item, qty: newBillableHours, line_total: newTimeCharge, product_name: `Tiền giờ sử dụng (${durationLabel})` }
      }
      return item
    })
  }, [items, localCheckoutTime, customCheckoutTime, metadata, hourlyRate])

  const computedSubtotal = computedItems.reduce((s, it) => s + (it.line_total || 0), 0)
  const finalTotal = Math.max(0, computedSubtotal - localDiscount)

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId && autoPrintReceipt,
  })

  useEffect(() => {
    if (open) {
      setLocalCustomer(customer)
      setLocalDiscount(discount_amount)
      setDiscountInput(String(discount_amount))
      const newTotal = Math.max(0, subtotal - discount_amount - orderPaidAmount)
      setPayments([{ id: nextId(), method: 'cash', amount: String(newTotal) }])
      setLocalNote(note)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // When checkout time changes → recalculate payment
  useEffect(() => {
    if (!localCheckoutTime) return
    const newRemaining = Math.max(0, finalTotal - orderPaidAmount)
    setPayments([{ id: nextId(), method: 'cash', amount: String(newRemaining) }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCheckoutTime])

  const overPaid = Math.max(0, orderPaidAmount - finalTotal)
  const remainingTotal = Math.max(0, finalTotal - orderPaidAmount)
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining = remainingTotal - totalPaid
  const cashRows = payments.filter((p) => p.method === 'cash')
  const cashChange = overPaid + cashRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) - (remainingTotal - payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))

  function updatePayment(id: string, field: 'method' | 'amount', value: string) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  function removePayment(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  function addPayment() {
    const usedMethods = new Set(payments.map((p) => p.method))
    const nextMethod = METHODS.find((m) => !usedMethods.has(m.value))
    if (!nextMethod) return
    const leftover = Math.max(0, remaining)
    setPayments((prev) => [...prev, { id: nextId(), method: nextMethod.value, amount: leftover > 0 ? String(leftover) : '' }])
  }

  function distributeRemaining() {
    setPayments((prev) => {
      if (prev.length === 0) return prev
      const othersPaid = prev.slice(0, -1).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      return prev.map((p, i) =>
        i === prev.length - 1 ? { ...p, amount: String(Math.max(0, remainingTotal - othersPaid)) } : p
      )
    })
  }

  function applyDiscount() {
    let d = parseFloat(discountInput.replace(/,/g, ''))
    if (isNaN(d)) d = 0
    if (d > subtotal) d = subtotal
    setLocalDiscount(d)
    setDiscountInput(String(d))
    setIsEditingDiscount(false)
    const newTotal = Math.max(0, subtotal - d)
    setPayments([{ id: nextId(), method: 'cash', amount: String(newTotal) }])
  }

  async function handleSubmit() {
    if (items.length === 0) return
    if (totalPaid < remainingTotal) {
      toast.error(`Còn thiếu ${fmtVND(remainingTotal - totalPaid)}`)
      return
    }

    const hasDebt = payments.some((p) => p.method === 'debt' && parseFloat(p.amount) > 0)
    if (hasDebt && !localCustomer) {
      toast.error('Phương thức Ghi nợ yêu cầu phải chọn Khách hàng')
      return
    }

    setSaving(true)
    try {
      const debtAmount = payments
        .filter((p) => p.method === 'debt')
        .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const actualPaid = Math.max(0, finalTotal - debtAmount)

      const local_id = crypto.randomUUID()
      const now = new Date().toISOString()

      const orderItems: LocalOrderItem[] = computedItems.map((item) => ({
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

      if (cashChange > 0) {
        localPayments.push({
          local_id: crypto.randomUUID(),
          order_local_id: local_id,
          method: 'cash',
          amount: -cashChange,
          reference_no: '',
          note: 'Tiền thừa trả khách',
        })
      }

      const order: LocalOrder = {
        local_id,
        sync_status: 'pending',
        customer_id: localCustomer?.customer_id?.startsWith('virtual:') ? undefined : localCustomer?.customer_id,
        customer_name: localCustomer?.name,
        branch_id: branchId,
        employee_id: employeeId,
        subtotal: computedSubtotal,
        discount_amount: localDiscount,
        tax_amount: 0,
        total_amount: finalTotal,
        paid_amount: actualPaid,
        debt_amount: debtAmount,
        note: localNote,
        created_at: now,
        status: 'completed',
        print_count: autoPrintReceipt ? 1 : 0,
        items: orderItems,
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _embedded, ...orderWithoutItems } = order

      const orderData: any = { ...orderWithoutItems }
      if (metadata) {
        orderData.metadata = JSON.stringify({
          ...metadata,
          checkout_time: localCheckoutTime || customCheckoutTime || new Date().toISOString()
        })
      }

      const syncPayload = {
        order: orderData,
        items: orderItems,
        payments: localPayments,
        stockMovements: computedItems.map((item) => ({
          type: 'sale_out',
          product_id: item.product_id,
          qty: -item.qty,
          branch_id: branchId,
          reference_no: local_id,
        })).filter(m => m.product_id !== 'TIME_CHARGE'),
        customer: localCustomer ? { name: localCustomer.name, phone: localCustomer.phone } : undefined,
      }

      let isSuccessDirect = false
      let serverId = undefined
      let serverOrderNo = undefined

      if (isOnline) {
        try {
          const res = await fetch(`/api/shops/${shopId}/orders/sync-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              local_order_id: local_id,
              server_order_id: orderId,
              ...syncPayload,
              stock_movements: syncPayload.stockMovements // API expects stock_movements, local payload expects stockMovements
            }),
          })
          if (res.ok) {
            const data = await res.json()
            isSuccessDirect = true
            serverId = data.order_id
            serverOrderNo = data.order_no
          }
        } catch (e) {
          console.error('Direct sync failed, falling back to queue:', e)
        }
      }

      if (isSuccessDirect) {
        order.sync_status = 'done'
        order.server_id = serverId
        order.order_no = serverOrderNo
      } else {
        order.sync_status = 'pending'
      }

      const syncItem: SyncQueueItem = {
        status: 'pending',
        entity: 'order',
        payload: syncPayload,
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
          
          if (!isSuccessDirect) {
            await localDb.syncQueue.add(syncItem)
          }

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
      toast.success(isSuccessDirect ? 'Tạo mới đơn hàng thành công!' : 'Tạo mới đơn hàng thành công (chờ đồng bộ)')
      onSuccess() // close modal + clear cart first
      if (autoPrintReceipt) {
        setTimeout(async () => {
          await printBill({ 
            order, 
            items: orderItems, 
            payments: localPayments, 
            shopName, 
            settings, 
            printCount: 1,
            shopId
          })
        }, 150)
      }
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

      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Thanh toán đơn hàng</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Customer */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">KHÁCH HÀNG</p>
              <p className="text-xs text-slate-600 font-medium">
                {localCustomer ? (
                  <>
                    {localCustomer.name}
                    {localCustomer.phone && <span className="text-slate-400 font-normal ml-1">({localCustomer.phone})</span>}
                  </>
                ) : (
                  'Khách lẻ'
                )}
              </p>
            </div>
            <CustomerSearch selected={localCustomer} onSelect={setLocalCustomer} />
          </div>

          {/* Resource Info */}
          {metadata?.check_in && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-sm space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Giờ vào:</span>
                <span className="font-medium text-slate-900">{fmtDateTimeVN(new Date(metadata.check_in))}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-slate-600">{localCheckoutTime || customCheckoutTime ? 'Giờ ra:' : 'Giờ ra (Hiện tại):'}</span>
                {isEditingCheckout ? (
                  <div className="flex items-center gap-2">
                    <input 
                      type="datetime-local" 
                      value={checkoutInput}
                      onChange={e => setCheckoutInput(e.target.value)}
                      className="text-xs border border-slate-300 rounded px-1 py-0.5 outline-none"
                    />
                    <button onClick={() => { 
                      const checkInDate = new Date(metadata.check_in)
                      const selectedDate = new Date(checkoutInput)
                      if (selectedDate < checkInDate) {
                        import('sonner').then(({ toast }) => toast.error('Giờ ra không được nhỏ hơn giờ vào!'))
                        return
                      }
                      setLocalCheckoutTime(checkoutInput)
                      setIsEditingCheckout(false)
                    }} className="text-primary font-bold">OK</button>
                  </div>
                ) : (
                  <button onClick={() => { 
                    setCheckoutInput(localCheckoutTime || customCheckoutTime || new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); 
                    setIsEditingCheckout(true); 
                  }} className="font-medium text-slate-900 border-b border-dotted border-slate-400 hover:text-primary transition-colors cursor-pointer">
                    {localCheckoutTime || customCheckoutTime ? fmtDateTimeVN(new Date(localCheckoutTime || customCheckoutTime)) : fmtDateTimeVN(new Date())}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Order summary */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {computedItems.map((item, idx) => (
                <div key={`${item.product_id}-${idx}`} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.product_name} × {item.qty}</span>
                  <span className="text-slate-900">{fmtVND(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-2 border-t border-slate-200 pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Giảm giá:</span>
                {isEditingDiscount ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyDiscount()
                        if (e.key === 'Escape') setIsEditingDiscount(false)
                      }}
                      className="w-24 text-right border-b border-slate-300 outline-none text-slate-800 bg-transparent font-medium"
                    />
                    <button onClick={applyDiscount} className="text-primary text-xs font-semibold">OK</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingDiscount(true)}
                    className="font-medium text-slate-800 border-b border-dotted border-slate-400 hover:text-primary transition-colors cursor-pointer"
                  >
                    {localDiscount > 0 ? `-${fmtVND(localDiscount)}` : '0đ'}
                  </button>
                )}
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-base border-t border-dashed border-slate-200 pt-2">
                <span>Tổng cộng:</span>
                <span className={orderPaidAmount > 0 ? "text-slate-900" : "text-primary"}>{fmtVND(finalTotal)}</span>
              </div>
              {orderPaidAmount > 0 && (
                <div className="flex justify-between font-medium text-slate-600 text-sm mt-1">
                  <span>Đã thu:</span>
                  <span className="text-green-600">-{fmtVND(orderPaidAmount)}</span>
                </div>
              )}
              {overPaid > 0 && (
                <div className="flex justify-between font-bold text-red-600 text-sm mt-1 border-t border-red-100 pt-1">
                  <span>Tiền thừa trả khách:</span>
                  <span>{fmtVND(overPaid)}</span>
                </div>
              )}
              {orderPaidAmount > 0 && overPaid === 0 && (
                <div className="flex justify-between font-bold text-slate-700 text-sm border-t border-slate-200 pt-2 mt-2">
                  <span>Cần thanh toán:</span>
                  <span className="text-primary">{fmtVND(remainingTotal)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <input
            type="text"
            value={localNote}
            onChange={(e) => setLocalNote(e.target.value)}
            placeholder="Ghi chú đơn hàng..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
          />

          {/* Payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">PHƯƠNG THỨC THANH TOÁN</p>
              <button
                onClick={addPayment}
                disabled={payments.length >= METHODS.length}
                className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Thêm
              </button>
            </div>

            {payments.map((p, idx) => (
              <div key={p.id} className="flex gap-2">
                <select
                  value={p.method}
                  onChange={(e) => updatePayment(p.id, 'method', e.target.value)}
                  className="w-32 shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {METHODS.filter(
                    (m) => m.value === p.method || !payments.some((other) => other.id !== p.id && other.method === m.value)
                  ).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={p.amount ? Number(String(p.amount).replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      updatePayment(p.id, 'amount', val)
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm focus:border-primary focus:outline-none"
                  />
                  {idx === payments.length - 1 && remaining > 0 && (
                    <button
                      onClick={distributeRemaining}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline"
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

            {/* Summary rows */}
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Số tiền nhận:</span>
                <span className={remaining > 0 ? 'font-medium text-red-500' : 'font-medium text-green-600'}>
                  {fmtVND(totalPaid)}
                  {remaining > 0 && (
                    <span className="ml-2 text-xs">còn thiếu {fmtVND(remaining)}</span>
                  )}
                </span>
              </div>
              {remaining < 0 && cashRows.length > 0 && cashChange > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-500">Trả lại tiền thừa:</span>
                  <span className="font-semibold text-red-500">{fmtVND(cashChange)}</span>
                </div>
              )}
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Đang xử lý...' : 'Hoàn tất · Ctrl+Enter'}
          </button>
        </div>
      </div>
    </div>
  )
}
