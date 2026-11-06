// Bar/Bếp K1 — kitchen ticket persistence + queries (Postgres only). See docs/KITCHEN-BAR-PLAN.md.

import crypto from 'crypto'
import type { IDataConnector, TransactionClient } from '@oni/adapters'
import { getGMT7Time, toPrepStation, type PrepStation, type PrepStationRoute } from '@oni/core'
import { planKitchenTickets, type OrderLineInfo, type PlannedTicket, type PlannerOp, type PlannerOpResult, type SentInfo } from './ticketPlanner'
import { broadcastKitchen } from './broadcast'

type TxConnector = IDataConnector & { withTransaction: NonNullable<IDataConnector['withTransaction']> }

const tid = (tx: TransactionClient) => tx.tenantId ?? ''

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
  status: 'pending' | 'ready' | 'voided'
  ready_at: string | null
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

/**
 * Generate kitchen tickets for the ops just applied to a table session. Runs in its own
 * transaction AFTER the ops commit; the caller treats failures as best-effort.
 * Returns the created tickets (empty when the branch has no station).
 */
export async function generateKitchenTicketsForOps(
  connector: TxConnector,
  shopId: string,
  input: { sessionId: string; deviceId: string; ops: PlannerOp[]; results: PlannerOpResult[] },
): Promise<KitchenTicket[]> {
  const applied = input.results.filter((r) => r.status === 'applied' && !r.replayed)
  if (applied.length === 0) return []

  const created = await connector.withTransaction(async (tx) => {
    const stations = await loadStations(tx, shopId)
    if (stations.length === 0) return []
    const routes = await loadRoutes(tx, shopId)

    const opsById = new Map(input.ops.map((o) => [o?.op_id, o]))
    const itemIds = [...new Set(applied.map((r) => r.item_id || opsById.get(r.op_id)?.item_id || '').filter(Boolean))]
    const productIds = new Set<string>()
    for (const r of applied) {
      const op = opsById.get(r.op_id)
      if (op?.type === 'add_item' && op.product_id) productIds.add(String(op.product_id))
    }

    const orderLines = new Map<string, OrderLineInfo>()
    const sent = new Map<string, SentInfo>()
    if (itemIds.length > 0) {
      const lines = await tx.query(
        `SELECT id, product_id, product_name, variant_label, modifiers FROM order_items
          WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tid(tx), itemIds],
      )
      for (const l of lines) {
        orderLines.set(l.id, {
          product_id: l.product_id || '',
          product_name: l.product_name || '',
          variant_label: l.variant_label || '',
          modifiers: l.modifiers || '',
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
                (ARRAY_AGG(i.modifiers ORDER BY t.created_at DESC))[1] AS modifiers
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

    const planned = planKitchenTickets({ ops: input.ops, results: applied, stations, routes, productCategories, orderLines, sent })
    if (planned.length === 0) return []

    const sessionRows = await tx.query(
      `SELECT s.resource_id, s.order_id, r.name AS resource_name
         FROM table_sessions s
         LEFT JOIN location_resources r ON r.id = s.resource_id AND r.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1 AND s.id = $2`,
      [tid(tx), input.sessionId],
    )
    const session = sessionRows[0] || {}
    return insertPlannedTickets(tx, shopId, planned, {
      sessionId: input.sessionId,
      orderId: session.order_id || '',
      resourceId: session.resource_id || '',
      resourceName: session.resource_name || '',
      deviceId: input.deviceId,
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
  ctx: { sessionId: string; orderId: string; resourceId: string; resourceName: string; deviceId: string },
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
            note, qty, status, active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$15,$6,$7,$8,$9,$10,$11,$12,$13,'TRUE',$14,$14)
         ON CONFLICT (tenant_id, op_id) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), tid(tx), shopId, ticketId, l.op_id, l.order_item_id, l.product_id, l.product_name,
          l.variant_label, l.modifiers, l.note, String(l.qty), status, now, lineNo],
      )
      if (rows.length === 0) continue // this op was ticketed before
      items.push({
        id: rows[0].id, op_id: l.op_id, order_item_id: l.order_item_id, product_id: l.product_id, product_name: l.product_name,
        variant_label: l.variant_label, modifiers: l.modifiers, note: l.note, qty: l.qty, status, ready_at: null,
      })
    }
    if (items.length === 0) continue

    const noRows = await tx.query(
      `SELECT COALESCE(MAX(ticket_no), 0) + 1 AS n FROM kitchen_tickets
        WHERE tenant_id = $1 AND branch_id = $2 AND business_date = $3`,
      [tid(tx), shopId, businessDate],
    )
    const ticketNo = Number(noRows[0]?.n) || 1
    await tx.query(
      `INSERT INTO kitchen_tickets
         (id, tenant_id, branch_id, ticket_no, business_date, station_id, station_name, session_id, order_id, resource_id,
          resource_name, batch_id, source, kind, status, print_count, created_by_device, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'table_ops',$13,'open',0,$14,'TRUE',$15,$15)`,
      [ticketId, tid(tx), shopId, ticketNo, businessDate, p.station.id, p.station.name, ctx.sessionId, ctx.orderId,
        ctx.resourceId, ctx.resourceName, p.batch_id, p.kind, ctx.deviceId, now],
    )
    out.push({
      id: ticketId, ticket_no: ticketNo, business_date: businessDate, station_id: p.station.id, station_name: p.station.name,
      session_id: ctx.sessionId, order_id: ctx.orderId, resource_id: ctx.resourceId, resource_name: ctx.resourceName,
      batch_id: p.batch_id, source: 'table_ops', kind: p.kind, status: 'open', print_count: 0, printed_at: null,
      created_at: now, items,
    })
  }
  return out
}

// ── Queries / mutations for the kitchen API ────────────────────────────────

function mapItem(r: any): KitchenTicketItem {
  return {
    id: r.id, op_id: r.op_id, order_item_id: r.order_item_id || '', product_id: r.product_id || '',
    product_name: r.product_name || '', variant_label: r.variant_label || '', modifiers: r.modifiers || '',
    note: r.note || '', qty: Number(r.qty) || 0, status: r.status, ready_at: r.ready_at || null,
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
        WHERE tenant_id = $3 AND branch_id = $4 AND id = $5 AND status IN ('pending', 'ready')
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
