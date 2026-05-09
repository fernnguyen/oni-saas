'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { localDb, type LocalCategory, type LocalInventory } from '@/lib/localDb/schema'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import type { LocalProduct } from '@/lib/localDb/schema'

interface Props {
  branchId: string
  onAddToCart: (product: LocalProduct) => void
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

export function ProductGrid({ branchId, onAddToCart }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [categories, setCategories] = useState<LocalCategory[]>([])
  const [inventory, setInventory] = useState<Map<string, number>>(new Map())

  const { results, isLoading } = usePOSProductSearch(search, categoryId)

  useEffect(() => {
    localDb.categories.filter((c) => c.active).sortBy('sort_order').then(setCategories)
  }, [])

  useEffect(() => {
    const sub = liveQuery(() => localDb.inventory.toArray()).subscribe({
      next: (rows: LocalInventory[]) => {
        const map = new Map<string, number>()
        rows.forEach((r) => {
          map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.stock_qty))
        })
        setInventory(map)
      },
      error: () => {},
    })
    return () => sub.unsubscribe()
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
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">Đang tải...</div>
        ) : results.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            {search ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((product) => {
              const stock = inventory.get(product.product_id) ?? 0
              const outOfStock = stock <= 0
              return (
                <button
                  key={product.product_id}
                  onClick={() => !outOfStock && onAddToCart(product)}
                  disabled={outOfStock}
                  className={[
                    'flex flex-col items-start rounded-lg border p-2 text-left transition-all',
                    outOfStock
                      ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 bg-white hover:border-[#0268FF] hover:shadow-sm active:scale-[0.98]',
                  ].join(' ')}
                >
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="mb-1.5 h-12 w-full rounded object-cover"
                    />
                  ) : (
                    <div className="mb-1.5 flex h-12 w-full items-center justify-center rounded bg-slate-100">
                      <span className="text-xl">📦</span>
                    </div>
                  )}
                  <p className="line-clamp-2 text-xs font-medium leading-tight text-slate-900">{product.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#0268FF]">{fmtVND(product.sell_price)}</p>
                  <p className={['mt-0.5 text-[10px]', outOfStock ? 'text-red-500' : 'text-slate-400'].join(' ')}>
                    Kho: {stock}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
