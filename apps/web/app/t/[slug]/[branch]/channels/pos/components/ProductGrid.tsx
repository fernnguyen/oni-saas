'use client'
import { useEffect, useState } from 'react'
import { localDb, type LocalCategory } from '@/lib/localDb/schema'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import type { LocalProduct } from '@/lib/localDb/schema'
import { IconBox } from '@/app/components/layout/nav'

interface Props {
  branchId: string
  inventory: Map<string, number>
  onAddToCart: (product: LocalProduct) => void
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

let _audioCtx: AudioContext | null = null
function playBeep() {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new AudioContext()
    }
    const ctx = _audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  } catch {}
}

export function ProductGrid({ branchId, inventory, onAddToCart }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [categories, setCategories] = useState<LocalCategory[]>([])

  const { results, isLoading } = usePOSProductSearch(search, categoryId)

  useEffect(() => {
    localDb.categories.filter((c) => c.active).sortBy('sort_order').then(setCategories)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-slate-100 px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm sản phẩm (tên, SKU, barcode)..."
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-[#0268FF] focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-2 py-1.5 scrollbar-hide">
          <button
            onClick={() => setCategoryId(undefined)}
            className={[
              'shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              categoryId === undefined
                ? 'bg-[#0268FF] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category_id}
              onClick={() => setCategoryId(cat.category_id)}
              className={[
                'shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                categoryId === cat.category_id
                  ? 'bg-[#0268FF] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">Đang tải...</div>
        ) : results.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            {search ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((product) => {
              const stock = inventory.get(product.product_id) ?? 0
              const outOfStock = stock <= 0
              return (
                <button
                  key={product.product_id}
                  onClick={() => {
                    if (!outOfStock) {
                      playBeep()
                      onAddToCart(product)
                    }
                  }}
                  disabled={outOfStock}
                  className={[
                    'flex flex-col rounded-xl border overflow-hidden text-left transition-all',
                    outOfStock
                      ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 bg-white hover:border-[#0268FF] hover:shadow-md active:scale-[0.98]',
                  ].join(' ')}
                >
                  {/* Image */}
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full aspect-[4/3] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center bg-slate-100">
                      <IconBox className="h-10 w-10 text-slate-300" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex flex-col px-2.5 pt-2 pb-1 gap-0.5">
                    <p className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight">
                      {product.name}
                    </p>
                    {product.sku && (
                      <p className="text-[11px] text-slate-400">{product.sku}</p>
                    )}
                    <p className={['text-xs font-medium mt-0.5', outOfStock ? 'text-red-400' : 'text-emerald-600'].join(' ')}>
                      {stock} trong kho
                    </p>
                  </div>

                  {/* Price + add button */}
                  <div className="px-2.5 pb-2.5 pt-1 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0268FF]">
                      {fmtVND(product.sell_price)}
                    </span>
                    <div className={[
                      'h-7 w-7 flex items-center justify-center rounded-full text-base font-medium transition-colors',
                      outOfStock ? 'bg-slate-100 text-slate-300' : 'bg-[#EEF4FF] text-[#0268FF]',
                    ].join(' ')}>
                      +
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
