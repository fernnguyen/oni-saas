import type { IDataConnector } from './DataSource'
import { GoogleSheetsConnector } from './googleSheetsAdapter'
import { StubConnector } from './supabaseDbAdapter'
import { MysqlConnector } from './mysqlAdapter'

export function createConnector(
  type: string,
  config: Record<string, unknown>,
  tokenProvider?: () => Promise<string>,
  tenantId?: string,
  branchId?: string,
): IDataConnector {
  switch (type) {
    case 'google_sheets': {
      if (!tokenProvider) throw new Error('tokenProvider is required for google_sheets connector')
      const sheetId = config['sheet_id'] as string
      if (!sheetId) throw new Error('sheet_id is required in google_sheets connector config')
      return new GoogleSheetsConnector(sheetId, tokenProvider, branchId)
    }
    case 'mysql_local': {
      const connectionUri = process.env.LOCAL_MYSQL_URI || process.env.DATABASE_URL
      if (!connectionUri) throw new Error('LOCAL_MYSQL_URI is not set in environment variables')
      return new MysqlConnector(connectionUri, tenantId, branchId)
    }
    case 'mysql_remote': {
      const connectionUri = config['connection_uri'] as string
      if (!connectionUri) throw new Error('connection_uri is required in mysql connector config')
      return new MysqlConnector(connectionUri, tenantId, branchId)
    }
    default:
      return new StubConnector(type, tenantId)
  }
}
