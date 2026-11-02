'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientTableOp, InboxItem, OpenSessionPayload, OutboxEntry } from '@oni/core'
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser'
import { getWebTableSyncClient, type WebTableSyncClient } from '@/lib/pos/tableSyncV2'

const RETRY_INTERVAL_MS = 15_000

/**
 * Table sync v2 for the web POS. Inert (returns `enabled: false`, no timers, no channel) unless
 * the shop has `table_sync_v2` on. `changeTick` increments whenever the server reports changes
 * for this shop, so table views can refetch.
 */
export function useTableSyncV2(shopId: string, enabled: boolean) {
  const clientRef = useRef<WebTableSyncClient | null>(null)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])
  const [changeTick, setChangeTick] = useState(0)
  const [lastChangedSessions, setLastChangedSessions] = useState<string[]>([])

  const client = enabled && shopId ? (clientRef.current ??= getWebTableSyncClient(shopId)) : null

  const refreshState = useCallback(async () => {
    if (!client) return
    setInbox(await client.storage.loadInbox())
    setOutbox(await client.storage.loadOutbox())
  }, [client])

  const catchUp = useCallback(async () => {
    if (!client) return
    try {
      const { events } = await client.catchUp()
      if (events.length > 0) {
        setLastChangedSessions(Array.from(new Set(events.map((e) => String(e.session_id)))))
        setChangeTick((t) => t + 1)
      }
    } catch {
      // offline: the next reconnect or broadcast retries
    }
  }, [client])

  const flush = useCallback(async () => {
    if (!client) return
    try {
      await client.flush()
    } finally {
      await refreshState()
    }
  }, [client, refreshState])

  useEffect(() => {
    if (!client) return
    void refreshState()
    const unsubscribe = client.subscribe(() => { void refreshState() })
    const onOnline = () => { void flush().then(catchUp) }
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => {
      if (navigator.onLine) void client.outbox.pending().then((p) => { if (p.length > 0) void flush() })
    }, RETRY_INTERVAL_MS)
    void flush().then(catchUp)

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`table_sync_${shopId}`)
      .on('broadcast', { event: 'changes' }, () => { void catchUp() })
      .subscribe()

    return () => {
      unsubscribe()
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [client, shopId, flush, catchUp, refreshState])

  const openSession = useCallback(async (payload: Omit<OpenSessionPayload, 'session_id'> & { session_id?: string }) => {
    if (!client) throw new Error('table_sync_v2 disabled')
    const sessionId = await client.outbox.enqueueOpen(payload)
    void flush()
    return sessionId
  }, [client, flush])

  const enqueueOps = useCallback(async (sessionId: string, ops: ClientTableOp[]) => {
    if (!client) throw new Error('table_sync_v2 disabled')
    const ids = await client.outbox.enqueueOps(sessionId, ops)
    void flush()
    return ids
  }, [client, flush])

  const pendingCount = useCallback(async (sessionId: string) => {
    if (!client) return 0
    return (await client.outbox.pending(sessionId)).length
  }, [client])

  const discardSession = useCallback(async (sessionId: string) => {
    if (!client) return
    await client.outbox.discardSession(sessionId)
    await refreshState()
  }, [client, refreshState])

  const resolveInbox = useCallback(async (ids: string[]) => {
    if (!client) return
    await client.outbox.resolveInbox(ids)
    await refreshState()
  }, [client, refreshState])

  return {
    enabled: Boolean(client),
    deviceId: client?.deviceId || '',
    inbox,
    outbox,
    pendingFor: (sessionId: string) => outbox.filter((e) => e.session_id === sessionId),
    changeTick,
    lastChangedSessions,
    openSession,
    enqueueOps,
    flush,
    catchUp,
    pendingCount,
    discardSession,
    resolveInbox,
  }
}

export type TableSyncV2Api = ReturnType<typeof useTableSyncV2>
