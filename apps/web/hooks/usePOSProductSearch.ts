'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { useDebounce } from 'use-debounce'
import { localDb, type LocalProduct } from '@/lib/localDb/schema'
import { cleanSku } from '@/lib/sku'
import { isSystemTimeChargeProduct } from '@oni/core'

/** A sellable unit row shown as its own pseudo-product (base product + unit). */
function toUnitRow(p: LocalProduct, u: any): LocalProduct {
  return {
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
    // Search-only: the unit's own SKU (the row keeps the base SKU for the cart line)
    unit_sku: u.sku || '',
  } as any
}

function flattenUnits(items: LocalProduct[]): LocalProduct[] {
  const out: LocalProduct[] = []
  for (const p of items) {
    out.push(p)
    if (Array.isArray(p.product_units) && p.product_units.length > 0) {
      for (const u of p.product_units) out.push(toUnitRow(p, u))
    }
  }
  return out
}

function eqCode(value: string | null | undefined, q: string) {
  return !!value && value.trim().toLowerCase() === q
}

/**
 * How well a row matches a typed / scanned code. Lower is better.
 * 0 = exact barcode, 1 = exact unit SKU, 2 = exact SKU on the base row,
 * 3 = exact SKU inherited by a unit row, 4 = code prefix, 5 = anything else.
 */
export function codeMatchRank(p: LocalProduct, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 5
  const isUnitRow = !!(p as any).unit_id
  if (eqCode(p.barcode, q)) return 0
  if (isUnitRow && (eqCode((p as any).unit_sku, q) || eqCode(cleanSku((p as any).unit_sku), q))) return 1
  if (eqCode(p.sku, q) || eqCode(cleanSku(p.sku), q)) return isUnitRow ? 3 : 2
  const starts = (v: string | null | undefined) => !!v && v.toLowerCase().startsWith(q)
  if (starts(p.barcode) || starts(p.sku) || starts(cleanSku(p.sku))) return 4
  return 5
}

/**
 * Exact barcode / SKU lookup against Dexie, independent of the debounced list.
 * Used by barcode scanners (keyboard wedge + camera): they type the code and
 * press Enter faster than the search debounce settles.
 * Returns every row tied for the best exact rank (more than one = duplicate code).
 */
export async function findProductsByCode(rawCode: string): Promise<LocalProduct[]> {
  const q = rawCode.trim().toLowerCase()
  if (!q) return []
  const items = await localDb.products
    .filter((p) => p.active && !isSystemTimeChargeProduct(p.product_id, p.sku))
    .toArray()
  // variant_child rows are hidden from the grid but their barcode is still scannable
  // (a matched variant_parent opens the size picker instead of adding directly).
  const rows = flattenUnits(items)
  let best = 4
  let matches: LocalProduct[] = []
  for (const row of rows) {
    const rank = codeMatchRank(row, q)
    if (rank > 3) continue
    if (rank < best) {
      best = rank
      matches = [row]
    } else if (rank === best) {
      matches.push(row)
    }
  }
  return matches
}

export function usePOSProductSearch(query: string, categoryId?: string) {
  const [results, setResults] = useState<LocalProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)
  /** Which query/category the current `results` belong to (lags `query` by the debounce). */
  const [resultsKey, setResultsKey] = useState<string | null>(null)
  const [debouncedQuery] = useDebounce(query.trim(), 200)
  const database = localDb

  useEffect(() => {
    const key = `${debouncedQuery}|${categoryId ?? ''}`
    const subscription = liveQuery(async () => {
      setIsLoading(true)
      try {
        let items = await database.products.filter((p) => p.active && (p as any).product_type !== 'variant_child' && !isSystemTimeChargeProduct(p.product_id, p.sku)).toArray()

        if (categoryId) {
          items = items.filter((p) => p.category_id === categoryId)
        }

        // Flatten product units into pseudo-products
        items = flattenUnits(items)

        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase()
          items = items.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.sku ?? '').toLowerCase().includes(q) ||
              cleanSku(p.sku).toLowerCase().includes(q) ||
              (p.barcode ?? '').toLowerCase().includes(q) ||
              ((p as any).unit_sku ?? '').toLowerCase().includes(q)
          )
          // Exact barcode/SKU hits first, then by name
          items.sort(
            (a, b) =>
              codeMatchRank(a, q) - codeMatchRank(b, q) || a.name.localeCompare(b.name, 'vi')
          )
        } else {
          items.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        }

        return items.slice(0, 200)
      } catch {
        return []
      }
    }).subscribe({
      next: (items) => {
        setResults(items)
        setResultsKey(key)
        setIsLoading(false)
      },
      error: () => setIsLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [database, debouncedQuery, categoryId])

  const currentKey = `${query.trim()}|${categoryId ?? ''}`
  return { results, isLoading, resultsKey, isStale: resultsKey !== currentKey }
}
