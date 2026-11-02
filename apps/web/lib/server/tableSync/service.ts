import type { IDataConnector, TransactionClient } from '@oni/adapters'
import { getGMT7Time } from '@oni/core'
import { invalidate } from '@/lib/server/cache'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { cleanResourceSessionMetadata, parseMetadataSafe } from '@/lib/server/tableSessionReconciler'
import { applyTableOps, TableSyncError, type ApplyOpsResult, type TableOp } from './engine'
import { createPgTableSyncRepo, mapSessionRow } from './pgRepository'

// Table sync v2 service (docs/TABLE-SESSION-SYNC-PLAN.md Phase 1): sessions, idempotent ops,
// change feed. Only for shops with `shop_settings.table_sync_v2` on a transactional connector.

type TxConnector = IDataConnector & { withTransaction: NonNullable<IDataConnector['withTransaction']> }

export async function requireTableSyncV2(shopId: string, connector: IDataConnector): Promise<TxConnector> {
  if (typeof connector.withTransaction !== 'function') {
    throw new TableSyncError(409, 'table_sync_v2_unsupported', 'Nguồn dữ liệu của cửa hàng chưa hỗ trợ đồng bộ bàn v2')
  }
  const admin = getSupabaseAdminClient()
  const { data } = await admin.from('shop_settings').select('table_sync_v2').eq('shop_id', shopId).maybeSingle()
  if (!data?.table_sync_v2) {
    throw new TableSyncError(409, 'table_sync_v2_disabled', 'Cửa hàng chưa bật đồng bộ bàn v2')
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
    const occupied = await findOpenSessionForResource(tx, shopId, resourceId)
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
          input.pricing_snapshot ? JSON.stringify(input.pricing_snapshot) : null,
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

  return { session: sessionResponse(outcome.row), created: true }
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
