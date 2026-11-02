// Server-side realtime notification for table sync v2 (plan 1.5). Clients subscribe to the
// `table_sync_<shopId>` broadcast channel and, on any message, call
// `GET table-sessions/changes?since=<their cursor>`; the payload is only a hint, never the data.
// Uses Supabase's REST broadcast endpoint (no socket subscription needed). Best-effort: a
// failure here never fails the write, because clients also catch up via the change feed.

import { env } from '../../env'

export interface TableSyncBroadcast {
  cursor?: number
  session_id: string
  resource_id?: string
  kind: string
  version?: number
}

export function tableSyncChannel(shopId: string) {
  return `table_sync_${shopId}`
}

export async function broadcastTableSync(shopId: string, message: TableSyncBroadcast): Promise<void> {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url.includes('placeholder')) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: tableSyncChannel(shopId), event: 'changes', payload: message }] }),
      signal: controller.signal,
    })
  } catch (err) {
    console.warn('[tableSync] broadcast failed (clients will catch up via change feed):', err)
  } finally {
    clearTimeout(timer)
  }
}
