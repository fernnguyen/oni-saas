import type { IDataConnector as DataConnector } from '@oni/core'
import { invalidate } from '@/lib/server/cache'

const SESSION_METADATA_KEYS = [
  'check_in',
  'check_in_time',
  'temp_checkout_time',
  'actual_checkout_requested_at',
  'original_start_time',
  'original_temp_checkout_time',
  'guests',
  'guests_list',
  'num_guests',
  'expected_checkout',
  'customer_phone',
  'customer_address',
  'note',
] as const

export function parseMetadataSafe(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, any>) }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {}
  }
  return {}
}

export function cleanResourceSessionMetadata(
  rawMetadata: unknown,
  extraFields?: Record<string, unknown>
): string {
  const meta = parseMetadataSafe(rawMetadata)
  for (const key of SESSION_METADATA_KEYS) {
    delete meta[key]
  }
  if (extraFields) {
    Object.assign(meta, extraFields)
  }
  return JSON.stringify(meta)
}

export function resolveOrderResourceId(order: Record<string, any>): string {
  const meta = parseMetadataSafe(order.metadata)
  const metaResId = typeof meta.resource_id === 'string' ? meta.resource_id.trim() : ''
  if (metaResId) return metaResId
  const directResId = typeof order.resource_id === 'string' ? order.resource_id.trim() : ''
  return directResId
}

function getOrderId(order: Record<string, any>): string {
  return String(order.order_id || order.id || '')
}

export function isOrderFlaggedForReview(order: Record<string, any>): boolean {
  const meta = parseMetadataSafe(order.metadata)
  return meta.needs_review === true || meta.needs_review === 'true'
}

/**
 * Two session check-in markers refer to the same session when they parse to the same instant (±2s),
 * or are string-identical when unparseable.
 */
export function isSameSessionCheckIn(a: unknown, b: unknown): boolean {
  const sa = String(a || '').trim()
  const sb = String(b || '').trim()
  if (!sa || !sb) return false
  if (sa === sb) return true
  const ta = new Date(sa).getTime()
  const tb = new Date(sb).getTime()
  if (isNaN(ta) || isNaN(tb)) return false
  return Math.abs(ta - tb) <= 2000
}

/**
 * True when an order still carries customer data we must never silently discard:
 * any payment, or at least one active order item. Fails safe (true) on lookup errors.
 */
async function orderHasItemsOrPayment(connector: DataConnector, order: Record<string, any>): Promise<boolean> {
  if (Number(order.paid_amount || 0) > 0) return true
  try {
    const itemsRes = await connector.list('order-items', {
      page: 1,
      limit: 5,
      filters: { order_id: getOrderId(order), active: 'TRUE' },
    })
    return ((itemsRes.data || []) as Record<string, any>[]).some(
      (it) => String(it.active || 'TRUE').toUpperCase() !== 'FALSE'
    )
  } catch {
    return true
  }
}

/**
 * Marks an in_progress table order as needing manual review instead of cancelling it.
 * Returns true when a write happened (already-flagged orders are left untouched).
 */
async function flagOrderForReview(
  connector: DataConnector,
  order: Record<string, any>,
  reason: string
): Promise<boolean> {
  if (isOrderFlaggedForReview(order)) return false
  const meta = parseMetadataSafe(order.metadata)
  meta.needs_review = true
  meta.review_reason = reason
  meta.review_flagged_at = new Date().toISOString()
  console.warn(`[tableSessionReconciler] Flagged order ${getOrderId(order)} for review: ${reason}`)
  await connector.update('orders', getOrderId(order), { metadata: JSON.stringify(meta) }).catch(() => {})
  order.metadata = JSON.stringify(meta)
  return true
}

/**
 * Cancels a stale in_progress table order only when doing so cannot lose data.
 * Orders with items or payments are flagged `needs_review` instead, unless `sameSessionCheckIn`
 * proves they belong to the session that was just settled/cancelled.
 */
async function cancelOrFlagTableOrder(
  connector: DataConnector,
  order: Record<string, any>,
  cancelNote: string,
  reviewReason: string,
  sameSessionCheckIn?: string
): Promise<'cancelled' | 'flagged' | 'skipped'> {
  if (isOrderFlaggedForReview(order)) return 'skipped'
  const ordMeta = parseMetadataSafe(order.metadata)
  const isSameSession = Boolean(sameSessionCheckIn && isSameSessionCheckIn(ordMeta.check_in, sameSessionCheckIn))
  if (!isSameSession && (await orderHasItemsOrPayment(connector, order))) {
    return (await flagOrderForReview(connector, order, reviewReason)) ? 'flagged' : 'skipped'
  }
  await connector.update('orders', getOrderId(order), {
    status: 'cancelled',
    note: order.note ? `${order.note} | ${cancelNote}` : cancelNote,
  }).catch(() => {})
  return 'cancelled'
}

/**
 * Cancels any lingering `in_progress` orders attached to `resourceId` (except `keepOrderId`).
 * Used when opening a new session, completing checkout, or releasing/cancelling a table.
 * Orders that still hold items or payments are never cancelled: they are flagged `needs_review`
 * (or skipped in `safeMode`), unless their check_in matches `sessionCheckIn` (same session).
 */
export async function cancelOrphanedInProgressOrdersForResource(
  connector: DataConnector,
  shopId: string,
  resourceId: string,
  keepOrderId?: string,
  safeMode: boolean = false,
  sessionCheckIn?: string
): Promise<void> {
  if (!resourceId || resourceId.startsWith('takeaway')) return
  try {
    const inProgRes = await connector.list('orders', {
      page: 1,
      limit: 100,
      filters: { status: 'in_progress' },
    })
    const orders = (inProgRes.data || []) as Record<string, any>[]
    let mutatedAny = false

    for (const ord of orders) {
      const ordId = getOrderId(ord)
      if (!ordId || (keepOrderId && ordId === keepOrderId)) continue

      const ordResId = resolveOrderResourceId(ord)
      if (ordResId !== resourceId) continue

      // In safeMode, skip orders that already have items or payments (to avoid data loss)
      if (safeMode) {
        if (await orderHasItemsOrPayment(connector, ord)) continue
      }

      const outcome = await cancelOrFlagTableOrder(
        connector,
        ord,
        'Tự động đóng phiên phòng/bàn cũ bị treo',
        'Phiên cũ còn món/tiền trên bàn đang được mở hoặc trả',
        sessionCheckIn
      )
      if (outcome !== 'skipped') mutatedAny = true
    }

    if (mutatedAny) {
      invalidate(shopId, 'orders')
    }
  } catch (err) {
    console.warn('[tableSessionReconciler] Failed to cancel orphaned in_progress orders:', err)
  }
}

/**
 * Reconciles physical `location-resources` and `in_progress` orders for a shop:
 * 1. Cleans stale `check_in` / `current_order_id` on non-occupied tables.
 * 2. Deduplicates multiple `in_progress` orders on the same physical table (keeps only the newest).
 * 3. Auto-closes zombie `in_progress` orders that were already superseded by a newer `completed` order on the same table.
 * 4. Auto-releases tables whose `current_order_id` points to a `completed` or `cancelled` order.
 */
export async function reconcileShopTableSessions(
  connector: DataConnector,
  shopId: string,
  existingResources?: Record<string, any>[]
): Promise<Record<string, any>[]> {
  try {
    const resourcesList = existingResources
      ? existingResources
      : ((await connector.list('location-resources', {
          page: 1,
          limit: 500,
          filters: { branch_id: shopId },
          sortDesc: false,
        })).data as Record<string, any>[])

    if (!resourcesList || resourcesList.length === 0) return []

    const [inProgRes, completedRes] = await Promise.all([
      connector.list('orders', {
        page: 1,
        limit: 100,
        filters: { status: 'in_progress' },
      }),
      connector.list('orders', {
        page: 1,
        limit: 100,
        filters: { status: 'completed' },
      }),
    ])

    const inProgOrders = (inProgRes.data || []) as Record<string, any>[]
    const completedOrders = (completedRes.data || []) as Record<string, any>[]

    // Map latest completed order timestamp per resource_id
    const latestCompletedByResource = new Map<string, { order: Record<string, any>; timeMs: number; checkIn: string }>()
    for (const comp of completedOrders) {
      const rId = resolveOrderResourceId(comp)
      if (!rId || rId.startsWith('takeaway')) continue
      const compMeta = parseMetadataSafe(comp.metadata)
      const timeStr = compMeta.check_out || comp.updated_at || comp.created_at || ''
      const timeMs = timeStr ? new Date(timeStr).getTime() : 0
      if (!timeMs || isNaN(timeMs)) continue

      const prev = latestCompletedByResource.get(rId)
      if (!prev || timeMs > prev.timeMs) {
        latestCompletedByResource.set(rId, {
          order: comp,
          timeMs,
          checkIn: String(compMeta.check_in || ''),
        })
      }
    }

    // Track which resource explicitly owns which current_order_id
    const explicitOwnerByOrderId = new Map<string, string>()
    const resourceById = new Map<string, Record<string, any>>()
    for (const r of resourcesList) {
      const rId = String(r.id || r.resource_id || '')
      if (!rId || r.status === 'deleted') continue
      resourceById.set(rId, r)
      const isOccupied = r.status === 'occupied' || r.status === 'playing' || r.status === 'checking_out'
      if (isOccupied && r.current_order_id) {
        explicitOwnerByOrderId.set(String(r.current_order_id), rId)
      }
    }

    // Group in_progress orders by effective resource_id
    const inProgByResource = new Map<string, Record<string, any>[]>()
    for (const ord of inProgOrders) {
      const ordId = String(ord.order_id || ord.id || '')
      if (!ordId || isOrderFlaggedForReview(ord)) continue
      const rId = explicitOwnerByOrderId.get(ordId) || resolveOrderResourceId(ord)
      if (!rId || rId.startsWith('takeaway') || !resourceById.has(rId)) continue

      const list = inProgByResource.get(rId) || []
      list.push(ord)
      inProgByResource.set(rId, list)
    }

    let resourcesMutated = false
    let ordersMutated = false
    const nowMs = Date.now()

    for (const r of resourcesList) {
      const rId = String(r.id || r.resource_id || '')
      if (!rId || r.status === 'deleted') continue

      const isOccupied = r.status === 'occupied' || r.status === 'playing' || r.status === 'checking_out'
      const rMeta = parseMetadataSafe(r.metadata)
      const tableInProgList = inProgByResource.get(rId) || []

      // Sort newest first by created_at / metadata.check_in
      tableInProgList.sort((a, b) => {
        const tA = new Date(parseMetadataSafe(a.metadata).check_in || a.created_at || 0).getTime()
        const tB = new Date(parseMetadataSafe(b.metadata).check_in || b.created_at || 0).getTime()
        return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA)
      })

      if (!isOccupied) {
        // 1. Table is available/dirty/cleaning: strip any leftover session metadata or current_order_id
        const hasStaleSessionMeta = Boolean(
          r.current_order_id ||
          rMeta.check_in ||
          rMeta.temp_checkout_time ||
          rMeta.original_start_time
        )
        if (hasStaleSessionMeta) {
          const cleanedMeta = cleanResourceSessionMetadata(r.metadata)
          r.current_order_id = ''
          r.metadata = cleanedMeta
          await connector.update('location-resources', rId, {
            current_order_id: '',
            metadata: cleanedMeta,
          }).catch(() => {})
          resourcesMutated = true
        }

        // 2. Cancel any orphaned in_progress orders pointing to this non-occupied table
        // (allow 60s grace window in case a table check-in is mid-flight)
        for (const orphanOrd of tableInProgList) {
          const orphanMeta = parseMetadataSafe(orphanOrd.metadata)
          const startedMs = new Date(orphanMeta.check_in || orphanOrd.created_at || 0).getTime()
          const ageMs = isNaN(startedMs) ? Infinity : nowMs - startedMs
          if (ageMs > 60_000) {
            const outcome = await cancelOrFlagTableOrder(
              connector,
              orphanOrd,
              'Tự động hủy phiên treo trên bàn trống',
              'Đơn còn món/tiền nhưng bàn đang trống'
            )
            if (outcome !== 'skipped') ordersMutated = true
          }
        }
        continue
      }

      // Table IS occupied:
      // 1. If there are multiple in_progress orders for this table, cancel all but the newest
      if (tableInProgList.length > 1) {
        for (let i = 1; i < tableInProgList.length; i++) {
          const olderOrd = tableInProgList[i]
          if (!getOrderId(olderOrd)) continue
          const outcome = await cancelOrFlagTableOrder(
            connector,
            olderOrd,
            'Tự động đóng phiên cũ trùng bàn',
            'Nhiều phiên đang mở trên cùng bàn'
          )
          if (outcome !== 'skipped') ordersMutated = true
        }
      }

      const newestInProg = tableInProgList[0]
      const latestComp = latestCompletedByResource.get(rId)

      if (newestInProg) {
        const activeOrdId = String(newestInProg.order_id || newestInProg.id || '')
        const activeOrdMeta = parseMetadataSafe(newestInProg.metadata)
        const activeCreatedMs = new Date(activeOrdMeta.check_in || newestInProg.created_at || 0).getTime()
        const activeCheckInStr = String(activeOrdMeta.check_in || newestInProg.created_at || '')

        // Check if this in_progress order was ALREADY superseded by a completed checkout on the same table
        const isSupersededByCompleted = Boolean(
          latestComp &&
          ((!isNaN(activeCreatedMs) && latestComp.timeMs > activeCreatedMs + 5000) ||
            (latestComp.checkIn && activeCheckInStr && latestComp.checkIn === activeCheckInStr))
        )

        if (isSupersededByCompleted && latestComp) {
          // Auto-cancel the zombie in_progress order (flag instead if it may hold unpaid items) and release the table
          const compRef = latestComp.order.order_no || latestComp.order.order_id
          const outcome = await cancelOrFlagTableOrder(
            connector,
            newestInProg,
            `Tự động đóng phiên treo (đã thanh toán ở đơn ${compRef})`,
            `Bàn đã thanh toán ở đơn ${compRef} nhưng phiên này vẫn còn món/tiền`,
            latestComp.checkIn
          )
          if (outcome !== 'skipped') ordersMutated = true

          const cleanedMeta = cleanResourceSessionMetadata(r.metadata, {
            last_checkout_time: latestComp.order.created_at || new Date().toISOString(),
          })
          r.status = 'available'
          r.current_order_id = ''
          r.metadata = cleanedMeta
          await connector.update('location-resources', rId, {
            status: 'available',
            current_order_id: '',
            metadata: cleanedMeta,
          }).catch(() => {})
          resourcesMutated = true
          continue
        }

        // Valid active session: ensure location-resources points to newestInProg and has its fresh check_in
        const needsOrderSync = r.current_order_id !== activeOrdId
        const needsCheckInSync = Boolean(activeCheckInStr && rMeta.check_in !== activeCheckInStr)
        if (needsOrderSync || needsCheckInSync) {
          const syncedMeta = JSON.stringify({
            ...rMeta,
            check_in: activeCheckInStr || rMeta.check_in || new Date().toISOString(),
            rental_type: activeOrdMeta.rental_type || rMeta.rental_type || 'hourly',
          })
          r.current_order_id = activeOrdId
          r.metadata = syncedMeta
          await connector.update('location-resources', rId, {
            current_order_id: activeOrdId,
            metadata: syncedMeta,
          }).catch(() => {})
          resourcesMutated = true
        }
      } else if (r.current_order_id) {
        // Table is occupied and has current_order_id, but NO in_progress order matched!
        // Check if current_order_id is already completed or cancelled on the server
        const referencedOrder = await connector.findById('orders', String(r.current_order_id)).catch(() => null)
        if (
          !referencedOrder ||
          referencedOrder.status === 'completed' ||
          referencedOrder.status === 'cancelled'
        ) {
          const cleanedMeta = cleanResourceSessionMetadata(r.metadata, {
            last_checkout_time: referencedOrder?.updated_at || referencedOrder?.created_at || new Date().toISOString(),
          })
          r.status = 'available'
          r.current_order_id = ''
          r.metadata = cleanedMeta
          await connector.update('location-resources', rId, {
            status: 'available',
            current_order_id: '',
            metadata: cleanedMeta,
          }).catch(() => {})
          resourcesMutated = true
        }
      }
    }

    if (resourcesMutated) invalidate(shopId, 'location-resources')
    if (ordersMutated) invalidate(shopId, 'orders')

    return resourcesList
  } catch (err) {
    console.warn('[tableSessionReconciler] Reconcile warning:', err)
    return existingResources || []
  }
}

/**
 * Resolves a potentially temporary client-side table order ID (e.g. `ORD-T-INPROG-...`)
 * to the canonical server `orders.id` by checking `reference_no` if needed.
 */
export async function resolveServerOrderId(
  connector: DataConnector,
  rawOrderId: string
): Promise<string> {
  const trimmed = (rawOrderId || '').trim()
  if (!trimmed) return ''
  if (!trimmed.startsWith('ORD-T-INPROG-')) return trimmed

  try {
    const direct = await connector.findById('orders', trimmed).catch(() => null)
    if (direct) return String(direct.order_id || direct.id || trimmed)

    const byRef = await connector.list('orders', {
      page: 1,
      limit: 5,
      filters: { reference_no: trimmed },
    })
    const matched = (byRef.data || [])[0] as Record<string, any> | undefined
    if (matched) {
      return String(matched.order_id || matched.id || trimmed)
    }
  } catch {}
  return trimmed
}

/**
 * Recalculates and syncs `subtotal`, `total_amount`, and `metadata.cartItemsCount`
 * on an `in_progress` table/room order whenever its `order-items` are created, updated, or deleted.
 * Strictly no-ops for `completed` or `cancelled` orders (zero impact on retail).
 */
export async function recalculateInProgressOrderTotals(
  connector: DataConnector,
  shopId: string,
  orderId: string
): Promise<void> {
  if (!orderId) return
  try {
    const resolvedId = await resolveServerOrderId(connector, orderId)
    const order = await connector.findById('orders', resolvedId).catch(() => null)
    if (!order || order.status !== 'in_progress') return

    const itemsRes = await connector.list('order-items', {
      page: 1,
      limit: 500,
      filters: { order_id: resolvedId, active: 'TRUE' },
    })
    const items = (itemsRes.data || []) as Record<string, any>[]

    let cartItemsCount = 0
    let itemsSubtotal = 0

    for (const it of items) {
      if (String(it.active || 'TRUE').toUpperCase() === 'FALSE') continue
      const prodId = String(it.product_id || '')
      const sku = String(it.sku || '')
      const prodName = String(it.product_name || '')
      const isTimeCharge =
        prodId.startsWith('TIME_CHARGE') ||
        sku.startsWith('TIME_CHARGE') ||
        prodName.startsWith('Tiền giờ ') ||
        prodName.startsWith('Phí giờ ')

      const qty = Number(it.qty ?? it.quantity ?? 0) || 0
      const lineTotal =
        it.line_total !== undefined && it.line_total !== ''
          ? Number(it.line_total) || 0
          : (Number(it.unit_price || 0) + Number(it.modifier_total || 0)) * qty

      if (!isTimeCharge && qty > 0) {
        cartItemsCount += qty
      }
      itemsSubtotal += lineTotal
    }

    const meta = parseMetadataSafe(order.metadata)
    meta.cartItemsCount = cartItemsCount
    meta.items_updated_at = new Date().toISOString()

    const discountAmt = Number(order.discount_amount || 0) || 0
    const taxAmt = Number(order.tax_amount || 0) || 0
    const shippingFee = Number(order.shipping_fee || 0) || 0
    const totalAmt = Math.max(0, itemsSubtotal - discountAmt + taxAmt + shippingFee)

    await connector.update('orders', resolvedId, {
      subtotal: String(itemsSubtotal),
      total_amount: String(totalAmt),
      metadata: JSON.stringify(meta),
    })

    invalidate(shopId, 'orders')
    invalidate(shopId, 'location-resources')
  } catch (err) {
    console.warn('[tableSessionReconciler] Failed to recalculate in_progress order totals:', err)
  }
}


interface StaleSessionItem {
  product_id: string
  sku?: string
  product_name: string
  qty: number
  unit_price: number
  discount_amount?: number
  line_total: number
  variant_label?: string
  modifiers?: unknown
  modifier_total?: number
}

/**
 * Preserves a stale offline table session (check_in before the table's last checkout) instead of
 * cancelling it: the server order is flagged `needs_review` (or cancelled when it holds nothing),
 * and offline items the server never received are parked on that order — or on a new flagged
 * order when the server never saw this session. Returns the order id holding the data, if any.
 */
export async function preserveStaleTableSession(
  connector: DataConnector,
  params: {
    serverOrderId: string
    order: { customer_name?: string; branch_id?: string; employee_id?: string; metadata?: string; note?: string }
    items: StaleSessionItem[]
    localOrderId: string
    resourceId: string
    isTimeCharge: (productId: string, productName: string) => boolean
  }
): Promise<string> {
  const { serverOrderId, order, items, localOrderId, resourceId, isTimeCharge } = params
  const reason = 'Phiên offline có giờ vào trước lần trả bàn gần nhất'
  const realItems = (items || []).filter(
    (it) => it && it.product_id && Number(it.qty) > 0 && !isTimeCharge(it.product_id, it.product_name)
  )

  let holderOrderId = ''
  const knownProductIds = new Set<string>()

  if (serverOrderId) {
    const serverOrder = await connector.findById('orders', serverOrderId).catch(() => null)
    if (serverOrder && serverOrder.status === 'in_progress') {
      if (realItems.length > 0) {
        await flagOrderForReview(connector, serverOrder as Record<string, any>, reason)
      } else {
        await cancelOrFlagTableOrder(connector, serverOrder as Record<string, any>, 'Tự động hủy phiên offline cũ', reason)
      }
      holderOrderId = serverOrderId
      const existing = await connector.list('order-items', {
        page: 1,
        limit: 200,
        filters: { order_id: serverOrderId },
      }).catch(() => ({ data: [] as Record<string, any>[] }))
      for (const row of (existing.data || []) as Record<string, any>[]) {
        if (String(row.active || 'TRUE').toUpperCase() !== 'FALSE') knownProductIds.add(String(row.product_id))
      }
    }
  }

  const missingItems = realItems.filter((it) => !knownProductIds.has(it.product_id))
  if (missingItems.length === 0) return holderOrderId

  if (!holderOrderId) {
    const meta = parseMetadataSafe(order.metadata)
    meta.resource_id = resourceId
    meta.needs_review = true
    meta.review_reason = reason
    meta.review_flagged_at = new Date().toISOString()
    const subtotal = missingItems.reduce((sum, it) => sum + (Number(it.line_total) || 0), 0)
    const created = await connector.create('orders', {
      status: 'in_progress',
      channel: 'pos',
      customer_name: order.customer_name ?? '',
      branch_id: order.branch_id ?? '',
      employee_id: order.employee_id ?? '',
      subtotal: String(subtotal),
      discount_amount: '0',
      tax_amount: '0',
      total_amount: String(subtotal),
      paid_amount: '0',
      note: order.note ? `${order.note} | ${reason}` : reason,
      reference_no: localOrderId,
      resource_id: resourceId,
      metadata: JSON.stringify(meta),
    })
    holderOrderId = String((created as Record<string, any>).order_id || (created as Record<string, any>).id || '')
    if (!holderOrderId) return ''
    console.warn(`[tableSessionReconciler] Parked stale offline session ${localOrderId} as order ${holderOrderId}`)
  }

  await connector.batchCreate('order-items', missingItems.map((it, idx) => ({
    order_id: holderOrderId,
    line_no: String(idx + 1),
    product_id: it.product_id,
    sku: it.sku ?? '',
    product_name: it.product_name,
    qty: String(it.qty),
    unit_price: String(it.unit_price),
    original_price: String(it.unit_price),
    line_discount: String(it.discount_amount ?? 0),
    line_total: String(it.line_total),
    variant_label: it.variant_label ?? '',
    modifiers: typeof it.modifiers === 'object' && it.modifiers !== null ? JSON.stringify(it.modifiers) : String(it.modifiers ?? ''),
    modifier_total: String(it.modifier_total ?? 0),
  })))

  return holderOrderId
}

function normalizeModifiersKey(raw: unknown): string {
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

export function tableLineKey(productId: unknown, variantLabel: unknown, modifiers: unknown): string {
  return `${String(productId || '')}|${String(variantLabel || '').trim()}|${normalizeModifiersKey(modifiers)}`
}

interface TableLineInput {
  product_id: string
  product_name: string
  qty: number
  unit_price: number
  line_total: number
  discount_amount?: number
  variant_label?: string
  modifiers?: unknown
}

/**
 * sync-batch, existing table/room orders only: aligns a server line that duplicates a payload line
 * (same product/variant/modifiers) with the client cart instead of skipping it. Food lines are only
 * overwritten at checkout (status != in_progress); the time-charge line is refreshed on every sync.
 * Returns true when the server row was updated.
 */
export async function syncExistingTableOrderLine(
  connector: DataConnector,
  params: {
    item: TableLineInput
    existingRows: Record<string, any>[]
    payloadItems: { product_id: string }[]
    orderStatus: string
    isTimeCharge: (productId: string, productName: string) => boolean
    onRollback?: (fn: () => Promise<void>) => void
  }
): Promise<boolean> {
  const { item: it, existingRows, payloadItems, orderStatus, isTimeCharge, onRollback } = params
  const isTimeChargeLine = isTimeCharge(it.product_id, it.product_name)
  if (!isTimeChargeLine && orderStatus === 'in_progress') return false

  const candidates = existingRows.filter(
    (row) => row.product_id === it.product_id && String(row.active || 'TRUE').toUpperCase() !== 'FALSE'
  )
  const incomingKey = tableLineKey(it.product_id, it.variant_label, it.modifiers)
  let target = candidates.find((row) => tableLineKey(row.product_id, row.variant_label, row.modifiers) === incomingKey)
  if (!target && candidates.length === 1 && payloadItems.filter((x) => x.product_id === it.product_id).length === 1) {
    target = candidates[0]
  }
  const targetId = target ? String(target.item_id || target.id || '') : ''
  if (!target || !targetId) return false

  const nextQty = Number(it.qty) || 0
  const nextUnitPrice = Number(it.unit_price) || 0
  const nextLineTotal = Number(it.line_total) || 0
  if (
    Number(target.qty || 0) === nextQty &&
    Number(target.unit_price || 0) === nextUnitPrice &&
    Number(target.line_total || 0) === nextLineTotal
  ) return false

  const previous = {
    qty: String(target.qty ?? ''),
    unit_price: String(target.unit_price ?? ''),
    line_total: String(target.line_total ?? ''),
    line_discount: String(target.line_discount ?? ''),
    product_name: String(target.product_name ?? ''),
  }
  await connector.update('order-items', targetId, {
    qty: String(nextQty),
    unit_price: String(nextUnitPrice),
    line_total: String(nextLineTotal),
    line_discount: String(it.discount_amount ?? 0),
    product_name: it.product_name,
  })
  onRollback?.(async () => {
    await connector.update('order-items', targetId, previous).catch(() => {})
  })
  return true
}
