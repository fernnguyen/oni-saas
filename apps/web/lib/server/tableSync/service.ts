import type { IDataConnector, TransactionClient } from '@oni/adapters'
import crypto from 'crypto'
import { buildTablePricingSnapshot, computeTableTimeCharge, getGMT7Time, type TablePricingSnapshot } from '@oni/core'
import { invalidate } from '@/lib/server/cache'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { cleanResourceSessionMetadata, parseMetadataSafe } from '@/lib/server/tableSessionReconciler'
import { applyTableOps, isTimeChargeLine, TableSyncError, type ApplyOpsResult, type TableOp } from './engine'
import { createPgTableSyncRepo, mapSessionRow } from './pgRepository'
import { broadcastTableSync } from './broadcast'

// Table sync v2 service (docs/TABLE-SESSION-SYNC-PLAN.md Phase 1): sessions, idempotent ops,
// change feed. On by default for every shop whose connector supports transactions (Postgres);
// other connectors keep the legacy flow. Emergency kill switch: TABLE_SYNC_V2_DISABLED=true.

type TxConnector = IDataConnector & { withTransaction: NonNullable<IDataConnector['withTransaction']> }

export function isTableSyncV2KillSwitchOn(): boolean {
  return process.env.TABLE_SYNC_V2_DISABLED === 'true'
}

/** Clients treat any non-200 here (409 disabled/unsupported) as "use the legacy table flow". */
export async function requireTableSyncV2(_shopId: string, connector: IDataConnector): Promise<TxConnector> {
  if (isTableSyncV2KillSwitchOn()) {
    throw new TableSyncError(409, 'table_sync_v2_disabled', 'Đồng bộ bàn v2 đang tạm tắt')
  }
  if (typeof connector.withTransaction !== 'function') {
    throw new TableSyncError(409, 'table_sync_v2_unsupported', 'Nguồn dữ liệu của cửa hàng chưa hỗ trợ đồng bộ bàn v2')
  }
  return connector as TxConnector
}

const ID_PATTERN = /^[A-Za-z0-9_\-:.]{8,255}$/

function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export interface OpenSessionInput {
  session_id: string
  resource_id: string
  check_in: string
  device_id?: string
  customer_id?: string
  customer_name?: string
  employee_id?: string
  shift_id?: string
  rental_type?: string
  metadata?: Record<string, unknown>
  pricing_snapshot?: Record<string, unknown>
}

async function findSessionById(tx: TransactionClient, id: string) {
  const rows = await tx.query(`SELECT * FROM table_sessions WHERE id = $1 AND tenant_id = $2`, [id, tx.tenantId ?? ''])
  return rows[0] || null
}

async function findOpenSessionForResource(tx: TransactionClient, branchId: string, resourceId: string) {
  const rows = await tx.query(
    `SELECT * FROM table_sessions WHERE tenant_id = $1 AND branch_id = $2 AND resource_id = $3 AND status = 'open' LIMIT 1`,
    [tx.tenantId ?? '', branchId, resourceId]
  )
  return rows[0] || null
}

function sessionResponse(row: any) {
  const s = mapSessionRow(row)
  return { ...s, check_out: row.check_out || '', opened_by_device: row.opened_by_device || '' }
}

/**
 * Opens a session for a physical resource. Idempotent by client `session_id`: re-sending returns
 * the same session. If another session is already open on the resource, throws 409
 * `resource_occupied` with that session (never auto-cancels or merges – E10).
 */
export async function openTableSession(connector: TxConnector, shopId: string, input: OpenSessionInput) {
  const sessionId = String(input.session_id || '').trim()
  const resourceId = String(input.resource_id || '').trim()
  const checkIn = normalizeIso(input.check_in)
  if (!ID_PATTERN.test(sessionId)) throw new TableSyncError(400, 'invalid_session_id', 'session_id không hợp lệ')
  if (!resourceId || resourceId.startsWith('takeaway')) throw new TableSyncError(400, 'invalid_resource', 'resource_id không hợp lệ')
  if (!checkIn) throw new TableSyncError(400, 'invalid_check_in', 'check_in phải là thời điểm ISO hợp lệ')

  const pre = await connector.withTransaction(async (tx) => {
    const existing = await findSessionById(tx, sessionId)
    if (existing) return { existing }
    let occupied = await findOpenSessionForResource(tx, shopId, resourceId)
    if (occupied && (await healSessionIfOrderClosed(tx, occupied))) occupied = null
    return { occupied }
  })
  if (pre.existing) {
    if (pre.existing.resource_id !== resourceId) {
      throw new TableSyncError(409, 'session_id_conflict', 'session_id đã được dùng cho bàn khác')
    }
    return { session: sessionResponse(pre.existing), created: false }
  }
  if (pre.occupied) {
    throw Object.assign(new TableSyncError(409, 'resource_occupied', 'Bàn đang có phiên khác'), {
      details: { existing_session: sessionResponse(pre.occupied) },
    })
  }

  const resource = await connector.findById('location-resources', resourceId)
  if (!resource || (resource.branch_id && resource.branch_id !== shopId)) {
    throw new TableSyncError(404, 'resource_not_found', 'Không tìm thấy bàn/phòng')
  }

  // Mixed fleet (mobile/Zalo still on the legacy flow): never open a v2 session on top of a table
  // that a legacy client already occupies with a live order.
  const occupiedStatuses = ['occupied', 'playing', 'checking_out']
  if (occupiedStatuses.includes(String(resource.status || '')) && resource.current_order_id) {
    const liveOrder = await connector.findById('orders', String(resource.current_order_id)).catch(() => null)
    if (liveOrder && liveOrder.status === 'in_progress' && parseMetadataSafe(liveOrder.metadata).session_id !== sessionId) {
      throw Object.assign(new TableSyncError(409, 'resource_occupied', 'Bàn đang có phiên khác'), {
        details: { existing_session: null, legacy_order_id: String(resource.current_order_id) },
      })
    }
  }

  // Reuse an order left by an earlier attempt of this same open (crash between steps)
  const prior = await connector.list('orders', { page: 1, limit: 1, filters: { reference_no: sessionId } })
  let order = (prior.data || [])[0] as Record<string, string> | undefined
  const orderMeta = {
    ...(input.metadata || {}),
    resource_id: resourceId,
    resource_name: resource.name || '',
    check_in: checkIn,
    session_id: sessionId,
    rental_type: input.rental_type || (input.metadata as any)?.rental_type || 'hourly',
  }
  if (!order) {
    const { enforceLimit } = await import('@/lib/server/planLimits')
    const { data: shopRow } = await getSupabaseAdminClient().from('shops').select('tenant_id').eq('id', shopId).maybeSingle()
    if (shopRow?.tenant_id) await enforceLimit('max_orders_per_month', { tenantId: shopRow.tenant_id }, shopRow.tenant_id)
    order = await connector.create('orders', {
      status: 'in_progress',
      channel: 'pos',
      customer_id: input.customer_id || 'C-DEFAULT-RETAIL',
      customer_name: input.customer_name || 'Khách lẻ',
      branch_id: shopId,
      employee_id: input.employee_id || '',
      shift_id: input.shift_id || '',
      subtotal: '0',
      discount_amount: '0',
      tax_amount: '0',
      total_amount: '0',
      paid_amount: '0',
      debt_amount: '0',
      payment_method: 'cash',
      note: '',
      reference_no: sessionId,
      resource_id: resourceId,
      metadata: JSON.stringify(orderMeta),
      created_at: getGMT7Time(),
    })
  }
  const orderId = String(order.order_id || order.id || '')
  if (!orderId) throw new Error('Không tạo được đơn cho phiên bàn')
  const pricingSnapshot = input.pricing_snapshot || buildTablePricingSnapshot(resource, orderMeta)

  const outcome = await connector.withTransaction(async (tx) => {
    try {
      const rows = await tx.query(
        `INSERT INTO table_sessions
           (id, tenant_id, branch_id, resource_id, order_id, status, check_in, pricing_snapshot, version,
            opened_by_device, metadata, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, 1, $8, $9, 'TRUE', $10, $10)
         RETURNING *`,
        [
          sessionId, tx.tenantId ?? '', shopId, resourceId, orderId, checkIn,
          JSON.stringify(pricingSnapshot),
          input.device_id || null, JSON.stringify(orderMeta), getGMT7Time(),
        ]
      )
      const row = rows[0]
      await tx.query(
        `INSERT INTO table_sync_events (tenant_id, branch_id, session_id, resource_id, kind, payload)
         VALUES ($1, $2, $3, $4, 'session_opened', $5)`,
        [tx.tenantId ?? '', shopId, sessionId, resourceId, JSON.stringify({ order_id: orderId, check_in: checkIn, version: 1, device_id: input.device_id || '' })]
      )
      return { row }
    } catch (err: any) {
      if (err?.code === '23505') return { raced: true as const }
      throw err
    }
  })

  if ('raced' in outcome) {
    // Lost the race: another device opened this resource (or this session_id) first. The order we
    // created is still empty, so cancelling it loses nothing.
    if (!prior.data?.length) {
      await connector.update('orders', orderId, { status: 'cancelled', note: 'Mở bàn trùng (thiết bị khác đã mở trước)' }).catch(() => {})
    }
    const after = await connector.withTransaction(async (tx) => ({
      byId: await findSessionById(tx, sessionId),
      occupied: await findOpenSessionForResource(tx, shopId, resourceId),
    }))
    if (after.byId && after.byId.resource_id === resourceId) return { session: sessionResponse(after.byId), created: false }
    throw Object.assign(new TableSyncError(409, 'resource_occupied', 'Bàn đang có phiên khác'), {
      details: { existing_session: after.occupied ? sessionResponse(after.occupied) : null },
    })
  }

  const cleanedResMeta = parseMetadataSafe(cleanResourceSessionMetadata(resource.metadata))
  await connector.update('location-resources', resourceId, {
    status: 'occupied',
    current_order_id: orderId,
    metadata: JSON.stringify({ ...cleanedResMeta, check_in: checkIn, session_id: sessionId, rental_type: orderMeta.rental_type }),
  })
  invalidate(shopId, 'orders')
  invalidate(shopId, 'location-resources')
  void broadcastTableSync(shopId, { session_id: sessionId, resource_id: resourceId, kind: 'session_opened', version: 1 })

  return { session: sessionResponse(outcome.row), created: true }
}

/**
 * A session left `open` although its order was settled/cancelled through a legacy path (old app
 * build, manual release…) would block the table forever. Close it to match the order.
 * Returns true when the session was healed.
 */
async function healSessionIfOrderClosed(tx: TransactionClient, sessionRow: any): Promise<boolean> {
  const orderId = String(sessionRow.order_id || '')
  const [order] = orderId
    ? await tx.query(`SELECT status FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, tx.tenantId ?? ''])
    : []
  const orderStatus = String(order?.status || '')
  if (order && orderStatus !== 'completed' && orderStatus !== 'cancelled') return false
  const nextStatus = orderStatus === 'completed' ? 'closed' : 'cancelled'
  await tx.query(
    `UPDATE table_sessions SET status = $1, check_out = COALESCE(check_out, $2), version = version + 1, updated_at = $3
      WHERE id = $4 AND tenant_id = $5 AND status = 'open'`,
    [nextStatus, new Date().toISOString(), getGMT7Time(), sessionRow.id, tx.tenantId ?? '']
  )
  await tx.query(
    `INSERT INTO table_sync_events (tenant_id, branch_id, session_id, resource_id, kind, payload) VALUES ($1, $2, $3, $4, 'session_healed', $5)`,
    [tx.tenantId ?? '', sessionRow.branch_id, sessionRow.id, sessionRow.resource_id, JSON.stringify({ order_id: orderId, order_status: orderStatus || 'missing', status: nextStatus })]
  )
  return true
}

/**
 * Called by the legacy cancel route (`POST /orders/:id/cancel`) so a v2 session never outlives
 * its cancelled order. No-op for orders without metadata.session_id.
 */
export async function endTableSessionForCancelledOrder(connector: IDataConnector, shopId: string, orderId: string, orderMetadata: unknown) {
  const sessionId = String(parseMetadataSafe(orderMetadata).session_id || '')
  if (!sessionId || typeof connector.withTransaction !== 'function') return false
  const healed = await connector.withTransaction(async (tx) => {
    const [row] = await tx.query(
      `SELECT * FROM table_sessions WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND order_id = $4 AND status = 'open' FOR UPDATE`,
      [sessionId, tx.tenantId ?? '', shopId, orderId]
    )
    return row ? healSessionIfOrderClosed(tx, row) : false
  })
  if (healed) void broadcastTableSync(shopId, { session_id: sessionId, kind: 'session_cancelled' })
  return healed
}

export async function applyTableSessionOps(
  connector: TxConnector,
  shopId: string,
  input: { sessionId: string; deviceId: string; ops: TableOp[] }
): Promise<ApplyOpsResult> {
  const result = await connector.withTransaction(async (tx) => {
    const repo = createPgTableSyncRepo(tx)
    const locked = await repo.lockSession(input.sessionId)
    if (locked && locked.branch_id !== shopId) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')
    return applyTableOps(repo, input)
  })
  if (result.results.some((r) => r.status === 'applied' && !r.replayed)) {
    invalidate(shopId, 'orders')
    invalidate(shopId, 'order-items')
    void broadcastTableSync(shopId, { session_id: input.sessionId, kind: 'op_applied', version: result.session_version })
  }
  return result
}

export async function getTableSessionSnapshot(connector: TxConnector, shopId: string, sessionId: string) {
  const row = await connector.withTransaction((tx) => findSessionById(tx, sessionId))
  if (!row || row.branch_id !== shopId) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')
  const session = sessionResponse(row)
  const order = session.order_id ? await connector.findById('orders', session.order_id) : null
  const items = session.order_id
    ? ((await connector.list('order-items', { page: 1, limit: 500, filters: { order_id: session.order_id, active: 'TRUE' } })).data || [])
    : []
  const cursorRows = await connector.withTransaction((tx) =>
    tx.query(`SELECT COALESCE(MAX(seq), 0) AS seq FROM table_sync_events WHERE tenant_id = $1 AND branch_id = $2`, [tx.tenantId ?? '', shopId])
  )
  return { session, order, items, cursor: Number(cursorRows[0]?.seq || 0) }
}

export async function getTableSyncChanges(connector: TxConnector, shopId: string, since: number, limit = 500) {
  const safeSince = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 500, 1), 1000)
  const rows = await connector.withTransaction((tx) =>
    tx.query(
      `SELECT seq, session_id, resource_id, kind, payload, created_at
         FROM table_sync_events
        WHERE tenant_id = $1 AND branch_id = $2 AND seq > $3
        ORDER BY seq ASC
        LIMIT $4`,
      [tx.tenantId ?? '', shopId, safeSince, safeLimit + 1]
    )
  )
  const hasMore = rows.length > safeLimit
  const events = rows.slice(0, safeLimit).map((r: any) => ({
    seq: Number(r.seq),
    session_id: r.session_id,
    resource_id: r.resource_id,
    kind: r.kind,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ''),
  }))
  const cursor = events.length > 0 ? events[events.length - 1].seq : safeSince
  return { events, cursor, has_more: hasMore }
}

// ── Phase 2: server-decided time charge, close, cancel, transfer ───────────────

export const QUOTE_TTL_MS = 5 * 60_000
/** Offline provisional close is accepted as-is within these limits (plan §7.1) */
export const CLOSE_TOLERANCE = { minutes: 2, amount: 2000 }

async function insertSessionEvent(tx: TransactionClient, session: { id: string; branch_id: string; resource_id: string }, kind: string, payload: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO table_sync_events (tenant_id, branch_id, session_id, resource_id, kind, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
    [tx.tenantId ?? '', session.branch_id, session.id, session.resource_id, kind, JSON.stringify(payload)]
  )
}

async function loadPricingSnapshot(tx: TransactionClient, sessionId: string, resourceId: string, orderId: string): Promise<{ snapshot: TablePricingSnapshot; resourceName: string; metadata: Record<string, any> }> {
  const tenantId = tx.tenantId ?? ''
  const [row] = await tx.query(`SELECT pricing_snapshot, metadata FROM table_sessions WHERE id = $1 AND tenant_id = $2`, [sessionId, tenantId])
  const [resource] = await tx.query(`SELECT name, hourly_rate, metadata FROM location_resources WHERE id = $1 AND tenant_id = $2`, [resourceId, tenantId])
  let snapshot = row?.pricing_snapshot as TablePricingSnapshot | null
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.rental_type) {
    const [order] = orderId ? await tx.query(`SELECT metadata FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, tenantId]) : []
    snapshot = buildTablePricingSnapshot(resource || null, order?.metadata)
    await tx.query(`UPDATE table_sessions SET pricing_snapshot = $1 WHERE id = $2 AND tenant_id = $3`, [JSON.stringify(snapshot), sessionId, tenantId])
  }
  const metadata = row?.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {}
  return { snapshot, resourceName: String(resource?.name || ''), metadata }
}

export interface QuoteInput {
  device_id?: string
  /** Offline/provisional checkout time chosen on the device; accepted only if plausible */
  checkout_at?: string
  time_charge_product_id?: string
}

/**
 * Server freezes `checkout_at` (server clock), computes the time charge from the session's frozen
 * pricing snapshot, writes it as the order's single time-charge line and returns a quote valid for
 * 5 minutes. Re-quoting replaces the previous quote.
 */
export async function quoteTableSession(connector: TxConnector, shopId: string, sessionId: string, input: QuoteInput = {}) {
  const result = await connector.withTransaction(async (tx) => {
    const repo = createPgTableSyncRepo(tx)
    const session = await repo.lockSession(sessionId)
    if (!session || session.branch_id !== shopId) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')
    if (session.status !== 'open') throw new TableSyncError(409, 'session_not_open', 'Phiên bàn đã đóng')

    const now = new Date()
    const checkInDate = new Date(session.check_in)
    let checkout = now
    let source: 'server' | 'client' = 'server'
    if (input.checkout_at) {
      const t = new Date(input.checkout_at)
      const ms = t.getTime()
      if (Number.isFinite(ms) && ms <= now.getTime() + 5000 && ms >= checkInDate.getTime() && now.getTime() - ms <= 24 * 3600_000) {
        checkout = t
        source = 'client'
      }
    }

    const { snapshot, resourceName, metadata } = await loadPricingSnapshot(tx, session.id, session.resource_id, session.order_id)
    const charge = computeTableTimeCharge(snapshot, checkInDate, checkout)
    const quoteId = `Q-${crypto.randomUUID()}`
    const checkoutIso = checkout.toISOString()
    const applied = await applyTableOps(repo, {
      sessionId: session.id,
      deviceId: input.device_id || 'server',
      ops: [{
        op_id: `quote:${quoteId}`,
        type: 'set_time_charge',
        product_id: input.time_charge_product_id || 'TIME_CHARGE',
        product_name: `Tiền giờ ${resourceName || session.resource_id} (${charge.duration_label})`.trim(),
        amount: charge.amount,
        duration_minutes: charge.billable_minutes,
        checkout_at: checkoutIso,
      }],
    })
    const quote = {
      quote_id: quoteId,
      checkout_at: checkoutIso,
      checkout_source: source,
      expires_at: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
      time_charge: charge,
      pricing_snapshot: snapshot,
      order_totals: applied.order_totals,
    }
    metadata.quote = { ...quote, pricing_snapshot: undefined }
    await tx.query(`UPDATE table_sessions SET metadata = $1 WHERE id = $2 AND tenant_id = $3`, [JSON.stringify(metadata), session.id, tx.tenantId ?? ''])
    await insertSessionEvent(tx, session, 'quote_issued', { quote_id: quoteId, amount: charge.amount, checkout_at: checkoutIso, version: applied.session_version })
    return { ...quote, session_version: applied.session_version }
  })
  invalidate(shopId, 'orders')
  invalidate(shopId, 'order-items')
  void broadcastTableSync(shopId, { session_id: sessionId, kind: 'quote_issued', version: result.session_version })
  return result
}

export interface CloseHookInput {
  orderId: string
  orderMetadata?: unknown
  /** time-charge amount the device actually billed (sum of time-charge lines in the payload) */
  clientTimeCharge?: number
}

/**
 * Called by sync-batch after a table order was saved as `completed` (payments, stock, CRM are
 * still handled by the existing checkout pipeline). Closes the v2 session, idempotently, and
 * records whether the billed time charge matches the server's computation. It never changes what
 * the customer paid; a mismatch beyond tolerance is flagged as `billing_discrepancy` for review.
 * No-op for orders without a v2 session (all retail orders and legacy table orders).
 */
export async function closeTableSessionForOrder(connector: IDataConnector, shopId: string, input: CloseHookInput) {
  const meta = parseMetadataSafe(input.orderMetadata)
  const sessionId = typeof meta.session_id === 'string' ? meta.session_id : ''
  if (!sessionId || typeof connector.withTransaction !== 'function') return null

  const outcome = await connector.withTransaction(async (tx) => {
    const repo = createPgTableSyncRepo(tx)
    const session = await repo.lockSession(sessionId)
    if (!session || session.branch_id !== shopId || session.order_id !== input.orderId) return null
    if (session.status !== 'open') return { alreadyClosed: true as const, session }

    const { snapshot, metadata } = await loadPricingSnapshot(tx, session.id, session.resource_id, session.order_id)
    const quote = metadata.quote as { quote_id?: string; checkout_at?: string; time_charge?: { amount: number }; expires_at?: string } | undefined
    const requestedQuoteId = typeof meta.quote_id === 'string' ? meta.quote_id : ''
    const now = new Date()
    const quoteValid = Boolean(
      quote?.quote_id && requestedQuoteId === quote.quote_id && quote.expires_at && new Date(quote.expires_at).getTime() >= now.getTime() - 60_000
    )

    const clientCheckout = meta.check_out ? new Date(String(meta.check_out)) : null
    const checkoutForCheck = quoteValid && quote?.checkout_at
      ? new Date(quote.checkout_at)
      : clientCheckout && Number.isFinite(clientCheckout.getTime()) ? clientCheckout : now
    const expected = quoteValid && quote?.time_charge
      ? quote.time_charge.amount
      : computeTableTimeCharge(snapshot, new Date(session.check_in), checkoutForCheck).amount
    const serverNowExpected = computeTableTimeCharge(snapshot, new Date(session.check_in), now)

    const billed = Number.isFinite(input.clientTimeCharge) ? Math.round(Number(input.clientTimeCharge)) : expected
    const amountDiff = Math.abs(billed - expected)
    const minutesDiff = clientCheckout && Number.isFinite(clientCheckout.getTime())
      ? Math.abs(now.getTime() - clientCheckout.getTime()) / 60000
      : 0
    // An offline close may legitimately sync much later; judge the amount against the device's
    // own checkout time, and only flag when the bill itself disagrees with the snapshot pricing.
    const withinTolerance = amountDiff <= CLOSE_TOLERANCE.amount
    const billing = {
      quote_id: requestedQuoteId || null,
      quote_valid: quoteValid,
      expected_time_charge: expected,
      billed_time_charge: billed,
      amount_diff: amountDiff,
      server_now_time_charge: serverNowExpected.amount,
      sync_delay_minutes: Math.round(minutesDiff),
      provisional: meta.provisional_close === true || meta.provisional_close === 'true',
      billing_discrepancy: !withinTolerance,
    }
    metadata.billing = billing
    const checkOutIso = checkoutForCheck.toISOString()
    await tx.query(
      `UPDATE table_sessions SET status = 'closed', check_out = $1, version = version + 1, metadata = $2, updated_at = $3
        WHERE id = $4 AND tenant_id = $5`,
      [checkOutIso, JSON.stringify(metadata), getGMT7Time(), session.id, tx.tenantId ?? '']
    )
    await insertSessionEvent(tx, session, 'session_closed', { order_id: session.order_id, check_out: checkOutIso, billing_discrepancy: billing.billing_discrepancy, version: session.version + 1 })
    return { closed: true as const, session, billing }
  })

  if (outcome && 'closed' in outcome && outcome.billing) {
    if (outcome.billing.billing_discrepancy) {
      console.warn(`[tableSync] billing discrepancy on session ${sessionId}:`, outcome.billing)
    }
    void broadcastTableSync(shopId, { session_id: sessionId, resource_id: outcome.session.resource_id, kind: 'session_closed' })
  }
  return outcome
}

async function releaseResourceIfOwned(connector: IDataConnector, shopId: string, resourceId: string, orderId: string, status = 'available') {
  const resource = await connector.findById('location-resources', resourceId).catch(() => null)
  if (!resource) return
  if (resource.current_order_id && resource.current_order_id !== orderId) return
  await connector.update('location-resources', resourceId, {
    status,
    current_order_id: '',
    metadata: cleanResourceSessionMetadata(resource.metadata, { last_checkout_time: new Date().toISOString() }),
  })
}

/** Cancels an open session that holds nothing (no active items, no payment). Otherwise 409. */
export async function cancelTableSession(connector: TxConnector, shopId: string, sessionId: string, input: { device_id?: string; reason?: string } = {}) {
  const outcome = await connector.withTransaction(async (tx) => {
    const repo = createPgTableSyncRepo(tx)
    const session = await repo.lockSession(sessionId)
    if (!session || session.branch_id !== shopId) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')
    if (session.status === 'cancelled') return { session, already: true }
    if (session.status !== 'open') throw new TableSyncError(409, 'session_not_open', 'Phiên bàn đã đóng')

    const lines = session.order_id ? await repo.listLines(session.order_id) : []
    const hasItems = lines.some((l) => l.active && l.qty > 0 && !isTimeChargeLine(l.product_id, l.product_name))
    const [order] = session.order_id ? await tx.query(`SELECT paid_amount FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [session.order_id, tx.tenantId ?? '']) : []
    if (hasItems || Number(order?.paid_amount || 0) > 0) {
      throw new TableSyncError(409, 'session_has_items', 'Phiên còn món hoặc đã thu tiền, không thể huỷ')
    }
    const now = getGMT7Time()
    await tx.query(`UPDATE table_sessions SET status = 'cancelled', check_out = $1, version = version + 1, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
      [new Date().toISOString(), now, session.id, tx.tenantId ?? ''])
    if (session.order_id) {
      await tx.query(`UPDATE orders SET status = 'cancelled', note = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4 AND status = 'in_progress'`,
        [input.reason ? `Huỷ phiên bàn: ${input.reason}` : 'Huỷ phiên bàn', now, session.order_id, tx.tenantId ?? ''])
    }
    await insertSessionEvent(tx, session, 'session_cancelled', { order_id: session.order_id, device_id: input.device_id || '', version: session.version + 1 })
    return { session, already: false }
  })
  if (!outcome.already) {
    await releaseResourceIfOwned(connector, shopId, outcome.session.resource_id, outcome.session.order_id)
    invalidate(shopId, 'orders')
    invalidate(shopId, 'location-resources')
    void broadcastTableSync(shopId, { session_id: sessionId, resource_id: outcome.session.resource_id, kind: 'session_cancelled' })
  }
  return { session_id: sessionId, status: 'cancelled' as const }
}

/**
 * Moves an open session (and its order) to another resource. The partial unique index makes the
 * move fail with 409 `target_occupied` if the target already has an open session. Order of side
 * effects mirrors the Zalo fix (0.8): session+order first, then occupy target, then free source.
 */
export async function transferTableSession(connector: TxConnector, shopId: string, sessionId: string, input: { target_resource_id: string; device_id?: string }) {
  const targetId = String(input.target_resource_id || '').trim()
  if (!targetId || targetId.startsWith('takeaway')) throw new TableSyncError(400, 'invalid_resource', 'Bàn đích không hợp lệ')

  const outcome = await connector.withTransaction(async (tx) => {
    const repo = createPgTableSyncRepo(tx)
    const session = await repo.lockSession(sessionId)
    if (!session || session.branch_id !== shopId) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')
    if (session.status !== 'open') throw new TableSyncError(409, 'session_not_open', 'Phiên bàn đã đóng')
    if (session.resource_id === targetId) return { session, from: targetId, noop: true }

    const [target] = await tx.query(`SELECT id, name, branch_id FROM location_resources WHERE id = $1 AND tenant_id = $2`, [targetId, tx.tenantId ?? ''])
    if (!target || (target.branch_id && target.branch_id !== shopId)) throw new TableSyncError(404, 'resource_not_found', 'Không tìm thấy bàn đích')

    try {
      await tx.query('SAVEPOINT transfer_session')
      await tx.query(`UPDATE table_sessions SET resource_id = $1, version = version + 1, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
        [targetId, getGMT7Time(), session.id, tx.tenantId ?? ''])
      await tx.query('RELEASE SAVEPOINT transfer_session')
    } catch (err: any) {
      await tx.query('ROLLBACK TO SAVEPOINT transfer_session').catch(() => {})
      if (err?.code === '23505') throw new TableSyncError(409, 'target_occupied', 'Bàn đích đang có phiên khác')
      throw err
    }
    if (session.order_id) {
      const [order] = await tx.query(`SELECT metadata FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [session.order_id, tx.tenantId ?? ''])
      const orderMeta = parseMetadataSafe(order?.metadata)
      orderMeta.resource_id = targetId
      orderMeta.resource_name = String(target.name || '')
      await tx.query(`UPDATE orders SET resource_id = $1, metadata = $2, updated_at = $3 WHERE id = $4 AND tenant_id = $5`,
        [targetId, JSON.stringify(orderMeta), getGMT7Time(), session.order_id, tx.tenantId ?? ''])
    }
    await insertSessionEvent(tx, { ...session, resource_id: targetId }, 'session_transferred', { from: session.resource_id, to: targetId, device_id: input.device_id || '', version: session.version + 1 })
    return { session, from: session.resource_id, noop: false }
  })

  if (!outcome.noop) {
    const target = await connector.findById('location-resources', targetId)
    const cleanedTargetMeta = parseMetadataSafe(cleanResourceSessionMetadata(target?.metadata))
    await connector.update('location-resources', targetId, {
      status: 'occupied',
      current_order_id: outcome.session.order_id,
      metadata: JSON.stringify({ ...cleanedTargetMeta, check_in: outcome.session.check_in, session_id: sessionId }),
    })
    await releaseResourceIfOwned(connector, shopId, outcome.from, outcome.session.order_id)
    invalidate(shopId, 'orders')
    invalidate(shopId, 'location-resources')
    void broadcastTableSync(shopId, { session_id: sessionId, resource_id: targetId, kind: 'session_transferred' })
  }
  return { session_id: sessionId, resource_id: targetId }
}
