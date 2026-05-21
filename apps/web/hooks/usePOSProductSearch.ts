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
        let items = await localDb.products.filter((p) => p.active && (p as any).product_type !== 'variant_child').toArray()

        if (categoryId) {
          items = items.filter((p) => p.category_id === categoryId)
        }

        // Flatten product units into pseudo-products
        const flattenedItems: LocalProduct[] = []
        for (const p of items) {
          flattenedItems.push(p)
          if (Array.isArray(p.product_units) && p.product_units.length > 0) {
            for (const u of p.product_units) {
              flattenedItems.push({
                ...p,
                product_id: p.product_id, // Keep base product ID
                name: `${p.name} (${u.unit_name})`, // Append unit name for display
                barcode: u.barcode || '',
                sell_price: Number(u.sell_price || 0),
                cost_price: Number(u.cost_price || 0),
                // Custom fields for cart
                unit_id: u.unit_id || u.id,
                unit_name: u.unit_name,
                conversion_rate: Number(u.conversion_rate || 1),
                unit: u.unit_name,
              } as any)
            }
          }
        }
        items = flattenedItems

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
