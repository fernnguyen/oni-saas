import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import crypto from 'crypto'
import type { IDataConnector, ListOptions, ListResult } from './DataSource'

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
  private db: ReturnType<typeof drizzle>

  constructor(
    connectionUri: string,
    private readonly tenantId?: string,
    private readonly branchId?: string,
  ) {
    const pool = getPool(connectionUri)
    this.db = drizzle(pool as any)
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
  }

  private async generateSequentialId(entity: string): Promise<string> {
    const prefix = ENTITY_PREFIXES[entity]
    if (!prefix) return crypto.randomUUID()

    const tableName = this.getTableName(entity)

    // Build parameterized query
    const params: unknown[] = [`${prefix}-%`]
    let paramIdx = 2
    let query = `SELECT id FROM "${tableName}" WHERE id LIKE $1`

    if (this.tenantId) {
      query += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    const result = await this.db.execute(sql.raw(query))
    // drizzle returns { rows: [...] }
    const rows = (result as any).rows ?? result
    const ids = (Array.isArray(rows) ? rows : [])

    const existing = ids
      .map((r: any) => r.id)
      .filter((id: string) => typeof id === 'string' && id.startsWith(`${prefix}-`))
      .map((id: string) => parseInt(id.slice(prefix.length + 1), 10))
      .filter((n: number) => !isNaN(n))

    const max = existing.length > 0 ? Math.max(...existing) : 9999
    return `${prefix}-${max + 1}`
  }

  private formatRow(entity: string, row: any): Record<string, string> {
    const stringifiedRow: Record<string, string> = {}
    for (const key in row) {
      const v = row[key]
      if (v instanceof Date) {
        stringifiedRow[key] = v.toISOString()
      } else if (typeof v === 'object' && v !== null) {
        // JSONB → store as JSON string for IDataConnector compatibility
        stringifiedRow[key] = JSON.stringify(v)
      } else {
        stringifiedRow[key] = v !== null && v !== undefined ? String(v) : ''
      }
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
      whereClauses.push(`branch_id = $${paramIdx}`)
      params.push(this.branchId)
      paramIdx++
    }

    if (filters) {
      const legacyIdField = this.LEGACY_ID_MAP[entity]
      for (const [k, v] of Object.entries(filters)) {
        if (k === 'active' && v === 'ALL') continue
        const queryKey = (k === legacyIdField) ? 'id' : k
        whereClauses.push(`"${queryKey}" = $${paramIdx}`)
        params.push(v)
        paramIdx++
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const orderBySql = sortDesc ? 'ORDER BY created_at DESC' : 'ORDER BY created_at ASC'
    const offset = (page - 1) * limit

    const query = `SELECT * FROM "${tableName}" ${whereSql} ${orderBySql} LIMIT ${limit} OFFSET ${offset}`
    const countQuery = `SELECT COUNT(*) as total FROM "${tableName}" ${whereSql}`

    const [dataResult, countResult] = await Promise.all([
      this.db.execute(sql.raw(query)),
      this.db.execute(sql.raw(countQuery)),
    ])

    const dataRows = (dataResult as any).rows ?? dataResult
    const countRows = (countResult as any).rows ?? countResult
    const total = parseInt((Array.isArray(countRows) ? countRows[0]?.total : 0) ?? '0', 10)

    const data = (Array.isArray(dataRows) ? dataRows : []).map((row: any) => this.formatRow(entity, row))

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const tableName = this.getTableName(entity)
    const params: unknown[] = [id]
    let paramIdx = 2
    let query = `SELECT * FROM "${tableName}" WHERE id = $1`

    if (this.tenantId) {
      query += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ` AND branch_id = $${paramIdx}`
      params.push(this.branchId)
      paramIdx++
    }

    const result = await this.db.execute(sql.raw(query))
    const rows = (result as any).rows ?? result
    const resultRows = Array.isArray(rows) ? rows : []

    if (resultRows.length === 0) return null
    return this.formatRow(entity, resultRows[0])
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
      insertData.created_at = new Date().toISOString()
    }

    if (!insertData.id) {
      insertData.id = await this.generateSequentialId(entity)
    }

    if (entity === 'products' && !insertData.sku) {
      insertData.sku = insertData.id
    }

    const columns = Object.keys(insertData)
    const columnsSql = columns.map(k => `"${k}"`).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const values = Object.values(insertData)

    const query = `INSERT INTO "${tableName}" (${columnsSql}) VALUES (${placeholders})`
    await this.db.execute(sql.raw(query))

    return this.formatRow(entity, insertData)
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    const tableName = this.getTableName(entity)
    const updateData = { ...data }

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
        values.push(v)
        paramIdx++
      }
    }

    if (setClauses.length === 0) {
      const existing = await this.findById(entity, id)
      return existing as any
    }

    let query = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`
    values.push(id)
    paramIdx++

    if (this.tenantId) {
      query += ` AND tenant_id = $${paramIdx}`
      values.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ` AND branch_id = $${paramIdx}`
      values.push(this.branchId)
      paramIdx++
    }

    await this.db.execute(sql.raw(query))

    const updated = await this.findById(entity, id)
    if (!updated) throw new Error(`${entity}/${id} not found after update`)
    return updated
  }

  async delete(entity: string, id: string): Promise<void> {
    const tableName = this.getTableName(entity)
    const params: unknown[] = [id]
    let paramIdx = 2
    let query = `UPDATE "${tableName}" SET active = 'FALSE' WHERE id = $1`

    if (this.tenantId) {
      query += ` AND tenant_id = $${paramIdx}`
      params.push(this.tenantId)
      paramIdx++
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ` AND branch_id = $${paramIdx}`
      params.push(this.branchId)
      paramIdx++
    }

    await this.db.execute(sql.raw(query))
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
      if (!insertData.created_at) insertData.created_at = new Date().toISOString()

      const legacyIdField = this.LEGACY_ID_MAP[entity]
      if (legacyIdField && insertData[legacyIdField]) {
        if (!insertData.id) insertData.id = insertData[legacyIdField]
        delete insertData[legacyIdField]
      }

      if (!insertData.id) {
        if (nextIdNumber === -1) {
          const firstId = await this.generateSequentialId(entity)
          const match = firstId.match(/^([A-Z]+)-(\d+)$/)
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
        allValues.push(row[k] ?? null)
        return `$${paramIdx++}`
      })
      rowPlaceholders.push(`(${ph.join(', ')})`)
    }

    const query = `INSERT INTO "${tableName}" (${columnsSql}) VALUES ${rowPlaceholders.join(', ')}`
    await this.db.execute(sql.raw(query))

    return insertRows.map(row => this.formatRow(entity, row))
  }
}
