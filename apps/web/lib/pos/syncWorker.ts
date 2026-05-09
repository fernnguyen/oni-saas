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

  private async syncOne(item: SyncQueueItem) {
    await localDb.syncQueue.update(item.id!, { status: 'syncing' })

    try {
      const { order, items, payments, stockMovements } = item.payload

      // 1. Create order — all number fields must be strings for the API validator
      const orderRes = await fetch(`/api/shops/${this.shopId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:          order.status,
          channel:         'pos',
          customer_id:     order.customer_id  ?? '',
          customer_name:   order.customer_name ?? '',
          branch_id:       order.branch_id    ?? '',
          employee_id:     order.employee_id  ?? '',
          subtotal:        String(order.subtotal),
          discount_amount: String(order.discount_amount),
          tax_amount:      String(order.tax_amount),
          total_amount:    String(order.total_amount),
          paid_amount:     String(order.paid_amount),
          note:            order.note ?? '',
        }),
      })
      if (!orderRes.ok) throw new Error(`Order POST ${orderRes.status}`)
      const serverOrder = await orderRes.json() as Record<string, string>
      const serverId = serverOrder.order_id
      const orderNo  = serverOrder.order_no ?? ''

      // 2. Create order items (sequential to maintain line_no order)
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const itemRes = await fetch(`/api/shops/${this.shopId}/order-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          }),
        })
        if (!itemRes.ok) throw new Error(`OrderItem POST ${itemRes.status}`)
      }

      // 3. Create payments
      for (const pay of payments) {
        const payRes = await fetch(`/api/shops/${this.shopId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id:     serverId,
            order_no:     orderNo,
            method:       pay.method,
            amount:       String(pay.amount),
            reference_no: pay.reference_no ?? '',
            note:         pay.note ?? '',
          }),
        })
        if (!payRes.ok) throw new Error(`Payment POST ${payRes.status}`)
      }

      // 4. Create stock movements — qty is stored negative for outbound, API calcDelta handles sign
      for (const mv of stockMovements) {
        const mvRes = await fetch(`/api/shops/${this.shopId}/stock-movements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:         mv.type,
            product_id:   mv.product_id,
            qty:          String(Math.abs(mv.qty)),
            branch_id:    mv.branch_id ?? '',
            reference_no: orderNo || mv.reference_no,
          }),
        })
        if (!mvRes.ok) throw new Error(`StockMovement POST ${mvRes.status}`)
      }

      // 5. Mark done and update local order record
      await localDb.transaction('rw', [localDb.syncQueue, localDb.orders], async () => {
        await localDb.syncQueue.update(item.id!, {
          status: 'done',
          server_order_id: serverId,
          synced_at: new Date().toISOString(),
        })
        await localDb.orders
          .where('local_id').equals(item.local_order_id)
          .modify({ server_id: serverId, sync_status: 'done' })
      })

      broadcastOrderSynced({ local_id: item.local_order_id, server_id: serverId })

    } catch (err) {
      const retries = item.retry_count + 1
      const isFinal = retries >= MAX_RETRY
      await localDb.syncQueue.update(item.id!, {
        status:      isFinal ? 'failed' : 'pending',
        retry_count: retries,
        last_error:  String(err),
      })
      if (!isFinal) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)]))
      }
    }
  }
}
