import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import crypto from 'crypto'
import type { IDataConnector, ListOptions, ListResult } from './DataSource'

const ENTITY_PREFIXES: Record<string, string> = {
  'categories':       'CAT',
  'suppliers':        'SUP',
  'products':         'P',
  'price-lists':      'PL',
  'discounts':        'DISC',
  'inventory':        'INV',
  'stock-movements':  'SM',
  'customers':        'C',
  'orders':           'ORD',
  'order-items':      'OI',
  'payments':         'PAY',
  'branches':         'BR',
  'employees':        'EMP',
  'returns':          'RET',
  'return-items':     'RI',
  'cashbook':         'CB',
}

export class MysqlConnector implements IDataConnector {
  private db: ReturnType<typeof drizzle>

  constructor(
    connectionUri: string,
    private readonly tenantId?: string,
    private readonly branchId?: string,
  ) {
    const poolConnection = mysql.createPool(connectionUri)
    this.db = drizzle(poolConnection)
  }

  // Helper to ensure table names are safe
  private getTableName(entity: string) {
    // Map google sheet entities to DB table names if needed
    // e.g., 'stock-movements' -> 'stock_movements'
    return entity.replace(/-/g, '_')
  }

  // Entities that do not have branch_id and are scoped only by tenant
  private readonly tenantScopedEntities = [
    'categories',
    'price-lists',
    'discounts',
    'suppliers',
  ]

  private async generateSequentialId(entity: string): Promise<string> {
    const prefix = ENTITY_PREFIXES[entity]
    if (!prefix) return crypto.randomUUID()

    const tableName = this.getTableName(entity)
    let query = `SELECT id FROM \`${tableName}\` WHERE id LIKE ?`
    const params: unknown[] = [`${prefix}-%`]

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      params.push(this.tenantId)
    }

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, params)))
    const resultRows = rows as any[]

    const existing = resultRows
      .map(r => r.id)
      .filter(id => typeof id === 'string' && id.startsWith(`${prefix}-`))
      .map(id => parseInt(id.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n))

    const max = existing.length > 0 ? Math.max(...existing) : 0
    return `${prefix}-${String(max + 1).padStart(3, '0')}`
  }

  private readonly LEGACY_ID_MAP: Record<string, string> = {
    'categories': 'category_id',
    'suppliers': 'supplier_id',
    'products': 'product_id',
    'price-lists': 'price_id',
    'discounts': 'discount_id',
    'employees': 'employee_id',
    'customers': 'customer_id',
    'orders': 'order_id',
  }

  private formatRow(entity: string, row: any): Record<string, string> {
    const stringifiedRow: Record<string, string> = {}
    for (const key in row) {
      stringifiedRow[key] = row[key] !== null && row[key] !== undefined ? String(row[key]) : ''
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
    
    let whereClauses: string[] = []
    const params: unknown[] = []

    if (this.tenantId) {
      whereClauses.push('tenant_id = ?')
      params.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      whereClauses.push('branch_id = ?')
      params.push(this.branchId)
    }

    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        whereClauses.push(`${k} = ?`)
        params.push(v)
      }
    }

    // In a real scenario, search would look at specific columns. 
    // Here we just mock it or skip it, as dynamic search across all columns is complex in pure SQL without knowing schema.
    
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const orderBySql = sortDesc ? 'ORDER BY created_at DESC' : 'ORDER BY created_at ASC'
    const offset = (page - 1) * limit

    const query = `SELECT * FROM \`${tableName}\` ${whereSql} ${orderBySql} LIMIT ? OFFSET ?`
    const countQuery = `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereSql}`

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, [...params, limit, offset])))
    const [countResult] = await this.db.execute(sql.raw(mysql.format(countQuery, params)))

    const total = (countResult as any)[0]?.total || 0

    // Convert all values to string and alias legacy id for IDataConnector compatibility
    const data = (rows as any[]).map(row => this.formatRow(entity, row))

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const tableName = this.getTableName(entity)
    let query = `SELECT * FROM \`${tableName}\` WHERE id = ?`
    const params: unknown[] = [id]

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      params.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ' AND branch_id = ?'
      params.push(this.branchId)
    }

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, params)))
    const resultRows = rows as any[]

    if (resultRows.length === 0) return null

    return this.formatRow(entity, resultRows[0])
  }

  async create(entity: string, data: Record<string, string>): Promise<Record<string, string>> {
    const tableName = this.getTableName(entity)
    
    const insertData = { ...data }
    if (this.tenantId) {
      insertData.tenant_id = this.tenantId
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      insertData.branch_id = this.branchId
    }

    if (!insertData.created_at) {
      insertData.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    }

    if (!insertData.id) {
      insertData.id = await this.generateSequentialId(entity)
    }

    if (entity === 'products' && !insertData.sku) {
      insertData.sku = insertData.id
    }

    const columns = Object.keys(insertData).map(k => `\`${k}\``).join(', ')
    const placeholders = Object.keys(insertData).map(() => '?').join(', ')
    const values = Object.values(insertData)

    const query = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`
    await this.db.execute(sql.raw(mysql.format(query, values)))

    return this.formatRow(entity, insertData)
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    const tableName = this.getTableName(entity)

    const setClauses: string[] = []
    const values: unknown[] = []

    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        setClauses.push(`\`${k}\` = ?`)
        values.push(v)
      }
    }

    if (setClauses.length === 0) {
      const existing = await this.findById(entity, id)
      return existing as any
    }

    let query = `UPDATE \`${tableName}\` SET ${setClauses.join(', ')} WHERE id = ?`
    values.push(id)

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      values.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ' AND branch_id = ?'
      values.push(this.branchId)
    }

    await this.db.execute(sql.raw(mysql.format(query, values)))

    const updated = await this.findById(entity, id)
    if (!updated) throw new Error(`${entity}/${id} not found after update`)
    return updated
  }

  async delete(entity: string, id: string): Promise<void> {
    const tableName = this.getTableName(entity)
    let query = `UPDATE \`${tableName}\` SET active = 'FALSE' WHERE id = ?`
    const params: unknown[] = [id]

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      params.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ' AND branch_id = ?'
      params.push(this.branchId)
    }

    await this.db.execute(sql.raw(mysql.format(query, params)))
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    if (rows.length === 0) return []
    const tableName = this.getTableName(entity)
    
    const insertRows = []
    for (const row of rows) {
      const insertData = { ...row }
      if (this.tenantId) insertData.tenant_id = this.tenantId
      if (this.branchId && !this.tenantScopedEntities.includes(entity)) insertData.branch_id = this.branchId
      if (!insertData.created_at) insertData.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      
      const legacyIdField = this.LEGACY_ID_MAP[entity]
      if (legacyIdField && insertData[legacyIdField] && !insertData.id) {
        insertData.id = insertData[legacyIdField]
      }
      
      if (!insertData.id) insertData.id = await this.generateSequentialId(entity)
      if (entity === 'products' && !insertData.sku) insertData.sku = insertData.id
      insertRows.push(insertData)
    }

    // Assuming all rows have the same keys for batch insert
    const columns = Object.keys(insertRows[0])
    const columnsSql = columns.map(k => `\`${k}\``).join(', ')
    
    const values: unknown[] = []
    const placeholders = insertRows.map(row => {
      const rowPlaceholders = columns.map(k => {
        values.push(row[k] ?? null)
        return '?'
      })
      return `(${rowPlaceholders.join(', ')})`
    }).join(', ')

    const query = `INSERT INTO \`${tableName}\` (${columnsSql}) VALUES ${placeholders}`
    await this.db.execute(sql.raw(mysql.format(query, values)))

    return insertRows.map(row => this.formatRow(entity, row))
  }
}
