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

  const result = await sheetsGet(token, sheetId, `/values/${encodeURIComponent(tabName)}`) as { values?: string[][] }
  const values = result.values ?? []
  const headers = values[0] ?? []
  const rows: Record<string, string>[] = []

  for (let i = 1; i < values.length; i++) {
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j] ?? ''
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

export class GoogleSheetsConnector implements IDataConnector {
  constructor(
    private readonly sheetId: string,
    private readonly tokenProvider: () => Promise<string>,
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

    const max = existing.length > 0 ? Math.max(...existing) : 0
    return `${prefix}-${String(max + 1).padStart(3, '0')}`
  }

  async list(entity: string, options: ListOptions = {}): Promise<ListResult> {
    const { page = 1, limit = 50, search, filters } = options
    const { tab } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { headers, rows } = await readTab(token, this.sheetId, tab)

    const hasActiveField = headers.includes('active')

    let filtered = rows.filter(row => {
      if (hasActiveField && row.active === 'FALSE') return false
      if (search) {
        const q = search.toLowerCase()
        const matches = Object.values(row).some(v => v.toLowerCase().includes(q))
        if (!matches) return false
      }
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if ((row[k] ?? '').toLowerCase() !== v.toLowerCase()) return false
        }
      }
      return true
    })

    const total = filtered.length
    const start = (page - 1) * limit
    const data = filtered.slice(start, start + limit)

    return { data, total, page, limit }
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const { tab, idKey } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { rows } = await readTab(token, this.sheetId, tab)
    return rows.find(r => r[idKey] === id) ?? null
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
    const { headers, rows } = tabData

    const newId = await this.generateId(token, tab, prefix, rows, idKey)

    const fullRow: Record<string, string> = { ...data }
    fullRow[idKey] = newId
    if (!fullRow.active) fullRow.active = 'TRUE'
    if (headers.includes('created_at') && !fullRow.created_at) {
      fullRow.created_at = new Date().toISOString()
    }

    const rowValues = headers.map(h => fullRow[h] ?? '')
    await appendRow(token, this.sheetId, tab, rowValues)
    cacheInvalidate(`${this.sheetId}:${tab}`)

    return fullRow
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    const { tab, idKey } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { headers, rows } = await readTab(token, this.sheetId, tab)

    const rowIndex = rows.findIndex(r => r[idKey] === id)
    if (rowIndex === -1) throw new Error(`${entity}/${id} not found`)

    // +2: +1 for 1-based indexing, +1 for the header row
    const sheetRowNumber = rowIndex + 2
    const currentRow = rows[rowIndex]
    if (!currentRow) throw new Error(`${entity}/${id} not found`)

    const sanitizedData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Record<string, string>

    const merged: Record<string, string> = { ...currentRow, ...sanitizedData }
    const rowValues = headers.map(h => merged[h] ?? '')

    await updateRow(token, this.sheetId, tab, sheetRowNumber, rowValues)
    cacheInvalidate(`${this.sheetId}:${tab}`)

    return merged
  }

  async delete(entity: string, id: string): Promise<void> {
    await this.update(entity, id, { active: 'FALSE' })
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    if (rows.length === 0) return []

    const { tab, idKey, prefix } = this.getConfig(entity)
    const token = await this.tokenProvider()
    const { headers, rows: existingRows } = await readTab(token, this.sheetId, tab)

    const currentMax = existingRows
      .map(r => r[idKey])
      .filter(id => id?.startsWith(`${prefix}-`))
      .map(id => parseInt(id.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0)

    const created: Record<string, string>[] = []

    for (let i = 0; i < rows.length; i++) {
      const newId = `${prefix}-${String(currentMax + i + 1).padStart(3, '0')}`
      const fullRow: Record<string, string> = { ...rows[i] }
      fullRow[idKey] = newId
      if (!fullRow.active) fullRow.active = 'TRUE'
      if (headers.includes('created_at') && !fullRow.created_at) {
        fullRow.created_at = new Date().toISOString()
      }
      const rowValues = headers.map(h => fullRow[h] ?? '')
      await appendRow(token, this.sheetId, tab, rowValues)
      created.push(fullRow)
    }

    cacheInvalidate(`${this.sheetId}:${tab}`)
    return created
  }
}
