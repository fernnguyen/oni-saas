'use client'
import type { CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { CustomerSearch } from './CustomerSearch'

interface Props {
  items: CartItem[]
  subtotal: number
  discount_amount: number
  total: number
  note: string
  customer: LocalCustomer | null
  onCustomerChange: (c: LocalCustomer | null) => void
  onQtyChange: (product_id: string, qty: number) => void
  onRemove: (product_id: string) => void
  onDiscountChange: (discount: number) => void
  onNoteChange: (note: string) => void
  onCheckout: () => void
  disabled?: boolean
}

function fmtVND(v: number) {
  return v.toLocaleString('vi-VN') + 'đ'
}

export function CartPanel({
  items,
  subtotal,
  discount_amount,
  total,
  note,
  customer,
  onCustomerChange,
  onQtyChange,
  onRemove,
  onDiscountChange,
  onNoteChange,
  onCheckout,
  disabled,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Customer */}
      <div className="border-b border-slate-100 p-3">
        <p className="mb-1.5 text-xs font-medium text-slate-500">KHÁCH HÀNG</p>
        <CustomerSearch selected={customer} onSelect={onCustomerChange} />
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-slate-400">
            <span className="text-3xl">🛒</span>
            <p className="text-sm">Chưa có sản phẩm</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.product_name}</p>
                  <p className="text-xs text-slate-500">{fmtVND(item.unit_price)} / đv</p>
                </div>
                {/* Qty controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onQtyChange(item.product_id, item.qty - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={item.qty}
                    min={1}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) onQtyChange(item.product_id, v)
                    }}
                    className="h-6 w-10 rounded-lg border border-slate-200 text-center text-sm focus:border-[#0268FF] focus:outline-none"
                  />
                  <button
                    onClick={() => onQtyChange(item.product_id, item.qty + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-semibold text-slate-900">
                  {fmtVND(item.line_total)}
                </span>
                <button
                  onClick={() => onRemove(item.product_id)}
                  className="text-slate-300 hover:text-red-400"
                  aria-label="Xóa"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t border-slate-100 p-3 space-y-2">
        {/* Note */}
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Ghi chú đơn hàng..."
          className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-[#0268FF] focus:outline-none"
        />

        {/* Discount */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Giảm giá đơn:</span>
          <input
            type="number"
            value={discount_amount || ''}
            min={0}
            onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm focus:border-[#0268FF] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Tạm tính:</span>
          <span>{fmtVND(subtotal)}</span>
        </div>

        {discount_amount > 0 && (
          <div className="flex items-center justify-between text-sm text-orange-600">
            <span>Giảm:</span>
            <span>−{fmtVND(discount_amount)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-base font-bold text-slate-900">
          <span>Tổng cộng:</span>
          <span className="text-[#0268FF]">{fmtVND(total)}</span>
        </div>

        <button
          onClick={onCheckout}
          disabled={items.length === 0 || disabled}
          className="w-full rounded-xl bg-[#0268FF] py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Thanh toán
        </button>
      </div>
    </div>
  )
}
