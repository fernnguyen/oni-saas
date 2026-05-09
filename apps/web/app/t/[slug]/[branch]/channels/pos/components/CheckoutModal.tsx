'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { localDb, type LocalCustomer, type LocalOrder, type LocalOrderItem, type LocalPayment, type SyncQueueItem } from '@/lib/localDb/schema'
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

function fmtVND(v: number) {
  return v.toLocaleString('vi-VN') + 'đ'
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
  const [method, setMethod] = useState('cash')
  const [paid, setPaid] = useState('')
  const [saving, setSaving] = useState(false)

  const paidAmount = Number(paid) || total
  const change = method === 'cash' ? Math.max(0, paidAmount - total) : 0

  async function handleSubmit() {
    if (items.length === 0) return
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

      const actualPaid = Math.min(paidAmount, total)
      const payments: LocalPayment[] = [
        {
          local_id: crypto.randomUUID(),
          order_local_id: local_id,
          method,
          amount: actualPaid,
          reference_no: '',
          note: '',
        },
      ]

      const order: LocalOrder = {
        local_id,
        sync_status: 'pending',
        customer_id: customer?.customer_id,
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
      const { items: _embeddedItems, ...orderWithoutItems } = order

      const syncItem: SyncQueueItem = {
        status: 'pending',
        entity: 'order',
        payload: {
          order: orderWithoutItems,
          items: orderItems,
          payments,
          stockMovements: items.map((item) => ({
            type: 'sale',
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
          await localDb.payments.bulkAdd(payments)
          await localDb.syncQueue.add(syncItem)

          // Delta inventory
          await Promise.all(
            items.map(async (item) => {
              const inv = await localDb.inventory
                .where('[product_id+branch_id]')
                .equals([item.product_id, branchId])
                .first()
              if (inv) {
                await localDb.inventory
                  .where('[product_id+branch_id]')
                  .equals([item.product_id, branchId])
                  .modify({ stock_qty: Math.max(0, inv.stock_qty - item.qty) })
              }
            })
          )
        }
      )

      broadcastOrderCreated(order)
      toast.success('Đơn hàng đã được tạo!')

      printBill({ order, items: orderItems, payments, shopName })

      onSuccess()
      setPaid('')
      setMethod('cash')
    } catch (err) {
      console.error(err)
      toast.error('Tạo đơn thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Thanh toán</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Order summary */}
        <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
          {items.map((item) => (
            <div key={item.product_id} className="flex justify-between py-0.5">
              <span className="text-slate-600">
                {item.product_name} × {item.qty}
              </span>
              <span className="text-slate-900">{fmtVND(item.line_total)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-200 pt-2">
            {discount_amount > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>Giảm giá:</span>
                <span>−{fmtVND(discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900">
              <span>Tổng cộng:</span>
              <span className="text-[#0268FF]">{fmtVND(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-slate-500">PHƯƠNG THỨC</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  method === m.value
                    ? 'bg-[#0268FF] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paid amount (cash only) */}
        {method === 'cash' && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-slate-500">KHÁCH ĐƯA</p>
            <input
              type="number"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder={String(total)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
            />
            {change > 0 && (
              <p className="mt-1 text-sm text-green-600 font-medium">
                Tiền thối: {fmtVND(change)}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || items.length === 0}
            className="flex-1 rounded-xl bg-[#0268FF] py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Đang xử lý...' : 'Hoàn tất'}
          </button>
        </div>
      </div>
    </div>
  )
}
