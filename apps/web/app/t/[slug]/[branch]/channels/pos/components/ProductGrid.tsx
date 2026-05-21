'use client'
import { useEffect, useState, useRef } from 'react'
import { localDb, type LocalCategory, type LocalProduct } from '@/lib/localDb/schema'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import { IconBox } from '@/app/components/layout/nav'
import type { CartItem } from '@/hooks/useCart'
import { VariantPickerModal } from './VariantPickerModal'
import { ModifierPickerModal } from './ModifierPickerModal'

interface Props {
  branchId: string
  inventory: Map<string, number>
  mutePosSound: boolean
  onAddToCart: (product: LocalProduct) => void
  onAddToCartWithOptions: (item: CartItem) => void
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

let _beep: HTMLAudioElement | null = null
function playBeep() {
  try {
    if (!_beep) _beep = new Audio('/beep.wav')
    _beep.currentTime = 0
    _beep.play().catch(() => {})
  } catch {}
}

export function ProductGrid({ branchId, inventory, mutePosSound, onAddToCart, onAddToCartWithOptions }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [categories, setCategories] = useState<LocalCategory[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0)

  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Picker state
  const [variantParent, setVariantParent] = useState<LocalProduct | null>(null)
  const [modifierProduct, setModifierProduct] = useState<LocalProduct | null>(null)

  const { results, isLoading } = usePOSProductSearch(search, categoryId)

  // Reset highlight index when results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [results])

  useEffect(() => {
    localDb.categories.filter((c) => c.active).sortBy('sort_order').then(setCategories)
  }, [])

  function handleProductClick(product: LocalProduct) {
    const type = (product as any).product_type ?? 'simple'

    if (type === 'variant_parent') {
      // Open variant picker — don't add directly
      setVariantParent(product)
      return
    }

    if (type === 'modifier') {
      // Open modifier picker
      setModifierProduct(product)
      return
    }

    // simple or variant_child: add directly
    if (!mutePosSound) playBeep()
    onAddToCart(product)
  }

  function handleVariantSelected(item: CartItem) {
    if (!mutePosSound) playBeep()
    onAddToCartWithOptions(item)
  }

  function handleModifierConfirmed(item: CartItem) {
    if (!mutePosSound) playBeep()
    onAddToCartWithOptions(item)
  }

  // Badge label for product type
  function getTypeBadge(product: LocalProduct) {
    const type = (product as any).product_type ?? 'simple'
    if (type === 'variant_parent') return { label: 'Có size', color: 'bg-violet-100 text-violet-600' }
    if (type === 'modifier') return { label: 'Tuỳ chọn', color: 'bg-amber-100 text-amber-600' }
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const targetProduct = results[highlightedIndex]
      if (targetProduct) {
        const stock = inventory.get(targetProduct.product_id) ?? 0
        const type = (targetProduct as any).product_type ?? 'simple'
        const outOfStock = type !== 'variant_parent' && type !== 'modifier' && stock <= 0
        if (!outOfStock) {
          handleProductClick(targetProduct)
        }
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-slate-100 px-3 py-2">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm sản phẩm (tên, SKU, barcode)..."
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
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
                ? 'bg-primary text-white'
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
                  ? 'bg-primary text-white'
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
            {results.map((product, index) => {
              const stock = inventory.get(product.product_id) ?? 0
              const type = (product as any).product_type ?? 'simple'
              // variant_parent: don't track stock by itself, always show
              const outOfStock = type !== 'variant_parent' && type !== 'modifier' && stock <= 0
              const badge = getTypeBadge(product)
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={`${product.product_id}-${(product as any).unit_id || 'base'}`}
                  onClick={() => {
                    if (!outOfStock) handleProductClick(product)
                  }}
                  onMouseEnter={() => {
                    if (!outOfStock) setHighlightedIndex(index)
                  }}
                  disabled={outOfStock}
                  className={[
                    'flex h-full flex-col rounded-xl border overflow-hidden text-left transition-all duration-200',
                    outOfStock
                      ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      : isHighlighted
                        ? 'border-primary ring-2 ring-primary bg-primary/[0.02] shadow-md scale-[1.01]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm active:scale-[0.98]',
                  ].join(' ')}
                >
                  {/* Image with type badge overlay */}
                  <div className="relative w-full aspect-[4/3] shrink-0 bg-white border-b border-slate-100 overflow-hidden">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="absolute inset-0 w-full h-full object-contain p-2"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const sibling = e.currentTarget.nextElementSibling
                          if (sibling) sibling.classList.remove('hidden')
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                        <IconBox className="h-10 w-10 text-slate-300" />
                      </div>
                    )}
                    {product.image_url && (
                      <div className="absolute inset-0 items-center justify-center bg-slate-50 hidden z-0">
                        <IconBox className="h-10 w-10 text-slate-300" />
                      </div>
                    )}
                    {product.sku && (
                      <span className="absolute top-1.5 left-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm leading-none">
                        {product.sku}
                      </span>
                    )}
                    {/* Product type badge */}
                    {badge && (
                      <span className={`absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col px-2.5 pt-2 pb-1 gap-0.5">
                    <p className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight">
                      {product.name}
                    </p>
                    <p className={['text-xs font-medium mt-auto pt-1', outOfStock ? 'text-red-400' : 'text-emerald-600'].join(' ')}>
                      {type === 'variant_parent' ? 'Nhiều phân loại' : type === 'modifier' ? 'Tuỳ chỉnh' : `${stock} trong kho`}
                    </p>
                  </div>

                  {/* Price + add button */}
                  <div className="px-2.5 pb-2.5 pt-1 flex items-center justify-between shrink-0">
                    <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                      {type === 'variant_parent' ? 'Chọn...' : fmtVND(product.sell_price)}
                      {isHighlighted && (
                        <kbd className="px-1 py-0.5 text-[8px] bg-primary text-white border border-primary-dark rounded font-semibold tracking-wider uppercase leading-none shadow-sm animate-pulse shrink-0">
                          Enter
                        </kbd>
                      )}
                    </span>
                    <div className={[
                      'h-7 w-7 shrink-0 flex items-center justify-center rounded-full transition-all',
                      outOfStock
                        ? 'bg-slate-100 text-slate-300'
                        : isHighlighted
                          ? 'bg-primary text-white scale-110 shadow-sm'
                          : 'bg-[#EEF4FF] text-primary',
                    ].join(' ')}>
                      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <line x1="7" y1="1" x2="7" y2="13" /><line x1="1" y1="7" x2="13" y2="7" />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Pickers */}
      {variantParent && (
        <VariantPickerModal
          parentProduct={variantParent}
          open={!!variantParent}
          onClose={() => setVariantParent(null)}
          onSelect={handleVariantSelected}
        />
      )}
      {modifierProduct && (
        <ModifierPickerModal
          product={modifierProduct}
          open={!!modifierProduct}
          onClose={() => setModifierProduct(null)}
          onConfirm={handleModifierConfirmed}
        />
      )}
    </div>
  )
}
