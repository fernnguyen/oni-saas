export interface ListOptions {
  page?: number
  limit?: number
  search?: string
  filters?: Record<string, any>
  sortDesc?: boolean  // true = newest-first (reverse append order)
  sortBy?: string
  date_range?: { column: string; start: string; end: string }
}

export interface ListResult {
  data: Record<string, string>[]
  total: number
  page: number
  limit: number
}

export interface IDataConnector {
  list(entity: string, options?: ListOptions): Promise<ListResult>
  findById(entity: string, id: string): Promise<Record<string, string> | null>
  create(entity: string, data: Record<string, string>): Promise<Record<string, string>>
  update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>>
  delete(entity: string, id: string): Promise<void>
  batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]>
  /**
   * Optional: run `fn` inside one database transaction (BEGIN/COMMIT, ROLLBACK on throw).
   * Only SQL connectors implement this; callers must feature-detect it. Used by table sync v2
   * for idempotent ops and compare-and-set writes. Existing CRUD methods are unaffected.
   */
  withTransaction?<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>
}

export interface TransactionClient {
  /** Parameterized query ($1, $2… placeholders) executed on the transaction's connection */
  query(text: string, params?: unknown[]): Promise<any[]>
  readonly dialect: 'postgres'
  readonly tenantId?: string
  readonly branchId?: string
}
