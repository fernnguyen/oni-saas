import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import crypto from 'crypto'
import type { IDataConnector, ListOptions, ListResult } from './DataSource'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

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
  'cashbook':            'CB',
  'location-resources':  'LR',
  'product-bom':         'BOM',
}

export class MysqlConnector implements IDataConnector {
  private db: ReturnType<typeof drizzle>

  constructor(
    connectionUri: string,
    private readonly tenantId?: string,
    private readonly branchId?: string,
  ) {
    const poolConnection = mysql.createPool(connectionUri)
    this.db = drizzle(poolConnection as any)
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
    'product-bom',
  ]

  private async generateSequentialId(entity: string): Promise<string> {
    const prefix = ENTITY_PREFIXES[entity]
    if (!prefix) return crypto.randomUUID()

    let tenantHash = ''
    if (this.tenantId) {
      tenantHash = crypto.createHash('sha256').update(this.tenantId).digest('hex').substring(0, 8).toUpperCase() + '-'
    }
    const searchPrefix = `${prefix}-${tenantHash}`

    const tableName = this.getTableName(entity)
    let query = `SELECT id FROM \`${tableName}\` WHERE id LIKE ?`
    const params: any[] = [`${searchPrefix}%`]

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      params.push(this.tenantId)
    }

    // Filter to only include numeric suffixes (5 to 10 digits) to prevent mixed
    // hexadecimal/random IDs from breaking the sequence
    const regexPattern = `^${searchPrefix}[0-9]{5,10}$`
    query += ' AND id REGEXP ?'
    params.push(regexPattern)

    query += ' ORDER BY CAST(SUBSTRING_INDEX(id, \'-\', -1) AS UNSIGNED) DESC LIMIT 1'

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, params)))
    const resultRows = rows as unknown as any[]

    let max = 9999
    if (resultRows.length > 0) {
      const lastId = resultRows[0].id as string
      if (lastId && typeof lastId === 'string' && lastId.startsWith(searchPrefix)) {
        const numStr = lastId.slice(searchPrefix.length)
        const num = parseInt(numStr, 10)
        if (!isNaN(num)) max = num
      }
    }

    return `${searchPrefix}${max + 1}`
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
  }

  private formatRow(entity: string, row: any): Record<string, string> {
    const stringifiedRow: Record<string, string> = {}
    for (const key in row) {
      let valStr = row[key] !== null && row[key] !== undefined ? String(row[key]) : ''
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
    
    let whereClauses: string[] = []
    const params: any[] = []

    if (this.tenantId) {
      whereClauses.push('tenant_id = ?')
      params.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      whereClauses.push('branch_id = ?')
      params.push(this.branchId)
    }

    if (filters) {
      const legacyIdField = this.LEGACY_ID_MAP[entity]
      for (const [k, v] of Object.entries(filters)) {
        if (k === 'active') {
          if (v === 'ALL') continue
          const activeVal = typeof v === 'string' ? v.toUpperCase() : String(v).toUpperCase()
          whereClauses.push(`\`active\` = ?`)
          params.push(activeVal)
          continue
        }
        const queryKey = (k === legacyIdField) ? 'id' : k
        whereClauses.push(`\`${queryKey}\` = ?`)
        params.push(v)
      }
    }

    // Default to excluding soft-deleted records if active filter is not explicitly provided
    if (!filters || !('active' in filters)) {
      whereClauses.push(`(\`active\` IS NULL OR \`active\` != 'FALSE')`)
    }

    // Implement basic dynamic search for common entities
    if (search) {
      const searchTerm = `%${search}%`
      if (entity === 'orders') {
        whereClauses.push(`(order_no LIKE ? OR customer_name LIKE ? OR reference_no LIKE ?)`)
        params.push(searchTerm, searchTerm, searchTerm)
      } else if (entity === 'customers') {
        whereClauses.push(`(name LIKE ? OR phone LIKE ?)`)
        params.push(searchTerm, searchTerm)
      } else if (entity === 'products') {
        whereClauses.push(`(name LIKE ? OR sku LIKE ?)`)
        params.push(searchTerm, searchTerm)
      } else if (entity === 'returns') {
        whereClauses.push(`(return_no LIKE ? OR order_no LIKE ? OR customer_name LIKE ?)`)
        params.push(searchTerm, searchTerm, searchTerm)
      } else {
        // Fallback for other entities: just search by legacy ID or name if possible, 
        // but since we don't know schema, we might skip or do a generic fallback.
        // For now, only support search on known entities.
      }
    }
    
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const orderBySql = sortDesc ? 'ORDER BY updated_at DESC, created_at DESC' : 'ORDER BY updated_at ASC, created_at ASC'
    const offset = (page - 1) * limit

    const query = `SELECT * FROM \`${tableName}\` ${whereSql} ${orderBySql} LIMIT ? OFFSET ?`
    const countQuery = `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereSql}`

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, [...params, limit, offset])))
    const [countResult] = await this.db.execute(sql.raw(mysql.format(countQuery, params)))

    const total = (countResult as any)[0]?.total || 0

    // Convert all values to string and alias legacy id for IDataConnector compatibility
    const data = (rows as unknown as any[]).map(row => this.formatRow(entity, row))

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const tableName = this.getTableName(entity)
    let query = `SELECT * FROM \`${tableName}\` WHERE id = ?`
    const params: any[] = [id]

    if (this.tenantId) {
      query += ' AND tenant_id = ?'
      params.push(this.tenantId)
    }

    if (this.branchId && !this.tenantScopedEntities.includes(entity)) {
      query += ' AND branch_id = ?'
      params.push(this.branchId)
    }

    const [rows] = await this.db.execute(sql.raw(mysql.format(query, params)))
    const resultRows = rows as unknown as any[]

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

    if (this.tenantId) {
      insertData.tenant_id = this.tenantId
    }

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

    const columns = Object.keys(insertData).map(k => `\`${k}\``).join(', ')
    const placeholders = Object.keys(insertData).map(() => '?').join(', ')
    const values = Object.values(insertData)

    const query = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`
    await this.db.execute(sql.raw(mysql.format(query, values)))

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
    const values: any[] = []

    for (const [k, v] of Object.entries(updateData)) {
      if (v !== undefined && k !== 'id') {
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
    const params: any[] = [id]

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
    let nextIdNumber = -1
    let idPrefix = ''

    for (const row of rows) {
      const insertData = { ...row }
      if (this.tenantId) insertData.tenant_id = this.tenantId
      if (this.branchId && !this.tenantScopedEntities.includes(entity)) insertData.branch_id = this.branchId
      if (!insertData.created_at) insertData.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      
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
      insertRows.push(insertData)
    }

    // Assuming all rows have the same keys for batch insert
    const columns = Object.keys(insertRows[0])
    const columnsSql = columns.map(k => `\`${k}\``).join(', ')
    
    const values: any[] = []
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
