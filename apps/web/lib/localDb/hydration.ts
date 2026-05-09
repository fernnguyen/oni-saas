import { localDb } from './schema'

async function safeFetch(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : (json.data ?? [])
  } catch {
    return []
  }
}

export async function hydrateAll(shopId: string, branchId: string): Promise<void> {
  const [products, categories, priceLists, discounts, employees, inventory, customers] =
    await Promise.all([
      safeFetch(`/api/shops/${shopId}/products?active=true&limit=2000`),
      safeFetch(`/api/shops/${shopId}/categories?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/price-lists?active=true&limit=2000`),
      safeFetch(`/api/shops/${shopId}/discounts?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/employees?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/inventory?limit=2000`),
      safeFetch(`/api/shops/${shopId}/customers?limit=500&sort=last_seen_at`),
    ])

  await localDb.transaction('rw',
    [localDb.products, localDb.categories, localDb.priceLists, localDb.discounts,
     localDb.employees, localDb.inventory, localDb.customers, localDb.meta],
    async () => {
      await Promise.all([
        products.length   ? localDb.products.bulkPut(products as never[])   : null,
        categories.length ? localDb.categories.bulkPut(categories as never[]) : null,
        priceLists.length ? localDb.priceLists.bulkPut(priceLists as never[]) : null,
        discounts.length  ? localDb.discounts.bulkPut(discounts as never[])  : null,
        employees.length  ? localDb.employees.bulkPut(employees as never[])  : null,
        inventory.length  ? localDb.inventory.bulkPut(inventory as never[])  : null,
        customers.length  ? localDb.customers.bulkPut(customers as never[])  : null,
        localDb.meta.put({ key: 'last_hydrated_at', value: new Date().toISOString() }),
        localDb.meta.put({ key: 'hydrated_branch_id', value: branchId }),
        localDb.meta.put({ key: 'hydrated_shop_id', value: shopId }),
      ])
    }
  )
}

export async function getLastHydratedAt(): Promise<string | null> {
  const entry = await localDb.meta.get('last_hydrated_at')
  return entry?.value ?? null
}

export async function isHydrationStale(ttlMs: number): Promise<boolean> {
  const last = await getLastHydratedAt()
  if (!last) return true
  return Date.now() - new Date(last).getTime() > ttlMs
}

export async function clearLocalDb(): Promise<void> {
  await localDb.transaction('rw',
    [localDb.products, localDb.categories, localDb.priceLists, localDb.discounts,
     localDb.employees, localDb.inventory, localDb.customers,
     localDb.orders, localDb.orderItems, localDb.payments, localDb.syncQueue, localDb.meta],
    async () => {
      await Promise.all([
        localDb.products.clear(),
        localDb.categories.clear(),
        localDb.priceLists.clear(),
        localDb.discounts.clear(),
        localDb.employees.clear(),
        localDb.inventory.clear(),
        localDb.customers.clear(),
        localDb.orders.clear(),
        localDb.orderItems.clear(),
        localDb.payments.clear(),
        localDb.syncQueue.clear(),
        localDb.meta.clear(),
      ])
    }
  )
}
