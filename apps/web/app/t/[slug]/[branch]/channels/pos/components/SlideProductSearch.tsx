'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { usePOSProductSearch } from '@/hooks/usePOSProductSearch'
import type { LocalProduct } from '@/lib/localDb/schema'

interface Props {
  onSelect: (product: LocalProduct) => void
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

export function SlideProductSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const { results, isLoading } = usePOSProductSearch(query)
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
        placeholder="Tìm tên món, mã SKU..."
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
            let selectedProduct = null
            if (highlightedIndex >= 0 && highlightedIndex < displayResults.length) {
              selectedProduct = displayResults[highlightedIndex]
            } else if (displayResults.length === 1) {
              selectedProduct = displayResults[0]
            }

            if (selectedProduct) {
              onSelect(selectedProduct)
              setQuery('')
              setIsOpen(false)
              setHighlightedIndex(-1)
            }
          }
        }}
        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
      />
      
      {isOpen && (query || results.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {isLoading ? (
            <div className="p-3 text-center text-xs text-slate-400">Đang tìm...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">Không tìm thấy món nào</div>
          ) : (
            <ul className="py-1">
              {displayResults.map((p, index) => (
                <li key={p.product_id}>
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
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        {p.sku && <p className="text-xs text-slate-500">{p.sku}</p>}
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
