// Table sync v2 – idempotent delta operations on a table/room/court session.
// docs/TABLE-SESSION-SYNC-PLAN.md Phase 1 (1.3). Pure logic over `TableSyncRepo`, which runs
// inside one database transaction (see pgRepository.ts), so a batch is all-or-nothing and two
// devices sending ops for the same session are serialised by the session row lock.

import { tableLineKey } from '../tableSessionReconciler'

export type TableOp =
  | {
      op_id: string
      type: 'add_item'
      product_id: string
      product_name: string
      unit_price: number
      qty: number
      sku?: string
      variant_label?: string
      modifiers?: unknown
      modifier_total?: number
      unit_cost?: number
      tax_rate?: string
      tax_group?: string
      client_created_at?: string
    }
  | { op_id: string; type: 'change_qty'; item_id?: string; line_key?: string; delta: number; client_created_at?: string }
  | { op_id: string; type: 'remove_item'; item_id?: string; line_key?: string; client_created_at?: string }
  | {
      op_id: string
      type: 'set_time_charge'
      product_id: string
      product_name: string
      amount: number
      duration_minutes?: number
      checkout_at?: string
      client_created_at?: string
    }

export type TableOpType = TableOp['type']

export interface SessionRow {
  id: string
  branch_id: string
  resource_id: string
  order_id: string
  status: string
  check_in: string
  version: number
}

export interface LineRow {
  id: string
  order_id: string
  product_id: string
  product_name: string
  qty: number
  unit_price: number
  modifier_total: number
  line_total: number
  variant_label: string
  modifiers: string
  active: boolean
}

export interface OrderTotalsInput {
  discount_amount: number
  tax_amount: number
  shipping_fee: number
  metadata: Record<string, any>
}

export interface TableSyncRepo {
  findOp(opId: string): Promise<{ status: string; result: OpResult } | null>
  lockSession(sessionId: string): Promise<SessionRow | null>
  listLines(orderId: string): Promise<LineRow[]>
  insertLine(orderId: string, line: Omit<LineRow, 'id' | 'order_id' | 'active'> & Record<string, unknown>): Promise<LineRow>
  updateLine(itemId: string, patch: { qty?: number; line_total?: number; unit_price?: number; product_name?: string; active?: boolean }): Promise<void>
  insertOp(row: { op: TableOp; session: SessionRow; deviceId: string; status: 'applied' | 'rejected'; itemId?: string; result: OpResult }): Promise<void>
  bumpSessionVersion(sessionId: string): Promise<number>
  insertEvent(ev: { session: SessionRow; kind: string; payload: Record<string, unknown> }): Promise<number>
  getOrderTotalsInput(orderId: string): Promise<OrderTotalsInput | null>
  updateOrderTotals(orderId: string, totals: { subtotal: number; total_amount: number; metadata: Record<string, any> }): Promise<void>
}

export interface OpResult {
  op_id: string
  status: 'applied' | 'rejected'
  reason?: string
  item_id?: string
  line_key?: string
  qty?: number
  session_version?: number
  /** true when this op_id was already processed earlier (stored result returned) */
  replayed?: boolean
}

export interface ApplyOpsResult {
  session_id: string
  session_version: number
  results: OpResult[]
  order_totals?: { subtotal: number; total_amount: number }
}

const MAX_QTY = 100_000

export class TableSyncError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'TableSyncError'
  }
}

const lineKeyOf = (l: Pick<LineRow, 'product_id' | 'variant_label' | 'modifiers'>) =>
  tableLineKey(l.product_id, l.variant_label, l.modifiers)

const computeLineTotal = (unitPrice: number, modifierTotal: number, qty: number) =>
  Math.round((unitPrice + modifierTotal) * qty)

export function isTimeChargeLine(productId: string, productName: string): boolean {
  return (
    productId.startsWith('TIME_CHARGE') ||
    productName.startsWith('Tiền giờ ') ||
    productName.startsWith('Phí giờ ')
  )
}

function validateOp(op: TableOp): string | null {
  if (!op || typeof op.op_id !== 'string' || !op.op_id.trim() || op.op_id.length > 255) return 'invalid_op_id'
  switch (op.type) {
    case 'add_item':
      if (!op.product_id || !op.product_name) return 'missing_product'
      if (!Number.isFinite(op.qty) || op.qty <= 0 || op.qty > MAX_QTY) return 'invalid_qty'
      if (!Number.isFinite(op.unit_price) || op.unit_price < 0) return 'invalid_price'
      return null
    case 'change_qty':
      if (!op.item_id && !op.line_key) return 'missing_line_ref'
      if (!Number.isFinite(op.delta) || op.delta === 0 || Math.abs(op.delta) > MAX_QTY) return 'invalid_delta'
      return null
    case 'remove_item':
      if (!op.item_id && !op.line_key) return 'missing_line_ref'
      return null
    case 'set_time_charge':
      if (!op.product_id || !op.product_name) return 'missing_product'
      if (!Number.isFinite(op.amount) || op.amount < 0) return 'invalid_amount'
      return null
    default:
      return 'unknown_op_type'
  }
}

function findLine(lines: LineRow[], ref: { item_id?: string; line_key?: string }): LineRow | undefined {
  if (ref.item_id) return lines.find((l) => l.id === ref.item_id && l.active)
  if (ref.line_key) return lines.find((l) => l.active && lineKeyOf(l) === ref.line_key)
  return undefined
}

/**
 * Applies a batch of ops to one session, in order. Each op is idempotent by `op_id`:
 * re-sending returns the stored result without re-applying. Domain failures (closed session,
 * unknown line…) are recorded as `rejected` so retries get the same answer and the client can
 * move them to its conflict inbox; unexpected errors throw and roll back the whole batch.
 */
export async function applyTableOps(
  repo: TableSyncRepo,
  input: { sessionId: string; deviceId: string; ops: TableOp[] }
): Promise<ApplyOpsResult> {
  const { sessionId, deviceId, ops } = input
  if (!Array.isArray(ops) || ops.length === 0) throw new TableSyncError(400, 'empty_ops', 'Không có thao tác nào')
  if (ops.length > 200) throw new TableSyncError(400, 'too_many_ops', 'Tối đa 200 thao tác mỗi lần gửi')

  const session = await repo.lockSession(sessionId)
  if (!session) throw new TableSyncError(404, 'session_not_found', 'Không tìm thấy phiên bàn')

  const lines = session.order_id ? await repo.listLines(session.order_id) : []
  const results: OpResult[] = []
  let version = session.version
  let mutated = false
  const seenInBatch = new Set<string>()

  for (const op of ops) {
    const opId = typeof op?.op_id === 'string' ? op.op_id.trim() : ''
    if (opId && seenInBatch.has(opId)) {
      const earlier = results.find((r) => r.op_id === opId)
      if (earlier) results.push({ ...earlier, replayed: true })
      continue
    }
    if (opId) seenInBatch.add(opId)

    const stored = opId ? await repo.findOp(opId) : null
    if (stored) {
      results.push({ ...stored.result, replayed: true })
      continue
    }

    const reject = async (reason: string, extra: Partial<OpResult> = {}) => {
      const result: OpResult = { op_id: opId || String(op?.op_id ?? ''), status: 'rejected', reason, ...extra }
      if (opId) await repo.insertOp({ op, session, deviceId, status: 'rejected', result })
      results.push(result)
    }

    const invalid = validateOp(op)
    if (invalid) { await reject(invalid); continue }
    if (session.status !== 'open' || !session.order_id) { await reject('session_not_open'); continue }

    let itemId: string | undefined
    let lineKey: string | undefined
    let qty: number | undefined

    if (op.type === 'add_item') {
      lineKey = tableLineKey(op.product_id, op.variant_label, op.modifiers)
      const existing = lines.find((l) => l.active && lineKeyOf(l) === lineKey)
      if (existing) {
        existing.qty += op.qty
        existing.line_total = computeLineTotal(existing.unit_price, existing.modifier_total, existing.qty)
        await repo.updateLine(existing.id, { qty: existing.qty, line_total: existing.line_total })
        itemId = existing.id
        qty = existing.qty
      } else {
        const modifierTotal = Number(op.modifier_total || 0) || 0
        const modifiers = op.modifiers === undefined || op.modifiers === null
          ? ''
          : typeof op.modifiers === 'string' ? op.modifiers : JSON.stringify(op.modifiers)
        const created = await repo.insertLine(session.order_id, {
          product_id: op.product_id,
          product_name: op.product_name,
          qty: op.qty,
          unit_price: op.unit_price,
          modifier_total: modifierTotal,
          line_total: computeLineTotal(op.unit_price, modifierTotal, op.qty),
          variant_label: op.variant_label || '',
          modifiers,
          sku: op.sku || '',
          unit_cost: op.unit_cost ?? '',
          tax_rate: op.tax_rate || '0',
          tax_group: op.tax_group || '',
        })
        lines.push(created)
        itemId = created.id
        qty = created.qty
      }
    } else if (op.type === 'change_qty') {
      const line = findLine(lines, op)
      if (!line) { await reject('line_not_found'); continue }
      lineKey = lineKeyOf(line)
      itemId = line.id
      const nextQty = line.qty + op.delta
      if (nextQty <= 0) {
        line.qty = 0
        line.active = false
        await repo.updateLine(line.id, { active: false })
      } else {
        line.qty = nextQty
        line.line_total = computeLineTotal(line.unit_price, line.modifier_total, nextQty)
        await repo.updateLine(line.id, { qty: line.qty, line_total: line.line_total })
      }
      qty = line.qty
    } else if (op.type === 'remove_item') {
      const line = findLine(lines, op)
      if (!line) {
        // Already removed (e.g. by another device): the intent is satisfied
        const result: OpResult = { op_id: opId, status: 'applied', reason: 'already_removed', session_version: version }
        await repo.insertOp({ op, session, deviceId, status: 'applied', result })
        results.push(result)
        continue
      }
      lineKey = lineKeyOf(line)
      itemId = line.id
      line.active = false
      line.qty = 0
      await repo.updateLine(line.id, { active: false })
      qty = 0
    } else if (op.type === 'set_time_charge') {
      const amount = Math.round(op.amount)
      const existing = lines.find((l) => l.active && isTimeChargeLine(l.product_id, l.product_name))
      if (existing) {
        existing.unit_price = amount
        existing.line_total = amount
        existing.qty = 1
        existing.product_name = op.product_name
        await repo.updateLine(existing.id, { qty: 1, unit_price: amount, line_total: amount, product_name: op.product_name })
        itemId = existing.id
      } else {
        const created = await repo.insertLine(session.order_id, {
          product_id: op.product_id,
          product_name: op.product_name,
          qty: 1,
          unit_price: amount,
          modifier_total: 0,
          line_total: amount,
          variant_label: '',
          modifiers: '',
        })
        lines.push(created)
        itemId = created.id
      }
      qty = 1
      lineKey = tableLineKey(op.product_id, '', '')
    }

    version = await repo.bumpSessionVersion(session.id)
    mutated = true
    const result: OpResult = { op_id: opId, status: 'applied', item_id: itemId, line_key: lineKey, qty, session_version: version }
    await repo.insertOp({ op, session, deviceId, status: 'applied', itemId, result })
    await repo.insertEvent({
      session,
      kind: 'op_applied',
      payload: { op_id: opId, op_type: op.type, item_id: itemId, line_key: lineKey, qty, version, device_id: deviceId },
    })
    results.push(result)
  }

  let orderTotals: ApplyOpsResult['order_totals']
  if (mutated && session.order_id) {
    orderTotals = await recomputeOrderTotals(repo, session.order_id, lines)
  }

  return { session_id: session.id, session_version: version, results, order_totals: orderTotals }
}

/** Same rules as `recalculateInProgressOrderTotals`, computed from the in-transaction line state */
export async function recomputeOrderTotals(repo: TableSyncRepo, orderId: string, lines: LineRow[]) {
  const input = await repo.getOrderTotalsInput(orderId)
  if (!input) return undefined
  let subtotal = 0
  let cartItemsCount = 0
  for (const l of lines) {
    if (!l.active) continue
    subtotal += l.line_total
    if (!isTimeChargeLine(l.product_id, l.product_name) && l.qty > 0) cartItemsCount += l.qty
  }
  const totalAmount = Math.max(0, subtotal - input.discount_amount + input.tax_amount + input.shipping_fee)
  const metadata = { ...input.metadata, cartItemsCount, items_updated_at: new Date().toISOString() }
  await repo.updateOrderTotals(orderId, { subtotal, total_amount: totalAmount, metadata })
  return { subtotal, total_amount: totalAmount }
}
