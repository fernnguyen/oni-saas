export interface ListOptions {
  page?: number
  limit?: number
  search?: string
  filters?: Record<string, string>
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
}
