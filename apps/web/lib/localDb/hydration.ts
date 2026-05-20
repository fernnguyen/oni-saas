import { localDb } from './schema'

// GSheets returns all cell values as strings. These parsers enforce correct runtime types
// before bulkPut so that arithmetic (+, -, *, /) never silently becomes string concat.
const f = (v: unknown): number => parseFloat(String(v ?? '')) || 0
const n = (v: unknown): number => parseInt(String(v ?? ''), 10) || 0
const bool = (v: unknown): boolean =>
  v === true || String(v).toUpperCase() === 'TRUE'

type Raw = Record<string, unknown>

function parseProduct(r: Raw) {
  return {
    ...r,
    product_id: String(r.id || r.product_id),
    sell_price: f(r.sell_price),
    cost_price: f(r.cost_price),
    min_price:  f(r.min_price),
    active:     bool(r.active),
  }
}

function parseCategory(r: Raw) {
  return { ...r, category_id: String(r.id || r.category_id), sort_order: n(r.sort_order), active: bool(r.active) }
}

function parsePriceList(r: Raw) {
  return { ...r, price_id: String(r.id || r.price_id), price: f(r.price), active: bool(r.active) }
}

function parseDiscount(r: Raw) {
  return { ...r, discount_id: String(r.id || r.discount_id), value: f(r.value), active: bool(r.active) }
}

function parseEmployee(r: Raw) {
  return { ...r, employee_id: String(r.id || r.employee_id), active: bool(r.active) }
}

function parseInventory(r: Raw) {
  return {
    ...r,
    stock_qty:  f(r.stock_qty),
    min_stock:  f(r.min_stock),
    cost_price: f(r.cost_price),
  }
}

function parseInventoryBatch(r: Raw) {
  return {
    ...r,
    stock_qty: f(r.stock_qty),
  }
}

function parseCustomer(r: Raw) {
  return {
    ...r,
    customer_id: String(r.id || r.customer_id),
    debt_amount: r.debt_amount != null ? f(r.debt_amount) : undefined,
  }
}

async function safeFetch(url: string): Promise<Raw[]> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Fetch failed with status: ${res.status}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data ?? [])
}

export async function hydrateAll(shopId: string, branchId: string): Promise<void> {
  const [products, categories, priceLists, discounts, employees, inventory, inventoryBatches, customers] =
    await Promise.all([
      safeFetch(`/api/shops/${shopId}/products?active=true&limit=2000`),
      safeFetch(`/api/shops/${shopId}/categories?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/price-lists?active=true&limit=2000`),
      safeFetch(`/api/shops/${shopId}/discounts?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/employees?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/inventory?limit=2000`),
      safeFetch(`/api/shops/${shopId}/inventory-batches?limit=5000`).catch(() => []),
      safeFetch(`/api/shops/${shopId}/customers?limit=500&sort=last_seen_at`),
    ])

  await localDb.transaction('rw',
    [localDb.products, localDb.categories, localDb.priceLists, localDb.discounts,
     localDb.employees, localDb.inventory, localDb.inventoryBatches, localDb.customers, localDb.meta],
    async () => {
      await Promise.all([
        products.length   ? localDb.products.bulkPut(products.map(parseProduct) as never[])       : null,
        categories.length ? localDb.categories.bulkPut(categories.map(parseCategory) as never[])  : null,
        priceLists.length ? localDb.priceLists.bulkPut(priceLists.map(parsePriceList) as never[]) : null,
        discounts.length  ? localDb.discounts.bulkPut(discounts.map(parseDiscount) as never[])    : null,
        employees.length  ? localDb.employees.bulkPut(employees.map(parseEmployee) as never[])    : null,
        inventory.length  ? localDb.inventory.bulkPut(inventory.map(parseInventory) as never[])   : null,
        inventoryBatches.length ? localDb.inventoryBatches.bulkPut(inventoryBatches.map(parseInventoryBatch) as never[]) : null,
        customers.length  ? localDb.customers.bulkPut(customers.map(parseCustomer) as never[])    : null,
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
     localDb.employees, localDb.inventory, localDb.inventoryBatches, localDb.customers,
     localDb.orders, localDb.orderItems, localDb.payments, localDb.syncQueue, localDb.meta],
    async () => {
      await Promise.all([
        localDb.products.clear(),
        localDb.categories.clear(),
        localDb.priceLists.clear(),
        localDb.discounts.clear(),
        localDb.employees.clear(),
        localDb.inventory.clear(),
        localDb.inventoryBatches.clear(),
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
