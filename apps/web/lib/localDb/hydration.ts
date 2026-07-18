import { getLocalDbScope, localDb } from './schema'

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
    product_units: Array.isArray(r.product_units) ? r.product_units : undefined,
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
    credit_limit: r.credit_limit != null ? f(r.credit_limit) : undefined,
    loyalty_points: r.loyalty_points != null ? f(r.loyalty_points) : undefined,
    prepaid_balance: r.prepaid_balance != null ? f(r.prepaid_balance) : undefined,
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

export async function hydrateAll(shopId: string, branchId: string, scopeId?: string): Promise<void> {
  const db = scopeId ? getLocalDbScope(scopeId) : localDb
  const [products, categories, priceLists, discounts, employees, inventory, inventoryBatches, customers] =
    await Promise.all([
      safeFetch(`/api/shops/${shopId}/products?active=true&limit=5000&nocache=true`),
      safeFetch(`/api/shops/${shopId}/categories?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/price-lists?active=true&limit=5000`),
      safeFetch(`/api/shops/${shopId}/discounts?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/employees?active=true&limit=200`),
      safeFetch(`/api/shops/${shopId}/inventory?limit=5000`),
      safeFetch(`/api/shops/${shopId}/inventory-batches?limit=5000`).catch(() => []),
      safeFetch(`/api/shops/${shopId}/customers?limit=500&sort=last_seen_at`),
    ])

  await db.transaction('rw',
    [db.products, db.categories, db.priceLists, db.discounts,
     db.employees, db.inventory, db.inventoryBatches, db.customers, db.meta],
    async () => {
      // Clear tables to remove deleted/stale items from the server
      await Promise.all([
        db.products.clear(),
        db.categories.clear(),
        db.priceLists.clear(),
        db.discounts.clear(),
        db.employees.clear(),
        db.inventory.clear(),
        db.inventoryBatches.clear(),
        // Only delete fully-synced customers, preserve offline-created ones (virtual: prefix)
        db.customers.filter(c => !c.customer_id.startsWith('virtual:')).delete(),
      ])

      await Promise.all([
        products.length   ? db.products.bulkPut(products.map(parseProduct) as never[])       : null,
        categories.length ? db.categories.bulkPut(categories.map(parseCategory) as never[])  : null,
        priceLists.length ? db.priceLists.bulkPut(priceLists.map(parsePriceList) as never[]) : null,
        discounts.length  ? db.discounts.bulkPut(discounts.map(parseDiscount) as never[])    : null,
        employees.length  ? db.employees.bulkPut(employees.map(parseEmployee) as never[])    : null,
        inventory.length  ? db.inventory.bulkPut(inventory.map(parseInventory) as never[])   : null,
        inventoryBatches.length ? db.inventoryBatches.bulkPut(inventoryBatches.map(parseInventoryBatch) as never[]) : null,
        customers.length  ? db.customers.bulkPut(customers.map(parseCustomer) as never[])    : null,
        db.meta.put({ key: 'last_hydrated_at', value: new Date().toISOString() }),
        db.meta.put({ key: 'hydrated_branch_id', value: branchId }),
        db.meta.put({ key: 'hydrated_shop_id', value: shopId }),
      ])
    }
  )
}

export async function getLastHydratedAt(scopeId?: string): Promise<string | null> {
  const db = scopeId ? getLocalDbScope(scopeId) : localDb
  const entry = await db.meta.get('last_hydrated_at')
  return entry?.value ?? null
}

export async function isHydrationStale(ttlMs: number, scopeId?: string): Promise<boolean> {
  const last = await getLastHydratedAt(scopeId)
  if (!last) return true
  return Date.now() - new Date(last).getTime() > ttlMs
}

export async function clearLocalDb(): Promise<void> {
  const db = localDb
  await db.transaction('rw',
    [db.products, db.categories, db.priceLists, db.discounts,
     db.employees, db.inventory, db.inventoryBatches, db.customers,
     db.orders, db.orderItems, db.payments, db.syncQueue, db.meta],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.categories.clear(),
        db.priceLists.clear(),
        db.discounts.clear(),
        db.employees.clear(),
        db.inventory.clear(),
        db.inventoryBatches.clear(),
        db.customers.clear(),
        db.orders.clear(),
        db.orderItems.clear(),
        db.payments.clear(),
        db.syncQueue.clear(),
        db.meta.clear(),
      ])
    }
  )
}
