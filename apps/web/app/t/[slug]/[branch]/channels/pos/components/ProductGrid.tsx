'use client'
import { useEffect, useState, useRef } from 'react'
import { liveQuery } from 'dexie'
import { toast } from 'sonner'
import { localDb, type LocalCategory, type LocalProduct } from '@/lib/localDb/schema'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import { IconBox } from '@/app/components/layout/nav'
import type { CartItem } from '@/hooks/useCart'
import { VariantPickerModal } from './VariantPickerModal'
import { ModifierPickerModal } from './ModifierPickerModal'
import { CameraScannerModal } from './CameraScannerModal'
import { QuickCreateProductDialog } from './QuickCreateProductDialog'
import { cleanSku } from '@/lib/sku'
import { allowsProductNegativeStock, isSystemTimeChargeProduct } from '@oni/core'

interface Props {
  branchId: string
  inventory: Map<string, number>
  mutePosSound: boolean
  onAddToCart: (product: LocalProduct) => void
  onAddToCartWithOptions: (item: CartItem) => void
  allowNegativeStock?: boolean
  planCode?: string
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

export function ProductGrid({ branchId, inventory, mutePosSound, onAddToCart, onAddToCartWithOptions, allowNegativeStock = false, planCode }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [categories, setCategories] = useState<LocalCategory[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0)
  const [showOutOfStock, setShowOutOfStock] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [quickCreateRequest, setQuickCreateRequest] = useState<{ name: string; barcode: string } | null>(null)
  const [pendingScannedBarcode, setPendingScannedBarcode] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const database = localDb

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

  // Helper to check if a product is out of stock
  const isOOS = (p: LocalProduct) => {
    // Legacy products have no metadata and remain subject to the existing shop policy.
    if (allowNegativeStock || allowsProductNegativeStock(p as any)) return false
    const stock = inventory.get(p.product_id) ?? 0
    const type = (p as any).product_type ?? 'simple'
    return type !== 'variant_parent' && type !== 'modifier' && stock <= 0
  }

  // Filtered results
  const filteredResults = showOutOfStock
    ? results
    : results.filter((p) => !isOOS(p))

  // Reset highlight index ONLY when search query, category, or stock toggle changes
  // This solves the issue where highlight focus freezes on the first item during keyboard navigation
  useEffect(() => {
    const firstActive = filteredResults.findIndex((p) => !isOOS(p))
    setHighlightedIndex(firstActive >= 0 ? firstActive : 0)
  }, [search, categoryId, showOutOfStock])

  useEffect(() => {
    const subscription = liveQuery(() =>
      database.categories.filter((category) => category.active).sortBy('sort_order')
    ).subscribe({
      next: setCategories,
      error: () => setCategories([]),
    })
    return () => subscription.unsubscribe()
  }, [database, branchId])

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

  // Handle successful camera scan
  async function handleScanSuccess(barcode: string) {
    if (!barcode) return
    setSearch(barcode)
    toast.success(`Đã quét mã: ${barcode}`)
    if (!mutePosSound) playBeep()

    try {
      // Query active products from Dexie DB
      const items = await localDb.products.filter((p) => p.active && (p as any).product_type !== 'variant_child' && !isSystemTimeChargeProduct(p.product_id, p.sku)).toArray()
      
      // Flatten units identical to search hook
      let match: LocalProduct | null = null
      for (const p of items) {
        if (p.barcode === barcode || p.sku === barcode || cleanSku(p.sku) === barcode) {
          match = p
          break
        }
        if (Array.isArray(p.product_units) && p.product_units.length > 0) {
          for (const u of p.product_units) {
            if (u.barcode === barcode || u.sku === barcode || cleanSku(u.sku) === barcode) {
              match = {
                ...p,
                product_id: p.product_id,
                name: `${p.name} (${u.unit_name})`,
                barcode: u.barcode || '',
                sell_price: Number(u.sell_price || 0),
                cost_price: Number(u.cost_price || 0),
                unit_id: u.unit_id || u.id,
                unit_name: u.unit_name,
                conversion_rate: Number(u.conversion_rate || 1),
                unit: u.unit_name,
              } as any
              break
            }
          }
          if (match) break
        }
      }

      if (match) {
        handleProductClick(match)
        setSearch('') // Clear search bar upon successful auto-add
        toast.success(`Đã thêm vào giỏ: ${match.name}`)
      } else {
        setIsCameraOpen(false)
        setPendingScannedBarcode(barcode)
        toast.info(`Không tìm thấy sản phẩm với mã: ${barcode}`)
      }
    } catch (e) {
      console.error('Error auto-adding scanned barcode:', e)
    }
  }

  // Badge label for product type
  function getTypeBadge(product: LocalProduct) {
    const type = (product as any).product_type ?? 'simple'
    if (type === 'variant_parent') return { label: 'Có size', color: 'bg-violet-100 text-violet-600' }
    if (type === 'modifier') return { label: 'Tuỳ chọn', color: 'bg-amber-100 text-amber-600' }
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Skip out-of-stock (disabled) items
      let nextIndex = highlightedIndex
      for (let i = 1; i <= filteredResults.length; i++) {
        const checkIndex = (highlightedIndex + i) % filteredResults.length
        if (!isOOS(filteredResults[checkIndex])) {
          nextIndex = checkIndex
          break
        }
      }
      setHighlightedIndex(nextIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Skip out-of-stock (disabled) items
      let nextIndex = highlightedIndex
      for (let i = 1; i <= filteredResults.length; i++) {
        const checkIndex = (highlightedIndex - i + filteredResults.length) % filteredResults.length
        if (!isOOS(filteredResults[checkIndex])) {
          nextIndex = checkIndex
          break
        }
      }
      setHighlightedIndex(nextIndex)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const targetProduct = filteredResults[highlightedIndex]
      if (targetProduct) {
        if (!isOOS(targetProduct)) {
          handleProductClick(targetProduct)
        }
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-slate-100 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-slate-50/50">
        <div className="relative flex-1 flex items-center">
          {/* Barcode icon / Camera Scan Trigger Button */}
          <button
            onClick={() => setIsCameraOpen(true)}
            type="button"
            className="absolute left-2.5 flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            title="Quét mã vạch bằng camera điện thoại"
          >
            <div className="shrink-0 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="h-5 w-5 text-slate-500">
                <rect x="3" y="4" width="2" height="16" rx="0.5" />
                <rect x="7" y="4" width="1" height="16" rx="0.5" />
                <rect x="10" y="4" width="3" height="16" rx="0.5" />
                <rect x="15" y="4" width="1" height="16" rx="0.5" />
                <rect x="18" y="4" width="2" height="16" rx="0.5" />
                <rect x="21" y="4" width="1" height="16" rx="0.5" />
              </svg>
            </div>
          </button>

          <input
            ref={inputRef}
            id="pos-product-search-input"
            autoFocus
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPendingScannedBarcode('')
            }}
            onKeyDown={handleKeyDown}
            placeholder="Tìm sản phẩm (F3) - tên, SKU, barcode..."
            className="w-full rounded-lg border border-slate-200 pl-10 pr-11 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none bg-white shadow-xs"
          />

          {/* Clear search keyword button or F3 kbd indicator */}
          {search ? (
            <button
              onClick={() => {
                setSearch('')
                inputRef.current?.focus()
              }}
              type="button"
              className="absolute right-2.5 flex items-center justify-center p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
              title="Xoá từ khoá"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          ) : (
            <div className="absolute right-2.5 flex items-center pointer-events-none">
              <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 font-sans text-[10px] font-bold text-slate-400 shadow-xs">
                F3
              </kbd>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setQuickCreateRequest({ name: '', barcode: '' })}
          className="shrink-0 rounded-lg border border-primary/20 bg-white px-2.5 py-1.5 text-xs font-bold text-primary shadow-xs transition hover:bg-primary/5"
        >
          + Tạo nhanh
        </button>

        <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors shadow-xs">
          <input
            type="checkbox"
            checked={showOutOfStock}
            onChange={(e) => setShowOutOfStock(e.target.checked)}
            className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
          />
          <span>Hiện sp hết hàng</span>
        </label>
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
        ) : filteredResults.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center text-sm text-slate-400 p-6 text-center">
            {results.length > 0 ? (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-amber-600 font-semibold">Sản phẩm bạn tìm đã hết hàng!</p>
                <p className="text-xs text-slate-500 mb-2">Hãy nhập hàng để tiếp tục bán hoặc yêu cầu quản trị viên cho phép bán khi hết hàng.</p>
                <button
                  type="button"
                  onClick={() => setShowOutOfStock(true)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors shadow-sm active:scale-95"
                >
                  Hiển thị
                </button>
              </div>
            ) : search ? (
              <div className="flex flex-col items-center gap-3">
                <span>Không tìm thấy sản phẩm “{search}”</span>
                <button
                  type="button"
                  onClick={() => setQuickCreateRequest({ name: pendingScannedBarcode ? '' : search, barcode: pendingScannedBarcode })}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90 active:scale-95"
                >
                  Tạo mới sản phẩm {pendingScannedBarcode ? pendingScannedBarcode : 'này'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span>Chưa có sản phẩm nào. Hãy tạo sản phẩm để bắt đầu bán hàng.</span>
                <button type="button" onClick={() => setQuickCreateRequest({ name: '', barcode: '' })} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90">
                  Tạo mới sản phẩm
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredResults.map((product, index) => {
              const stock = inventory.get(product.product_id) ?? 0
              const type = (product as any).product_type ?? 'simple'
              // variant_parent: don't track stock by itself, always show
              const outOfStock = !allowNegativeStock && !allowsProductNegativeStock(product as any) && type !== 'variant_parent' && type !== 'modifier' && stock <= 0
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
                        {cleanSku(product.sku)}
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
                    <p className={[
                      'text-xs font-medium mt-auto pt-1',
                      outOfStock
                        ? 'text-red-400'
                        : (type !== 'variant_parent' && type !== 'modifier' && stock < 0)
                          ? 'text-amber-600 font-semibold'
                          : 'text-emerald-600'
                    ].join(' ')}>
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

      {/* Pickers & Scanners */}
      {variantParent && (
        <VariantPickerModal
          parentProduct={variantParent}
          open={!!variantParent}
          onClose={() => setVariantParent(null)}
          onSelect={handleVariantSelected}
          allowNegativeStock={allowNegativeStock}
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
      {isCameraOpen && (
        <CameraScannerModal
          open={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onScanSuccess={handleScanSuccess}
        />
      )}
      {quickCreateRequest && (
        <QuickCreateProductDialog
          open={!!quickCreateRequest}
          shopId={branchId}
          initialName={quickCreateRequest.name}
          initialBarcode={quickCreateRequest.barcode}
          categories={categories}
          allowLocalImageUpload={planCode !== 'plan_mini'}
          onClose={() => setQuickCreateRequest(null)}
          onUseExisting={async (candidate) => {
            const product = await database.products.get(candidate.product_id || candidate.id || '')
            if (!product) {
              toast.error('Sản phẩm có sẵn chưa được đồng bộ về máy. Vui lòng đồng bộ rồi thử lại.')
              return
            }
            handleProductClick(product)
          }}
          onCreated={async (created) => {
            const product = {
              ...created,
              product_id: String(created.product_id || created.id),
              category_id: String(created.category_id || ''),
              sku: String(created.sku || ''),
              barcode: String(created.barcode || ''),
              name: String(created.name || ''),
              unit: String(created.unit || 'Cái'),
              sell_price: Number(created.sell_price || 0),
              cost_price: Number(created.cost_price || 0),
              min_price: Number(created.min_price || 0),
              active: String(created.active || 'TRUE').toUpperCase() !== 'FALSE',
              product_units: Array.isArray(created.product_units) ? created.product_units : [],
            } as LocalProduct
            await database.products.put(product)
            if (!mutePosSound) playBeep()
            onAddToCart(product)
            setSearch('')
            setPendingScannedBarcode('')
            inputRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
