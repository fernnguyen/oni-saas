import { localDb, type SyncQueueItem } from '@/lib/localDb/schema'
import { broadcastOrderSynced } from '@/lib/localDb/tabSync'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function calcMovementDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
  return qty // adjustment: use raw signed value
}

const SYNC_INTERVAL_MS = 3_000
const MAX_RETRY = 5
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000]

export class SyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private stopped = false
  private shopId: string

  constructor(shopId: string) {
    this.shopId = shopId
  }

  async start() {
    // Web Locks are released automatically on page unload, so on startup there
    // are no active locks. Resetting all 'syncing' items is always safe here —
    // no worker can hold a lock on them until this worker acquires one.
    await localDb.syncQueue
      .where('status').equals('syncing')
      .modify((item) => {
        item.status = 'pending'
        delete item.syncing_since
      })

    this.timer = setInterval(() => void this.tick(), SYNC_INTERVAL_MS)
    void this.tick()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async flushAll() {
    void this.tick()
  }

  async retryFailed() {
    await localDb.syncQueue
      .where('status').equals('failed')
      .and((item) => item.retry_count < MAX_RETRY)
      .modify({ status: 'pending', last_error: undefined })
    void this.tick()
  }

  // Resets both stuck-syncing and failed items so the user can recover without
  // reloading the page (e.g. after a long offline period or a hung request).
  async retryAll() {
    await localDb.syncQueue
      .where('status').anyOf('syncing', 'failed')
      .modify((item) => {
        item.status = 'pending'
        item.retry_count = 0
        delete item.syncing_since
        delete item.last_error
      })
    void this.tick()
  }

  private async tick() {
    if (!navigator.onLine || this.running || this.stopped) return
    this.running = true
    try {
      await this.flushQueue()
    } finally {
      this.running = false
    }
  }

  private async flushQueue() {
    const items = await localDb.syncQueue
      .where('status').equals('pending')
      .sortBy('id') // FIFO — auto-increment id preserves creation order

    for (const item of items) {
      if (!navigator.onLine) break
      await this.syncOne(item)
    }
  }

  private async post(path: string, body: Record<string, string>) {
    const res = await fetch(`/api/shops/${this.shopId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
    return res.json() as Promise<Record<string, string>>
  }

  private async postJson<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api/shops/${this.shopId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
    return res.json() as Promise<T>
  }

  private async get(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`/api/shops/${this.shopId}/${path}?${qs}`)
    if (!res.ok) return [] as Record<string, string>[]
    const json = await res.json()
    return (Array.isArray(json) ? json : (json.data ?? [])) as Record<string, string>[]
  }

  private async syncOne(rawItem: SyncQueueItem) {
    // Web Locks: only one tab can hold the lock for a given item at a time.
    // Lock is released automatically on page unload, so start() can safely reset
    // any 'syncing' items — no active worker will be holding a stale lock.
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request(
        `pos-sync-${rawItem.id}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return  // another tab is already processing this item
          await this._doSync(rawItem)
        }
      )
    } else {
      await this._doSync(rawItem)
    }
  }

  private async _doSync(rawItem: SyncQueueItem) {
    // Atomically claim item: transition 'pending' → 'syncing' inside a Dexie transaction.
    // Also re-reads to pick up server_order_id / steps_done from prior attempts.
    // If another worker already claimed this item, item stays undefined and we bail.
    let item: SyncQueueItem | undefined
    await localDb.transaction('rw', [localDb.syncQueue], async () => {
      const current = await localDb.syncQueue.get(rawItem.id!)
      if (!current || current.status !== 'pending') return
      await localDb.syncQueue.update(rawItem.id!, {
        status: 'syncing',
        syncing_since: new Date().toISOString(),
      })
      item = current
    })
    if (!item) return
    // TypeScript can't narrow `item` across closures below, so rebind to a definite type.
    const syncItem: SyncQueueItem = item

    try {
      const { order, items, payments, stockMovements } = syncItem.payload
      const stepsDone = new Set(syncItem.steps_done ?? [])

      // ── Step 1: Batch sync — order + items + payments + movements in one call ──
      let serverId = syncItem.server_order_id ?? ''
      let orderNo  = syncItem.server_order_no  ?? ''

      if (!stepsDone.has('batch')) {
        const result = await this.postJson<{ order_id: string; order_no: string }>(
          'orders/sync-batch',
          {
            local_order_id:  syncItem.local_order_id,
            server_order_id: serverId || undefined,
            order,
            items,
            payments,
            stock_movements: stockMovements,
          }
        )
        serverId = result.order_id
        orderNo  = result.order_no ?? ''

        stepsDone.add('batch')
        await localDb.syncQueue.update(syncItem.id!, {
          steps_done:      [...stepsDone],
          server_order_id: serverId,
          server_order_no: orderNo,
        })
      }

      // ── Step 2: Inventory adjustments — per-item dedup via steps_done ──
      // Kept separate from the batch so a failed inventory update is retried
      // independently without re-creating order/items/payments/movements.
      if (!stepsDone.has('inventory')) {
        for (const mv of stockMovements) {
          const invKey = `inv:${mv.product_id}`
          if (stepsDone.has(invKey)) continue

          const delta = calcMovementDelta(mv.type, mv.qty)
          if (delta !== 0) {
            await this.post('inventory/adjust', {
              product_id: mv.product_id,
              delta:      String(delta),
              branch_id:  mv.branch_id ?? '',
            })
          }

          stepsDone.add(invKey)
          await localDb.syncQueue.update(syncItem.id!, { steps_done: [...stepsDone] })
        }

        stepsDone.add('inventory')
        await localDb.syncQueue.update(syncItem.id!, { steps_done: [...stepsDone] })
      }

      // ── Done ──
      await localDb.transaction('rw', [localDb.syncQueue, localDb.orders], async () => {
        await localDb.syncQueue.update(syncItem.id!, {
          status:    'done',
          synced_at: new Date().toISOString(),
        })
        await localDb.orders
          .where('local_id').equals(syncItem.local_order_id)
          .modify({ server_id: serverId, sync_status: 'done' })
      })

      broadcastOrderSynced({ local_id: syncItem.local_order_id, server_id: serverId })

    } catch (err) {
      const retries = (syncItem.retry_count ?? 0) + 1
      const isFinal = retries >= MAX_RETRY
      await localDb.syncQueue.update(item.id!, {
        status:      isFinal ? 'failed' : 'pending',
        retry_count: retries,
        last_error:  String(err),
      })
      if (!isFinal) {
        await new Promise((r) =>
          setTimeout(r, BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)])
        )
      }
    }
  }
}
