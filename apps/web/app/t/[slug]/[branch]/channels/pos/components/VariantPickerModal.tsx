'use client'
import { useEffect, useState } from 'react'
import { localDb, type LocalProduct } from '@/lib/localDb/schema'
import type { CartItem } from '@/hooks/useCart'

interface Props {
  parentProduct: LocalProduct          // variant_parent product
  open: boolean
  onClose: () => void
  onSelect: (item: CartItem) => void
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

function safeJson(s?: string | null) {
  try { return s ? JSON.parse(s) : null } catch { return null }
}

export function VariantPickerModal({ parentProduct, open, onClose, onSelect }: Props) {
  const [children, setChildren] = useState<LocalProduct[]>([])
  const [inventory, setInventory] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!open) return
    localDb.products
      .filter((p) => p.parent_id === parentProduct.product_id && p.active !== false)
      .toArray()
      .then(async (kids) => {
        setChildren(kids)
        const ids = kids.map((k) => k.product_id)
        const invs = await localDb.inventory.where('product_id').anyOf(ids).toArray()
        const map = new Map<string, number>()
        for (const i of invs) map.set(i.product_id, Number(i.stock_qty || 0))
        setInventory(map)
      })
  }, [open, parentProduct.product_id])

  if (!open) return null

  function handleSelect(child: LocalProduct) {
    const opts = safeJson(child.variant_options) ?? {}
    const label = Object.entries(opts).map(([k, v]) => `${k}: ${v}`).join(' / ') || child.name

    const item: CartItem = {
      product_id: child.product_id,
      product_name: `${parentProduct.name}`,
      sku: child.sku,
      unit_price: Number(child.sell_price),
      cost_price: Number(child.cost_price),
      qty: 1,
      discount_amount: 0,
      modifier_total: 0,
      variant_label: label,
      line_total: Number(child.sell_price),
    }
    onSelect(item)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Chọn phân loại</p>
            <p className="text-sm font-bold text-slate-900">{parentProduct.name}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Variant list */}
        <div className="p-3 max-h-80 overflow-y-auto">
          {children.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">Không có phân loại nào</p>
          ) : (
            <div className="space-y-2">
              {children.map((child) => {
                const opts = safeJson(child.variant_options) ?? {}
                const label = Object.entries(opts).map(([k, v]) => `${k}: ${v}`).join(' / ') || child.name
                const stock = inventory.get(child.product_id) ?? 0
                const outOfStock = stock <= 0
                return (
                  <button
                    key={child.product_id}
                    onClick={() => {
                      if (!outOfStock) handleSelect(child)
                    }}
                    disabled={outOfStock}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-3 transition-all text-left ${outOfStock ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-primary hover:bg-slate-50 active:scale-[0.98]'}`}
                  >
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${outOfStock ? 'border-slate-300' : 'border-slate-300 group-hover:border-primary'}`}>
                    </div>
                    <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-sm font-medium ${outOfStock ? 'text-slate-500' : 'text-slate-900'}`}>{label}</span>
                      <span className={`text-sm font-semibold ${outOfStock ? 'text-slate-400' : 'text-primary'}`}>({fmtVND(child.sell_price)})</span>
                      <span className={`text-[11px] font-medium ${outOfStock ? 'text-red-500' : 'text-green-600'}`}>{outOfStock ? 'Hết hàng' : `Còn: ${stock}`}</span>
                      {child.sku && (
                        <span className="text-[11px] text-slate-400 ml-auto">{child.sku}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
