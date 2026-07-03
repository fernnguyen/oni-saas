import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface ItemEditModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (unitPrice: number, discountAmount: number) => void
  item: {
    product_name: string
    qty: number
    unit_price: number
    discount_amount: number
  } | null
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

export function ItemEditModal({ open, onClose, onConfirm, item }: ItemEditModalProps) {
  const [unitPrice, setUnitPrice] = useState('')
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountPct, setDiscountPct] = useState('')
  const [discountAmt, setDiscountAmt] = useState('')

  useEffect(() => {
    if (open && item) {
      setUnitPrice(String(item.unit_price))
      setDiscountMode('amount')
      setDiscountAmt(item.discount_amount > 0 ? String(item.discount_amount) : '')
      setDiscountPct('')
    } else {
      setUnitPrice('')
      setDiscountAmt('')
      setDiscountPct('')
    }
  }, [open, item])

  if (!open || !item) return null

  const currentPrice = Number(unitPrice) || 0
  
  // Calculate effective discount amount
  let effectiveDiscount = 0
  if (discountMode === 'amount') {
    effectiveDiscount = Number(discountAmt) || 0
  } else {
    const pct = Number(discountPct) || 0
    effectiveDiscount = Math.round(currentPrice * (pct / 100))
  }

  // Ensure discount does not exceed unit price
  effectiveDiscount = Math.min(effectiveDiscount, currentPrice)

  const lineTotal = Math.max(0, currentPrice - effectiveDiscount) * item.qty

  const handleConfirm = () => {
    if (currentPrice < 0) {
      toast.error('Giá bán không hợp lệ')
      return
    }
    if (effectiveDiscount < 0 || effectiveDiscount > currentPrice) {
      toast.error('Mức giảm giá không hợp lệ')
      return
    }
    onConfirm(currentPrice, effectiveDiscount)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Điều chỉnh giá & Giảm giá</h2>
            <p className="text-sm text-slate-500 truncate mt-1">
              {item.product_name} <span className="font-semibold text-slate-700">(x{item.qty})</span>
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1 overflow-y-auto">
          {/* Unit Price */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 block">Giá bán trực tiếp</label>
            <div className="relative">
              <input
                type="text"
                value={unitPrice ? Number(unitPrice).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '')
                  setUnitPrice(raw)
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-right text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-white font-medium shadow-sm"
                placeholder="Nhập giá bán mới"
              />
              <span className="absolute left-3 top-3 text-slate-400 text-sm">VNĐ</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Thay đổi giá bán trực tiếp trên đơn này.</p>
          </div>

          {/* Item Discount */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 block">Giảm giá món</label>
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-xl border border-slate-200 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setDiscountMode('amount')}
                  className={['px-3 py-2 transition-colors', discountMode === 'amount' ? 'bg-slate-100 text-primary' : 'bg-white text-slate-600 hover:bg-slate-50'].join(' ')}
                >
                  VNĐ
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountMode('percent')}
                  className={['px-3 py-2 border-l border-slate-200 transition-colors', discountMode === 'percent' ? 'bg-slate-100 text-primary' : 'bg-white text-slate-600 hover:bg-slate-50'].join(' ')}
                >
                  %
                </button>
              </div>
              <div className="flex-1 relative">
                {discountMode === 'amount' ? (
                  <input
                    type="text"
                    value={discountAmt ? Number(discountAmt).toLocaleString('vi-VN') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '')
                      setDiscountAmt(raw)
                    }}
                    className="w-full h-full rounded-xl border border-slate-200 px-3 text-right text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    placeholder="0"
                  />
                ) : (
                  <input
                    type="text"
                    value={discountPct}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '')
                      if (Number(raw) <= 100) setDiscountPct(raw)
                    }}
                    className="w-full h-full rounded-xl border border-slate-200 px-3 text-right text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    placeholder="0"
                  />
                )}
              </div>
            </div>
            {effectiveDiscount > 0 && (
              <p className="text-xs text-orange-600 text-right font-medium">
                − {fmtVND(effectiveDiscount)} / món
              </p>
            )}
          </div>

          {/* Calculation Summary */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Đơn giá sau giảm:</span>
              <span>{fmtVND(currentPrice - effectiveDiscount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 mt-2">
              <span>Thành tiền ({item.qty}):</span>
              <span className="text-primary text-lg">{fmtVND(lineTotal)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 shrink-0">
          <button className="flex-1 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" onClick={onClose}>
            Bỏ qua
          </button>
          <button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-dark transition-colors" onClick={handleConfirm}>
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  )
}
