import assert from 'node:assert/strict'
import test from 'node:test'

import { requireTableSyncV2 } from '../../apps/web/lib/server/tableSync/service'

// v2 is on by default where the connector supports transactions; kill switch turns it off.

const pgLike = { withTransaction: async (fn: any) => fn({}) } as any
const sheetsLike = { list: async () => ({ data: [] }) } as any

test('Postgres-like connector → v2 available without any shop flag', async () => {
  delete process.env.TABLE_SYNC_V2_DISABLED
  assert.equal(await requireTableSyncV2('shop-1', pgLike), pgLike)
})

test('connector without transactions (Sheets/MySQL) → 409 unsupported (client falls back to legacy)', async () => {
  delete process.env.TABLE_SYNC_V2_DISABLED
  await assert.rejects(requireTableSyncV2('shop-1', sheetsLike), (e: any) => e.status === 409 && e.code === 'table_sync_v2_unsupported')
})

test('TABLE_SYNC_V2_DISABLED=true → 409 disabled for everyone', async () => {
  process.env.TABLE_SYNC_V2_DISABLED = 'true'
  try {
    await assert.rejects(requireTableSyncV2('shop-1', pgLike), (e: any) => e.status === 409 && e.code === 'table_sync_v2_disabled')
  } finally {
    delete process.env.TABLE_SYNC_V2_DISABLED
  }
})
