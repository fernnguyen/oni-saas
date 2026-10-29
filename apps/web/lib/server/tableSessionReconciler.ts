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

/**
 * Cancels any lingering `in_progress` orders attached to `resourceId` (except `keepOrderId`).
 * Used when opening a new session, completing checkout, or releasing/cancelling a table.
 */
export async function cancelOrphanedInProgressOrdersForResource(
  connector: DataConnector,
  shopId: string,
  resourceId: string,
  keepOrderId?: string,
  safeMode: boolean = false
): Promise<void> {
  if (!resourceId || resourceId.startsWith('takeaway')) return
  try {
    const inProgRes = await connector.list('orders', {
      page: 1,
      limit: 100,
      filters: { status: 'in_progress' },
    })
    const orders = (inProgRes.data || []) as Record<string, any>[]
    let cancelledAny = false

    for (const ord of orders) {
      const ordId = String(ord.order_id || ord.id || '')
      if (!ordId || (keepOrderId && ordId === keepOrderId)) continue

      const ordResId = resolveOrderResourceId(ord)
      if (ordResId !== resourceId) continue

      // In safeMode, skip orders that already have items (to avoid data loss)
      if (safeMode) {
        try {
          const itemsCheck = await connector.list('order-items', {
            filters: { order_id: ordId },
            limit: 1,
          })
          if ((itemsCheck.data || []).length > 0) continue
        } catch {}
      }

      await connector.update('orders', ordId, {
        status: 'cancelled',
        note: ord.note
          ? `${ord.note} | Tự động đóng phiên treo`
          : 'Tự động đóng phiên phòng/bàn cũ bị treo',
      }).catch(() => {})
      cancelledAny = true
    }

    if (cancelledAny) {
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
      if (!ordId) continue
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
          const ordId = String(orphanOrd.order_id || orphanOrd.id || '')
          const createdMs = new Date(orphanOrd.created_at || 0).getTime()
          const ageMs = isNaN(createdMs) ? Infinity : nowMs - createdMs
          if (ageMs > 60_000 && Number(orphanOrd.paid_amount || 0) === 0) {
            await connector.update('orders', ordId, {
              status: 'cancelled',
              note: orphanOrd.note
                ? `${orphanOrd.note} | Tự động hủy phiên treo trên bàn trống`
                : 'Tự động hủy phiên treo trên bàn trống',
            }).catch(() => {})
            ordersMutated = true
          }
        }
        continue
      }

      // Table IS occupied:
      // 1. If there are multiple in_progress orders for this table, cancel all but the newest
      if (tableInProgList.length > 1) {
        for (let i = 1; i < tableInProgList.length; i++) {
          const olderOrd = tableInProgList[i]
          const olderId = String(olderOrd.order_id || olderOrd.id || '')
          if (!olderId) continue
          await connector.update('orders', olderId, {
            status: 'cancelled',
            note: olderOrd.note
              ? `${olderOrd.note} | Tự động đóng phiên cũ trùng bàn`
              : 'Tự động đóng phiên cũ trùng bàn',
          }).catch(() => {})
          ordersMutated = true
        }
      }

      const newestInProg = tableInProgList[0]
      const latestComp = latestCompletedByResource.get(rId)

      if (newestInProg) {
        const activeOrdId = String(newestInProg.order_id || newestInProg.id || '')
        const activeOrdMeta = parseMetadataSafe(newestInProg.metadata)
        const activeCreatedMs = new Date(newestInProg.created_at || activeOrdMeta.check_in || 0).getTime()
        const activeCheckInStr = String(activeOrdMeta.check_in || newestInProg.created_at || '')

        // Check if this in_progress order was ALREADY superseded by a completed checkout on the same table
        const isSupersededByCompleted = Boolean(
          latestComp &&
          ((!isNaN(activeCreatedMs) && latestComp.timeMs > activeCreatedMs + 5000) ||
            (latestComp.checkIn && activeCheckInStr && latestComp.checkIn === activeCheckInStr))
        )

        if (isSupersededByCompleted && latestComp) {
          // Auto-cancel the zombie in_progress order and release the table!
          await connector.update('orders', activeOrdId, {
            status: 'cancelled',
            note: newestInProg.note
              ? `${newestInProg.note} | Đã hoàn tất ở đơn ${latestComp.order.order_no || latestComp.order.order_id}`
              : `Tự động đóng phiên treo (đã thanh toán ở đơn ${latestComp.order.order_no || latestComp.order.order_id})`,
          }).catch(() => {})
          ordersMutated = true

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

