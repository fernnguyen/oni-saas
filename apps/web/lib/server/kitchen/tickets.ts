// Bar/Bếp K1 — kitchen ticket persistence + queries (Postgres only). See docs/KITCHEN-BAR-PLAN.md.

import crypto from 'crypto'
import type { IDataConnector, TransactionClient } from '@oni/adapters'
import { getGMT7Time, toPrepStation, type PrepStation, type PrepStationRoute } from '@oni/core'
import { mergeSameItemLines, netPlannedTickets, planKitchenTickets, type KitchenVoidOutcome, type OrderLineInfo, type PlannedLine, type PlannedTicket, type PlannerOp, type PlannerOpResult, type SentInfo } from './ticketPlanner'
import { broadcastKitchen } from './broadcast'
import type { KitchenActor } from './actor'
import { getKitchenSettings, KITCHEN_SETTINGS_DEFAULTS, type KitchenSettings } from './settings'

export type TxConnector = IDataConnector & { withTransaction: NonNullable<IDataConnector['withTransaction']> }

const tid = (tx: TransactionClient) => tx.tenantId ?? ''
/** Note the POS puts on a cancel line removed because the kitchen reported it sold out (see voidOpFields). */
export const SOLD_OUT_VOID_NOTE = 'Lý do: Hết món'

export interface KitchenTicketItem {
  id: string
  op_id: string
  order_item_id: string
  product_id: string
  product_name: string
  variant_label: string
  modifiers: string
  note: string
  qty: number
  status: 'pending' | 'ready' | 'voided' | 'unavailable'
  ready_at: string | null
  /** void lines: what the kitchen did with the cancelled dish ('' = not answered yet) */
  void_outcome: '' | KitchenVoidOutcome
  unit_price: number
  /** who answered the cancel at the station ('' = nobody yet / before audit) */
  answered_by_name: string
}

export interface KitchenTicket {
  id: string
  ticket_no: number
  business_date: string
  station_id: string
  station_name: string
  session_id: string
  order_id: string
  resource_id: string
  resource_name: string
  batch_id: string
  source: string
  kind: 'order' | 'void'
  status: 'open' | 'done'
  print_count: number
  printed_at: string | null
  created_at: string
  /** signed-in user whose request made the ticket ('' = system / before audit) */
  created_by_name: string
  items: KitchenTicketItem[]
}

async function loadStations(tx: TransactionClient, branchId: string): Promise<PrepStation[]> {
  const rows = await tx.query(
    `SELECT id, name, kind, output, is_default, sort_order FROM prep_stations
      WHERE tenant_id = $1 AND branch_id = $2 AND (active IS NULL OR active != 'FALSE')`,
    [tid(tx), branchId],
  )
  return rows.map(toPrepStation)
}

async function loadRoutes(tx: TransactionClient, branchId: string): Promise<PrepStationRoute[]> {
  const rows = await tx.query(
    `SELECT station_id, target_type, target_id FROM prep_station_routes
      WHERE tenant_id = $1 AND branch_id = $2 AND (active IS NULL OR active != 'FALSE')`,
    [tid(tx), branchId],
  )
  return rows as PrepStationRoute[]
}

interface PlanContext {
  stations: PrepStation[]
  routes: PrepStationRoute[]
  productCategories: Map<string, string>
  orderLines: Map<string, OrderLineInfo>
  sent: Map<string, SentInfo>
}

/** Stations, routes and the per-item data the planner needs. null = branch has no station. */
async function loadPlanContext(
  tx: TransactionClient,
  shopId: string,
  itemIds: string[],
  productIds: Set<string>,
): Promise<PlanContext | null> {
  const stations = await loadStations(tx, shopId)
  if (stations.length === 0) return null
  const routes = await loadRoutes(tx, shopId)

  const orderLines = new Map<string, OrderLineInfo>()
  const sent = new Map<string, SentInfo>()
  if (itemIds.length > 0) {
    const lines = await tx.query(
      `SELECT id, product_id, product_name, variant_label, modifiers, unit_price FROM order_items
        WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tid(tx), itemIds],
    )
    for (const l of lines) {
      orderLines.set(l.id, {
        product_id: l.product_id || '',
        product_name: l.product_name || '',
        variant_label: l.variant_label || '',
        modifiers: l.modifiers || '',
        ...(l.unit_price !== null && l.unit_price !== undefined && l.unit_price !== '' ? { unit_price: Number(l.unit_price) || 0 } : {}),
      })
      if (l.product_id) productIds.add(l.product_id)
    }
    // Net qty already sent per item + the station of the latest "order" ticket for it.
    const sentRows = await tx.query(
      `SELECT i.order_item_id,
              SUM(i.qty::numeric) AS net_qty,
              (ARRAY_AGG(t.station_id ORDER BY t.created_at DESC) FILTER (WHERE t.kind = 'order'))[1] AS station_id,
              (ARRAY_AGG(i.product_id ORDER BY t.created_at DESC))[1] AS product_id,
              (ARRAY_AGG(i.product_name ORDER BY t.created_at DESC))[1] AS product_name,
              (ARRAY_AGG(i.variant_label ORDER BY t.created_at DESC))[1] AS variant_label,
              (ARRAY_AGG(i.modifiers ORDER BY t.created_at DESC))[1] AS modifiers,
              (ARRAY_AGG(i.unit_price ORDER BY t.created_at DESC) FILTER (WHERE t.kind = 'order' AND i.unit_price IS NOT NULL))[1] AS unit_price
         FROM kitchen_ticket_items i
         JOIN kitchen_tickets t ON t.id = i.ticket_id AND t.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1 AND i.branch_id = $2 AND i.order_item_id = ANY($3::text[])
        GROUP BY i.order_item_id`,
      [tid(tx), shopId, itemIds],
    )
    for (const s of sentRows) {
      sent.set(s.order_item_id, {
        net_qty: Number(s.net_qty) || 0,
        station_id: s.station_id || '',
        product_id: s.product_id || '',
        product_name: s.product_name || '',
        variant_label: s.variant_label || '',
        modifiers: s.modifiers || '',
        ...(s.unit_price !== null && s.unit_price !== undefined ? { unit_price: Number(s.unit_price) || 0 } : {}),
      })
    }
  }

  const productCategories = new Map<string, string>()
  if (productIds.size > 0) {
    const prods = await tx.query(`SELECT id, category_id FROM products WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
      tid(tx),
      [...productIds],
    ])
    for (const p of prods) if (p.category_id) productCategories.set(p.id, p.category_id)
  }
  return { stations, routes, productCategories, orderLines, sent }
}

/**
 * Applied ops of a session that are not on any kitchen ticket yet ("chưa báo bếp"), oldest first.
 * Ops that net to zero (added then removed before sending) stay here and keep netting to zero.
 */
async function loadUnsentOps(tx: TransactionClient, shopId: string, sessionId: string) {
  const rows = await tx.query(
    `SELECT o.id, o.payload, o.result FROM order_item_ops o
      WHERE o.tenant_id = $1 AND o.branch_id = $2 AND o.session_id = $3 AND o.status = 'applied'
        AND o.op_type IN ('add_item', 'change_qty', 'remove_item')
        AND NOT EXISTS (SELECT 1 FROM kitchen_fired_ops f WHERE f.tenant_id = o.tenant_id AND f.op_id = o.id)
      ORDER BY o.created_at, o.id`,
    [tid(tx), shopId, sessionId],
  )
  const ops: PlannerOp[] = []
  const results: PlannerOpResult[] = []
  for (const r of rows) {
    const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {}
    const result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result || {}
    ops.push({ ...payload, op_id: r.id })
    results.push({ op_id: r.id, status: 'applied', item_id: result.item_id, reason: result.reason })
  }
  return { ops, results }
}

async function planSession(tx: TransactionClient, shopId: string, sessionId: string, batchId: string) {
  const { ops, results } = await loadUnsentOps(tx, shopId, sessionId)
  if (ops.length === 0) return { planned: [] as PlannedTicket[], hasStations: true, opIds: [] as string[] }
  const opsById = new Map(ops.map((o) => [o.op_id, o]))
  const itemIds = [...new Set(results.map((r) => r.item_id || opsById.get(r.op_id)?.item_id || '').filter(Boolean))]
  const productIds = new Set(ops.filter((o) => o.type === 'add_item' && o.product_id).map((o) => String(o.product_id)))
  const ctx = await loadPlanContext(tx, shopId, itemIds, productIds)
  if (!ctx) return { planned: [] as PlannedTicket[], hasStations: false, opIds: [] as string[] }
  // One send = one ticket per station, whatever batch the individual ops came from.
  const batched = ops.map((o) => ({ ...o, batch_id: batchId }))
  return {
    planned: mergeSameItemLines(netPlannedTickets(planKitchenTickets({ ops: batched, results, ...ctx }))),
    hasStations: true,
    opIds: ops.map((o) => o.op_id),
  }
}

/**
 * Dish notes typed on the POS at send time (order_item_id → "ít đá"). They go on the new order
 * lines of that item; a note already carried by the op (mobile draft) wins.
 */
function applyLineNotes(planned: PlannedTicket[], notes?: Record<string, string>) {
  if (!notes) return
  for (const t of planned) {
    if (t.kind !== 'order') continue
    for (const l of t.lines) {
      const n = String(notes[l.order_item_id] ?? '').trim().slice(0, 500)
      if (n && !l.note) l.note = n
    }
  }
}

async function loadSessionInfo(tx: TransactionClient, sessionId: string) {
  const rows = await tx.query(
    `SELECT s.resource_id, s.order_id, r.name AS resource_name
       FROM table_sessions s
       LEFT JOIN location_resources r ON r.id = s.resource_id AND r.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.id = $2`,
    [tid(tx), sessionId],
  )
  return rows[0] || {}
}

/**
 * "Gửi bếp": turn every applied-but-unsent op of a table session into kitchen tickets.
 * Idempotent: ops already on a ticket are skipped, so a double tap sends nothing twice.
 */
export async function fireKitchenForSession(
  connector: TxConnector,
  shopId: string,
  sessionId: string,
  opts: { deviceId?: string; batchId?: string; notes?: Record<string, string>; actor?: KitchenActor } = {},
): Promise<KitchenTicket[]> {
  const batchId = (opts.batchId || crypto.randomUUID()).slice(0, 255)
  const created = await connector.withTransaction(async (tx) => {
    // Serialise sends of the same session (two devices tapping "Gửi bếp" at once).
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kitchen_fire:${tid(tx)}:${sessionId}`])
    const [sess] = await tx.query(`SELECT status FROM table_sessions WHERE tenant_id = $1 AND id = $2`, [tid(tx), sessionId])
    if (sess && sess.status !== 'open') return [] // paid / cancelled: nothing new goes to the kitchen
    const { planned, hasStations, opIds } = await planSession(tx, shopId, sessionId, batchId)
    if (!hasStations) return []
    // Mark every considered op as sent, including ones that netted out to nothing.
    if (opIds.length > 0) {
      await tx.query(
        `INSERT INTO kitchen_fired_ops (tenant_id, branch_id, session_id, op_id, batch_id, created_at)
         SELECT $1, $2, $3, unnest($4::text[]), $5, NOW()
         ON CONFLICT (tenant_id, op_id) DO NOTHING`,
        [tid(tx), shopId, sessionId, opIds, batchId],
      )
    }
    if (planned.length === 0) return []
    applyLineNotes(planned, opts.notes)
    const session = await loadSessionInfo(tx, sessionId)
    return insertPlannedTickets(tx, shopId, planned, {
      sessionId,
      orderId: session.order_id || '',
      resourceId: session.resource_id || '',
      resourceName: session.resource_name || '',
      deviceId: opts.deviceId || '',
      source: 'table_ops',
      actor: opts.actor,
    })
  })
  for (const t of created) {
    void broadcastKitchen(shopId, { kind: 'ticket_created', ticket_id: t.id, station_id: t.station_id })
  }
  return created
}

export interface SessionKitchenStatus {
  /** false when the branch has no station (POS hides every kitchen control) */
  enabled: boolean
  /** lines a "Gửi bếp" would send now (after netting) */
  unsent_lines: number
  unsent_qty: number
  /** per order item: qty on kitchen tickets, of which ready / reported sold out by the kitchen,
   *  and the station it went to (labels: "Chưa báo Bar", "Bếp xong") */
  items: Record<string, { sent: number; ready: number; unavailable: number; station_id?: string; station_name?: string; station_kind?: string }>
  /** where a send would go now (labels: "Gửi Bar", "Gửi Bếp + Bar") */
  unsent_stations: StationRef[]
  /** every station of the branch */
  stations: StationRef[]
  /** products on today's "Tạm hết" list */
  unavailable_products: string[]
  /** branch setting: send new dishes without pressing "Gửi bếp" (see kitchen/settings.ts) */
  auto_send: boolean
}

export interface StationRef {
  id: string
  name: string
  kind: string
}

const stationRef = (s: PrepStation): StationRef => ({ id: s.id, name: s.name, kind: s.kind })

export async function getSessionKitchenStatus(connector: TxConnector, shopId: string, sessionId: string): Promise<SessionKitchenStatus> {
  const { auto_send } = await getKitchenSettingsSafe(connector, shopId)
  const status = await connector.withTransaction(async (tx) => {
    const stations = await loadStations(tx, shopId)
    if (stations.length === 0) return { enabled: false, unsent_lines: 0, unsent_qty: 0, items: {}, unavailable_products: [], unsent_stations: [], stations: [] }
    const { planned } = await planSession(tx, shopId, sessionId, 'preview')
    const lines = planned.flatMap((p) => p.lines)
    const rows = await tx.query(
      `SELECT i.order_item_id,
              SUM(i.qty::numeric) AS sent,
              SUM(CASE WHEN i.status = 'ready' THEN i.qty::numeric ELSE 0 END) AS ready,
              SUM(CASE WHEN i.status = 'unavailable' THEN i.qty::numeric ELSE 0 END) AS unavailable,
              SUM(CASE WHEN t.kind = 'void' THEN -i.qty::numeric ELSE 0 END) AS voided,
              (ARRAY_AGG(t.station_id ORDER BY t.created_at DESC) FILTER (WHERE t.kind = 'order'))[1] AS station_id
         FROM kitchen_ticket_items i
         JOIN kitchen_tickets t ON t.id = i.ticket_id AND t.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1 AND i.branch_id = $2 AND t.session_id = $3 AND i.order_item_id IS NOT NULL
        GROUP BY i.order_item_id`,
      [tid(tx), shopId, sessionId],
    )
    const items: SessionKitchenStatus['items'] = {}
    for (const r of rows) {
      // "hết món" still to be dealt with on the floor: reported minus what was cancelled since
      const unavailable = Math.max(0, (Number(r.unavailable) || 0) - (Number(r.voided) || 0))
      const st = stations.find((x) => x.id === r.station_id)
      items[r.order_item_id] = {
        sent: Number(r.sent) || 0, ready: Number(r.ready) || 0, unavailable,
        ...(st ? { station_id: st.id, station_name: st.name, station_kind: st.kind } : {}),
      }
    }
    const unsentStations = new Map<string, StationRef>()
    for (const p of planned) unsentStations.set(p.station.id, stationRef(p.station))
    return {
      enabled: true,
      unsent_lines: lines.length,
      unsent_qty: lines.reduce((n, l) => n + Math.abs(l.qty), 0),
      items,
      unavailable_products: (await listUnavailableProductsTx(tx, shopId)).map((p) => p.product_id),
      unsent_stations: [...unsentStations.values()],
      stations: stations.map(stationRef),
    }
  })
  return { ...status, auto_send }
}

/** Branch kitchen settings, defaults when the table is missing (DB not migrated yet) or unreadable. */
export async function getKitchenSettingsSafe(connector: TxConnector, shopId: string): Promise<KitchenSettings> {
  try {
    return await getKitchenSettings(connector, shopId)
  } catch {
    return { ...KITCHEN_SETTINGS_DEFAULTS }
  }
}

/**
 * QR orders are written straight to order_items (legacy path, no table-sync ops): ticket the
 * accepted items right after the accept. Idempotent per request via synthetic op ids.
 */
export async function generateKitchenTicketsForQr(
  connector: TxConnector,
  shopId: string,
  input: {
    requestId: string
    orderId: string
    resourceId: string
    resourceName: string
    items: { product_id: string; product_name: string; variant_label?: string; modifiers?: unknown; qty: number; order_item_id?: string; note?: string }[]
    /** staff member who accepted the QR order */
    actor?: KitchenActor
  },
): Promise<KitchenTicket[]> {
  const ops: PlannerOp[] = []
  const results: PlannerOpResult[] = []
  input.items.forEach((it, idx) => {
    const opId = `qr:${input.requestId}:${idx}`
    ops.push({
      op_id: opId, type: 'add_item', product_id: it.product_id, product_name: it.product_name, qty: Number(it.qty) || 0,
      variant_label: it.variant_label, modifiers: it.modifiers, note: it.note, batch_id: `qr:${input.requestId}`,
    })
    // order_item_id lets a later cancel (via table ops) void the right line; fall back to the op id.
    results.push({ op_id: opId, status: 'applied', item_id: it.order_item_id || opId })
  })
  const created = await connector.withTransaction(async (tx) => {
    const productIds = new Set(input.items.map((i) => i.product_id).filter(Boolean))
    const ctx = await loadPlanContext(tx, shopId, [], productIds)
    if (!ctx) return []
    const planned = planKitchenTickets({ ops, results, ...ctx })
    if (planned.length === 0) return []
    return insertPlannedTickets(tx, shopId, planned, {
      sessionId: '',
      orderId: input.orderId,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      deviceId: 'qr',
      source: 'qr',
      actor: input.actor,
    })
  })
  for (const t of created) {
    void broadcastKitchen(shopId, { kind: 'ticket_created', ticket_id: t.id, station_id: t.station_id })
  }
  return created
}

async function insertPlannedTickets(
  tx: TransactionClient,
  shopId: string,
  planned: PlannedTicket[],
  ctx: { sessionId: string; orderId: string; resourceId: string; resourceName: string; deviceId: string; source: string; actor?: KitchenActor },
): Promise<KitchenTicket[]> {
  // Serialise ticket numbering per branch for this transaction.
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kitchen_ticket_no:${tid(tx)}:${shopId}`])
  const now = getGMT7Time()
  const businessDate = now.slice(0, 10)
  const out: KitchenTicket[] = []

  for (const p of planned) {
    const ticketId = crypto.randomUUID()
    const items: KitchenTicketItem[] = []
    for (const [lineNo, l] of p.lines.entries()) {
      const status = p.kind === 'void' ? 'voided' : 'pending'
      const rows = await tx.query(
        `INSERT INTO kitchen_ticket_items
           (id, tenant_id, branch_id, ticket_id, op_id, line_no, order_item_id, product_id, product_name, variant_label, modifiers,
            note, qty, status, active, created_at, updated_at, void_outcome, unit_price)
         VALUES ($1,$2,$3,$4,$5,$15,$6,$7,$8,$9,$10,$11,$12,$13,'TRUE',$14,$14,$16,$17)
         ON CONFLICT (tenant_id, op_id) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), tid(tx), shopId, ticketId, l.op_id, l.order_item_id, l.product_id, l.product_name,
          l.variant_label, l.modifiers, l.note, String(l.qty), status, now, lineNo,
          p.kind === 'void' ? (l.outcome ?? null) : null,
          l.unit_price !== undefined ? String(l.unit_price) : null],
      )
      if (rows.length === 0) continue // this op was ticketed before
      items.push({
        id: rows[0].id, op_id: l.op_id, order_item_id: l.order_item_id, product_id: l.product_id, product_name: l.product_name,
        variant_label: l.variant_label, modifiers: l.modifiers, note: l.note, qty: l.qty, status, ready_at: null,
        void_outcome: p.kind === 'void' ? (l.outcome ?? '') : '', unit_price: l.unit_price ?? 0, answered_by_name: '',
      })
    }
    if (items.length === 0) continue

    // A cancel the kitchen itself asked for (it reported the dish sold out, the floor removed it
    // with reason "Hết món") needs no acknowledgement: file it as done, no chime, no print.
    let ticketStatus: 'open' | 'done' = 'open'
    // Every cancelled line already says what happened to the dish (made = waste, stopped = never
    // cooked): nothing for the kitchen to stop, so no chime/print; it stays in the record.
    if (p.kind === 'void' && items.every((it) => it.void_outcome)) ticketStatus = 'done'
    else if (p.kind === 'void' && items.every((it) => it.note === SOLD_OUT_VOID_NOTE && it.order_item_id)) {
      const reported = await tx.query(
        `SELECT DISTINCT order_item_id FROM kitchen_ticket_items
          WHERE tenant_id = $1 AND branch_id = $2 AND status = 'unavailable' AND order_item_id = ANY($3::text[])`,
        [tid(tx), shopId, items.map((it) => it.order_item_id)],
      )
      const ids = new Set(reported.map((r: { order_item_id: string }) => r.order_item_id))
      if (items.every((it) => ids.has(it.order_item_id))) ticketStatus = 'done'
    }

    const noRows = await tx.query(
      `SELECT COALESCE(MAX(ticket_no), 0) + 1 AS n FROM kitchen_tickets
        WHERE tenant_id = $1 AND branch_id = $2 AND business_date = $3`,
      [tid(tx), shopId, businessDate],
    )
    const ticketNo = Number(noRows[0]?.n) || 1
    await tx.query(
      `INSERT INTO kitchen_tickets
         (id, tenant_id, branch_id, ticket_no, business_date, station_id, station_name, session_id, order_id, resource_id,
          resource_name, batch_id, source, kind, status, print_count, created_by_device, active, created_at, updated_at,
          created_by_user, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$16,$13,$17,0,$14,'TRUE',$15,$15,$18,$19)`,
      [ticketId, tid(tx), shopId, ticketNo, businessDate, p.station.id, p.station.name, ctx.sessionId, ctx.orderId,
        ctx.resourceId, ctx.resourceName, p.batch_id, p.kind, ctx.deviceId, now, ctx.source, ticketStatus,
        ctx.actor?.id ?? null, ctx.actor?.name ?? null],
    )
    if (p.kind === 'void') await voidFullyCancelledOrderLines(tx, shopId, items.map((it) => it.order_item_id))
    out.push({
      id: ticketId, ticket_no: ticketNo, business_date: businessDate, station_id: p.station.id, station_name: p.station.name,
      session_id: ctx.sessionId, order_id: ctx.orderId, resource_id: ctx.resourceId, resource_name: ctx.resourceName,
      batch_id: p.batch_id, source: ctx.source, kind: p.kind, status: ticketStatus, print_count: 0, printed_at: null,
      created_at: now, created_by_name: ctx.actor?.name ?? '', items,
    })
  }
  return out
}

/**
 * Dishes cancelled down to nothing (net qty on tickets ≤ 0): their order lines still waiting at the
 * station are struck (status 'voided') so nobody cooks them from the order ticket, and order
 * tickets with nothing left to make close. Partial cancels leave the order line as it is.
 */
async function voidFullyCancelledOrderLines(tx: TransactionClient, shopId: string, orderItemIds: string[]) {
  const ids = [...new Set(orderItemIds.filter(Boolean))]
  if (ids.length === 0) return
  const rows = await tx.query(
    `UPDATE kitchen_ticket_items i SET status = 'voided', updated_at = NOW()
       FROM kitchen_tickets t
      WHERE t.id = i.ticket_id AND t.tenant_id = i.tenant_id AND t.kind = 'order'
        AND i.tenant_id = $1 AND i.branch_id = $2 AND i.status = 'pending' AND i.order_item_id = ANY($3::text[])
        AND (SELECT COALESCE(SUM(x.qty::numeric), 0) FROM kitchen_ticket_items x
              WHERE x.tenant_id = i.tenant_id AND x.order_item_id = i.order_item_id) <= 0
      RETURNING i.ticket_id`,
    [tid(tx), shopId, ids],
  )
  for (const ticketId of new Set(rows.map((r: { ticket_id: string }) => r.ticket_id))) await refreshTicketStatus(tx, shopId, ticketId)
}

// ── Table lifecycle hooks (best-effort, called by table sync service) ─────────

/**
 * The table was paid/closed or cancelled: its open tickets leave the kitchen screen (status done).
 * Matches by session and by order (QR tickets carry the order but no session).
 */
export async function closeKitchenTicketsForTable(
  connector: TxConnector,
  shopId: string,
  ref: { sessionId?: string; orderId?: string },
): Promise<number> {
  const sessionId = ref.sessionId || ''
  const orderId = ref.orderId || ''
  if (!sessionId && !orderId) return 0
  const rows = await connector.withTransaction((tx) =>
    tx.query(
      `UPDATE kitchen_tickets SET status = 'done', updated_at = NOW()
        WHERE tenant_id = $1 AND branch_id = $2 AND status = 'open'
          AND ((session_id <> '' AND session_id = $3) OR (order_id <> '' AND order_id = $4))
        RETURNING id, station_id`,
      [tid(tx), shopId, sessionId, orderId],
    ),
  )
  for (const r of rows) void broadcastKitchen(shopId, { kind: 'ticket_updated', ticket_id: r.id, station_id: r.station_id })
  return rows.length
}

/**
 * The table / order was cancelled while dishes were at the kitchen: every dish still on a ticket
 * (net of earlier cancels) gets a cancel line, so the kitchen is told instead of the tickets
 * silently leaving the screen. Lines say what is already known:
 *  - ticked "Xong" by the kitchen → 'made' (cooked: counted as waste, nothing to stop)
 *  - reported sold out → 'stopped'
 *  - still cooking → unset: the cancel ticket opens (chime, print) and the kitchen answers
 *    "Dừng kịp" / "Đã làm rồi".
 * Then the open order tickets of the table are closed. Idempotent: a second call finds nothing
 * left to cancel (and fixed op ids guard concurrent calls).
 */
export async function voidKitchenForCancelledTable(
  connector: TxConnector,
  shopId: string,
  ref: { sessionId?: string; orderId?: string; reason?: string; deviceId?: string; actor?: KitchenActor },
): Promise<KitchenTicket[]> {
  const sessionId = ref.sessionId || ''
  const orderId = ref.orderId || ''
  if (!sessionId && !orderId) return []
  const note = `Lý do: ${(ref.reason || 'Huỷ đơn').trim().slice(0, 200)}`
  const { created, closed } = await connector.withTransaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kitchen_cancel:${tid(tx)}:${sessionId || orderId}`])
    const stations = await loadStations(tx, shopId)
    const rows = await tx.query(
      `SELECT i.order_item_id,
              SUM(i.qty::numeric) AS net_qty,
              SUM(CASE WHEN t.kind = 'order' AND i.status = 'ready' THEN i.qty::numeric ELSE 0 END) AS ready,
              SUM(CASE WHEN t.kind = 'order' AND i.status = 'unavailable' THEN i.qty::numeric ELSE 0 END) AS unavailable,
              (ARRAY_AGG(t.station_id ORDER BY t.created_at DESC) FILTER (WHERE t.kind = 'order'))[1] AS station_id,
              (ARRAY_AGG(i.product_id ORDER BY t.created_at DESC))[1] AS product_id,
              (ARRAY_AGG(i.product_name ORDER BY t.created_at DESC))[1] AS product_name,
              (ARRAY_AGG(i.variant_label ORDER BY t.created_at DESC))[1] AS variant_label,
              (ARRAY_AGG(i.modifiers ORDER BY t.created_at DESC))[1] AS modifiers,
              (ARRAY_AGG(i.unit_price ORDER BY t.created_at DESC) FILTER (WHERE t.kind = 'order' AND i.unit_price IS NOT NULL))[1] AS unit_price,
              (ARRAY_AGG(t.session_id ORDER BY t.created_at DESC))[1] AS session_id,
              (ARRAY_AGG(t.order_id ORDER BY t.created_at DESC))[1] AS order_id,
              (ARRAY_AGG(t.resource_id ORDER BY t.created_at DESC))[1] AS resource_id,
              (ARRAY_AGG(t.resource_name ORDER BY t.created_at DESC))[1] AS resource_name
         FROM kitchen_ticket_items i
         JOIN kitchen_tickets t ON t.id = i.ticket_id AND t.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1 AND i.branch_id = $2 AND i.order_item_id IS NOT NULL AND i.order_item_id <> ''
          AND ((t.session_id <> '' AND t.session_id = $3) OR (t.order_id <> '' AND t.order_id = $4))
        GROUP BY i.order_item_id
       HAVING SUM(i.qty::numeric) > 0`,
      [tid(tx), shopId, sessionId, orderId],
    )
    const byStation = new Map<string, PlannedTicket>()
    const scope = sessionId || orderId
    for (const r of rows) {
      const station = stations.find((x) => x.id === r.station_id) ?? stations.find((x) => x.is_default)
      if (!station) continue
      const net = Number(r.net_qty) || 0
      // What is still on the table after earlier cancels: cooked first, then sold out, then cooking.
      const made = Math.min(net, Math.max(0, Number(r.ready) || 0))
      const stopped = Math.min(net - made, Math.max(0, Number(r.unavailable) || 0))
      const cooking = net - made - stopped
      const base = {
        order_item_id: r.order_item_id, product_id: r.product_id || '', product_name: r.product_name || '',
        variant_label: r.variant_label || '', modifiers: r.modifiers || '', note,
        ...(r.unit_price !== null && r.unit_price !== undefined ? { unit_price: Number(r.unit_price) || 0 } : {}),
      }
      const lines: PlannedLine[] = []
      if (cooking > 0) lines.push({ ...base, op_id: `cancel:${scope}:${r.order_item_id}:cooking`, qty: -cooking })
      if (made > 0) lines.push({ ...base, op_id: `cancel:${scope}:${r.order_item_id}:made`, qty: -made, outcome: 'made' })
      if (stopped > 0) lines.push({ ...base, op_id: `cancel:${scope}:${r.order_item_id}:stopped`, qty: -stopped, outcome: 'stopped' })
      if (lines.length === 0) continue
      let t = byStation.get(station.id)
      if (!t) {
        t = { station, kind: 'void', batch_id: `cancel:${scope}`, lines: [] }
        byStation.set(station.id, t)
      }
      t.lines.push(...lines)
    }
    const first = rows[0] || {}
    const created = byStation.size === 0 ? [] : await insertPlannedTickets(tx, shopId, [...byStation.values()], {
      sessionId: sessionId || first.session_id || '',
      orderId: orderId || first.order_id || '',
      resourceId: first.resource_id || '',
      resourceName: first.resource_name || '',
      deviceId: ref.deviceId || '',
      source: 'cancel',
      actor: ref.actor,
    })
    const closed = await tx.query(
      `UPDATE kitchen_tickets SET status = 'done', updated_at = NOW()
        WHERE tenant_id = $1 AND branch_id = $2 AND status = 'open' AND kind = 'order'
          AND ((session_id <> '' AND session_id = $3) OR (order_id <> '' AND order_id = $4))
        RETURNING id, station_id`,
      [tid(tx), shopId, sessionId, orderId],
    )
    return { created, closed }
  })
  for (const t of created) void broadcastKitchen(shopId, { kind: 'ticket_created', ticket_id: t.id, station_id: t.station_id })
  for (const r of closed) void broadcastKitchen(shopId, { kind: 'ticket_updated', ticket_id: r.id, station_id: r.station_id })
  return created
}

/** The table moved: every ticket of the session now shows the new table. */
export async function retargetKitchenTickets(
  connector: TxConnector,
  shopId: string,
  sessionId: string,
  target: { resourceId: string; resourceName: string },
): Promise<number> {
  const rows = await connector.withTransaction((tx) =>
    tx.query(
      `UPDATE kitchen_tickets SET resource_id = $1, resource_name = $2, updated_at = NOW()
        WHERE tenant_id = $3 AND branch_id = $4 AND session_id = $5
        RETURNING id, station_id, status`,
      [target.resourceId, target.resourceName, tid(tx), shopId, sessionId],
    ),
  )
  for (const r of rows) {
    if (r.status === 'open') void broadcastKitchen(shopId, { kind: 'ticket_updated', ticket_id: r.id, station_id: r.station_id })
  }
  return rows.length
}

/** Best-effort wrapper: kitchen bookkeeping must never fail a table operation. */
export async function kitchenBestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[kitchen] ${label} failed (table operation already done):`, err)
  }
}

// ── Queries / mutations for the kitchen API ────────────────────────────────

function mapItem(r: any): KitchenTicketItem {
  return {
    id: r.id, op_id: r.op_id, order_item_id: r.order_item_id || '', product_id: r.product_id || '',
    product_name: r.product_name || '', variant_label: r.variant_label || '', modifiers: r.modifiers || '',
    note: r.note || '', qty: Number(r.qty) || 0, status: r.status, ready_at: r.ready_at || null,
    void_outcome: r.void_outcome === 'made' || r.void_outcome === 'stopped' ? r.void_outcome : '',
    unit_price: Number(r.unit_price) || 0,
    answered_by_name: r.answered_by_name || '',
  }
}

function mapTicket(r: any, items: KitchenTicketItem[]): KitchenTicket {
  return {
    id: r.id, ticket_no: Number(r.ticket_no), business_date: r.business_date, station_id: r.station_id,
    station_name: r.station_name || '', session_id: r.session_id || '', order_id: r.order_id || '',
    resource_id: r.resource_id || '', resource_name: r.resource_name || '', batch_id: r.batch_id || '',
    source: r.source || '', kind: r.kind, status: r.status, print_count: Number(r.print_count) || 0,
    printed_at: r.printed_at || null,
    created_at: r.created_at instanceof Date ? getGMT7Time(r.created_at) : String(r.created_at ?? ''),
    created_by_name: r.created_by_name || '',
    items,
  }
}

async function attachItems(tx: TransactionClient, ticketRows: any[]): Promise<KitchenTicket[]> {
  if (ticketRows.length === 0) return []
  const itemRows = await tx.query(
    `SELECT * FROM kitchen_ticket_items WHERE tenant_id = $1 AND ticket_id = ANY($2::text[]) ORDER BY created_at, line_no, id`,
    [tid(tx), ticketRows.map((t) => t.id)],
  )
  const byTicket = new Map<string, KitchenTicketItem[]>()
  for (const r of itemRows) byTicket.set(r.ticket_id, [...(byTicket.get(r.ticket_id) ?? []), mapItem(r)])
  return ticketRows.map((t) => mapTicket(t, byTicket.get(t.id) ?? []))
}

export async function listKitchenTickets(
  connector: TxConnector,
  shopId: string,
  opts: { stationId?: string; status?: 'open' | 'done' | 'all'; limit?: number },
): Promise<KitchenTicket[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 300)
  return connector.withTransaction(async (tx) => {
    const params: unknown[] = [tid(tx), shopId]
    let where = `tenant_id = $1 AND branch_id = $2 AND (active IS NULL OR active != 'FALSE')`
    if (opts.stationId) {
      params.push(opts.stationId)
      where += ` AND station_id = $${params.length}`
    }
    const status = opts.status ?? 'open'
    if (status !== 'all') {
      params.push(status)
      where += ` AND status = $${params.length}`
    }
    if (status === 'open') {
      // Forgotten tickets (never bumped, table never closed) must not crowd out new ones:
      // the kitchen screen only works on yesterday + today (GMT+7 business dates).
      const y = new Date(Date.now() - 24 * 3600 * 1000)
      params.push(getGMT7Time(y).slice(0, 10))
      where += ` AND business_date >= $${params.length}`
    }
    params.push(limit)
    // Open tickets oldest first (kitchen works FIFO); history newest first.
    const order = status === 'open' ? 'created_at ASC' : 'created_at DESC'
    const rows = await tx.query(`SELECT * FROM kitchen_tickets WHERE ${where} ORDER BY ${order} LIMIT $${params.length}`, params)
    return attachItems(tx, rows)
  })
}

export async function getKitchenTicket(connector: TxConnector, shopId: string, ticketId: string): Promise<KitchenTicket | null> {
  return connector.withTransaction(async (tx) => {
    const rows = await tx.query(`SELECT * FROM kitchen_tickets WHERE tenant_id = $1 AND branch_id = $2 AND id = $3`, [
      tid(tx), shopId, ticketId,
    ])
    return (await attachItems(tx, rows))[0] ?? null
  })
}

/** Recompute ticket status: an order ticket is done when no item is pending. */
async function refreshTicketStatus(tx: TransactionClient, shopId: string, ticketId: string) {
  await tx.query(
    `UPDATE kitchen_tickets t
        SET status = CASE WHEN EXISTS (
              SELECT 1 FROM kitchen_ticket_items i
               WHERE i.tenant_id = t.tenant_id AND i.ticket_id = t.id AND i.status = 'pending'
            ) THEN 'open' ELSE 'done' END,
            updated_at = NOW()
      WHERE t.tenant_id = $1 AND t.branch_id = $2 AND t.id = $3 AND t.kind = 'order'`,
    [tid(tx), shopId, ticketId],
  )
}

export async function setTicketDone(connector: TxConnector, shopId: string, ticketId: string, done: boolean) {
  const now = getGMT7Time()
  const ticket = await connector.withTransaction(async (tx) => {
    const rows = await tx.query(`SELECT id, kind, station_id FROM kitchen_tickets WHERE tenant_id = $1 AND branch_id = $2 AND id = $3 FOR UPDATE`, [
      tid(tx), shopId, ticketId,
    ])
    if (!rows[0]) return null
    if (rows[0].kind === 'order') {
      await tx.query(
        `UPDATE kitchen_ticket_items SET status = $1, ready_at = $2, updated_at = NOW()
          WHERE tenant_id = $3 AND ticket_id = $4 AND status = $5`,
        done ? ['ready', now, tid(tx), ticketId, 'pending'] : ['pending', null, tid(tx), ticketId, 'ready'],
      )
    }
    await tx.query(`UPDATE kitchen_tickets SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`, [
      done ? 'done' : 'open', tid(tx), ticketId,
    ])
    return rows[0]
  })
  if (ticket) void broadcastKitchen(shopId, { kind: 'ticket_updated', ticket_id: ticketId, station_id: ticket.station_id })
  return ticket ? getKitchenTicket(connector, shopId, ticketId) : null
}

export async function setTicketItemStatus(connector: TxConnector, shopId: string, itemId: string, ready: boolean) {
  const now = getGMT7Time()
  const ticketId = await connector.withTransaction(async (tx) => {
    const rows = await tx.query(
      `UPDATE kitchen_ticket_items SET status = $1, ready_at = $2, updated_at = NOW()
        WHERE tenant_id = $3 AND branch_id = $4 AND id = $5 AND status IN ('pending', 'ready', 'unavailable')
        RETURNING ticket_id`,
      [ready ? 'ready' : 'pending', ready ? now : null, tid(tx), shopId, itemId],
    )
    if (!rows[0]) return null
    await refreshTicketStatus(tx, shopId, rows[0].ticket_id)
    return rows[0].ticket_id as string
  })
  if (!ticketId) return null
  const ticket = await getKitchenTicket(connector, shopId, ticketId)
  if (ticket) void broadcastKitchen(shopId, { kind: 'ticket_updated', ticket_id: ticketId, station_id: ticket.station_id })
  return ticket
}

// ── Cancelled dishes: kitchen answer + report ──────────────────────────────

/**
 * The kitchen answers a cancel line: "Dừng kịp" ('stopped') or "Đã làm rồi" ('made' = waste);
 * null clears the answer. Once every line of the cancel ticket is answered the ticket is done.
 */
export async function setVoidOutcome(
  connector: TxConnector,
  shopId: string,
  itemId: string,
  outcome: KitchenVoidOutcome | null,
  actor?: KitchenActor,
): Promise<KitchenTicket | null> {
  const hit = await connector.withTransaction(async (tx) => {
    // Only cancel lines (kind 'void'): order lines struck by a full cancel are 'voided' too.
    const rows = await tx.query(
      `UPDATE kitchen_ticket_items i
          SET void_outcome = $1, answered_by_user = $5, answered_by_name = $6, answered_at = $7, updated_at = NOW()
         FROM kitchen_tickets t
        WHERE t.id = i.ticket_id AND t.tenant_id = i.tenant_id AND t.kind = 'void'
          AND i.tenant_id = $2 AND i.branch_id = $3 AND i.id = $4 AND i.status = 'voided'
        RETURNING i.ticket_id, i.product_name`,
      [outcome, tid(tx), shopId, itemId,
        outcome ? actor?.id ?? null : null, outcome ? actor?.name ?? null : null, outcome ? getGMT7Time() : null],
    )
    if (!rows[0]) return null
    await tx.query(
      `UPDATE kitchen_tickets t
          SET status = CASE WHEN EXISTS (
                SELECT 1 FROM kitchen_ticket_items i
                 WHERE i.tenant_id = t.tenant_id AND i.ticket_id = t.id AND COALESCE(i.void_outcome, '') = ''
              ) THEN 'open' ELSE 'done' END,
              updated_at = NOW()
        WHERE t.tenant_id = $1 AND t.branch_id = $2 AND t.id = $3 AND t.kind = 'void'`,
      [tid(tx), shopId, rows[0].ticket_id],
    )
    return rows[0] as { ticket_id: string; product_name: string }
  })
  if (!hit) return null
  const ticket = await getKitchenTicket(connector, shopId, hit.ticket_id)
  if (ticket) {
    void broadcastKitchen(shopId, {
      kind: 'void_answered', ticket_id: ticket.id, station_id: ticket.station_id,
      product_name: hit.product_name || '', resource_name: ticket.resource_name, session_id: ticket.session_id,
      station_name: ticket.station_name, outcome: outcome || '',
    })
  }
  return ticket
}

export interface VoidReportLine {
  id: string
  ticket_no: number
  business_date: string
  created_at: string
  station_name: string
  resource_name: string
  product_name: string
  variant_label: string
  qty: number
  reason: string
  outcome: '' | KitchenVoidOutcome
  unit_price: number
  value: number
  /** who cancelled (signed-in user of the request that made the cancel ticket); '' = unknown */
  cancelled_by_user: string
  cancelled_by_name: string
  /** who answered at the station */
  answered_by_user: string
  answered_by_name: string
}

export interface VoidReportActor {
  user_id: string
  name: string
  lines: number
  qty: number
  value: number
  waste_value: number
}

export interface VoidReport {
  lines: VoidReportLine[]
  totals: { lines: number; qty: number; value: number; made_qty: number; waste_value: number; stopped_qty: number; unanswered_qty: number }
  /** per person who cancelled, most waste first ('' user = before audit / system) */
  by_actor: VoidReportActor[]
}

/** "YYYY-MM-DD HH:mm" in GMT+7 from a timestamp column (Date or string). */
function toGMT7Stamp(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v || ''))
  if (Number.isNaN(d.getTime())) return String(v || '')
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
}

/** Cancelled dishes between two business dates (inclusive, YYYY-MM-DD, GMT+7), newest first. */
export async function listVoidReport(connector: TxConnector, shopId: string, range: { from: string; to: string }): Promise<VoidReport> {
  const rows = await connector.withTransaction((tx) =>
    tx.query(
      `SELECT i.id, i.product_name, i.variant_label, i.qty, i.note, i.void_outcome, i.unit_price, i.created_at,
              i.answered_by_user, i.answered_by_name,
              t.ticket_no, t.business_date, t.station_name, t.resource_name, t.created_by_user, t.created_by_name
         FROM kitchen_ticket_items i
         JOIN kitchen_tickets t ON t.id = i.ticket_id AND t.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1 AND i.branch_id = $2 AND t.kind = 'void'
          AND t.business_date >= $3 AND t.business_date <= $4
        ORDER BY t.created_at DESC, i.line_no
        LIMIT 2000`,
      [tid(tx), shopId, range.from, range.to],
    ),
  )
  const totals = { lines: 0, qty: 0, value: 0, made_qty: 0, waste_value: 0, stopped_qty: 0, unanswered_qty: 0 }
  const lines: VoidReportLine[] = rows.map((r: any) => {
    const qty = Math.abs(Number(r.qty) || 0)
    const unit = Number(r.unit_price) || 0
    const outcome: '' | KitchenVoidOutcome = r.void_outcome === 'made' || r.void_outcome === 'stopped' ? r.void_outcome : ''
    totals.lines += 1
    totals.qty += qty
    totals.value += qty * unit
    if (outcome === 'made') {
      totals.made_qty += qty
      totals.waste_value += qty * unit
    } else if (outcome === 'stopped') totals.stopped_qty += qty
    else totals.unanswered_qty += qty
    return {
      id: r.id, ticket_no: Number(r.ticket_no) || 0, business_date: r.business_date, created_at: toGMT7Stamp(r.created_at),
      station_name: r.station_name || '', resource_name: r.resource_name || '', product_name: r.product_name || '',
      variant_label: r.variant_label || '', qty, reason: String(r.note || '').replace(/^Lý do:\s*/, ''), outcome,
      unit_price: unit, value: qty * unit,
      cancelled_by_user: r.created_by_user || '', cancelled_by_name: r.created_by_name || '',
      answered_by_user: r.answered_by_user || '', answered_by_name: r.answered_by_name || '',
    }
  })
  return { lines, totals, by_actor: summariseByActor(lines) }
}

/** Per person who cancelled: count, value and waste (made) value, most waste first. */
export function summariseByActor(lines: VoidReportLine[]): VoidReportActor[] {
  const by = new Map<string, VoidReportActor>()
  for (const l of lines) {
    const key = l.cancelled_by_user
    const a = by.get(key) ?? { user_id: key, name: l.cancelled_by_name, lines: 0, qty: 0, value: 0, waste_value: 0 }
    if (!a.name && l.cancelled_by_name) a.name = l.cancelled_by_name
    a.lines += 1
    a.qty += l.qty
    a.value += l.value
    if (l.outcome === 'made') a.waste_value += l.value
    by.set(key, a)
  }
  return [...by.values()].sort((x, y) => y.waste_value - x.waste_value || y.value - x.value || y.lines - x.lines)
}

// ── "Hết món" (sold out) ────────────────────────────────────────────────────

export interface UnavailableProduct {
  product_id: string
  product_name: string
  station_id: string
  business_date: string
}

const todayGMT7 = () => getGMT7Time().slice(0, 10)

async function listUnavailableProductsTx(tx: TransactionClient, shopId: string): Promise<UnavailableProduct[]> {
  const rows = await tx.query(
    `SELECT product_id, product_name, station_id, business_date FROM kitchen_unavailable_products
      WHERE tenant_id = $1 AND branch_id = $2 AND business_date = $3 ORDER BY created_at`,
    [tid(tx), shopId, todayGMT7()],
  )
  return rows.map((r) => ({
    product_id: r.product_id, product_name: r.product_name || '', station_id: r.station_id || '', business_date: r.business_date,
  }))
}

export async function listUnavailableProducts(connector: TxConnector, shopId: string): Promise<UnavailableProduct[]> {
  return connector.withTransaction((tx) => listUnavailableProductsTx(tx, shopId))
}

export async function setProductUnavailable(
  connector: TxConnector,
  shopId: string,
  product: { product_id: string; product_name?: string; station_id?: string },
  unavailable: boolean,
): Promise<UnavailableProduct[]> {
  const list = await connector.withTransaction(async (tx) => {
    if (unavailable) {
      await tx.query(
        `INSERT INTO kitchen_unavailable_products (tenant_id, branch_id, product_id, product_name, business_date, station_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, branch_id, product_id, business_date) DO NOTHING`,
        [tid(tx), shopId, product.product_id, product.product_name || '', todayGMT7(), product.station_id || ''],
      )
    } else {
      await tx.query(
        `DELETE FROM kitchen_unavailable_products WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3 AND business_date = $4`,
        [tid(tx), shopId, product.product_id, todayGMT7()],
      )
    }
    return listUnavailableProductsTx(tx, shopId)
  })
  void broadcastKitchen(shopId, { kind: 'unavailable_changed', product_name: product.product_name || '' })
  return list
}

/**
 * The kitchen cannot make this dish: the line turns "unavailable" (no longer pending), the floor
 * is alerted in real time, and with `soldOutToday` the product joins today's "Tạm hết" list.
 */
export async function markTicketItemUnavailable(
  connector: TxConnector,
  shopId: string,
  itemId: string,
  opts: { soldOutToday?: boolean } = {},
): Promise<KitchenTicket | null> {
  const hit = await connector.withTransaction(async (tx) => {
    const rows = await tx.query(
      `UPDATE kitchen_ticket_items SET status = 'unavailable', ready_at = NULL, updated_at = NOW()
        WHERE tenant_id = $1 AND branch_id = $2 AND id = $3 AND status IN ('pending', 'ready')
        RETURNING ticket_id, product_id, product_name`,
      [tid(tx), shopId, itemId],
    )
    if (!rows[0]) return null
    await refreshTicketStatus(tx, shopId, rows[0].ticket_id)
    const [t] = await tx.query(
      `SELECT station_id, station_name, resource_name, session_id FROM kitchen_tickets WHERE tenant_id = $1 AND id = $2`,
      [tid(tx), rows[0].ticket_id],
    )
    return { ...rows[0], ...(t || {}) }
  })
  if (!hit) return null
  if (opts.soldOutToday && hit.product_id) {
    await setProductUnavailable(connector, shopId, { product_id: hit.product_id, product_name: hit.product_name, station_id: hit.station_id }, true)
  }
  void broadcastKitchen(shopId, {
    kind: 'item_unavailable', ticket_id: hit.ticket_id, station_id: hit.station_id,
    product_name: hit.product_name, resource_name: hit.resource_name, session_id: hit.session_id, station_name: hit.station_name,
  })
  return getKitchenTicket(connector, shopId, hit.ticket_id)
}

/**
 * Record a print. With `claim`, only the first caller for a never-printed ticket wins
 * (claimed = true): two print stations auto-printing the same station never print twice.
 * A manual reprint (no claim) always counts.
 */
export async function markTicketPrinted(
  connector: TxConnector,
  shopId: string,
  ticketId: string,
  opts: { claim?: boolean } = {},
): Promise<{ ticket: KitchenTicket | null; claimed: boolean }> {
  const now = getGMT7Time()
  const claimed = await connector.withTransaction(async (tx) => {
    const rows = await tx.query(
      `UPDATE kitchen_tickets SET print_count = print_count + 1, printed_at = $1, updated_at = NOW()
        WHERE tenant_id = $2 AND branch_id = $3 AND id = $4 ${opts.claim ? 'AND print_count = 0' : ''} RETURNING id`,
      [now, tid(tx), shopId, ticketId],
    )
    return rows.length > 0
  })
  return { ticket: await getKitchenTicket(connector, shopId, ticketId), claimed }
}
