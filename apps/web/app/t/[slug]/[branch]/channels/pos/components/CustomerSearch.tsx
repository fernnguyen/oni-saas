'use client'
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalCustomer } from '@/lib/localDb/schema'

interface Props {
  shopId?: string
  selected: LocalCustomer | null
  onSelect: (customer: LocalCustomer | null) => void
  onOpenCustomerModal?: () => void
}

function formatPhone(phone?: string): string {
  if (!phone) return ''
  const clean = phone.trim().replace(/\D/g, '')
  if (clean.length === 10) {
    return `${clean.substring(0, 4)}.${clean.substring(4, 7)}.${clean.substring(7)}`
  }
  if (clean.length === 9) {
    const formatted = `0${clean}`
    return `${formatted.substring(0, 4)}.${formatted.substring(4, 7)}.${formatted.substring(7)}`
  }
  return phone
}

function QuickCustomerBadge({ customer, onClear }: { customer: LocalCustomer; onClear: () => void }) {
  const isVirtual = customer.customer_id.startsWith('virtual:')
  return (
    <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="truncate text-sm font-medium text-slate-900">
            {customer.name}
            {customer.phone && (
              <>
                <span className="text-slate-350 mx-1.5 font-normal">·</span>
                <span className="text-primary font-bold">{formatPhone(customer.phone)}</span>
              </>
            )}
          </p>
          {isVirtual && (
            <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-500">tạm</span>
          )}
        </div>
        {customer.address && (
          <p className="truncate text-[11px] text-slate-500 mt-0.5">
            {customer.address}
          </p>
        )}
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

export function CustomerSearch({ shopId, selected, onSelect, onOpenCustomerModal }: Props) {
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
      
      // 1. Search local DB first
      const localItems = await localDb.customers
        .filter((c) => {
          const matchesText = c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
          if (!matchesText) return false
          
          // Enforce strict branch isolation: hide customer if branch_id is set to a different shop
          const cBranchId = c.branch_id
          if (cBranchId && cBranchId !== shopId) return false
          
          return true
        })
        .limit(10)
        .toArray()
      
      if (!cancelled) setResults(localItems)
      
      // 2. Hybrid search: if online and shopId is provided, query the server!
      if (shopId && navigator.onLine) {
        try {
          const res = await fetch(`/api/shops/${shopId}/customers?search=${encodeURIComponent(debouncedQuery)}&limit=15`)
          if (res.ok) {
            const json = await res.json()
            if (json.data && !cancelled) {
              const serverItems = json.data as LocalCustomer[]
              
              // Merge server items with local items, avoiding duplicates
              const merged = [...localItems]
              serverItems.forEach((serverCust) => {
                const exists = merged.some((c) => c.customer_id === serverCust.customer_id)
                if (!exists) {
                  merged.push(serverCust)
                  // Proactively save to IndexedDB on the fly
                  localDb.customers.put(serverCust).catch(() => {})
                }
              })
              
              setResults(merged.slice(0, 15))
            }
          }
        } catch (err) {
          console.error('POS hybrid customer search failed:', err)
        }
      }
    }
    search()
    return () => { cancelled = true }
  }, [debouncedQuery, shopId])

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
    let trimmedPhone = phone.trim()
    if (trimmedPhone && /^[1-9][0-9]{8}$/.test(trimmedPhone)) {
      trimmedPhone = '0' + trimmedPhone
    }
    onSelect({ customer_id: `virtual:${Date.now()}`, name, phone: trimmedPhone || undefined })
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
        <div className="relative flex items-stretch rounded-xl border border-slate-200 bg-white shadow-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <input
            type="text"
            id="pos-customer-search-input"
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
            placeholder="Tìm khách hàng (F4)"
            className={`flex-1 min-w-0 rounded-l-xl border-0 bg-transparent pl-3 pr-3 ${onOpenCustomerModal ? '' : 'rounded-r-xl'} py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-0 text-slate-800`}
          />

          {onOpenCustomerModal && (
            <button
              type="button"
              onClick={onOpenCustomerModal}
              className="flex items-center justify-center px-3 rounded-r-xl border-l border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 active:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              title="Thêm đầy đủ thông tin khách hàng mới"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235A8.91 8.91 0 0110.5 15a8.91 8.91 0 016.5 4.235M10.5 15a8.91 8.91 0 00-6.5 4.235" />
              </svg>
            </button>
          )}

          {/* Dropdown */}
          {open && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
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
                  <span className="text-slate-400 text-xs">{c.phone ? formatPhone(c.phone) : ''}</span>
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
