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
  customer_type?: string
  debt_amount?: number
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
  cost_price: number
  discount_amount: number
  line_total: number
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

  constructor() {
    super('oni-pos')
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
  }
}

export const localDb = typeof window !== 'undefined' ? new OniLocalDB() : null as unknown as OniLocalDB
