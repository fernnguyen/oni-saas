import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClientTableOp, InboxItem, OpenSessionPayload, OutboxEntry } from '@oni/core';
import { supabase } from '../../lib/supabase';
import { callTableSessionApi, getMobileTableSyncClient, type MobileTableSyncClient } from '../../lib/pos/tableSyncV2';

const RETRY_INTERVAL_MS = 15_000;
const availabilityKey = (shopId: string) => `table_sync_v2:${shopId}:available`;

/**
 * Table sync v2 for the mobile POS (mirror of apps/web/hooks/useTableSyncV2.ts).
 * v2 is used wherever the server supports it: the hook probes `table-sessions/changes` (200 → v2,
 * 409 unsupported/disabled or any error → legacy flow) and remembers the answer for offline
 * starts. While unavailable it is inert. `changeTick` bumps whenever the server reports changes.
 */
export function useTableSyncV2(shopId: string, allowed: boolean, isOnline: boolean) {
  const [client, setClient] = useState<MobileTableSyncClient | null>(null);
  const [available, setAvailable] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [changeTick, setChangeTick] = useState(0);
  const [lastChangedSessions, setLastChangedSessions] = useState<string[]>([]);
  const flushingRef = useRef<Promise<void> | null>(null);

  // Capability probe (re-run when connectivity returns)
  useEffect(() => {
    if (!allowed || !shopId) return;
    let cancelled = false;
    AsyncStorage.getItem(availabilityKey(shopId))
      .then((v) => { if (!cancelled && v === 'true') setAvailable(true); })
      .catch(() => {});
    if (!isOnline) return () => { cancelled = true; };
    callTableSessionApi(shopId, '/changes?since=0&limit=1', 'GET')
      .then((res) => {
        if (cancelled) return;
        const ok = res.status === 200;
        setAvailable(ok);
        AsyncStorage.setItem(availabilityKey(shopId), ok ? 'true' : 'false').catch(() => {});
      })
      .catch(() => { /* offline: keep the remembered answer */ });
    return () => { cancelled = true; };
  }, [allowed, shopId, isOnline]);

  const enabled = allowed && available && !!shopId;

  useEffect(() => {
    if (!enabled) { setClient(null); return; }
    let cancelled = false;
    getMobileTableSyncClient(shopId).then((c) => { if (!cancelled) setClient(c); });
    return () => { cancelled = true; };
  }, [enabled, shopId]);

  const refreshState = useCallback(async () => {
    if (!client) return;
    setInbox(await client.storage.loadInbox());
    setOutbox(await client.storage.loadOutbox());
  }, [client]);

  const catchUp = useCallback(async () => {
    if (!client) return;
    try {
      const { events } = await client.catchUp();
      if (events.length > 0) {
        setLastChangedSessions(Array.from(new Set(events.map((e: any) => String(e.session_id)))));
        setChangeTick((t) => t + 1);
      }
    } catch {
      // offline: next reconnect / broadcast retries
    }
  }, [client]);

  /** Single-flight flush within this app process */
  const flush = useCallback(async () => {
    if (!client) return;
    if (flushingRef.current) return flushingRef.current;
    const run = (async () => {
      try { await client.outbox.flush(); } catch {} finally { await refreshState(); }
    })();
    flushingRef.current = run.finally(() => { flushingRef.current = null; });
    return flushingRef.current;
  }, [client, refreshState]);

  useEffect(() => {
    if (!client) return;
    void refreshState();
    const unsubscribe = client.subscribe(() => { void refreshState(); });
    void flush().then(catchUp);

    const timer = setInterval(() => {
      void client.outbox.pending().then((p) => { if (p.length > 0) void flush(); });
    }, RETRY_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush().then(catchUp);
    });
    const channel = supabase
      .channel(`table_sync_${shopId}`)
      .on('broadcast', { event: 'changes' }, () => { void catchUp(); })
      .subscribe();

    return () => {
      unsubscribe();
      clearInterval(timer);
      appStateSub.remove();
      void supabase.removeChannel(channel);
    };
  }, [client, shopId, flush, catchUp, refreshState]);

  // Connectivity regained → send what is queued, then catch up
  useEffect(() => {
    if (client && isOnline) void flush().then(catchUp);
  }, [client, isOnline, flush, catchUp]);

  const openSession = useCallback(async (payload: Omit<OpenSessionPayload, 'session_id'> & { session_id?: string }) => {
    if (!client) throw new Error('table_sync_v2 disabled');
    const sessionId = await client.outbox.enqueueOpen(payload);
    void flush();
    return sessionId;
  }, [client, flush]);

  const enqueueOps = useCallback(async (sessionId: string, ops: ClientTableOp[]) => {
    if (!client) throw new Error('table_sync_v2 disabled');
    const ids = await client.outbox.enqueueOps(sessionId, ops);
    void flush();
    return ids;
  }, [client, flush]);

  const pendingCount = useCallback(async (sessionId: string) => {
    if (!client) return 0;
    return (await client.outbox.pending(sessionId)).length;
  }, [client]);

  const pendingOpsFor = useCallback(async (sessionId: string): Promise<ClientTableOp[]> => {
    if (!client) return [];
    return (await client.outbox.pending(sessionId)).flatMap((e) => (e.kind === 'op' ? [e.op] : []));
  }, [client]);

  const discardSession = useCallback(async (sessionId: string) => {
    if (!client) return;
    await client.outbox.discardSession(sessionId);
    await refreshState();
  }, [client, refreshState]);

  const resolveInbox = useCallback(async (ids: string[]) => {
    if (!client) return;
    await client.outbox.resolveInbox(ids);
    await refreshState();
  }, [client, refreshState]);

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
    pendingOpsFor,
    discardSession,
    resolveInbox,
  };
}

export type MobileTableSyncV2Api = ReturnType<typeof useTableSyncV2>;
