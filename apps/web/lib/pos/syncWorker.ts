import { localDb, type SyncQueueItem } from '@/lib/localDb/schema'
import { broadcastOrderSynced } from '@/lib/localDb/tabSync'

const SYNC_INTERVAL_MS = 3_000
const MAX_RETRY = 5
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000]

export class SyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private shopId: string

  constructor(shopId: string) {
    this.shopId = shopId
  }

  async start() {
    // Reset any items stuck as 'syncing' from a previous crashed session
    await localDb.syncQueue
      .where('status').equals('syncing')
      .modify({ status: 'pending' })

    this.timer = setInterval(() => void this.tick(), SYNC_INTERVAL_MS)
    void this.tick()
  }

  stop() {
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

  private async tick() {
    if (!navigator.onLine || this.running) return
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

  private async get(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`/api/shops/${this.shopId}/${path}?${qs}`)
    if (!res.ok) return [] as Record<string, string>[]
    const json = await res.json()
    return (Array.isArray(json) ? json : (json.data ?? [])) as Record<string, string>[]
  }

  private async syncOne(rawItem: SyncQueueItem) {
    // Always re-read from DB — a previous attempt may have saved server_order_id / steps_done
    const item = (await localDb.syncQueue.get(rawItem.id!)) ?? rawItem

    await localDb.syncQueue.update(item.id!, { status: 'syncing' })

    try {
      const { order, items, payments, stockMovements } = item.payload
      const stepsDone = new Set(item.steps_done ?? [])

      // ── Step 1: Create order (skip if already created in a previous attempt) ──
      let serverId = item.server_order_id ?? ''
      let orderNo  = item.server_order_no  ?? ''

      if (!serverId) {
        const serverOrder = await this.post('orders', {
          status:          order.status,
          channel:         'pos',
          customer_id:     order.customer_id   ?? '',
          customer_name:   order.customer_name ?? '',
          branch_id:       order.branch_id     ?? '',
          employee_id:     order.employee_id   ?? '',
          subtotal:        String(order.subtotal),
          discount_amount: String(order.discount_amount),
          tax_amount:      String(order.tax_amount),
          total_amount:    String(order.total_amount),
          paid_amount:     String(order.paid_amount),
          note:            order.note ?? '',
        })
        serverId = serverOrder.order_id
        orderNo  = serverOrder.order_no ?? ''

        // Persist immediately — if any later step fails, retry will reuse these IDs
        await localDb.syncQueue.update(item.id!, {
          server_order_id: serverId,
          server_order_no: orderNo,
        })
      }

      // ── Step 2: Order items — dedupe by product_id against server ──
      if (!stepsDone.has('items')) {
        const existing = await this.get('order-items', { order_id: serverId, limit: '200' })
        const existingProductIds = new Set(existing.map((r) => r.product_id))

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          if (existingProductIds.has(it.product_id)) continue // already on server

          await this.post('order-items', {
            order_id:      serverId,
            order_no:      orderNo,
            line_no:       String(i + 1),
            product_id:    it.product_id,
            sku:           it.sku ?? '',
            product_name:  it.product_name,
            qty:           String(it.qty),
            unit_price:    String(it.unit_price),
            line_discount: String(it.discount_amount),
            line_total:    String(it.line_total),
          })
        }

        stepsDone.add('items')
        await localDb.syncQueue.update(item.id!, { steps_done: [...stepsDone] })
      }

      // ── Step 3: Payments — dedupe by comparing total paid on server ──
      if (!stepsDone.has('payments')) {
        const existing = await this.get('payments', { order_id: serverId, limit: '50' })
        const serverPaid = existing.reduce((s, r) => s + parseFloat(r.amount || '0'), 0)
        const localPaid  = payments.reduce((s, p) => s + p.amount, 0)

        // Only create payments if the server is missing some (compare by method too)
        if (serverPaid < localPaid - 0.01) {
          const existingMethods = existing.map((r) => r.method)
          for (const pay of payments) {
            // Skip if this method already has a payment recorded (simple dedupe)
            if (existingMethods.includes(pay.method)) continue

            await this.post('payments', {
              order_id:     serverId,
              order_no:     orderNo,
              method:       pay.method,
              amount:       String(pay.amount),
              reference_no: pay.reference_no ?? '',
              note:         pay.note ?? '',
            })
          }
        }

        stepsDone.add('payments')
        await localDb.syncQueue.update(item.id!, { steps_done: [...stepsDone] })
      }

      // ── Step 4: Stock movements — dedupe by product_id against server ──
      if (!stepsDone.has('movements')) {
        const existing = await this.get('stock-movements', {
          product_id: '', // no product filter — fetch by order reference
          limit: '200',
        })
        // Reference_no in existing movements equals the local_order_id written on checkout
        const existingRefs = existing
          .filter((r) => r.reference_no === item.local_order_id || r.reference_no === orderNo)
          .map((r) => r.product_id)
        const synced = new Set(existingRefs)

        for (const mv of stockMovements) {
          if (synced.has(mv.product_id)) continue // already recorded

          await this.post('stock-movements', {
            type:         mv.type,
            product_id:   mv.product_id,
            qty:          String(Math.abs(mv.qty)),
            branch_id:    mv.branch_id ?? '',
            reference_no: orderNo || mv.reference_no,
          })
        }

        stepsDone.add('movements')
        await localDb.syncQueue.update(item.id!, { steps_done: [...stepsDone] })
      }

      // ── Done ──
      await localDb.transaction('rw', [localDb.syncQueue, localDb.orders], async () => {
        await localDb.syncQueue.update(item.id!, {
          status:   'done',
          synced_at: new Date().toISOString(),
        })
        await localDb.orders
          .where('local_id').equals(item.local_order_id)
          .modify({ server_id: serverId, sync_status: 'done' })
      })

      broadcastOrderSynced({ local_id: item.local_order_id, server_id: serverId })

    } catch (err) {
      const retries = (item.retry_count ?? 0) + 1
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
