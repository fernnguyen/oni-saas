import Dexie, { type Table } from 'dexie'

export interface LocalProduct {
  product_id: string
  sku: string
  barcode?: string
  name: string
  category_id?: string
  unit?: string
  sell_price: number
  cost_price: number
  min_price: number
  description?: string
  image_url?: string
  active: boolean
  tax_rate?: string
  tax_group?: string
  input_tax_rate?: string
  // ── Variant / Modifier System (Sprint 1) ───────────────────────
  product_type?: 'simple' | 'variant_parent' | 'variant_child' | 'modifier'
  parent_id?: string              // NULL → simple/parent; ID → variant_child
  variant_options?: string        // JSON string: {"Size": "L"}
  modifier_groups?: string        // JSON string: modifier config for offline POS
  // ── Unit Conversion ──────────────────────────────────────────────
  product_units?: any[]           // Array of unit conversions from backend
}

export interface LocalCategory {
  category_id: string
  name: string
  parent_id?: string
  sort_order: number
  active: boolean
  tax_rate?: string
  tax_group?: string
}

export interface LocalPriceList {
  price_id: string
  product_id: string
  price_type: string
  price: number
  active: boolean
}

export interface LocalDiscount {
  discount_id: string
  name: string
  type: string
  value: number
  active: boolean
  end_date?: string
}

export interface LocalEmployee {
  employee_id: string
  name: string
  employee_code?: string
  phone?: string
  role: string
  branch_id?: string
  active: boolean
}

export interface LocalInventory {
  product_id: string
  branch_id: string
  stock_qty: number
  min_stock: number
  cost_price: number
  sku?: string
}

export interface LocalInventoryBatch {
  id: string
  product_id: string
  branch_id: string
  batch_no: string
  expiry_date: string // YYYY-MM-DD
  stock_qty: number
}

export interface LocalCustomer {
  customer_id: string
  name: string
  phone?: string
  email?: string
  address?: string
  customer_code?: string
  customer_type?: string
  debt_amount?: number
  credit_limit?: number
  loyalty_points?: number
  prepaid_balance?: number
  branch_id?: string
  last_seen_at?: string
}

export interface LocalOrderItem {
  local_id: string
  order_local_id: string
  product_id: string
  product_name: string
  sku?: string
  qty: number
  unit_price: number
  original_price?: number
  cost_price: number
  discount_amount: number
  line_total: number
  tax_rate?: string
  tax_amount?: number
  tax_group?: string
  // ── Variant / Modifier context (Sprint 1) ───────────────────────
  variant_label?: string          // "Size L" — denormalized display
  modifiers?: string              // JSON string: [{group, option, price_adj}]
  modifier_total?: number         // Sum of price_adj (default 0)
  // ── Unit Conversion ──────────────────────────────────────────────
  unit_id?: string
  unit_name?: string
  conversion_rate?: number
}

export interface LocalPayment {
  local_id: string
  order_local_id: string
  method: string
  amount: number
  reference_no?: string
  note?: string
  fund_id?: string
}

export interface LocalOrder {
  local_id: string
  server_id?: string
  order_no?: string
  sync_status: 'pending' | 'syncing' | 'done' | 'failed'
  customer_id?: string
  customer_name?: string
  branch_id: string
  employee_id: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  debt_amount?: number
  points_earned?: number
  points_redeemed?: number
  note?: string
  metadata?: string
  created_at: string
  status: string
  print_count: number
  items: LocalOrderItem[]
}

export interface StockMovementPayload {
  type: string
  product_id: string
  qty: number
  branch_id: string
  reference_no: string
}

export interface SyncQueueItem {
  id?: number
  status: 'pending' | 'syncing' | 'done' | 'failed'
  entity: 'order'
  payload: {
    order: Omit<LocalOrder, 'items'>
    items: LocalOrderItem[]
    payments: LocalPayment[]
    stockMovements: StockMovementPayload[]
    customer?: { name: string; phone?: string }
  }
  local_order_id: string
  server_order_id?: string
  server_order_no?: string  // saved after step 1 so retries can skip order creation
  steps_done?: string[]     // ['items', 'payments', 'movements'] — completed bulk steps
  syncing_since?: string    // ISO timestamp when set to 'syncing' — used to detect stale locks
  retry_count: number
  last_error?: string
  created_at: string
  synced_at?: string
}

export interface MetaEntry {
  key: string
  value: string
}

export class OniLocalDB extends Dexie {
  products!:    Table<LocalProduct>
  categories!:  Table<LocalCategory>
  priceLists!:  Table<LocalPriceList>
  discounts!:   Table<LocalDiscount>
  employees!:   Table<LocalEmployee>
  inventory!:   Table<LocalInventory>
  inventoryBatches!: Table<LocalInventoryBatch>
  customers!:   Table<LocalCustomer>
  orders!:      Table<LocalOrder>
  orderItems!:  Table<LocalOrderItem>
  payments!:    Table<LocalPayment>
  syncQueue!:   Table<SyncQueueItem>
  meta!:        Table<MetaEntry>

  constructor(databaseName = 'oni-pos') {
    super(databaseName)
    this.version(1).stores({
      products:   'product_id, sku, barcode, category_id, active',
      categories: 'category_id, parent_id',
      priceLists: 'price_id, product_id, price_type, active',
      discounts:  'discount_id, active, end_date',
      employees:  'employee_id, branch_id, active',
      inventory:  '[product_id+branch_id], product_id',
      customers:  'customer_id, phone, last_seen_at',
      orders:     'local_id, server_id, created_at, status',
      orderItems: 'local_id, order_local_id',
      payments:   'local_id, order_local_id',
      syncQueue:  '++id, status, entity, created_at',
      meta:       'key',
    })
    // v2: Add product_type + parent_id indexes for variant/modifier system
    // All new fields are optional — existing data is automatically migrated
    this.version(2).stores({
      products: 'product_id, sku, barcode, category_id, active, product_type, parent_id',
    })
    // v3: Add inventoryBatches store for offline batch-expiry warnings
    this.version(3).stores({
      inventoryBatches: 'id, product_id, [product_id+branch_id], expiry_date',
    })
    // v4: Force Dexie database upgrade trigger
    this.version(4).stores({})
  }
}

const LEGACY_DB_NAME = 'oni-pos'
const LEGACY_MIGRATION_KEY = 'legacy_scope_migration_v1'
const browserDatabases = new Map<string, OniLocalDB>()

function getBrowserDatabase(databaseName: string): OniLocalDB {
  const existing = browserDatabases.get(databaseName)
  if (existing) return existing

  const database = new OniLocalDB(databaseName)
  browserDatabases.set(databaseName, database)
  return database
}

export let localDb = typeof window !== 'undefined'
  ? getBrowserDatabase(LEGACY_DB_NAME)
  : null as unknown as OniLocalDB

export function activateLocalDbScope(scopeId: string): OniLocalDB {
  if (typeof window === 'undefined') return localDb
  localDb = getBrowserDatabase(`${LEGACY_DB_NAME}:${scopeId}`)
  return localDb
}

export function getLocalDbScope(scopeId: string): OniLocalDB {
  if (typeof window === 'undefined') return localDb
  return getBrowserDatabase(`${LEGACY_DB_NAME}:${scopeId}`)
}

// Preserve offline work created before per-shop databases were introduced.
// The legacy database remains untouched so migration is non-destructive.
export async function migrateLegacyLocalDbToScope(scopeId: string, shopId: string, branchId: string): Promise<void> {
  if (typeof window === 'undefined') return

  const target = activateLocalDbScope(scopeId)
  if (await target.meta.get(LEGACY_MIGRATION_KEY)) return

  if (!(await Dexie.exists(LEGACY_DB_NAME))) {
    await target.meta.put({ key: LEGACY_MIGRATION_KEY, value: new Date().toISOString() })
    return
  }

  const legacy = getBrowserDatabase(LEGACY_DB_NAME)
  const hydratedShopId = (await legacy.meta.get('hydrated_shop_id'))?.value
  const hydratedBranchId = (await legacy.meta.get('hydrated_branch_id'))?.value
  const shouldCopyMasterData = hydratedShopId === shopId && (!hydratedBranchId || hydratedBranchId === branchId)

  const legacyOrders = await legacy.orders.filter((order) => order.branch_id === branchId).toArray()
  const orderIds = new Set(legacyOrders.map((order) => order.local_id))
  const legacyQueue = await legacy.syncQueue
    .filter((item) => item.payload.order.branch_id === branchId || orderIds.has(item.local_order_id))
    .toArray()

  const [orderItems, payments] = await Promise.all([
    legacy.orderItems.filter((item) => orderIds.has(item.order_local_id)).toArray(),
    legacy.payments.filter((payment) => orderIds.has(payment.order_local_id)).toArray(),
  ])

  const masterData = shouldCopyMasterData
    ? await Promise.all([
        legacy.products.toArray(),
        legacy.categories.toArray(),
        legacy.priceLists.toArray(),
        legacy.discounts.toArray(),
        legacy.employees.toArray(),
        legacy.inventory.filter((row) => row.branch_id === branchId).toArray(),
        legacy.inventoryBatches.filter((row) => row.branch_id === branchId).toArray(),
        legacy.customers.toArray(),
      ])
    : [[], [], [], [], [], [], [], []] as const

  const [products, categories, priceLists, discounts, employees, inventory, inventoryBatches, customers] = masterData
  const lastHydratedAt = shouldCopyMasterData
    ? (await legacy.meta.get('last_hydrated_at'))?.value
    : undefined

  await target.transaction('rw',
    [target.products, target.categories, target.priceLists, target.discounts,
     target.employees, target.inventory, target.inventoryBatches, target.customers,
     target.orders, target.orderItems, target.payments, target.syncQueue, target.meta],
    async () => {
      await Promise.all([
        products.length ? target.products.bulkPut(products) : null,
        categories.length ? target.categories.bulkPut(categories) : null,
        priceLists.length ? target.priceLists.bulkPut(priceLists) : null,
        discounts.length ? target.discounts.bulkPut(discounts) : null,
        employees.length ? target.employees.bulkPut(employees) : null,
        inventory.length ? target.inventory.bulkPut(inventory) : null,
        inventoryBatches.length ? target.inventoryBatches.bulkPut(inventoryBatches) : null,
        customers.length ? target.customers.bulkPut(customers) : null,
        legacyOrders.length ? target.orders.bulkPut(legacyOrders) : null,
        orderItems.length ? target.orderItems.bulkPut(orderItems) : null,
        payments.length ? target.payments.bulkPut(payments) : null,
        legacyQueue.length ? target.syncQueue.bulkPut(legacyQueue) : null,
      ])

      if (lastHydratedAt) {
        await Promise.all([
          target.meta.put({ key: 'last_hydrated_at', value: lastHydratedAt }),
          target.meta.put({ key: 'hydrated_branch_id', value: branchId }),
          target.meta.put({ key: 'hydrated_shop_id', value: shopId }),
        ])
      }
      await target.meta.put({ key: LEGACY_MIGRATION_KEY, value: new Date().toISOString() })
    }
  )
}
