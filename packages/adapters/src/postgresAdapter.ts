import { Pool } from 'pg'
import crypto from 'crypto'
import type { IDataConnector, ListOptions, ListResult } from './DataSource'
import { getGMT7Time } from '@oni/core'


const ENTITY_PREFIXES: Record<string, string> = {
  'categories':         'CAT',
  'suppliers':          'SUP',
  'products':           'P',
  'price-lists':        'PL',
  'discounts':          'DISC',
  'inventory':          'INV',
  'stock-movements':    'SM',
  'customers':          'C',
  'orders':             'ORD',
  'order-items':        'OI',
  'payments':           'PAY',
  'branches':           'BR',
  'employees':          'EMP',
  'returns':            'RET',
  'return-items':       'RI',
  'cashbook':           'CB',
  'location-resources': 'LR',
  'product-bom':        'BOM',
  'product-units':      'PU',
  'inventory-batches':  'IB',
  'payment-funds':      'PF',
  'payment-methods':    'PM',
  'shop-shifts':        'SHF',
  'fund-audits':        'FA',
  'purchase-requisitions':      'PR',
  'purchase-requisition-items':  'PRI',
  'purchase-orders':            'PO',
  'purchase-order-items':       'POI',
  'goods-receipt-notes':        'GRN',
  'goods-receipt-note-items':   'GRI',
  'product-purchase-history':   'PPH',
  'departments':                'DEP',
  'user-departments':           'USD',
  'assets':                     'AST',
  'asset-allocations':          'ATA',
  'asset-depreciations':        'ASD',
  'cost-allocation-templates':  'CAT',
  'warehouses':                  'WH',
  'sepay-webhook-logs':          'SWL',
  'customer-branch-stats':       'CBS',
  'reservations':               'RSV',
  'minibar-setup':              'MBS',
  'room-minibar-stock':         'RMS',
  'housekeeping-logs':          'HKL',
  'ota-bookings':               'OTA',
  'booking-channels':           'BC',
}

// Shared pool cache to avoid creating a new pool per request
const poolCache = new Map<string, Pool>()

function getPool(connectionUri: string): Pool {
  let pool = poolCache.get(connectionUri)
  if (!pool) {
    pool = new Pool({ connectionString: connectionUri, max: 10 })
    poolCache.set(connectionUri, pool)
  }
  return pool
}

export class PostgresConnector implements IDataConnector {
  private pool: Pool

  constructor(
    connectionUri: string,
    private readonly tenantId?: string,
    private readonly branchId?: string,
    private readonly shareCustomers?: boolean,
  ) {
    this.pool = getPool(connectionUri)
    if (this.shareCustomers) {
      this.tenantScopedEntities.push('customers')
    }
  }

  /** Execute a parameterized query and return rows */
  private async query(text: string, params: unknown[] = []): Promise<any[]> {
    const result = await this.pool.query(text, params)
    return result.rows
  }

  /** Columns that are JSONB type — empty strings must be null or valid JSON */
  private readonly JSONB_COLUMNS = new Set(['metadata', 'rules'])

  /** Sanitize a value before inserting/updating: handle JSONB columns */
  private sanitizeValue(column: string, value: unknown): unknown {
    if (this.JSONB_COLUMNS.has(column)) {
      if (value === null || value === undefined || value === '') return null
      // If it's already a string, try to parse to verify validity
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed === '') return null
        try { JSON.parse(trimmed) } catch { return null }
        return trimmed
      }
      // If it's an object, stringify it
      if (typeof value === 'object') return JSON.stringify(value)
    }
    return value
  }

  private getTableName(entity: string) {
    return entity.replace(/-/g, '_')
  }

  // Entities scoped only by tenant, not by branch
  private readonly tenantScopedEntities = [
    'categories',
    'price-lists',
    'discounts',
    'suppliers',
    'product-bom',
    'product-units',
    'product-purchase-history',
    'purchase-requisition-items',
    'purchase-order-items',
    'goods-receipt-note-items',
    'user-departments',
    'asset-allocations',
    'asset_allocations',
    'qr-session-carts',
  ]

  private readonly LEGACY_ID_MAP: Record<string, string> = {
    'categories': 'category_id',
    'suppliers': 'supplier_id',
    'products': 'product_id',
    'price-lists': 'price_id',
    'discounts': 'discount_id',
    'employees': 'employee_id',
    'customers': 'customer_id',
    'orders': 'order_id',
    'inventory': 'inventory_id',
    'stock-movements': 'movement_id',
    'order-items': 'item_id',
    'returns': 'return_id',
    'return-items': 'item_id',
    'cashbook': 'transaction_id',
    'payments': 'payment_id',
    'branches': 'branch_id',
    'location-resources': 'resource_id',
    'product-bom': 'bom_id',
    'product-units': 'unit_id',
    'inventory-batches': 'batch_id',
    'payment-funds': 'fund_id',
    'payment-methods': 'method_id',
    'shop-shifts': 'shift_id',
    'fund-audits': 'audit_id',
    'purchase-requisitions':      'requisition_id',
    'purchase-requisition-items':  'item_id',
    'purchase-orders':            'purchase_order_id',
    'purchase-order-items':       'item_id',
    'goods-receipt-notes':        'grn_id',
    'goods-receipt-note-items':   'item_id',
    'product-purchase-history':   'history_id',
    'departments':                'department_id',
    'user-departments':           'user_department_id',
    'assets':                     'asset_id',
    'asset-allocations':          'allocation_id',
    'asset-depreciations':        'depreciation_id',
    'cost-allocation-templates':  'template_id',
    'warehouses':                 'warehouse_id',
    'reservations':               'reservation_id',
    'minibar-setup':              'setup_id',
    'room-minibar-stock':         'stock_id',
    'housekeeping-logs':          'log_id',
    'ota-bookings':               'booking_id',
    'booking-channels':           'channel_id',
  }

  private async generateSequentialId(entity: string): Promise<string> {
    const prefix = ENTITY_PREFIXES[entity]
    if (!prefix) return crypto.randomUUID()

    let tenantHash = ''
    if (this.tenantId) {
      tenantHash = crypto.createHash('sha256').update(this.tenantId).digest('hex').substring(0, 8).toUpperCase() + '-'
    }
    const searchPrefix = `${prefix}-${tenantHash}`

    const tableName = this.getTableName(entity)

    const params: unknown[] = [`${searchPrefix}%`]
    let paramIdx = 2
    let queryText = `SELECT id FROM "${tableName}" WHERE id LIKE $1`

    if (this.tenantId) {
      queryText += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    // Filter to only include numeric suffixes (5 to 10 digits) to prevent mixed
    // hexadecimal/random IDs from breaking the sequence
    const regexPattern = '^' + searchPrefix + '[0-9]{5,10}$'
    queryText += ` AND id ~ $${paramIdx}`
    params.push(regexPattern)
    paramIdx++

    queryText += ` ORDER BY (SUBSTRING(id FROM '[0-9]+$'))::bigint DESC LIMIT 1`

    const rows = await this.query(queryText, params)

    let max = 9999
    if (rows.length > 0) {
      const lastId = rows[0].id as string
      if (lastId && typeof lastId === 'string' && lastId.startsWith(searchPrefix)) {
        const numStr = lastId.slice(searchPrefix.length)
        const num = parseInt(numStr, 10)
        if (!isNaN(num)) max = num
      }
    }

    return `${searchPrefix}${max + 1}`
  }

  private formatRow(entity: string, row: any): Record<string, string> {
    const stringifiedRow: Record<string, string> = {}
    for (const key in row) {
      const v = row[key]
      let valStr = ''
      if (v instanceof Date) {
        if (key === 'expected_checkin' || key === 'expected_checkout') {
          // Format as local ISO string to preserve the timezone-naive database hours/minutes
          const pad = (n: number) => (n < 10 ? '0' : '') + n
          valStr = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
        } else {
          valStr = v.toISOString()
        }
      } else if (typeof v === 'object' && v !== null) {
        // JSONB → store as JSON string for IDataConnector compatibility
        valStr = JSON.stringify(v)
      } else {
        valStr = v !== null && v !== undefined ? String(v) : ''
      }

      if (key === 'phone' && valStr) {
        const trimmed = valStr.trim()
        if (/^[1-9][0-9]{8}$/.test(trimmed)) {
          valStr = '0' + trimmed
        }
      }
      stringifiedRow[key] = valStr
    }
    const legacyIdField = this.LEGACY_ID_MAP[entity]
    if (legacyIdField && stringifiedRow.id) {
      stringifiedRow[legacyIdField] = stringifiedRow.id
    }
    return stringifiedRow
  }

  async list(entity: string, options: ListOptions = {}): Promise<ListResult> {
    const { page = 1, limit = 50, search, filters, sortDesc } = options
    const tableName = this.getTableName(entity)

    const whereClauses: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (this.tenantId) {
      whereClauses.push(`tenant_id = $${paramIdx}`)
      params.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      whereClauses.push(`(branch_id = $${paramIdx} OR branch_id IS NULL OR branch_id = '')`)
      params.push(this.branchId)
      paramIdx++
    }

    if (filters) {
      const legacyIdField = this.LEGACY_ID_MAP[entity]
      for (const [k, v] of Object.entries(filters)) {
        if (k === 'active') {
          if (v === 'ALL') continue
          const activeVal = typeof v === 'string' ? v.toUpperCase() : String(v).toUpperCase()
          whereClauses.push(`"active" = $${paramIdx}`)
          params.push(activeVal)
          paramIdx++
          continue
        }
        if (k === 'exclude_product_type') {
          whereClauses.push(`("product_type" != $${paramIdx} OR "product_type" IS NULL)`)
          params.push(v)
          paramIdx++
          continue
        }
        const queryKey = (k === legacyIdField) ? 'id' : k
        
        if (Array.isArray(v)) {
          if (v.length === 0) {
            whereClauses.push(`1=0`) // Match nothing
          } else {
            const inParams = v.map(val => {
              params.push(val)
              return `$${paramIdx++}`
            })
            whereClauses.push(`"${queryKey}" IN (${inParams.join(', ')})`)
          }
        } else {
          whereClauses.push(`"${queryKey}" = $${paramIdx}`)
          params.push(v)
          paramIdx++
        }
      }
    }

    if (search) {
      const searchTerm = `%${search}%`
      if (entity === 'customers') {
        let phoneSearch = search.trim()
        if (phoneSearch.startsWith('0')) {
          phoneSearch = phoneSearch.substring(1)
        }
        whereClauses.push(`("name" ILIKE $${paramIdx} OR "phone" ILIKE $${paramIdx} OR "phone" ILIKE $${paramIdx + 1} OR "customer_code" ILIKE $${paramIdx} OR "id" ILIKE $${paramIdx})`)
        params.push(searchTerm, `%${phoneSearch}%`)
        paramIdx += 2
      } else if (entity === 'products') {
        whereClauses.push(`("name" ILIKE $${paramIdx} OR "sku" ILIKE $${paramIdx} OR "id" ILIKE $${paramIdx})`)
        params.push(searchTerm)
        paramIdx++
      } else if (entity === 'orders') {
        whereClauses.push(`("order_no" ILIKE $${paramIdx} OR "customer_name" ILIKE $${paramIdx} OR "reference_no" ILIKE $${paramIdx} OR "id" ILIKE $${paramIdx})`)
        params.push(searchTerm)
        paramIdx++
      } else if (entity === 'returns') {
        whereClauses.push(`("return_no" ILIKE $${paramIdx} OR "order_no" ILIKE $${paramIdx} OR "customer_name" ILIKE $${paramIdx} OR "id" ILIKE $${paramIdx})`)
        params.push(searchTerm)
        paramIdx++
      } else if (entity === 'suppliers') {
        whereClauses.push(`("name" ILIKE $${paramIdx} OR "phone" ILIKE $${paramIdx} OR "id" ILIKE $${paramIdx})`)
        params.push(searchTerm)
        paramIdx++
      } else {
        whereClauses.push(`t::text ILIKE $${paramIdx}`)
        params.push(searchTerm)
        paramIdx++
      }
    }

    // Default to excluding soft-deleted records if active filter is not explicitly provided
    if (!filters || !('active' in filters)) {
      whereClauses.push(`("active" IS NULL OR "active" != 'FALSE')`)
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const orderBySql = sortDesc ? 'ORDER BY updated_at DESC NULLS LAST, created_at DESC' : 'ORDER BY updated_at ASC NULLS FIRST, created_at ASC'
    const offset = (page - 1) * limit

    const dataQuery = `SELECT * FROM "${tableName}" AS t ${whereSql} ${orderBySql} LIMIT ${limit} OFFSET ${offset}`
    const countQuery = `SELECT COUNT(*) as total FROM "${tableName}" AS t ${whereSql}`

    const [dataRows, countRows] = await Promise.all([
      this.query(dataQuery, params),
      this.query(countQuery, params),
    ])

    const total = parseInt(countRows[0]?.total ?? '0', 10)
    const data = dataRows.map((row: any) => this.formatRow(entity, row))

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const tableName = this.getTableName(entity)
    const params: unknown[] = [id]
    let paramIdx = 2
    let queryText = `SELECT * FROM "${tableName}" WHERE id = $1`

    if (this.tenantId) {
      queryText += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      queryText += ` AND (branch_id = $${paramIdx} OR branch_id IS NULL OR branch_id = '')`
      params.push(this.branchId)
      paramIdx++
    }

    const rows = await this.query(queryText, params)
    if (rows.length === 0) return null
    return this.formatRow(entity, rows[0])
  }

  async create(entity: string, data: Record<string, string>): Promise<Record<string, string>> {
    const tableName = this.getTableName(entity)
    const insertData = { ...data }

    const legacyIdField = this.LEGACY_ID_MAP[entity]
    if (legacyIdField && insertData[legacyIdField]) {
      if (!insertData.id) insertData.id = insertData[legacyIdField]
      delete insertData[legacyIdField]
    }

    if (this.tenantId) insertData.tenant_id = this.tenantId
    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      insertData.branch_id = this.branchId
    }

    if (!insertData.created_at) {
      insertData.created_at = getGMT7Time()
    }
    if (!insertData.updated_at) {
      insertData.updated_at = insertData.created_at
    }

    if (!insertData.id) {
      insertData.id = await this.generateSequentialId(entity)
    }

    if (entity === 'products' && !insertData.sku) {
      insertData.sku = insertData.id
    }

    if (entity === 'employees' && (!insertData.employee_code || insertData.employee_code.trim() === '')) {
      const match = insertData.id.match(/-(\d+)$/)
      const seq = match ? match[1] : '10001'
      insertData.employee_code = `NV${seq}`
    }

    const columns = Object.keys(insertData)
    const columnsSql = columns.map(k => `"${k}"`).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const values = columns.map(k => this.sanitizeValue(k, insertData[k]))

    const queryText = `INSERT INTO "${tableName}" (${columnsSql}) VALUES (${placeholders})`
    await this.query(queryText, values)

    return this.formatRow(entity, insertData)
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    const tableName = this.getTableName(entity)
    const updateData = { ...data }
    updateData.updated_at = getGMT7Time()

    const legacyIdField = this.LEGACY_ID_MAP[entity]
    if (legacyIdField && updateData[legacyIdField] !== undefined) {
      delete updateData[legacyIdField]
    }

    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    for (const [k, v] of Object.entries(updateData)) {
      if (v !== undefined && k !== 'id') {
        setClauses.push(`"${k}" = $${paramIdx}`)
        values.push(this.sanitizeValue(k, v))
        paramIdx++
      }
    }

    if (setClauses.length === 0) {
      const existing = await this.findById(entity, id)
      return existing as any
    }

    let queryText = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`
    values.push(id)
    paramIdx++

    if (this.tenantId) {
      queryText += ` AND tenant_id = $${paramIdx}`
      values.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      queryText += ` AND (branch_id = $${paramIdx} OR branch_id IS NULL OR branch_id = '')`
      values.push(this.branchId)
      paramIdx++
    }

    await this.query(queryText, values)

    const updated = await this.findById(entity, id)
    if (!updated) throw new Error(`${entity}/${id} not found after update`)
    return updated
  }

  async delete(entity: string, id: string): Promise<void> {
    const tableName = this.getTableName(entity)
    const params: unknown[] = [id]
    let paramIdx = 2
    let queryText = `UPDATE "${tableName}" SET active = 'FALSE' WHERE id = $1`

    if (this.tenantId) {
      queryText += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      queryText += ` AND (branch_id = $${paramIdx} OR branch_id IS NULL OR branch_id = '')`
      params.push(this.branchId)
      paramIdx++
    }

    await this.query(queryText, params)
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    if (rows.length === 0) return []

    const tableName = this.getTableName(entity)
    const insertRows: Record<string, string>[] = []
    let nextIdNumber = -1
    let idPrefix = ''

    for (const row of rows) {
      const insertData = { ...row }
      if (this.tenantId) insertData.tenant_id = this.tenantId
      if (this.branchId && !this.tenantScopedEntities.includes(entity)) insertData.branch_id = this.branchId
      if (!insertData.created_at) insertData.created_at = getGMT7Time()
      if (!insertData.updated_at) insertData.updated_at = insertData.created_at

      const legacyIdField = this.LEGACY_ID_MAP[entity]
      if (legacyIdField && insertData[legacyIdField]) {
        if (!insertData.id) insertData.id = insertData[legacyIdField]
        delete insertData[legacyIdField]
      }

      if (!insertData.id) {
        if (nextIdNumber === -1) {
          const firstId = await this.generateSequentialId(entity)
          const match = firstId.match(/^(.+)-(\d+)$/)
          if (match) {
            idPrefix = match[1]
            nextIdNumber = parseInt(match[2], 10)
          } else {
            insertData.id = firstId
          }
        }
        if (nextIdNumber !== -1) {
          insertData.id = `${idPrefix}-${nextIdNumber}`
          nextIdNumber++
        }
      }

      if (entity === 'products' && !insertData.sku) insertData.sku = insertData.id
      if (entity === 'employees' && (!insertData.employee_code || insertData.employee_code.trim() === '')) {
        const match = insertData.id.match(/-(\d+)$/)
        const seq = match ? match[1] : '10001'
        insertData.employee_code = `NV${seq}`
      }
      insertRows.push(insertData)
    }

    // Batch insert with a single INSERT ... VALUES (...), (...) statement
    const columns = Object.keys(insertRows[0])
    const columnsSql = columns.map(k => `"${k}"`).join(', ')

    const allValues: unknown[] = []
    const rowPlaceholders: string[] = []
    let paramIdx = 1

    for (const row of insertRows) {
      const ph = columns.map(k => {
        allValues.push(this.sanitizeValue(k, row[k] ?? null))
        return `$${paramIdx++}`
      })
      rowPlaceholders.push(`(${ph.join(', ')})`)
    }

    const queryText = `INSERT INTO "${tableName}" (${columnsSql}) VALUES ${rowPlaceholders.join(', ')} ON CONFLICT (id) DO NOTHING`
    await this.query(queryText, allValues)

    return insertRows.map(row => this.formatRow(entity, row))
  }
}
