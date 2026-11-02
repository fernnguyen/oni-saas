// Web binding of the shared table sync v2 client (@oni/core tableSync/client).
// One outbox per shop, persisted in localStorage so queued ops survive reloads and tab closes.
// Only used when shop_settings.table_sync_v2 is on; retail POS never imports this module.

import {
  catchUpTableChanges,
  createFetchTableSyncTransport,
  createTableSyncOutbox,
  generateClientId,
  type InboxItem,
  type OutboxEntry,
  type TableSyncOutbox,
  type TableSyncStorage,
  type TableSyncTransport,
} from '@oni/core'

const keyOf = (shopId: string, part: string) => `table_sync_v2:${shopId}:${part}`

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('[tableSyncV2] localStorage write failed:', err)
  }
}

export function createLocalStorageTableSyncStorage(shopId: string): TableSyncStorage {
  return {
    async loadOutbox() { return readJson<OutboxEntry[]>(keyOf(shopId, 'outbox'), []) },
    async saveOutbox(entries) { writeJson(keyOf(shopId, 'outbox'), entries) },
    async loadInbox() { return readJson<InboxItem[]>(keyOf(shopId, 'inbox'), []) },
    async saveInbox(items) { writeJson(keyOf(shopId, 'inbox'), items) },
    async loadCursor() { return Number(readJson<number>(keyOf(shopId, 'cursor'), 0)) || 0 },
    async saveCursor(cursor) { writeJson(keyOf(shopId, 'cursor'), cursor) },
  }
}

export function getTableSyncDeviceId(): string {
  const key = 'table_sync_v2:device_id'
  let id = readJson<string>(key, '')
  if (!id) {
    id = `web-${generateClientId()}`
    writeJson(key, id)
  }
  return id
}

export interface WebTableSyncClient {
  shopId: string
  deviceId: string
  storage: TableSyncStorage
  transport: TableSyncTransport
  outbox: TableSyncOutbox
  /** Flush guarded by a cross-tab Web Lock (falls back to in-tab single-flight) */
  flush: () => Promise<void>
  catchUp: () => Promise<{ events: any[]; cursor: number }>
  subscribe: (fn: () => void) => () => void
}

const clients = new Map<string, WebTableSyncClient>()

export function getWebTableSyncClient(shopId: string): WebTableSyncClient {
  const existing = clients.get(shopId)
  if (existing) return existing

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => { try { fn() } catch {} })
  const storage = createLocalStorageTableSyncStorage(shopId)
  const transport = createFetchTableSyncTransport({ baseUrl: '', shopId })
  const deviceId = getTableSyncDeviceId()
  const outbox = createTableSyncOutbox({
    storage,
    transport,
    deviceId,
    onInboxChange: notify,
    onOutboxChange: notify,
  })

  const flush = async () => {
    const run = async () => { await outbox.flush() }
    const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined
    if (locks?.request) {
      await locks.request(`table_sync_v2_flush:${shopId}`, run)
    } else {
      await run()
    }
  }

  const client: WebTableSyncClient = {
    shopId,
    deviceId,
    storage,
    transport,
    outbox,
    flush,
    catchUp: () => catchUpTableChanges(transport, storage),
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
  clients.set(shopId, client)
  return client
}
