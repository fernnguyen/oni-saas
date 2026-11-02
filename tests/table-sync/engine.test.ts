import assert from 'node:assert/strict'
import test from 'node:test'

import { applyTableOps, TableSyncError, type LineRow, type OpResult, type SessionRow, type TableOp, type TableSyncRepo } from '../../apps/web/lib/server/tableSync/engine'
import { tableLineKey } from '../../apps/web/lib/server/tableSessionReconciler'

// Plan: docs/TABLE-SESSION-SYNC-PLAN.md – Phase 1 (1.3 ops engine). In-memory repo.

function makeRepo(opts: { status?: string; lines?: Partial<LineRow>[]; failOnInsertLine?: boolean } = {}) {
  const session: SessionRow = { id: 'S1', branch_id: 'B1', resource_id: 'T1', order_id: 'O1', status: opts.status ?? 'open', check_in: '2026-11-02T01:00:00.000Z', version: 1 }
  const lines: LineRow[] = (opts.lines || []).map((l, i) => ({
    id: `L${i + 1}`, order_id: 'O1', product_id: 'P1', product_name: 'Bia', qty: 1, unit_price: 20000, modifier_total: 0,
    line_total: 20000, variant_label: '', modifiers: '', active: true, ...l,
  }))
  const ops = new Map<string, { status: string; result: OpResult }>()
  const events: any[] = []
  let order = { discount_amount: 0, tax_amount: 0, shipping_fee: 0, metadata: { resource_id: 'T1' } as Record<string, any>, subtotal: 0, total_amount: 0 }
  let seq = 0
  let idSeq = lines.length
  const repo: TableSyncRepo & { state: any } = {
    state: { session, lines, ops, events, get order() { return order } },
    async findOp(id) { return ops.get(id) || null },
    async lockSession(id) { return id === session.id ? { ...session } : null },
    async listLines() { return lines.map((l) => ({ ...l })) },
    async insertLine(orderId, line) {
      if (opts.failOnInsertLine) throw new Error('db down')
      const row: LineRow = { id: `L${++idSeq}`, order_id: orderId, active: true, ...(line as any) }
      lines.push({ ...row })
      return { ...row }
    },
    async updateLine(id, patch) {
      const l = lines.find((x) => x.id === id)!
      Object.assign(l, patch)
    },
    async insertOp({ op, status, result }) { if (!ops.has(op.op_id)) ops.set(op.op_id, { status, result }) },
    async bumpSessionVersion() { session.version += 1; return session.version },
    async insertEvent(ev) { events.push(ev); return ++seq },
    async getOrderTotalsInput() { return { discount_amount: order.discount_amount, tax_amount: order.tax_amount, shipping_fee: order.shipping_fee, metadata: order.metadata } },
    async updateOrderTotals(_id, t) { order = { ...order, ...t } },
  }
  return repo
}

const add = (op_id: string, extra: Partial<Extract<TableOp, { type: 'add_item' }>> = {}): TableOp =>
  ({ op_id, type: 'add_item', product_id: 'P1', product_name: 'Bia', unit_price: 20000, qty: 1, ...extra })
const run = (repo: TableSyncRepo, ops: TableOp[], deviceId = 'A') => applyTableOps(repo, { sessionId: 'S1', deviceId, ops })

test('add_item creates a line, then merges further adds of the same line key (delta, no overwrite)', async () => {
  const repo = makeRepo()
  await run(repo, [add('op1', { qty: 2 })], 'A')
  const r = await run(repo, [add('op2', { qty: 1 })], 'B')
  assert.equal(repo.state.lines.length, 1)
  assert.equal(repo.state.lines[0].qty, 3)
  assert.equal(repo.state.lines[0].line_total, 60000)
  assert.equal(r.results[0].qty, 3)
  assert.equal(repo.state.order.subtotal, 60000)
  assert.equal(repo.state.order.total_amount, 60000)
  assert.equal(repo.state.order.metadata.cartItemsCount, 3)
})

test('same op_id is applied exactly once, across batches and inside one batch', async () => {
  const repo = makeRepo()
  await run(repo, [add('dup', { qty: 2 })])
  const again = await run(repo, [add('dup', { qty: 2 }), add('dup', { qty: 2 })])
  assert.equal(repo.state.lines[0].qty, 2)
  assert.equal(again.results.length, 2)
  assert.ok(again.results.every((r) => r.replayed && r.status === 'applied'))
  assert.equal(repo.state.session.version, 2, 'version bumped once')
})

test('variants and modifiers are separate lines; modifier JSON formatting does not split lines', async () => {
  const repo = makeRepo()
  await run(repo, [
    add('a', { variant_label: 'Size L' }),
    add('b', { variant_label: 'Size S' }),
    add('c', { variant_label: 'Size L', modifiers: [] }),
    add('d', { modifiers: [{ group: 'Đá', option: 'Ít' }], modifier_total: 2000 }),
    add('e', { modifiers: '[{"group":"Đá","option":"Ít"}]', modifier_total: 2000 }),
  ])
  const byKey = (variant: string, mods: unknown) => repo.state.lines.find((l: LineRow) => tableLineKey(l.product_id, l.variant_label, l.modifiers) === tableLineKey('P1', variant, mods))
  assert.equal(repo.state.lines.length, 3)
  assert.equal(byKey('Size L', '').qty, 2)
  assert.equal(byKey('Size S', '').qty, 1)
  const withMods = byKey('', '[{"group":"Đá","option":"Ít"}]')
  assert.equal(withMods.qty, 2)
  assert.equal(withMods.line_total, 44000)
})

test('change_qty by line_key (offline client does not know item_id) and by item_id', async () => {
  const repo = makeRepo({ lines: [{ qty: 3, line_total: 60000 }] })
  const key = tableLineKey('P1', '', '')
  await run(repo, [{ op_id: 'c1', type: 'change_qty', line_key: key, delta: -1 }])
  assert.equal(repo.state.lines[0].qty, 2)
  await run(repo, [{ op_id: 'c2', type: 'change_qty', item_id: 'L1', delta: 5 }])
  assert.equal(repo.state.lines[0].qty, 7)
  assert.equal(repo.state.lines[0].line_total, 140000)
})

test('two devices decrementing concurrently never go below zero; line is deactivated at 0', async () => {
  const repo = makeRepo({ lines: [{ qty: 1 }] })
  await run(repo, [{ op_id: 'a', type: 'change_qty', item_id: 'L1', delta: -1 }], 'A')
  const r = await run(repo, [{ op_id: 'b', type: 'change_qty', item_id: 'L1', delta: -1 }], 'B')
  assert.equal(repo.state.lines[0].active, false)
  assert.equal(r.results[0].status, 'rejected')
  assert.equal(r.results[0].reason, 'line_not_found')
  assert.equal(repo.state.order.subtotal, 0)
})

test('remove_item is idempotent even if another device already removed the line', async () => {
  const repo = makeRepo({ lines: [{ qty: 2 }] })
  await run(repo, [{ op_id: 'r1', type: 'remove_item', item_id: 'L1' }], 'A')
  const r = await run(repo, [{ op_id: 'r2', type: 'remove_item', item_id: 'L1' }], 'B')
  assert.equal(r.results[0].status, 'applied')
  assert.equal(r.results[0].reason, 'already_removed')
  assert.equal(repo.state.lines[0].active, false)
})

test('add after remove creates a fresh line (other device re-orders the item)', async () => {
  const repo = makeRepo({ lines: [{ qty: 2 }] })
  await run(repo, [{ op_id: 'r', type: 'remove_item', item_id: 'L1' }, add('a2')])
  const active = repo.state.lines.filter((l: LineRow) => l.active)
  assert.equal(active.length, 1)
  assert.equal(active[0].qty, 1)
})

test('set_time_charge upserts a single time-charge line and is excluded from item count', async () => {
  const repo = makeRepo({ lines: [{ qty: 2, line_total: 40000 }] })
  const tc = (op_id: string, amount: number): TableOp => ({ op_id, type: 'set_time_charge', product_id: 'TIME_CHARGE_X', product_name: 'Tiền giờ bàn 1', amount })
  await run(repo, [tc('t1', 60000)])
  await run(repo, [tc('t2', 90000)])
  const tcLines = repo.state.lines.filter((l: LineRow) => l.product_id === 'TIME_CHARGE_X')
  assert.equal(tcLines.length, 1)
  assert.equal(tcLines[0].line_total, 90000)
  assert.equal(repo.state.order.subtotal, 130000)
  assert.equal(repo.state.order.metadata.cartItemsCount, 2)
})

test('ops on a closed session are rejected (stored), and the retry gets the same answer', async () => {
  const repo = makeRepo({ status: 'closed' })
  const r1 = await run(repo, [add('late')])
  assert.equal(r1.results[0].status, 'rejected')
  assert.equal(r1.results[0].reason, 'session_not_open')
  const r2 = await run(repo, [add('late')])
  assert.equal(r2.results[0].replayed, true)
  assert.equal(r2.results[0].reason, 'session_not_open')
  assert.equal(repo.state.lines.length, 0)
})

test('invalid ops are rejected without stopping the rest of the batch', async () => {
  const repo = makeRepo()
  const r = await run(repo, [
    add('bad-qty', { qty: 0 }),
    { op_id: 'bad-type', type: 'explode' } as any,
    { op_id: 'no-ref', type: 'change_qty', delta: 1 } as any,
    add('good'),
  ])
  assert.deepEqual(r.results.map((x) => x.status), ['rejected', 'rejected', 'rejected', 'applied'])
  assert.deepEqual(r.results.slice(0, 3).map((x) => x.reason), ['invalid_qty', 'unknown_op_type', 'missing_line_ref'])
  assert.equal(repo.state.lines[0].qty, 1)
})

test('order discount/tax/shipping are kept in the recomputed total', async () => {
  const repo = makeRepo()
  repo.state.order.discount_amount = 5000
  repo.state.order.tax_amount = 1000
  repo.state.order.shipping_fee = 0
  const r = await run(repo, [add('a', { qty: 2 })])
  assert.deepEqual(r.order_totals, { subtotal: 40000, total_amount: 36000 })
})

test('unknown session → 404, empty or oversized batch → 400', async () => {
  const repo = makeRepo()
  await assert.rejects(applyTableOps(repo, { sessionId: 'nope', deviceId: 'A', ops: [add('x')] }), (e: any) => e instanceof TableSyncError && e.status === 404)
  await assert.rejects(run(repo, []), (e: any) => e.status === 400 && e.code === 'empty_ops')
  await assert.rejects(run(repo, Array.from({ length: 201 }, (_, i) => add(`o${i}`))), (e: any) => e.code === 'too_many_ops')
})

test('unexpected storage errors propagate (transaction will roll back the batch)', async () => {
  const repo = makeRepo({ failOnInsertLine: true })
  await assert.rejects(run(repo, [add('a')]), /db down/)
})
