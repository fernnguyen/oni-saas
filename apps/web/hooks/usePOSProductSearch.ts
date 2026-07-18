'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalProduct } from '@/lib/localDb/schema'
import { cleanSku } from '@/lib/sku'
import { isSystemTimeChargeProduct } from '@oni/core'

export function usePOSProductSearch(query: string, categoryId?: string) {
  const [results, setResults] = useState<LocalProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [debouncedQuery] = useDebounce(query.trim(), 200)
  const database = localDb

  useEffect(() => {
    const subscription = liveQuery(async () => {
      setIsLoading(true)
      try {
        let items = await database.products.filter((p) => p.active && (p as any).product_type !== 'variant_child' && !isSystemTimeChargeProduct(p.product_id, p.sku)).toArray()

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
              cleanSku(p.sku).toLowerCase().includes(q) ||
              (p.barcode ?? '').toLowerCase().includes(q)
          )
        }

        items.sort((a, b) => a.name.localeCompare(b.name, 'vi'))

        return items.slice(0, 200)
      } catch {
        return []
      }
    }).subscribe({
      next: (items) => {
        setResults(items)
        setIsLoading(false)
      },
      error: () => setIsLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [database, debouncedQuery, categoryId])

  return { results, isLoading }
}
