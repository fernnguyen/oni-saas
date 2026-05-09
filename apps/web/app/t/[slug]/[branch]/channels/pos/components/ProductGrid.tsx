'use client'
import { useEffect, useState } from 'react'
import { localDb, type LocalCategory, type LocalInventory } from '@/lib/localDb/schema'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import type { LocalProduct } from '@/lib/localDb/schema'

interface Props {
  branchId: string
  onAddToCart: (product: LocalProduct) => void
}

function fmtVND(v: number) {
  return v.toLocaleString('vi-VN') + 'đ'
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
    localDb.inventory.toArray().then((rows) => {
      const map = new Map<string, number>()
      rows.forEach((r: LocalInventory) => {
        map.set(r.product_id, (map.get(r.product_id) ?? 0) + r.stock_qty)
      })
      setInventory(map)
    })
  }, [branchId])

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-slate-100 p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm sản phẩm (tên, SKU, barcode)..."
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[#0268FF] focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 p-2 scrollbar-hide">
          <button
            onClick={() => setCategoryId(undefined)}
            className={[
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
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
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((product) => {
              const stock = inventory.get(product.product_id) ?? 0
              const outOfStock = stock <= 0
              return (
                <button
                  key={product.product_id}
                  onClick={() => !outOfStock && onAddToCart(product)}
                  disabled={outOfStock}
                  className={[
                    'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
                    outOfStock
                      ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 bg-white hover:border-[#0268FF] hover:shadow-md active:scale-[0.98]',
                  ].join(' ')}
                >
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="mb-2 h-16 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="mb-2 flex h-16 w-full items-center justify-center rounded-lg bg-slate-100">
                      <span className="text-2xl">📦</span>
                    </div>
                  )}
                  <p className="line-clamp-2 text-xs font-medium text-slate-900">{product.name}</p>
                  <p className="mt-1 text-xs font-semibold text-[#0268FF]">{fmtVND(product.sell_price)}</p>
                  <p className={['mt-0.5 text-xs', outOfStock ? 'text-red-500' : 'text-slate-400'].join(' ')}>
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
