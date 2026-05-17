import type { IDataConnector, ListOptions, ListResult } from './DataSource'

interface EntityConfig {
  tab: string
  idKey: string
  prefix: string
}

const ENTITY_CONFIG: Record<string, EntityConfig> = {
  'categories':       { tab: 'Categories',     idKey: 'category_id',  prefix: 'CAT'  },
  'suppliers':        { tab: 'Suppliers',       idKey: 'supplier_id',  prefix: 'SUP'  },
  'products':         { tab: 'Products',        idKey: 'product_id',   prefix: 'P'    },
  'price-lists':      { tab: 'PriceLists',      idKey: 'price_id',     prefix: 'PL'   },
  'discounts':        { tab: 'Discounts',       idKey: 'discount_id',  prefix: 'DISC' },
  'inventory':        { tab: 'Inventory',       idKey: 'inventory_id', prefix: 'INV'  },
  'stock-movements':  { tab: 'StockMovements',  idKey: 'movement_id',  prefix: 'SM'   },
  'customers':        { tab: 'Customers',       idKey: 'customer_id',  prefix: 'C'    },
  'orders':           { tab: 'Orders',          idKey: 'order_id',     prefix: 'ORD'  },
  'order-items':      { tab: 'OrderItems',      idKey: 'item_id',      prefix: 'OI'   },
  'payments':         { tab: 'Payments',        idKey: 'payment_id',   prefix: 'PAY'  },
  'branches':         { tab: 'Branches',        idKey: 'branch_id',    prefix: 'BR'   },
  'employees':        { tab: 'Employees',       idKey: 'employee_id',  prefix: 'EMP'  },
  'returns':          { tab: 'Returns',         idKey: 'return_id',    prefix: 'RET'  },
  'return-items':     { tab: 'ReturnItems',     idKey: 'item_id',      prefix: 'RI'   },
  'cashbook':           { tab: 'Cashbook',          idKey: 'transaction_id', prefix: 'CB'  },
  'location-resources': { tab: 'LocationResources', idKey: 'resource_id',    prefix: 'LR'  },
}

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

const CACHE_TTL = 30_000
interface CacheEntry { headers: string[]; rows: Record<string, string>[]; expiresAt: number }
const tabCache = new Map<string, CacheEntry>()

function cacheGet(key: string): CacheEntry | null {
  const entry = tabCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    tabCache.delete(key)
    return null
  }
  return entry
}

function cacheSet(key: string, headers: string[], rows: Record<string, string>[]): void {
  tabCache.set(key, { headers, rows, expiresAt: Date.now() + CACHE_TTL })
}

function cacheInvalidate(key: string): void {
  tabCache.delete(key)
}

async function sheetsGet(token: string, sheetId: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${sheetId}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Sheets GET ${path} failed: ${res.status} ${res.statusText}`)
  return res.json()
}

async function sheetsPost(token: string, sheetId: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/${sheetId}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Sheets POST ${path} failed: ${res.status} ${res.statusText}`)
  return res.json()
}

async function sheetsPut(token: string, sheetId: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/${sheetId}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Sheets PUT ${path} failed: ${res.status} ${res.statusText}`)
  return res.json()
}

// Auto-create a sheet tab with headers derived from sampleData + idKey.
// Called when readTab() fails with a 400 (tab doesn't exist yet).
async function createTab(
  token: string,
  sheetId: string,
  tabName: string,
  sampleData: Record<string, string>,
  idKey: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  // Step 1: add the sheet
  await sheetsPost(token, sheetId, ':batchUpdate', {
    requests: [{ addSheet: { properties: { title: tabName } } }],
  })
  // Step 2: build headers — idKey first, then all data fields, created_at last if missing
  const dataKeys = Object.keys(sampleData).filter(k => k !== idKey)
  const headers = [idKey, ...dataKeys]
  
  if (!headers.includes('branch_id')) {
    headers.push('branch_id')
  }

  if (!headers.includes('created_at')) headers.push('created_at')
  // Step 3: write header row
  const range = `${tabName}!A1`
  await sheetsPut(token, sheetId, `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    range,
    values: [headers],
  })
  cacheInvalidate(`${sheetId}:${tabName}`)
  return { headers, rows: [] }
}

async function readTab(
  token: string,
  sheetId: string,
  tabName: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const cacheKey = `${sheetId}:${tabName}`
  const cached = cacheGet(cacheKey)
  if (cached) return { headers: cached.headers, rows: cached.rows }

  // UNFORMATTED_VALUE + FORMATTED_STRING: date cells return as ISO strings instead of
  // locale-formatted strings (e.g. "10/05/2026 09:30:00") that break Date parsing.
  const result = await sheetsGet(
    token,
    sheetId,
    `/values/${encodeURIComponent(tabName)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  ) as { values?: unknown[][] }
  const values = result.values ?? []
  const headers = (values[0] ?? []).map(String)
  const rows: Record<string, string>[] = []

  for (let i = 1; i < values.length; i++) {
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      const v = (values[i] as unknown[])[j]
      // Normalise booleans to uppercase string so existing checks (=== 'FALSE') keep working
      if (typeof v === 'boolean') row[headers[j]] = v ? 'TRUE' : 'FALSE'
      else row[headers[j]] = v != null ? String(v) : ''
    }
    rows.push(row)
  }

  cacheSet(cacheKey, headers, rows)
  return { headers, rows }
}

async function appendRow(
  token: string,
  sheetId: string,
  tabName: string,
  rowValues: string[],
): Promise<void> {
  const range = `${tabName}!A1`
  await sheetsPost(
    token,
    sheetId,
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [rowValues] },
  )
}

async function updateRow(
  token: string,
  sheetId: string,
  tabName: string,
  sheetRowNumber: number,
  rowValues: string[],
): Promise<void> {
  const range = `${tabName}!A${sheetRowNumber}`
  await sheetsPut(
    token,
    sheetId,
    `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { range, values: [rowValues] },
  )
}

async function appendRows(
  token: string,
  sheetId: string,
  tabName: string,
  rowsValues: string[][],
): Promise<void> {
  if (rowsValues.length === 0) return
  const range = `${tabName}!A1`
  await sheetsPost(
    token,
    sheetId,
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: rowsValues },
  )
}

async function ensureHeaders(
  token: string,
  sheetId: string,
  tabName: string,
  currentHeaders: string[],
  newData: Record<string, unknown> | Record<string, unknown>[]
): Promise<string[]> {
  const dataKeys = Array.isArray(newData) 
    ? Array.from(new Set(newData.flatMap(Object.keys)))
    : Object.keys(newData)
    
  const missingHeaders = dataKeys.filter(k => k !== undefined && !currentHeaders.includes(k))
  
  if (missingHeaders.length > 0) {
    const updatedHeaders = [...currentHeaders, ...missingHeaders]
    
    const range = `${tabName}!A1`
    await sheetsPut(
      token,
      sheetId,
      `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      { range, values: [updatedHeaders] },
    )
    
    const cacheKey = `${sheetId}:${tabName}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      cached.headers = updatedHeaders
    }
    
    return updatedHeaders
  }
  
  return currentHeaders
}

export class GoogleSheetsConnector implements IDataConnector {
  constructor(
    private readonly sheetId: string,
    private readonly tokenProvider: () => Promise<string>,
    private readonly branchId?: string,
  ) {}

  private getConfig(entity: string): EntityConfig {
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) throw new Error(`Unknown entity: ${entity}`)
    return cfg
  }

  private async generateId(
    _token: string,
    _tab: string,
    prefix: string,
    rows: Record<string, string>[],
    idKey: string,
  ): Promise<string> {
    const existing = rows
      .map(r => r[idKey])
      .filter(id => id?.startsWith(`${prefix}-`))
      .map(id => parseInt(id.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n))

    const max = existing.length > 0 ? Math.max(...existing) : 9999
    return `${prefix}-${max + 1}`
  }

  async list(entity: string, options: ListOptions = {}): Promise<ListResult> {
    const { page = 1, limit = 50, search, filters, sortDesc } = options
    const { tab, idKey } = this.getConfig(entity)
    const token = await this.tokenProvider()
    let headers: string[]
    let rows: Record<string, string>[]
    try {
      const tabData = await readTab(token, this.sheetId, tab)
      headers = tabData.headers
      rows = tabData.rows
    } catch {
      // Tab doesn't exist yet — return empty results (will be auto-created on first write)
      return { data: [], total: 0, page, limit }
    }

    const hasActiveField = headers.includes('active')
    const hasBranchField = headers.includes('branch_id')

    let filtered = rows.filter(row => {
      if (hasActiveField && !filters?.active && row.active === 'FALSE') return false
      if (this.branchId && hasBranchField) {
        if (row.branch_id !== this.branchId) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const matches = Object.values(row).some(v => v.toLowerCase().includes(q))
        if (!matches) return false
      }
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (k === 'active' && v === 'ALL') continue
          const filterKey = k === 'id' ? idKey : k
          if ((row[filterKey] ?? '').toLowerCase() !== v.toLowerCase()) return false
        }
      }
      return true
    })

    if (sortDesc) {
      filtered = [...filtered].sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0
        const tb = b.created_at ? Date.parse(b.created_at) : 0
        return tb - ta
      })
    }

    const total = filtered.length
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit).map(row => ({
      ...row,
      id: row[idKey]
    }))

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const { tab, idKey } = this.getConfig(entity)
    const token = await this.tokenProvider()
    let rows: Record<string, string>[]
    let headers: string[]
    try {
      const tabData = await readTab(token, this.sheetId, tab)
      rows = tabData.rows
      headers = tabData.headers
    } catch {
      return null
    }
    const row = rows.find(r => r[idKey] === id) ?? null

    const hasBranchField = headers.includes('branch_id')

    if (row && this.branchId && hasBranchField) {
      if (row.branch_id !== this.branchId) return null
    }

    return row
  }

  async create(entity: string, data: Record<string, string>): Promise<Record<string, string>> {
    const { tab, idKey, prefix } = this.getConfig(entity)
    const token = await this.tokenProvider()
    let tabData: { headers: string[]; rows: Record<string, string>[] }
    try {
      tabData = await readTab(token, this.sheetId, tab)
    } catch {
      // Tab doesn't exist yet — auto-create it with headers from the data
      tabData = await createTab(token, this.sheetId, tab, data, idKey)
    }
    const { headers: initialHeaders, rows } = tabData

    const headers = await ensureHeaders(token, this.sheetId, tab, initialHeaders, data)

    const newId = await this.generateId(token, tab, prefix, rows, idKey)
    const fullRow: Record<string, string> = { ...data }
    fullRow[idKey] = newId
    if (!fullRow.active) fullRow.active = 'TRUE'
    if (headers.includes('created_at') && !fullRow.created_at) {
      fullRow.created_at = new Date().toISOString()
    }
    if (this.branchId && headers.includes('branch_id')) {
      fullRow.branch_id = this.branchId
    }

    const rowValues = headers.map(h => fullRow[h] ?? '')
    await appendRow(token, this.sheetId, tab, rowValues)
    
    const cacheKey = `${this.sheetId}:${tab}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      cached.rows.push(fullRow)
    }

    return fullRow
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    const { tab, idKey } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { headers: initialHeaders, rows } = await readTab(token, this.sheetId, tab)

    const sanitizedData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Record<string, string>

    const headers = await ensureHeaders(token, this.sheetId, tab, initialHeaders, sanitizedData)

    const rowIndex = rows.findIndex(r => r[idKey] === id)
    if (rowIndex === -1) throw new Error(`${entity}/${id} not found`)

    const hasBranchField = headers.includes('branch_id')
    if (this.branchId && hasBranchField) {
      if (rows[rowIndex].branch_id !== this.branchId) throw new Error(`${entity}/${id} not found`)
    }

    // +2: +1 for 1-based indexing, +1 for the header row
    const sheetRowNumber = rowIndex + 2
    const currentRow = rows[rowIndex]
    if (!currentRow) throw new Error(`${entity}/${id} not found`)

    const merged: Record<string, string> = { ...currentRow, ...sanitizedData }
    const rowValues = headers.map(h => merged[h] ?? '')

    await updateRow(token, this.sheetId, tab, sheetRowNumber, rowValues)
    
    const cacheKey = `${this.sheetId}:${tab}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      const idx = cached.rows.findIndex(r => r[idKey] === id)
      if (idx !== -1) {
        cached.rows[idx] = merged
      }
    }

    return merged
  }

  async delete(entity: string, id: string): Promise<void> {
    await this.update(entity, id, { active: 'FALSE' })
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    if (rows.length === 0) return []

    const { tab, idKey, prefix } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { headers: initialHeaders, rows: existingRows } = await readTab(token, this.sheetId, tab)

    const headers = await ensureHeaders(token, this.sheetId, tab, initialHeaders, rows)

    const currentMax = existingRows
      .map(r => r[idKey])
      .filter(id => id?.startsWith(`${prefix}-`))
      .map(id => parseInt(id.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 9999)

    const created: Record<string, string>[] = []
    const allRowValues: string[][] = []

    for (let i = 0; i < rows.length; i++) {
      const newId = `${prefix}-${currentMax + i + 1}`
      const fullRow: Record<string, string> = { ...rows[i] }
      fullRow[idKey] = newId
      if (!fullRow.active) fullRow.active = 'TRUE'
      if (headers.includes('created_at') && !fullRow.created_at) {
        fullRow.created_at = new Date().toISOString()
      }
      if (this.branchId && headers.includes('branch_id')) {
        fullRow.branch_id = this.branchId
      }
      const rowValues = headers.map(h => fullRow[h] ?? '')
      allRowValues.push(rowValues)
      created.push(fullRow)
    }

    await appendRows(token, this.sheetId, tab, allRowValues)
    
    const cacheKey = `${this.sheetId}:${tab}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      cached.rows.push(...created)
    }
    
    return created
  }
}
