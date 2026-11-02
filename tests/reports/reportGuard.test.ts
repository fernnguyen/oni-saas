import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

import { resetReportGuard, runReport } from '../../apps/web/lib/server/reports/reportGuard'

beforeEach(() => resetReportGuard())

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('identical requests in flight share one job', async () => {
  let calls = 0
  const job = async () => { calls++; await sleep(20); return calls }
  const results = await Promise.all([1, 2, 3].map(() => runReport('k', { ttlMs: 0 }, job)))
  assert.deepEqual(results, [1, 1, 1])
  assert.equal(calls, 1)
})

test('cached value is served until ttl; fresh bypasses it', async () => {
  let calls = 0
  const job = async () => ++calls
  assert.equal(await runReport('k', { ttlMs: 60_000 }, job), 1)
  assert.equal(await runReport('k', { ttlMs: 60_000 }, job), 1)
  assert.equal(await runReport('k', { ttlMs: 60_000, fresh: true }, job), 2)
  assert.equal(await runReport('k', { ttlMs: 60_000 }, job), 2)
})

test('at most 3 report jobs run at once', async () => {
  let active = 0
  let peak = 0
  const job = async () => { active++; peak = Math.max(peak, active); await sleep(15); active--; return true }
  await Promise.all(Array.from({ length: 10 }, (_, i) => runReport(`k${i}`, { ttlMs: 0 }, job)))
  assert.equal(peak, 3)
})

test('a failed job is not cached and releases its slot', async () => {
  await assert.rejects(runReport('k', { ttlMs: 60_000 }, async () => { throw new Error('boom') }))
  assert.equal(await runReport('k', { ttlMs: 60_000 }, async () => 'ok'), 'ok')
  const all = await Promise.all(Array.from({ length: 4 }, (_, i) => runReport(`x${i}`, { ttlMs: 0 }, async () => i)))
  assert.deepEqual(all, [0, 1, 2, 3])
})
