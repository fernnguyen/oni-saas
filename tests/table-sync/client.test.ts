import assert from 'node:assert/strict'
import test from 'node:test'

import {
  catchUpTableChanges,
  createTableSyncOutbox,
  projectTableLines,
  tableSyncLineKey,
  type InboxItem,
  type OutboxEntry,
  type TableSyncStorage,
  type TableSyncTransport,
  type TransportResponse,
} from '../../packages/core/src/tableSync/client'
import { tableLineKey } from '../../apps/web/lib/server/tableSessionReconciler'

// Plan: docs/TABLE-SESSION-SYNC-PLAN.md 1.4 / 1.5 – client outbox, inbox, change-feed catch-up.

function memoryStorage(): TableSyncStorage & { outbox: OutboxEntry[]; inboxItems: InboxItem[]; cursor: number; writes: number } {
  const s = {
    outbox: [] as OutboxEntry[], inboxItems: [] as InboxItem[], cursor: 0, writes: 0,
    async loadOutbox() { return JSON.parse(JSON.stringify(s.outbox)) },
    async saveOutbox(e: OutboxEntry[]) { s.outbox = JSON.parse(JSON.stringify(e)); s.writes++ },
    async loadInbox() { return JSON.parse(JSON.stringify(s.inboxItems)) },
    async saveInbox(i: InboxItem[]) { s.inboxItems = JSON.parse(JSON.stringify(i)) },
    async loadCursor() { return s.cursor },
    async saveCursor(c: number) { s.cursor = c },
  }
  return s
}

type Handler = (kind: 'open' | 'ops' | 'changes', arg: any) => TransportResponse | Promise<TransportResponse>

function mockTransport(handler: Handler): TableSyncTransport & { calls: { kind: string; arg: any }[] } {
  const calls: { kind: string; arg: any }[] = []
  return {
    calls,
    async openSession(p) { calls.push({ kind: 'open', arg: p }); return handler('open', p) },
    async sendOps(sessionId, body) { calls.push({ kind: 'ops', arg: { sessionId, ...body } }); return handler('ops', { sessionId, ...body }) },
    async getChanges(since, limit) { calls.push({ kind: 'changes', arg: { since, limit } }); return handler('changes', { since, limit }) },
  }
}

const applyAll: Handler = (kind, arg) => {
  if (kind === 'open') return { status: 201, body: { created: true } }
  if (kind === 'ops') return { status: 200, body: { results: arg.ops.map((o: any) => ({ op_id: o.op_id, status: 'applied' })) } }
  return { status: 200, body: { events: [], cursor: 0, has_more: false } }
}

let idSeq = 0
const genId = () => `id-${++idSeq}`
const beer = { type: 'add_item' as const, product_id: 'P1', product_name: 'Bia', unit_price: 20000, qty: 1 }

test('line key is byte-identical to the server implementation', () => {
  const cases: [unknown, unknown, unknown][] = [['P1', '', undefined], ['P1', ' Size L ', '[]'], ['P1', 'L', [{ a: 1 }]], ['P1', 'L', '[{"a":1}]'], ['P', '', 'null'], ['P', '', 'raw-string']]
  for (const [p, v, m] of cases) assert.equal(tableSyncLineKey(p, v, m), tableLineKey(p, v, m))
})

test('ops are persisted before any network call (offline-first)', async () => {
  const storage = memoryStorage()
  let sawPersisted = false
  const transport = mockTransport((kind, arg) => {
    if (kind === 'ops') sawPersisted = storage.outbox.some((e) => e.kind === 'op' && e.op.op_id === arg.ops[0].op_id)
    return applyAll(kind, arg)
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer])
  assert.equal(storage.outbox.length, 1)
  await outbox.flush()
  assert.equal(sawPersisted, true)
  assert.equal(storage.outbox.length, 0)
})

test('offline: nothing is lost, op_ids stay the same on retry, then drain in order', async () => {
  const storage = memoryStorage()
  let online = false
  const transport = mockTransport((kind, arg) => {
    if (!online) throw new Error('network down')
    return applyAll(kind, arg)
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  const ids = await outbox.enqueueOps('S1', [beer, { type: 'change_qty', line_key: 'k', delta: 2 }])
  const r1 = await outbox.flush()
  assert.equal(r1.offline, true)
  assert.equal(storage.outbox.length, 2)
  assert.ok(storage.outbox.every((e) => e.attempts === 1))
  online = true
  await outbox.flush()
  const sent = transport.calls.filter((c) => c.kind === 'ops')
  assert.deepEqual(sent[sent.length - 1].arg.ops.map((o: any) => o.op_id), ids)
  assert.equal(storage.outbox.length, 0)
})

test('lost response: resending the same op_ids is safe and clears the queue when the server says replayed', async () => {
  const storage = memoryStorage()
  let first = true
  const serverSeen = new Set<string>()
  const transport = mockTransport((kind, arg) => {
    if (kind !== 'ops') return applyAll(kind, arg)
    const results = arg.ops.map((o: any) => {
      const replayed = serverSeen.has(o.op_id)
      serverSeen.add(o.op_id)
      return { op_id: o.op_id, status: 'applied', replayed }
    })
    if (first) { first = false; throw new Error('timeout after server applied') }
    return { status: 200, body: { results } }
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer])
  await outbox.flush()
  assert.equal(storage.outbox.length, 1)
  await outbox.flush()
  assert.equal(storage.outbox.length, 0)
  assert.equal(serverSeen.size, 1)
})

test("offline open: open is sent before that session's ops", async () => {
  const storage = memoryStorage()
  const transport = mockTransport(applyAll)
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  const sid = await outbox.enqueueOpen({ resource_id: 'T1', check_in: '2026-11-02T01:00:00Z' })
  await outbox.enqueueOps(sid, [beer])
  await outbox.flush()
  assert.deepEqual(transport.calls.map((c) => c.kind), ['open', 'ops'])
  assert.equal(transport.calls[0].arg.session_id, sid)
  assert.equal(transport.calls[0].arg.device_id, 'dev-A')
})

test('open conflict (another device opened the table): the whole session goes to the inbox, other sessions continue', async () => {
  const storage = memoryStorage()
  const transport = mockTransport((kind, arg) => {
    if (kind === 'open' && arg.resource_id === 'T1') return { status: 409, body: { error: 'resource_occupied', existing_session: { id: 'OTHER' } } }
    return applyAll(kind, arg)
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  const s1 = await outbox.enqueueOpen({ resource_id: 'T1', check_in: '2026-11-02T01:00:00Z' })
  await outbox.enqueueOps(s1, [beer, beer])
  await outbox.enqueueOps('S-other', [beer])
  const r = await outbox.flush()
  assert.deepEqual(r.blocked_sessions, [s1])
  assert.equal(storage.outbox.length, 0)
  assert.equal(storage.inboxItems.length, 3)
  assert.ok(storage.inboxItems.every((i) => i.kind === 'open_conflict' && i.reason === 'resource_occupied'))
  assert.ok(transport.calls.some((c) => c.kind === 'ops' && c.arg.sessionId === 'S-other'))
})

test('rejected ops (closed session) move to the inbox; applied ones are cleared', async () => {
  const storage = memoryStorage()
  const transport = mockTransport((kind, arg) => {
    if (kind !== 'ops') return applyAll(kind, arg)
    return { status: 200, body: { results: arg.ops.map((o: any, i: number) => (i === 0 ? { op_id: o.op_id, status: 'applied' } : { op_id: o.op_id, status: 'rejected', reason: 'session_not_open' })) } }
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer, beer])
  const r = await outbox.flush()
  assert.equal(r.applied, 1)
  assert.equal(r.rejected, 1)
  assert.equal(storage.outbox.length, 0)
  assert.equal(storage.inboxItems[0].reason, 'session_not_open')
  await outbox.resolveInbox([storage.inboxItems[0].id])
  assert.equal(storage.inboxItems.length, 0)
})

test('5xx and v2-disabled 409 keep the queue; 404 session moves to inbox (no infinite retry)', async () => {
  const storage = memoryStorage()
  let status = 503
  const transport = mockTransport((kind, arg) => (kind === 'ops' ? { status, body: { error: status === 404 ? 'session_not_found' : 'x' } } : applyAll(kind, arg)))
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer])
  await outbox.flush()
  status = 409
  await outbox.flush()
  assert.equal(storage.outbox.length, 1)
  assert.equal(storage.outbox[0].attempts, 2)
  status = 404
  await outbox.flush()
  assert.equal(storage.outbox.length, 0)
  assert.equal(storage.inboxItems[0].kind, 'session_missing')
})

test('ops the server did not report are kept for the next flush', async () => {
  const storage = memoryStorage()
  const transport = mockTransport((kind, arg) => (kind === 'ops' ? { status: 200, body: { results: [{ op_id: arg.ops[0].op_id, status: 'applied' }] } } : applyAll(kind, arg)))
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer, beer])
  await outbox.flush()
  assert.equal(storage.outbox.length, 1)
})

test('concurrent flush() calls share one run; ops enqueued during a flush are not lost', async () => {
  const storage = memoryStorage()
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let opsCalls = 0
  const transport = mockTransport(async (kind, arg) => {
    if (kind === 'ops') { opsCalls++; if (opsCalls === 1) await gate }
    return applyAll(kind, arg)
  })
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', [beer])
  const f1 = outbox.flush()
  const f2 = outbox.flush()
  assert.equal(f1, f2)
  await new Promise((r) => setTimeout(r, 5))
  await outbox.enqueueOps('S1', [{ ...beer, product_id: 'P2' }])
  release()
  await f1
  assert.equal(storage.outbox.length, 1, 'late op still queued')
  await outbox.flush()
  assert.equal(storage.outbox.length, 0)
})

test('batches are capped at 200 ops per request', async () => {
  const storage = memoryStorage()
  const transport = mockTransport(applyAll)
  const outbox = createTableSyncOutbox({ storage, transport, deviceId: 'dev-A', generateId: genId })
  await outbox.enqueueOps('S1', Array.from({ length: 250 }, () => beer))
  await outbox.flush()
  await outbox.flush()
  const sizes = transport.calls.filter((c) => c.kind === 'ops').map((c) => c.arg.ops.length)
  assert.deepEqual(sizes, [200, 50])
  assert.equal(storage.outbox.length, 0)
})

test('change feed catch-up pages until has_more is false and persists the cursor', async () => {
  const storage = memoryStorage()
  storage.cursor = 10
  const transport = mockTransport((kind, arg) => {
    if (kind !== 'changes') return applyAll(kind, arg)
    if (arg.since === 10) return { status: 200, body: { events: [{ seq: 11 }, { seq: 12 }], cursor: 12, has_more: true } }
    return { status: 200, body: { events: [{ seq: 13 }], cursor: 13, has_more: false } }
  })
  const r = await catchUpTableChanges(transport, storage)
  assert.deepEqual(r.events.map((e) => e.seq), [11, 12, 13])
  assert.equal(storage.cursor, 13)
})

test('projection: confirmed server lines + pending ops = what the cashier sees', () => {
  const server = [
    { item_id: 'L1', product_id: 'P1', product_name: 'Bia', qty: '2', unit_price: '20000', active: 'TRUE' },
    { item_id: 'L2', product_id: 'P2', product_name: 'Lạc', qty: '1', unit_price: '15000', active: 'TRUE' },
    { item_id: 'L3', product_id: 'P3', product_name: 'Cũ', qty: '1', unit_price: '1', active: 'FALSE' },
  ]
  const view = projectTableLines(server, [
    beer,
    { type: 'remove_item', item_id: 'L2' },
    { type: 'add_item', product_id: 'P4', product_name: 'Coca', unit_price: 15000, qty: 2 },
    { type: 'change_qty', line_key: tableSyncLineKey('P4', '', ''), delta: -1 },
  ])
  assert.deepEqual(view.map((l) => [l.product_id, l.qty, l.pending]), [['P1', 3, true], ['P4', 1, true]])
})
