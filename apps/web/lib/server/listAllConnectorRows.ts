import type { IDataConnector, ListOptions } from '@oni/adapters'

const DEFAULT_PAGE_SIZE = 1_000

/**
 * Reads every connector page. Reports must never silently truncate at an
 * arbitrary limit because Google Sheets, MySQL and Postgres all paginate.
 */
export async function listAllConnectorRows(
  connector: IDataConnector,
  entity: string,
  options: Omit<ListOptions, 'page' | 'limit'> = {},
  pageSize = DEFAULT_PAGE_SIZE
) {
  const rows: Record<string, string>[] = []
  let page = 1

  while (true) {
    const result = await connector.list(entity, { ...options, page, limit: pageSize })
    rows.push(...result.data)

    if (
      result.data.length === 0 ||
      result.data.length < pageSize ||
      rows.length >= result.total
    ) {
      break
    }

    page += 1
  }

  return rows
}
