'use client'
import { useState, useRef, useEffect } from 'react'
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
  const { results, isLoading } = usePOSProductSearch(query)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
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
              {results.slice(0, 10).map((p) => (
                <li key={p.product_id}>
                  <button
                    onClick={() => {
                      onSelect(p)
                      setQuery('')
                      setIsOpen(false)
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex justify-between items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      {p.sku && <p className="text-xs text-slate-500">{p.sku}</p>}
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
