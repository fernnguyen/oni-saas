import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cancelOrphanedInProgressOrdersForResource,
  isSameSessionCheckIn,
  preserveStaleTableSession,
  reconcileShopTableSessions,
  syncExistingTableOrderLine,
  tableLineKey,
} from '../../apps/web/lib/server/tableSessionReconciler'

// Plan: docs/TABLE-SESSION-SYNC-PLAN.md – Phase 0 (0.1 / 0.2 / 0.3 / 0.4).
// Run: pnpm test:table-sync

type Row = Record<string, any>

function makeConnector(seed: Record<string, Row[]>, opts: { failItemsList?: boolean } = {}) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(seed))
  const writes: { op: string; entity: string; id?: string; data?: Row }[] = []
  let seq = 0
  const idOf = (entity: string, r: Row) =>
    String((entity === 'orders' ? r.order_id : entity === 'order-items' ? r.item_id : undefined) || r.id)
  const connector: any = {
    db,
    writes,
    async list(entity: string, q: Row = {}) {
      if (opts.failItemsList && entity === 'order-items') throw new Error('items lookup failed')
      const rows = (db[entity] || []).filter((r) =>
        Object.entries(q.filters || {}).every(([k, v]) => {
          if (k === 'branch_id') return true
          const actual = r[k] ?? (k === 'active' ? 'TRUE' : '')
          return String(actual) === String(v)
        })
      )
      return { data: rows.map((r) => ({ ...r })), total: rows.length }
    },
    async findById(entity: string, id: string) {
      const r = (db[entity] || []).find((x) => idOf(entity, x) === id)
      return r ? { ...r } : null
    },
    async update(entity: string, id: string, patch: Row) {
      writes.push({ op: 'update', entity, id, data: patch })
      const r = (db[entity] || []).find((x) => idOf(entity, x) === id)
      if (r) Object.assign(r, patch)
      return r
    },
    async create(entity: string, data: Row) {
      const key = entity === 'orders' ? 'order_id' : 'item_id'
      const row = { ...data, [key]: `new-${++seq}` }
      ;(db[entity] ||= []).push(row)
      writes.push({ op: 'create', entity, id: row[key], data })
      return row
    },
    async batchCreate(entity: string, rows: Row[]) {
      const out = []
      for (const r of rows) out.push(await connector.create(entity, r))
      return out
    },
  }
  return connector
}

const T0 = '2026-11-01T08:00:00.000Z' // 15:00 GMT+7
const tableOrder = (id: string, extra: Row = {}) => {
  const { check_in = T0, resource_id = 'T1', meta = {}, ...rest } = extra
  return {
    order_id: id,
    status: 'in_progress',
    paid_amount: '0',
    created_at: T0,
    metadata: JSON.stringify({ resource_id, check_in, ...meta }),
    ...rest,
  }
}
const item = (id: string, orderId: string, extra: Row = {}) => ({
  item_id: id, order_id: orderId, product_id: 'P1', product_name: 'Bia', qty: '1', unit_price: '20000', line_total: '20000', active: 'TRUE', ...extra,
})
const orderOf = (c: any, id: string) => c.db.orders.find((o: Row) => o.order_id === id)
const metaOf = (c: any, id: string) => JSON.parse(orderOf(c, id).metadata)
const isTimeCharge = (id: string, name: string) => id.startsWith('TIME_CHARGE') || name.startsWith('Tiền giờ ')

// ─── isSameSessionCheckIn ─────────────────────────────────────────────────────

test('isSameSessionCheckIn: same instant in different formats, ±2s tolerance', () => {
  assert.equal(isSameSessionCheckIn(T0, '2026-11-01T15:00:00+07:00'), true)
  assert.equal(isSameSessionCheckIn(T0, '2026-11-01T08:00:01.900Z'), true)
  assert.equal(isSameSessionCheckIn(T0, '2026-11-01T08:00:03.000Z'), false)
  assert.equal(isSameSessionCheckIn('', T0), false)
  assert.equal(isSameSessionCheckIn(undefined, undefined), false)
  assert.equal(isSameSessionCheckIn('abc', 'abc'), true)
  assert.equal(isSameSessionCheckIn('abc', 'abd'), false)
})

// ─── 0.1 cancelOrphanedInProgressOrdersForResource ────────────────────────────

test('0.1 opening a new session: old order with items is flagged, empty one cancelled, kept order untouched', async () => {
  const c = makeConnector({
    orders: [tableOrder('OLD_ITEMS'), tableOrder('OLD_EMPTY'), tableOrder('NEW'), tableOrder('OTHER_TABLE', { resource_id: 'T2' })],
    'order-items': [item('i1', 'OLD_ITEMS')],
  })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'NEW')
  assert.equal(orderOf(c, 'OLD_ITEMS').status, 'in_progress')
  assert.equal(metaOf(c, 'OLD_ITEMS').needs_review, true)
  assert.ok(metaOf(c, 'OLD_ITEMS').review_reason)
  assert.equal(orderOf(c, 'OLD_EMPTY').status, 'cancelled')
  assert.equal(orderOf(c, 'NEW').status, 'in_progress')
  assert.equal(orderOf(c, 'OTHER_TABLE').status, 'in_progress')
  assert.equal(c.writes.filter((w: Row) => w.id === 'NEW' || w.id === 'OTHER_TABLE').length, 0)
})

test('0.1 checkout of the same session still closes the in_progress order even with items (no zombie)', async () => {
  const c = makeConnector({ orders: [tableOrder('SESSION')], 'order-items': [item('i1', 'SESSION')] })
  // completed order carries the same check_in, expressed as +07:00
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'COMPLETED', false, '2026-11-01T15:00:00+07:00')
  assert.equal(orderOf(c, 'SESSION').status, 'cancelled')
})

test('0.1 checkout of a different session never cancels another customer order with items', async () => {
  const c = makeConnector({ orders: [tableOrder('OTHER', { check_in: '2026-11-01T09:30:00.000Z' })], 'order-items': [item('i1', 'OTHER')] })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'COMPLETED', false, T0)
  assert.equal(orderOf(c, 'OTHER').status, 'in_progress')
  assert.equal(metaOf(c, 'OTHER').needs_review, true)
})

test('0.1 an order with paid_amount > 0 is never cancelled', async () => {
  const c = makeConnector({ orders: [tableOrder('PAID', { paid_amount: '50000' })], 'order-items': [] })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'X')
  assert.equal(orderOf(c, 'PAID').status, 'in_progress')
  assert.equal(metaOf(c, 'PAID').needs_review, true)
})

test('0.1 deactivated items do not count as items', async () => {
  const c = makeConnector({ orders: [tableOrder('A')], 'order-items': [item('i1', 'A', { active: 'FALSE' })] })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'X')
  assert.equal(orderOf(c, 'A').status, 'cancelled')
})

test('0.1 safeMode skips orders with items or payments without flagging, still cancels empty ones', async () => {
  const c = makeConnector({
    orders: [tableOrder('WITH_ITEMS'), tableOrder('PAID', { paid_amount: '1000' }), tableOrder('EMPTY')],
    'order-items': [item('i1', 'WITH_ITEMS')],
  })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'KEEP', true)
  assert.equal(orderOf(c, 'WITH_ITEMS').status, 'in_progress')
  assert.equal(metaOf(c, 'WITH_ITEMS').needs_review, undefined)
  assert.equal(orderOf(c, 'PAID').status, 'in_progress')
  assert.equal(orderOf(c, 'EMPTY').status, 'cancelled')
})

test('0.1 already-flagged orders are left alone (no repeated writes)', async () => {
  const c = makeConnector({ orders: [tableOrder('F', { meta: { needs_review: true } })], 'order-items': [] })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'X')
  assert.equal(orderOf(c, 'F').status, 'in_progress')
  assert.equal(c.writes.length, 0)
})

test('0.1 fails safe: if items cannot be read, the order is flagged instead of cancelled', async () => {
  const c = makeConnector({ orders: [tableOrder('A')] }, { failItemsList: true })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'T1', 'X')
  assert.equal(orderOf(c, 'A').status, 'in_progress')
  assert.equal(metaOf(c, 'A').needs_review, true)
})

test('0.1 takeaway resources are never touched', async () => {
  const c = makeConnector({ orders: [tableOrder('A', { resource_id: 'takeaway' })], 'order-items': [] })
  await cancelOrphanedInProgressOrdersForResource(c, 's', 'takeaway', 'X')
  assert.equal(c.writes.length, 0)
})

// ─── 0.1 / 0.2 reconcileShopTableSessions ─────────────────────────────────────

test('0.1 reconcile: order with items on an available table is flagged once, then ignored', async () => {
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'available', metadata: '{}' }],
    orders: [tableOrder('A')],
    'order-items': [item('i1', 'A')],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'A').status, 'in_progress')
  assert.equal(metaOf(c, 'A').needs_review, true)
  const writesAfterFirst = c.writes.length
  await reconcileShopTableSessions(c, 's')
  assert.equal(c.writes.length, writesAfterFirst, 'second pass must not write again')
})

test('0.1 reconcile: empty orphan older than 60s on an available table is still cancelled', async () => {
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'available', metadata: '{}' }],
    orders: [tableOrder('A')],
    'order-items': [],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'A').status, 'cancelled')
})

test('0.2 reconcile: grace window uses metadata.check_in, not created_at', async () => {
  const justNow = new Date(Date.now() - 10_000).toISOString()
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'available', metadata: '{}' }],
    // created_at is old (e.g. naive/skewed), but the session started 10s ago → mid-flight check-in
    orders: [tableOrder('A', { check_in: justNow, created_at: T0 })],
    'order-items': [],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'A').status, 'in_progress')
})

test('0.1 reconcile: duplicate sessions on an occupied table – older with items flagged, newest stays active', async () => {
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'occupied', current_order_id: 'NEWER', metadata: '{}' }],
    orders: [tableOrder('OLDER'), tableOrder('NEWER', { check_in: '2026-11-01T09:00:00.000Z' })],
    'order-items': [item('i1', 'OLDER')],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'OLDER').status, 'in_progress')
  assert.equal(metaOf(c, 'OLDER').needs_review, true)
  assert.equal(orderOf(c, 'NEWER').status, 'in_progress')
  assert.equal(c.db['location-resources'][0].current_order_id, 'NEWER')
})

test('0.1 reconcile: zombie of a session already paid (same check_in) is cancelled and table released', async () => {
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'occupied', current_order_id: 'ZOMBIE', metadata: JSON.stringify({ check_in: T0 }) }],
    orders: [
      tableOrder('ZOMBIE'),
      tableOrder('PAID', { status: 'completed', meta: { check_out: '2026-11-01T10:00:00.000Z' } }),
    ],
    'order-items': [item('i1', 'ZOMBIE')],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'ZOMBIE').status, 'cancelled')
  assert.equal(c.db['location-resources'][0].status, 'available')
})

test('0.1 reconcile: superseded by time only (different check_in) with items → flagged, never re-attached', async () => {
  const c = makeConnector({
    'location-resources': [{ id: 'T1', status: 'occupied', current_order_id: 'Z', metadata: '{}' }],
    orders: [
      tableOrder('Z'),
      tableOrder('PAID', { status: 'completed', check_in: '2026-11-01T07:00:00.000Z', meta: { check_out: '2026-11-01T10:00:00.000Z' } }),
    ],
    'order-items': [item('i1', 'Z')],
  })
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'Z').status, 'in_progress')
  assert.equal(metaOf(c, 'Z').needs_review, true)
  assert.equal(c.db['location-resources'][0].status, 'available')
  // next GET: flagged order must not be cancelled nor pulled back onto the table
  await reconcileShopTableSessions(c, 's')
  assert.equal(orderOf(c, 'Z').status, 'in_progress')
  assert.equal(c.db['location-resources'][0].current_order_id, '')
})

// ─── 0.4 preserveStaleTableSession ────────────────────────────────────────────

const staleBase = { order: { customer_name: 'Khách lẻ', branch_id: 'b1' }, localOrderId: 'LOCAL-1', resourceId: 'T1', isTimeCharge }

test('0.4 stale offline session unknown to server: items parked on a flagged order (time charge excluded)', async () => {
  const c = makeConnector({ orders: [], 'order-items': [] })
  const id = await preserveStaleTableSession(c, {
    ...staleBase,
    serverOrderId: '',
    items: [
      { product_id: 'P1', product_name: 'Bia', qty: 2, unit_price: 20000, line_total: 40000 },
      { product_id: 'P2', product_name: 'Lạc', qty: 1, unit_price: 15000, line_total: 15000 },
      { product_id: 'TIME_CHARGE', product_name: 'Tiền giờ bàn 1', qty: 1, unit_price: 60000, line_total: 60000 },
      { product_id: 'P3', product_name: 'Zero', qty: 0, unit_price: 1, line_total: 0 },
    ],
  })
  assert.ok(id)
  const o = orderOf(c, id)
  assert.equal(o.status, 'in_progress')
  assert.equal(o.reference_no, 'LOCAL-1')
  assert.equal(o.resource_id, 'T1')
  assert.equal(o.total_amount, '55000')
  assert.equal(metaOf(c, id).needs_review, true)
  assert.equal(metaOf(c, id).resource_id, 'T1')
  assert.deepEqual(c.db['order-items'].map((r: Row) => r.product_id).sort(), ['P1', 'P2'])
})

test('0.4 stale session with server order holding items: flagged, only missing items added', async () => {
  const c = makeConnector({ orders: [tableOrder('S')], 'order-items': [item('i1', 'S', { product_id: 'P1' })] })
  const id = await preserveStaleTableSession(c, {
    ...staleBase,
    serverOrderId: 'S',
    items: [
      { product_id: 'P1', product_name: 'Bia', qty: 3, unit_price: 20000, line_total: 60000 },
      { product_id: 'P2', product_name: 'Lạc', qty: 1, unit_price: 15000, line_total: 15000 },
    ],
  })
  assert.equal(id, 'S')
  assert.equal(orderOf(c, 'S').status, 'in_progress')
  assert.equal(metaOf(c, 'S').needs_review, true)
  assert.deepEqual(c.db['order-items'].filter((r: Row) => r.order_id === 'S').map((r: Row) => r.product_id).sort(), ['P1', 'P2'])
})

test('0.4 stale session where nothing holds data: server order cancelled as before', async () => {
  const c = makeConnector({ orders: [tableOrder('S')], 'order-items': [] })
  await preserveStaleTableSession(c, { ...staleBase, serverOrderId: 'S', items: [] })
  assert.equal(orderOf(c, 'S').status, 'cancelled')
})

test('0.4 stale session: empty server order but offline items → flagged, not cancelled', async () => {
  const c = makeConnector({ orders: [tableOrder('S')], 'order-items': [] })
  await preserveStaleTableSession(c, {
    ...staleBase,
    serverOrderId: 'S',
    items: [{ product_id: 'P1', product_name: 'Bia', qty: 1, unit_price: 20000, line_total: 20000 }],
  })
  assert.equal(orderOf(c, 'S').status, 'in_progress')
  assert.equal(metaOf(c, 'S').needs_review, true)
  assert.equal(c.db['order-items'].length, 1)
})

test('0.4 stale session with only a time charge creates nothing', async () => {
  const c = makeConnector({ orders: [], 'order-items': [] })
  const id = await preserveStaleTableSession(c, {
    ...staleBase,
    serverOrderId: '',
    items: [{ product_id: 'TIME_CHARGE', product_name: 'Tiền giờ', qty: 1, unit_price: 1, line_total: 1 }],
  })
  assert.equal(id, '')
  assert.equal(c.writes.length, 0)
})

test('0.4 retry after a lost response is idempotent (no duplicate items)', async () => {
  const c = makeConnector({ orders: [], 'order-items': [] })
  const items = [{ product_id: 'P1', product_name: 'Bia', qty: 1, unit_price: 20000, line_total: 20000 }]
  const id = await preserveStaleTableSession(c, { ...staleBase, serverOrderId: '', items })
  // second sync: sync-batch resolves serverId by reference_no → passes the parked id
  await preserveStaleTableSession(c, { ...staleBase, serverOrderId: id, items })
  assert.equal(c.db.orders.length, 1)
  assert.equal(c.db['order-items'].length, 1)
})

// ─── 0.3 syncExistingTableOrderLine ───────────────────────────────────────────

const line = (extra: Row = {}) => ({ product_id: 'P1', product_name: 'Bia', qty: 3, unit_price: 20000, line_total: 60000, ...extra })

test('0.3 while in_progress, food lines are never overwritten (no cross-device last-write-wins)', async () => {
  const c = makeConnector({ 'order-items': [item('i1', 'O')] })
  const changed = await syncExistingTableOrderLine(c, {
    item: line(), existingRows: c.db['order-items'], payloadItems: [line()], orderStatus: 'in_progress', isTimeCharge,
  })
  assert.equal(changed, false)
  assert.equal(c.writes.length, 0)
})

test('0.3 at checkout, a duplicate food line takes the paid qty/total, with rollback', async () => {
  const c = makeConnector({ 'order-items': [item('i1', 'O')] })
  const rollbacks: (() => Promise<void>)[] = []
  const changed = await syncExistingTableOrderLine(c, {
    item: line(), existingRows: c.db['order-items'], payloadItems: [line()], orderStatus: 'completed', isTimeCharge,
    onRollback: (fn) => rollbacks.push(fn),
  })
  assert.equal(changed, true)
  assert.equal(c.db['order-items'][0].qty, '3')
  assert.equal(c.db['order-items'][0].line_total, '60000')
  assert.equal(rollbacks.length, 1)
  await rollbacks[0]()
  assert.equal(c.db['order-items'][0].qty, '1')
  assert.equal(c.db['order-items'][0].line_total, '20000')
})

test('0.3 time-charge line is refreshed on every sync, even in_progress', async () => {
  const tc = { product_id: 'TIME_CHARGE_P', product_name: 'Tiền giờ bàn 1', qty: 1, unit_price: 90000, line_total: 90000 }
  const c = makeConnector({ 'order-items': [item('t1', 'O', { product_id: 'TIME_CHARGE_P', product_name: 'Tiền giờ bàn 1', unit_price: '60000', line_total: '60000' })] })
  const changed = await syncExistingTableOrderLine(c, {
    item: tc, existingRows: c.db['order-items'], payloadItems: [tc], orderStatus: 'in_progress', isTimeCharge,
  })
  assert.equal(changed, true)
  assert.equal(c.db['order-items'][0].line_total, '90000')
})

test('0.3 identical line → no write', async () => {
  const c = makeConnector({ 'order-items': [item('i1', 'O', { qty: '3', line_total: '60000' })] })
  const changed = await syncExistingTableOrderLine(c, {
    item: line(), existingRows: c.db['order-items'], payloadItems: [line()], orderStatus: 'completed', isTimeCharge,
  })
  assert.equal(changed, false)
  assert.equal(c.writes.length, 0)
})

test('0.3 variants of the same product are matched by line key', async () => {
  const c = makeConnector({
    'order-items': [item('S', 'O', { variant_label: 'Size S' }), item('L', 'O', { variant_label: 'Size L' })],
  })
  const payload = [line({ variant_label: 'Size S', qty: 1, line_total: 20000 }), line({ variant_label: 'Size L', qty: 2, line_total: 50000, unit_price: 25000 })]
  await syncExistingTableOrderLine(c, { item: payload[1], existingRows: c.db['order-items'], payloadItems: payload, orderStatus: 'completed', isTimeCharge })
  assert.equal(c.db['order-items'].find((r: Row) => r.item_id === 'L').qty, '2')
  assert.equal(c.db['order-items'].find((r: Row) => r.item_id === 'S').qty, '1')
})

test('0.3 ambiguous match (two server rows, no key match) → leave untouched', async () => {
  const c = makeConnector({
    'order-items': [item('A', 'O', { variant_label: 'X' }), item('B', 'O', { variant_label: 'Y' })],
  })
  const changed = await syncExistingTableOrderLine(c, {
    item: line({ variant_label: 'Z' }), existingRows: c.db['order-items'], payloadItems: [line({ variant_label: 'Z' })], orderStatus: 'completed', isTimeCharge,
  })
  assert.equal(changed, false)
})

test('0.3 single server row with legacy modifier formatting still matches (1↔1 fallback)', async () => {
  const c = makeConnector({ 'order-items': [item('A', 'O', { modifiers: '[{"group":"Đá","option":"Ít"}]' })] })
  const changed = await syncExistingTableOrderLine(c, {
    item: line({ modifiers: [{ option: 'Ít', group: 'Đá' }] }), existingRows: c.db['order-items'], payloadItems: [line()], orderStatus: 'completed', isTimeCharge,
  })
  assert.equal(changed, true)
})

test('0.3 inactive server rows are ignored', async () => {
  const c = makeConnector({ 'order-items': [item('A', 'O', { active: 'FALSE' })] })
  const changed = await syncExistingTableOrderLine(c, {
    item: line(), existingRows: c.db['order-items'], payloadItems: [line()], orderStatus: 'completed', isTimeCharge,
  })
  assert.equal(changed, false)
})

test('0.3 tableLineKey normalises empty modifiers and JSON formatting', () => {
  assert.equal(tableLineKey('P', '', undefined), tableLineKey('P', '', '[]'))
  assert.equal(tableLineKey('P', '', ''), tableLineKey('P', ' ', 'null'))
  assert.equal(tableLineKey('P', 'L', '[{"a":1}]'), tableLineKey('P', 'L', [{ a: 1 }]))
  assert.notEqual(tableLineKey('P', 'L', ''), tableLineKey('P', 'S', ''))
})

test('releasing a table strips the v2 session_id so a later legacy reopen is not mistaken for that session', async () => {
  const { cleanResourceSessionMetadata } = await import('../../apps/web/lib/server/tableSessionReconciler')
  const cleaned = JSON.parse(cleanResourceSessionMetadata(JSON.stringify({ session_id: 'S-old', check_in: 'x', advanced_pricing: { enabled: true } }), { last_checkout_time: 'y' }))
  assert.equal(cleaned.session_id, undefined)
  assert.equal(cleaned.check_in, undefined)
  assert.deepEqual(cleaned.advanced_pricing, { enabled: true })
  assert.equal(cleaned.last_checkout_time, 'y')
})
