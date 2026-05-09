'use client'
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalCustomer } from '@/lib/localDb/schema'

interface Props {
  selected: LocalCustomer | null
  onSelect: (customer: LocalCustomer | null) => void
}

export function CustomerSearch({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalCustomer[]>([])
  const [open, setOpen] = useState(false)
  const [debouncedQuery] = useDebounce(query, 200)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function search() {
      if (!debouncedQuery.trim()) {
        if (!cancelled) setResults([])
        return
      }
      const q = debouncedQuery.toLowerCase()
      const items = await localDb.customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
        )
        .limit(20)
        .toArray()
      if (!cancelled) setResults(items)
    }
    search()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{selected.name}</p>
          {selected.phone && <p className="text-xs text-slate-500">{selected.phone}</p>}
        </div>
        <button
          onClick={() => onSelect(null)}
          className="ml-2 shrink-0 text-xs text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm khách hàng..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[#0268FF] focus:outline-none"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((c) => (
            <button
              key={c.customer_id}
              onClick={() => {
                onSelect(c)
                setQuery('')
                setOpen(false)
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className="text-slate-400">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
