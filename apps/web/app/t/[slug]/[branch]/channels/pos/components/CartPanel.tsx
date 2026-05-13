'use client'
import { useEffect, useState } from 'react'
import type { CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { CustomerSearch } from './CustomerSearch'
import { IconClipboard, IconWarehouse, IconTrash } from '@/app/components/layout/nav'

interface Props {
  items: CartItem[]
  inventory?: Map<string, number>
  subtotal: number
  discount_amount: number
  total: number
  note: string
  customer: LocalCustomer | null
  heldCount: number
  onCustomerChange: (c: LocalCustomer | null) => void
  onQtyChange: (product_id: string, qty: number) => void
  onRemove: (product_id: string) => void
  onDiscountChange: (discount: number) => void
  onNoteChange: (note: string) => void
  onHold: () => void
  onCheckout: () => void
  onClearCart: () => void
  disabled?: boolean
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

const DISCOUNT_PRESETS = [5, 10, 20, 50]

export function CartPanel({
  items,
  inventory,
  subtotal,
  discount_amount,
  total,
  note,
  customer,
  heldCount,
  onCustomerChange,
  onQtyChange,
  onRemove,
  onDiscountChange,
  onNoteChange,
  onHold,
  onCheckout,
  onClearCart,
  disabled,
}: Props) {
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountPct, setDiscountPct] = useState('')

  // Recalculate discount when subtotal changes (percent mode only)
  useEffect(() => {
    if (discountMode !== 'percent') return
    const pct = parseFloat(discountPct)
    if (!isNaN(pct) && pct > 0) {
      onDiscountChange(Math.round(subtotal * pct / 100))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal])

  function handlePctChange(pct: string) {
    setDiscountPct(pct)
    const p = parseFloat(pct)
    if (!isNaN(p) && p >= 0 && p <= 100) {
      onDiscountChange(Math.round(subtotal * p / 100))
    }
  }

  function applyPreset(pct: number) {
    setDiscountMode('percent')
    setDiscountPct(String(pct))
    onDiscountChange(Math.round(subtotal * pct / 100))
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Customer */}
      <div className="border-b border-slate-100 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">KHÁCH HÀNG</p>
          <p className="text-xs text-slate-400">
            {customer ? customer.name : 'Khách lẻ'}
          </p>
        </div>
        <CustomerSearch selected={customer} onSelect={onCustomerChange} />
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <IconWarehouse className="h-12 w-12" />
            <p className="text-sm">Chọn sản phẩm để bắt đầu</p>
            {heldCount > 0 && (
              <p className="text-xs text-primary">{heldCount} đơn đang giữ</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map((item) => {
              const stock = inventory?.get(item.product_id)
              const atMax = stock !== undefined && item.qty >= stock
              return (
                <div key={item.product_id} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 leading-tight">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-slate-400">{fmtVND(item.unit_price)}/đv</p>
                    </div>
                    <button
                      onClick={() => onRemove(item.product_id)}
                      className="mt-0.5 shrink-0 text-slate-300 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    {/* Qty controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onQtyChange(item.product_id, item.qty - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-sm text-slate-600 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={item.qty}
                        min={1}
                        max={stock ?? undefined}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v) && v > 0) onQtyChange(item.product_id, v)
                        }}
                        className={[
                          'h-6 w-10 rounded border text-center text-sm focus:outline-none',
                          atMax
                            ? 'border-orange-300 text-orange-600 focus:border-orange-400'
                            : 'border-slate-200 focus:border-primary',
                        ].join(' ')}
                      />
                      <button
                        onClick={() => onQtyChange(item.product_id, item.qty + 1)}
                        disabled={atMax}
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded border text-sm transition-colors',
                          atMax
                            ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-100',
                        ].join(' ')}
                      >
                        +
                      </button>
                      {atMax && (
                        <span className="ml-0.5 text-[10px] font-semibold text-orange-500">
                          Tối đa
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {fmtVND(item.line_total)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 p-3 space-y-2.5">
        {/* Note */}
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Ghi chú đơn hàng..."
          className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
        />

        {/* Discount section */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            {/* Preset buttons */}
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-xs text-slate-500">Giảm:</span>
              {DISCOUNT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => applyPreset(pct)}
                  className={[
                    'rounded px-2 py-0.5 text-xs transition-colors',
                    discountMode === 'percent' && discountPct === String(pct)
                      ? 'bg-orange-100 text-orange-700 font-medium'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {pct}%
                </button>
              ))}
              <button
                onClick={() => { setDiscountMode('amount'); setDiscountPct(''); onDiscountChange(0) }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600"
              >
                Xóa
              </button>
            </div>

            {/* Mode toggle + input */}
            <div className="flex gap-1.5">
              <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
                <button
                  onClick={() => { setDiscountMode('amount'); setDiscountPct('') }}
                  className={['px-2 py-1', discountMode === 'amount' ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'].join(' ')}
                >
                  VNĐ
                </button>
                <button
                  onClick={() => setDiscountMode('percent')}
                  className={['px-2 py-1 border-l border-slate-200', discountMode === 'percent' ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'].join(' ')}
                >
                  %
                </button>
              </div>
              {discountMode === 'amount' ? (
                <input
                  type="number"
                  value={discount_amount || ''}
                  min={0}
                  max={subtotal}
                  onChange={(e) => onDiscountChange(Math.min(Number(e.target.value) || 0, subtotal))}
                  placeholder="0"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
                />
              ) : (
                <input
                  type="number"
                  value={discountPct}
                  min={0}
                  max={100}
                  onChange={(e) => handlePctChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
                />
              )}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Tạm tính ({items.length} sp):</span>
            <span>{fmtVND(subtotal)}</span>
          </div>
          {discount_amount > 0 && (
            <div className="flex items-center justify-between text-sm text-orange-600">
              <span>Giảm giá:</span>
              <span>−{fmtVND(discount_amount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-bold text-slate-900">
            <span>Tổng cộng:</span>
            <span className="text-lg text-primary">{fmtVND(total)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={onHold}
              title="Giữ đơn — lưu tạm để làm đơn khác"
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <IconClipboard className="h-4 w-4 shrink-0" />
              {heldCount > 0 && (
                <span className="min-w-[16px] rounded-full bg-orange-100 px-1 text-center text-xs font-semibold text-orange-600">
                  {heldCount}
                </span>
              )}
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={onClearCart}
              title="Xóa toàn bộ giỏ hàng"
              className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onCheckout}
            disabled={items.length === 0 || disabled}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {total > 0 ? `Thanh toán ${fmtVND(total)}` : 'Thanh toán'}
          </button>
        </div>
      </div>
    </div>
  )
}
