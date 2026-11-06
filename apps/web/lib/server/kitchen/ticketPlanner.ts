// Bar/Bếp K1 — turn applied table-sync ops into kitchen ticket lines (docs/KITCHEN-BAR-PLAN.md).
// Pure: all data comes in as arguments, so it is unit-tested without a database.
//
// Rules
//  - only ops applied in THIS call count (replays and rejects are skipped → no double tickets)
//  - add_item / change_qty(+)  → "order" line for the station the product routes to
//  - change_qty(−) / remove_item → "void" line, only for qty actually sent to a station before
//    (an item never sent needs no cancellation), on the station it was sent to
//  - time-charge lines never reach a station
//  - lines are grouped into one ticket per (station, kind, batch_id)

import { isSystemTimeChargeProduct, resolvePrepStation, type PrepStation, type PrepStationRoute } from '@oni/core'

export interface PlannerOp {
  op_id: string
  type: string
  product_id?: string
  product_name?: string
  qty?: number
  delta?: number
  item_id?: string
  variant_label?: string
  modifiers?: unknown
  note?: string
  batch_id?: string
}

export interface PlannerOpResult {
  op_id: string
  status: 'applied' | 'rejected'
  reason?: string
  item_id?: string
  replayed?: boolean
}

export interface OrderLineInfo {
  product_id: string
  product_name: string
  variant_label: string
  modifiers: string
}

/** What a station has already received for one order item (net qty, after voids). */
export interface SentInfo extends OrderLineInfo {
  net_qty: number
  station_id: string
}

export interface PlannedLine {
  op_id: string
  order_item_id: string
  product_id: string
  product_name: string
  variant_label: string
  modifiers: string
  note: string
  qty: number // negative for void
}

export interface PlannedTicket {
  station: PrepStation
  kind: 'order' | 'void'
  batch_id: string
  lines: PlannedLine[]
}

export interface PlanInput {
  ops: PlannerOp[]
  results: PlannerOpResult[]
  stations: PrepStation[]
  routes: PrepStationRoute[]
  /** product_id → category_id */
  productCategories: Map<string, string>
  /** order_item_id → current line (needed for change_qty(+)) */
  orderLines: Map<string, OrderLineInfo>
  /** order_item_id → what was sent to the kitchen so far */
  sent: Map<string, SentInfo>
}

const modifiersText = (m: unknown) => (m === undefined || m === null ? '' : typeof m === 'string' ? m : JSON.stringify(m))
const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max)

export function planKitchenTickets(input: PlanInput): PlannedTicket[] {
  const { stations, routes } = input
  if (stations.length === 0) return []

  const opsById = new Map(input.ops.filter((o) => o && typeof o.op_id === 'string').map((o) => [o.op_id, o]))
  const sent = new Map(input.sent) // local copy: updated as this call adds/voids lines
  const tickets = new Map<string, PlannedTicket>()
  const seen = new Set<string>()

  const push = (station: PrepStation, kind: 'order' | 'void', batchId: string, line: PlannedLine) => {
    const key = `${station.id}|${kind}|${batchId}`
    let t = tickets.get(key)
    if (!t) {
      t = { station, kind, batch_id: batchId, lines: [] }
      tickets.set(key, t)
    }
    t.lines.push(line)
  }

  for (const r of input.results) {
    if (r.status !== 'applied' || r.replayed || r.reason === 'already_removed') continue
    if (seen.has(r.op_id)) continue
    seen.add(r.op_id)
    const op = opsById.get(r.op_id)
    const itemId = r.item_id || op?.item_id || ''
    if (!op || !itemId) continue
    const batchId = clean(op.batch_id, 255)
    const note = clean(op.note, 500)

    let addQty = 0
    let info: OrderLineInfo | undefined
    if (op.type === 'add_item') {
      addQty = Number(op.qty) || 0
      info = {
        product_id: String(op.product_id || ''),
        product_name: String(op.product_name || ''),
        variant_label: String(op.variant_label || ''),
        modifiers: modifiersText(op.modifiers),
      }
    } else if (op.type === 'change_qty' && Number(op.delta) > 0) {
      addQty = Number(op.delta)
      info = input.orderLines.get(itemId) ?? sent.get(itemId)
    }

    if (addQty > 0 && info) {
      if (isSystemTimeChargeProduct(info.product_id, null, info.product_name)) continue
      const station = resolvePrepStation(
        { product_id: info.product_id, category_id: input.productCategories.get(info.product_id) },
        stations,
        routes,
      )
      if (!station) continue
      push(station, 'order', batchId, { op_id: op.op_id, order_item_id: itemId, ...info, note, qty: addQty })
      const prev = sent.get(itemId)
      sent.set(itemId, { ...info, net_qty: (prev?.net_qty ?? 0) + addQty, station_id: station.id })
      continue
    }

    const isVoid = op.type === 'remove_item' || (op.type === 'change_qty' && Number(op.delta) < 0)
    if (!isVoid) continue
    const prev = sent.get(itemId)
    if (!prev || prev.net_qty <= 0) continue
    const wanted = op.type === 'remove_item' ? prev.net_qty : Math.abs(Number(op.delta))
    const voidQty = Math.min(wanted, prev.net_qty)
    const station = stations.find((s) => s.id === prev.station_id) ?? stations.find((s) => s.is_default)
    if (!station || voidQty <= 0) continue
    push(station, 'void', batchId, {
      op_id: op.op_id,
      order_item_id: itemId,
      product_id: prev.product_id,
      product_name: prev.product_name,
      variant_label: prev.variant_label,
      modifiers: prev.modifiers,
      note,
      qty: -voidQty,
    })
    sent.set(itemId, { ...prev, net_qty: prev.net_qty - voidQty })
  }

  return [...tickets.values()]
}

/**
 * Collapse what one send would print per order item into its net change, so an item added and
 * then removed (or reduced) before "Gửi bếp" does not print an order line AND a cancel line.
 *  - net > 0 → keep the latest order lines up to the net qty (earlier ops stay unsent and keep
 *    netting with their partners next time)
 *  - net < 0 → keep the latest void lines up to |net|
 *  - net = 0 → nothing for that item
 * Ticket/line order is preserved; empty tickets are dropped.
 */
export function netPlannedTickets(planned: PlannedTicket[]): PlannedTicket[] {
  const net = new Map<string, number>()
  for (const t of planned) for (const l of t.lines) net.set(l.order_item_id, (net.get(l.order_item_id) ?? 0) + l.qty)

  // Walk lines newest → oldest, keeping qty until each item's net is covered.
  const remaining = new Map(net)
  const keep = new Map<PlannedLine, number>()
  const flat = planned.flatMap((t) => t.lines)
  for (let i = flat.length - 1; i >= 0; i--) {
    const l = flat[i]
    const left = remaining.get(l.order_item_id) ?? 0
    if (left === 0 || Math.sign(left) !== Math.sign(l.qty)) continue
    const take = Math.sign(left) * Math.min(Math.abs(left), Math.abs(l.qty))
    keep.set(l, take)
    remaining.set(l.order_item_id, left - take)
  }

  return planned
    .map((t) => ({ ...t, lines: t.lines.filter((l) => keep.has(l)).map((l) => ({ ...l, qty: keep.get(l)! })) }))
    .filter((t) => t.lines.length > 0)
}
