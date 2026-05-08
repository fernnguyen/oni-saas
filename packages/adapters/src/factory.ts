import type { IDataConnector } from './DataSource'
import { GoogleSheetsConnector } from './googleSheetsAdapter'
import { StubConnector } from './supabaseDbAdapter'

export function createConnector(
  type: string,
  config: Record<string, unknown>,
  tokenProvider?: () => Promise<string>,
): IDataConnector {
  switch (type) {
    case 'google_sheets': {
      if (!tokenProvider) throw new Error('tokenProvider is required for google_sheets connector')
      const sheetId = config['sheet_id'] as string
      if (!sheetId) throw new Error('sheet_id is required in google_sheets connector config')
      return new GoogleSheetsConnector(sheetId, tokenProvider)
    }
    default:
      return new StubConnector(type)
  }
}
