'use client'
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalCustomer } from '@/lib/localDb/schema'

interface Props {
  selected: LocalCustomer | null
  onSelect: (customer: LocalCustomer | null) => void
}

function QuickCustomerBadge({ customer, onClear }: { customer: LocalCustomer; onClear: () => void }) {
  const isVirtual = customer.customer_id.startsWith('virtual:')
  return (
    <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-slate-900">{customer.name}</p>
          {isVirtual && (
            <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-500">tạm</span>
          )}
        </div>
        {customer.phone && <p className="text-xs text-slate-500">{customer.phone}</p>}
      </div>
      <button
        onClick={onClear}
        className="ml-2 shrink-0 rounded p-0.5 text-slate-400 hover:bg-blue-100 hover:text-slate-600"
        aria-label="Bỏ chọn khách hàng"
      >
        ✕
      </button>
    </div>
  )
}

export function CustomerSearch({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [phone, setPhone] = useState('')
  const [results, setResults] = useState<LocalCustomer[]>([])
  const [open, setOpen] = useState(false)
  const [showQuickForm, setShowQuickForm] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [debouncedQuery] = useDebounce(query, 200)
  const ref = useRef<HTMLDivElement>(null)

  const totalOptions = results.length + (query.trim() ? 1 : 0)

  useEffect(() => {
    if (totalOptions > 0) {
      setHighlightedIndex(0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [results, query, totalOptions])

  useEffect(() => {
    let cancelled = false
    async function search() {
      if (!debouncedQuery.trim()) {
        if (!cancelled) setResults([])
        return
      }
      const q = debouncedQuery.toLowerCase()
      const items = await localDb.customers
        .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
        .limit(10)
        .toArray()
      if (!cancelled) setResults(items)
    }
    search()
    return () => { cancelled = true }
  }, [debouncedQuery])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowQuickForm(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleUseVirtual() {
    const name = query.trim()
    if (!name) return
    onSelect({ customer_id: `virtual:${Date.now()}`, name, phone: phone.trim() || undefined })
    setQuery('')
    setPhone('')
    setOpen(false)
    setShowQuickForm(false)
  }

  if (selected) {
    return <QuickCustomerBadge customer={selected} onClear={() => onSelect(null)} />
  }

  return (
    <div ref={ref} className="space-y-2">
      {!showQuickForm ? (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (totalOptions > 0) {
                  setHighlightedIndex(prev => (prev === -1 ? 0 : (prev + 1) % totalOptions))
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (totalOptions > 0) {
                  setHighlightedIndex(prev => (prev === -1 ? totalOptions - 1 : (prev - 1 + totalOptions) % totalOptions))
                }
              } else if (e.key === 'Escape') {
                setOpen(false)
                setHighlightedIndex(-1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                  const c = results[highlightedIndex]
                  onSelect(c)
                  setQuery('')
                  setOpen(false)
                  setHighlightedIndex(-1)
                } else if (query.trim() && (highlightedIndex === results.length || highlightedIndex === -1)) {
                  setShowQuickForm(true)
                  setOpen(false)
                  setHighlightedIndex(-1)
                }
              }
            }}
            placeholder="Tìm tên hoặc SĐT để tìm kiếm HOẶC tạo mới khách hàng..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
          />

          {/* Dropdown */}
          {open && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.map((c, index) => (
                <button
                  key={c.customer_id}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => { onSelect(c); setQuery(''); setOpen(false); setHighlightedIndex(-1) }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-900 truncate">{c.name}</span>
                    {(index === highlightedIndex || results.length === 1) && (
                      <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-slate-500 shadow-sm shrink-0">
                        Enter
                      </kbd>
                    )}
                  </div>
                  <span className="text-slate-400 text-xs">{c.phone}</span>
                </button>
              ))}

              {/* Quick-use typed name */}
              {query.trim() && (
                <button
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(results.length)}
                  onClick={() => { setShowQuickForm(true); setOpen(false); setHighlightedIndex(-1) }}
                  className={`flex w-full items-center justify-between border-t border-slate-100 px-3 py-2 text-left text-sm text-primary transition-colors ${
                    highlightedIndex === results.length
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : 'hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>+</span>
                    <span>Dùng tạm &ldquo;{query.trim()}&rdquo;</span>
                  </div>
                  {(highlightedIndex === results.length || results.length === 0) && (
                    <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-slate-500 shadow-sm shrink-0">
                      Enter
                    </kbd>
                  )}
                </button>
              )}

              {/* Always show walk-in option */}
              {results.length === 0 && !query.trim() && (
                <p className="px-3 py-2 text-xs text-slate-400">Gõ tên hoặc SĐT để tìm</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Quick-add form */
        <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <p className="text-xs font-medium text-slate-600">Nhập thông tin khách nhanh</p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) handleUseVirtual() }}
            placeholder="Tên khách *"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) handleUseVirtual() }}
            placeholder="Số điện thoại (tùy chọn)"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowQuickForm(false); setPhone('') }}
              className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-white"
            >
              Hủy
            </button>
            <button
              onClick={handleUseVirtual}
              disabled={!query.trim()}
              className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Xác nhận
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
