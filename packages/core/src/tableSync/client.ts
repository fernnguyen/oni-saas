// Table sync v2 – platform-agnostic client core (docs/TABLE-SESSION-SYNC-PLAN.md 1.4 / 1.5).
// Web (localStorage/IndexedDB) and mobile (AsyncStorage/SQLite) plug in their own storage and
// transport. Rules:
//  - every write is persisted to the outbox BEFORE it is sent (survives app kill / tab close);
//  - ops keep their op_id forever, so a resend after a lost response is applied once server-side;
//  - per session, entries are sent strictly in order; an `open` goes before that session's ops;
//  - server rejections never disappear silently: they move to the conflict inbox.

export interface OpenSessionPayload {
  session_id: string
  resource_id: string
  check_in: string
  customer_id?: string
  customer_name?: string
  rental_type?: string
  metadata?: Record<string, unknown>
}

export type ClientTableOp =
  | { op_id?: string; type: 'add_item'; product_id: string; product_name: string; unit_price: number; qty: number; sku?: string; variant_label?: string; modifiers?: unknown; modifier_total?: number; tax_rate?: string; tax_group?: string }
  | { op_id?: string; type: 'change_qty'; item_id?: string; line_key?: string; delta: number }
  | { op_id?: string; type: 'remove_item'; item_id?: string; line_key?: string }
  | { op_id?: string; type: 'set_time_charge'; product_id: string; product_name: string; amount: number; duration_minutes?: number; checkout_at?: string }

export type OutboxEntry =
  | { kind: 'open'; entry_id: string; session_id: string; payload: OpenSessionPayload; created_at: string; attempts: number }
  | { kind: 'op'; entry_id: string; session_id: string; op: ClientTableOp & { op_id: string; client_created_at: string }; created_at: string; attempts: number }

export interface InboxItem {
  id: string
  session_id: string
  kind: 'open_conflict' | 'op_rejected' | 'session_missing'
  reason: string
  entry: OutboxEntry
  server?: unknown
  detected_at: string
}

export interface TableSyncStorage {
  loadOutbox(): Promise<OutboxEntry[]>
  saveOutbox(entries: OutboxEntry[]): Promise<void>
  loadInbox(): Promise<InboxItem[]>
  saveInbox(items: InboxItem[]): Promise<void>
  loadCursor(): Promise<number>
  saveCursor(cursor: number): Promise<void>
}

export interface TransportResponse<T = any> {
  status: number
  body: T
}

/** Throw (or reject) on network failure; resolve with the HTTP status otherwise */
export interface TableSyncTransport {
  openSession(payload: OpenSessionPayload & { device_id: string }): Promise<TransportResponse>
  sendOps(sessionId: string, body: { device_id: string; ops: ClientTableOp[] }): Promise<TransportResponse>
  getChanges(since: number, limit?: number): Promise<TransportResponse>
}

export interface FlushResult {
  sent: number
  applied: number
  rejected: number
  blocked_sessions: string[]
  offline: boolean
}

const MAX_OPS_PER_REQUEST = 200

/** Transport over the v2 REST endpoints. Network errors reject; HTTP errors resolve with status. */
export function createFetchTableSyncTransport(options: {
  baseUrl: string
  shopId: string
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): TableSyncTransport {
  const fetchImpl = options.fetchImpl || fetch
  const root = `${options.baseUrl.replace(/\/$/, '')}/api/shops/${encodeURIComponent(options.shopId)}/table-sessions`
  const call = async (path: string, init: { method: string; body?: unknown }): Promise<TransportResponse> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 15000) : null
    try {
      const headers = { 'Content-Type': 'application/json', ...(await options.getHeaders?.()) }
      const res = await fetchImpl(`${root}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller?.signal,
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return {
    openSession: (payload) => call('/open', { method: 'POST', body: payload }),
    sendOps: (sessionId, body) => call(`/${encodeURIComponent(sessionId)}/ops`, { method: 'POST', body }),
    getChanges: (since, limit = 500) => call(`/changes?since=${since}&limit=${limit}`, { method: 'GET' }),
  }
}

export function generateClientId(): string {
  const g = globalThis as any
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID()
  // RFC4122 v4 fallback (Hermes / older runtimes)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function createTableSyncOutbox(options: {
  storage: TableSyncStorage
  transport: TableSyncTransport
  deviceId: string
  generateId?: () => string
  now?: () => Date
  onInboxChange?: (items: InboxItem[]) => void
  onOutboxChange?: (entries: OutboxEntry[]) => void
}) {
  const { storage, transport, deviceId } = options
  const genId = options.generateId || generateClientId
  const now = options.now || (() => new Date())
  let flushing: Promise<FlushResult> | null = null
  // Serialises read-modify-write of the persisted outbox/inbox inside this process
  let chain: Promise<unknown> = Promise.resolve()
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => {})
    return run
  }

  const saveOutbox = async (entries: OutboxEntry[]) => {
    await storage.saveOutbox(entries)
    options.onOutboxChange?.(entries)
  }
  const addToInbox = async (items: InboxItem[]) => {
    if (items.length === 0) return
    const inbox = await storage.loadInbox()
    const next = [...inbox, ...items]
    await storage.saveInbox(next)
    options.onInboxChange?.(next)
  }

  /** Queue a session open (works offline: the session_id is generated here). */
  function enqueueOpen(payload: Omit<OpenSessionPayload, 'session_id'> & { session_id?: string }): Promise<string> {
    return locked(async () => {
      const sessionId = payload.session_id || genId()
      const entries = await storage.loadOutbox()
      entries.push({ kind: 'open', entry_id: genId(), session_id: sessionId, payload: { ...payload, session_id: sessionId }, created_at: now().toISOString(), attempts: 0 })
      await saveOutbox(entries)
      return sessionId
    })
  }

  /** Queue ops for a session. Returns the op_ids (stable across retries). */
  function enqueueOps(sessionId: string, ops: ClientTableOp[]): Promise<string[]> {
    return locked(async () => {
      const entries = await storage.loadOutbox()
      const ts = now().toISOString()
      const ids: string[] = []
      for (const op of ops) {
        const opId = op.op_id || genId()
        ids.push(opId)
        entries.push({ kind: 'op', entry_id: genId(), session_id: sessionId, op: { ...op, op_id: opId, client_created_at: ts } as any, created_at: ts, attempts: 0 })
      }
      await saveOutbox(entries)
      return ids
    })
  }

  async function flushOnce(): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, applied: 0, rejected: 0, blocked_sessions: [], offline: false }
    const snapshot = await storage.loadOutbox()
    const sessionOrder: string[] = []
    for (const e of snapshot) if (!sessionOrder.includes(e.session_id)) sessionOrder.push(e.session_id)

    for (const sessionId of sessionOrder) {
      if (result.offline) break
      // Re-read each round: enqueues during the flush must not be lost
      const current = (await storage.loadOutbox()).filter((e) => e.session_id === sessionId)
      if (current.length === 0) continue

      const head = current[0]
      if (head.kind === 'open') {
        let res: TransportResponse
        try {
          res = await transport.openSession({ ...head.payload, device_id: deviceId })
        } catch {
          result.offline = true
          await bumpAttempts([head.entry_id])
          break
        }
        result.sent += 1
        if (res.status === 200 || res.status === 201) {
          await removeEntries([head.entry_id])
        } else if (res.status === 409) {
          // Another device opened this table first (or id clash): block this session's queue
          await locked(async () => {
            const entries = await storage.loadOutbox()
            const sessionEntries = entries.filter((e) => e.session_id === sessionId)
            await saveOutbox(entries.filter((e) => e.session_id !== sessionId))
            await addToInbox(sessionEntries.map((entry) => ({
              id: genId(), session_id: sessionId, kind: 'open_conflict' as const,
              reason: String(res.body?.error || 'resource_occupied'), entry, server: res.body, detected_at: now().toISOString(),
            })))
          })
          result.blocked_sessions.push(sessionId)
          result.rejected += current.length
          continue
        } else if (res.status >= 500 || res.status === 0) {
          await bumpAttempts([head.entry_id])
          result.blocked_sessions.push(sessionId)
          continue
        } else {
          await moveToInbox([head], 'open_conflict', String(res.body?.error || `http_${res.status}`), res.body)
          result.rejected += 1
          result.blocked_sessions.push(sessionId)
          continue
        }
      }

      // Send consecutive ops (stop at a later `open`, which cannot happen for one session in practice)
      const remaining = (await storage.loadOutbox()).filter((e) => e.session_id === sessionId)
      const ops: Extract<OutboxEntry, { kind: 'op' }>[] = []
      for (const e of remaining) {
        if (e.kind !== 'op') break
        ops.push(e)
        if (ops.length >= MAX_OPS_PER_REQUEST) break
      }
      if (ops.length === 0) continue

      let res: TransportResponse
      try {
        res = await transport.sendOps(sessionId, { device_id: deviceId, ops: ops.map((e) => e.op) })
      } catch {
        result.offline = true
        await bumpAttempts(ops.map((e) => e.entry_id))
        break
      }
      result.sent += ops.length

      if (res.status === 200) {
        const byOpId = new Map<string, any>()
        for (const r of (res.body?.results || []) as any[]) byOpId.set(String(r.op_id), r)
        const done: string[] = []
        const rejected: Extract<OutboxEntry, { kind: 'op' }>[] = []
        for (const e of ops) {
          const r = byOpId.get(e.op.op_id)
          if (!r) continue // not processed: keep for next flush
          if (r.status === 'applied') { done.push(e.entry_id); result.applied += 1 }
          else rejected.push(e)
        }
        await removeEntries(done)
        if (rejected.length) {
          const reasonFor = (e: Extract<OutboxEntry, { kind: 'op' }>) => String(byOpId.get(e.op.op_id)?.reason || 'rejected')
          await locked(async () => {
            const ids = new Set(rejected.map((e) => e.entry_id))
            await saveOutbox((await storage.loadOutbox()).filter((e) => !ids.has(e.entry_id)))
            await addToInbox(rejected.map((entry) => ({
              id: genId(), session_id: sessionId, kind: 'op_rejected' as const, reason: reasonFor(entry), entry, server: byOpId.get(entry.op.op_id), detected_at: now().toISOString(),
            })))
          })
          result.rejected += rejected.length
        }
      } else if (res.status === 404) {
        // Session unknown to the server (never opened, or wrong shop): never retry blindly
        const all = (await storage.loadOutbox()).filter((e) => e.session_id === sessionId)
        await moveToInbox(all, 'session_missing', String(res.body?.error || 'session_not_found'), res.body)
        result.rejected += all.length
        result.blocked_sessions.push(sessionId)
      } else if (res.status >= 500 || res.status === 0 || res.status === 409) {
        // Server trouble or v2 temporarily unavailable: keep everything, retry later
        await bumpAttempts(ops.map((e) => e.entry_id))
        result.blocked_sessions.push(sessionId)
      } else {
        await moveToInbox(ops, 'op_rejected', String(res.body?.error || `http_${res.status}`), res.body)
        result.rejected += ops.length
        result.blocked_sessions.push(sessionId)
      }
    }
    return result
  }

  function removeEntries(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve()
    return locked(async () => {
      const ids = new Set(entryIds)
      await saveOutbox((await storage.loadOutbox()).filter((e) => !ids.has(e.entry_id)))
    })
  }

  function bumpAttempts(entryIds: string[]) {
    return locked(async () => {
      const ids = new Set(entryIds)
      await saveOutbox((await storage.loadOutbox()).map((e) => (ids.has(e.entry_id) ? { ...e, attempts: e.attempts + 1 } : e)))
    })
  }

  function moveToInbox(entries: OutboxEntry[], kind: InboxItem['kind'], reason: string, server?: unknown) {
    return locked(async () => {
      const ids = new Set(entries.map((e) => e.entry_id))
      await saveOutbox((await storage.loadOutbox()).filter((e) => !ids.has(e.entry_id)))
      await addToInbox(entries.map((entry) => ({ id: genId(), session_id: entry.session_id, kind, reason, entry, server, detected_at: now().toISOString() })))
    })
  }

  /** Sends everything that can be sent. Concurrent calls share one run (single-flight). */
  function flush(): Promise<FlushResult> {
    if (flushing) return flushing
    flushing = flushOnce().finally(() => { flushing = null })
    return flushing
  }

  async function pending(sessionId?: string): Promise<OutboxEntry[]> {
    const entries = await storage.loadOutbox()
    return sessionId ? entries.filter((e) => e.session_id === sessionId) : entries
  }

  /** Remove inbox items once the user resolved them (resolution itself is an app decision). */
  function resolveInbox(ids: string[]) {
    return locked(async () => {
      const set = new Set(ids)
      const next = (await storage.loadInbox()).filter((i) => !set.has(i.id))
      await storage.saveInbox(next)
      options.onInboxChange?.(next)
    })
  }

  /**
   * Drop every queued entry of a session. Only for when those ops are already carried by another
   * write (e.g. an offline provisional checkout that billed the same items).
   */
  function discardSession(sessionId: string) {
    return locked(async () => {
      await saveOutbox((await storage.loadOutbox()).filter((e) => e.session_id !== sessionId))
    })
  }

  return { enqueueOpen, enqueueOps, flush, pending, resolveInbox, discardSession, inbox: () => storage.loadInbox() }
}

export type TableSyncOutbox = ReturnType<typeof createTableSyncOutbox>

/**
 * Catches up on server changes since the persisted cursor (call on reconnect, app foreground and
 * whenever a `table_sync_<shopId>` broadcast arrives). Returns the events in order.
 */
export async function catchUpTableChanges(transport: TableSyncTransport, storage: Pick<TableSyncStorage, 'loadCursor' | 'saveCursor'>, maxPages = 20) {
  let cursor = await storage.loadCursor()
  const events: any[] = []
  for (let page = 0; page < maxPages; page++) {
    const res = await transport.getChanges(cursor, 500)
    if (res.status !== 200) break
    const batch = (res.body?.events || []) as any[]
    events.push(...batch)
    if (typeof res.body?.cursor === 'number' && res.body.cursor > cursor) {
      cursor = res.body.cursor
      await storage.saveCursor(cursor)
    }
    if (!res.body?.has_more) break
  }
  return { events, cursor }
}

// ── Optimistic view: server lines + still-pending ops ───────────────────────────

export interface ViewLine {
  item_id?: string
  line_key: string
  product_id: string
  product_name: string
  qty: number
  unit_price: number
  modifier_total: number
  variant_label: string
  modifiers: string
  pending: boolean
}

const normalizeModifiersKey = (raw: unknown): string => {
  if (raw === undefined || raw === null) return ''
  let value: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === 'null' || trimmed === '[]') return ''
    try { value = JSON.parse(trimmed) } catch { return trimmed }
  }
  if (Array.isArray(value) && value.length === 0) return ''
  return JSON.stringify(value)
}

/** Must stay identical to the server's `tableLineKey` (apps/web/lib/server/tableSessionReconciler.ts) */
export function tableSyncLineKey(productId: unknown, variantLabel: unknown, modifiers: unknown): string {
  return `${String(productId || '')}|${String(variantLabel || '').trim()}|${normalizeModifiersKey(modifiers)}`
}

/** What the cashier should see: confirmed server lines with pending local ops applied on top. */
export function projectTableLines(serverItems: Record<string, any>[], pendingOps: ClientTableOp[]): ViewLine[] {
  const lines: ViewLine[] = serverItems
    .filter((it) => String(it.active ?? 'TRUE').toUpperCase() !== 'FALSE' && Number(it.qty) > 0)
    .map((it) => ({
      item_id: String(it.item_id || it.id || ''),
      line_key: tableSyncLineKey(it.product_id, it.variant_label, it.modifiers),
      product_id: String(it.product_id || ''),
      product_name: String(it.product_name || ''),
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      modifier_total: Number(it.modifier_total) || 0,
      variant_label: String(it.variant_label || ''),
      modifiers: typeof it.modifiers === 'string' ? it.modifiers : it.modifiers ? JSON.stringify(it.modifiers) : '',
      pending: false,
    }))
  const find = (ref: { item_id?: string; line_key?: string }) =>
    lines.find((l) => (ref.item_id ? l.item_id === ref.item_id : l.line_key === ref.line_key))

  for (const op of pendingOps) {
    if (op.type === 'add_item') {
      const key = tableSyncLineKey(op.product_id, op.variant_label, op.modifiers)
      const existing = lines.find((l) => l.line_key === key)
      if (existing) { existing.qty += op.qty; existing.pending = true }
      else lines.push({
        line_key: key, product_id: op.product_id, product_name: op.product_name, qty: op.qty, unit_price: op.unit_price,
        modifier_total: Number(op.modifier_total || 0), variant_label: op.variant_label || '',
        modifiers: op.modifiers === undefined || op.modifiers === null ? '' : typeof op.modifiers === 'string' ? op.modifiers : JSON.stringify(op.modifiers),
        pending: true,
      })
    } else if (op.type === 'change_qty') {
      const l = find(op)
      if (l) { l.qty = Math.max(0, l.qty + op.delta); l.pending = true }
    } else if (op.type === 'remove_item') {
      const l = find(op)
      if (l) { l.qty = 0; l.pending = true }
    }
  }
  return lines.filter((l) => l.qty > 0)
}
