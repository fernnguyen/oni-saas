import type { IDataConnector, ListOptions, ListResult } from './DataSource'

export class StubConnector implements IDataConnector {
  constructor(private readonly type: string, private readonly tenantId?: string) {}

  private notImplemented(): never {
    throw Object.assign(new Error(`Connector type '${this.type}' is not yet implemented`), { code: 'NOT_IMPLEMENTED' })
  }

  list(_entity: string, _options?: ListOptions): Promise<ListResult> { return this.notImplemented() }
  findById(_entity: string, _id: string): Promise<Record<string, string> | null> { return this.notImplemented() }
  create(_entity: string, _data: Record<string, string>): Promise<Record<string, string>> { return this.notImplemented() }
  update(_entity: string, _id: string, _data: Partial<Record<string, string>>): Promise<Record<string, string>> { return this.notImplemented() }
  delete(_entity: string, _id: string): Promise<void> { return this.notImplemented() }
  batchCreate(_entity: string, _rows: Record<string, string>[]): Promise<Record<string, string>[]> { return this.notImplemented() }
}
