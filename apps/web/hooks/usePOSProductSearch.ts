'use client'
import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalProduct } from '@/lib/localDb/schema'

export function usePOSProductSearch(query: string, categoryId?: string) {
  const [results, setResults] = useState<LocalProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [debouncedQuery] = useDebounce(query.trim(), 200)

  useEffect(() => {
    let cancelled = false
    async function search() {
      setIsLoading(true)
      try {
        let items = await localDb.products.filter((p) => p.active).toArray()

        if (categoryId) {
          items = items.filter((p) => p.category_id === categoryId)
        }

        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase()
          items = items.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.sku ?? '').toLowerCase().includes(q) ||
              (p.barcode ?? '').toLowerCase().includes(q)
          )
        }

        items.sort((a, b) => a.name.localeCompare(b.name, 'vi'))

        if (!cancelled) {
          setResults(items.slice(0, 200))
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }
    search()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, categoryId])

  return { results, isLoading }
}
