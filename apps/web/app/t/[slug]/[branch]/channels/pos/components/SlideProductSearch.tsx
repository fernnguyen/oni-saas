'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { usePOSProductSearch, findProductsByCode } from '@/hooks/usePOSProductSearch'
import type { LocalProduct } from '@/lib/localDb/schema'
import { cleanSku } from '@/lib/sku'

interface Props {
  onSelect: (product: LocalProduct) => void
  /** Bar/Bếp: products the kitchen marked sold out today (shown as "Tạm hết") */
  soldOutIds?: string[]
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

export function SlideProductSearch({ onSelect, soldOutIds = [] }: Props) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const { results, isLoading, isStale } = usePOSProductSearch(query)
  // Scanner sends code + Enter faster than the 200ms debounce; ignore a re-entrant Enter
  const lookupBusyRef = useRef(false)

  function selectAndReset(product: LocalProduct, code: string) {
    onSelect(product)
    // Only clear if the box still holds what was submitted (a next scan may have started)
    setQuery((prev) => (prev.trim() === code ? '' : prev))
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  async function handleEnter(input: HTMLInputElement) {
    const code = input.value.trim()
    if (!code || lookupBusyRef.current) return
    lookupBusyRef.current = true
    try {
      // 1) Exact barcode/SKU hit wins, independent of the debounced list.
      //    variant_child rows are left to the list/picker flow (callers expect parents).
      const exact = (await findProductsByCode(code)).filter(
        (p) => (p as any).product_type !== 'variant_child'
      )
      if (exact.length === 1) {
        selectAndReset(exact[0], code)
        return
      }
      // 2) Original behaviour — but only once the list belongs to the typed text.
      if (isStale) return
      let selectedProduct: LocalProduct | null = null
      if (highlightedIndex >= 0 && highlightedIndex < displayResults.length) {
        selectedProduct = displayResults[highlightedIndex]
      } else if (displayResults.length === 1) {
        selectedProduct = displayResults[0]
      }
      if (selectedProduct) {
        selectAndReset(selectedProduct, code)
      } else {
        // Nothing to add: select the text so the next scan replaces it instead of appending
        input.select()
      }
    } finally {
      lookupBusyRef.current = false
    }
  }
  const wrapperRef = useRef<HTMLDivElement>(null)

  const displayResults = useMemo(() => {
    return results.slice(0, 10)
  }, [results])

  useEffect(() => {
    if (displayResults.length > 0) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [displayResults])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        id="pos-mobile-product-search-input"
        placeholder="Tìm tên món, mã SKU (F3)..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (displayResults.length > 0) {
              setHighlightedIndex(prev => (prev === -1 ? 0 : (prev + 1) % displayResults.length))
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (displayResults.length > 0) {
              setHighlightedIndex(prev => (prev === -1 ? displayResults.length - 1 : (prev - 1 + displayResults.length) % displayResults.length))
            }
          } else if (e.key === 'Escape') {
            setIsOpen(false)
            setHighlightedIndex(-1)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            void handleEnter(e.currentTarget)
          }
        }}
        className="w-full rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
      />
      {!query && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 font-sans text-[10px] font-bold text-slate-400 shadow-xs">
            F3
          </kbd>
        </div>
      )}
      
      {isOpen && (query || results.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {isLoading ? (
            <div className="p-3 text-center text-xs text-slate-400">Đang tìm...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">Không tìm thấy món nào</div>
          ) : (
            <ul className="py-1">
              {displayResults.map((p, index) => (
                <li key={`${p.product_id}-${(p as any).unit_id || 'base'}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      onSelect(p)
                      setQuery('')
                      setIsOpen(false)
                      setHighlightedIndex(-1)
                    }}
                    className={`w-full px-3 py-2 text-left flex justify-between items-center transition-colors ${
                      index === highlightedIndex
                        ? 'bg-primary/10 border-l-2 border-primary'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${soldOutIds.includes(p.product_id) ? 'text-slate-400' : 'text-slate-900'}`}>
                          {p.name}
                          {soldOutIds.includes(p.product_id) && (
                            <span className="ml-1.5 rounded border border-rose-200 bg-rose-50 px-1 text-[10px] font-semibold text-rose-700">Tạm hết</span>
                          )}
                        </p>
                        {p.sku && <p className="text-xs text-slate-500">{cleanSku(p.sku)}</p>}
                      </div>
                      {(index === highlightedIndex || displayResults.length === 1) && (
                        <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-slate-500 shadow-sm shrink-0">
                          Enter
                        </kbd>
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">
                      {fmtVND(p.sell_price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
