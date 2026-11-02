// Mobile binding of the shared table sync v2 client (@oni/core tableSync/client).
// Same model as the web POS (apps/web/lib/pos/tableSyncV2.ts): one persistent outbox per shop,
// written BEFORE any network call, sent in order per session, idempotent by op_id.
// Storage is AsyncStorage (small JSON blobs per shop). Only used for table/room/court flows when
// the server supports v2; retail never touches this module.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  catchUpTableChanges,
  createTableSyncOutbox,
  generateClientId,
  type InboxItem,
  type OutboxEntry,
  type TableSyncOutbox,
  type TableSyncStorage,
  type TableSyncTransport,
  type TransportResponse,
} from '@oni/core';
import { getApiBaseUrl, getApiHeaders } from '../api/config';

const keyOf = (shopId: string, part: string) => `table_sync_v2:${shopId}:${part}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[tableSyncV2] AsyncStorage write failed:', err);
  }
}

export function createAsyncStorageTableSyncStorage(shopId: string): TableSyncStorage {
  return {
    loadOutbox: () => readJson<OutboxEntry[]>(keyOf(shopId, 'outbox'), []),
    saveOutbox: (entries) => writeJson(keyOf(shopId, 'outbox'), entries),
    loadInbox: () => readJson<InboxItem[]>(keyOf(shopId, 'inbox'), []),
    saveInbox: (items) => writeJson(keyOf(shopId, 'inbox'), items),
    loadCursor: async () => Number(await readJson<number>(keyOf(shopId, 'cursor'), 0)) || 0,
    saveCursor: (cursor) => writeJson(keyOf(shopId, 'cursor'), cursor),
  };
}

let cachedDeviceId = '';
export async function getTableSyncDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const key = 'table_sync_v2:device_id';
  let id = await readJson<string>(key, '');
  if (!id) {
    id = `mobile-${generateClientId()}`;
    await writeJson(key, id);
  }
  cachedDeviceId = id;
  return id;
}

/**
 * Transport over the v2 REST endpoints. The API base URL is resolved per call because the app
 * lets users switch servers at runtime. Network errors reject (→ outbox keeps the entry).
 */
export function createMobileTableSyncTransport(shopId: string, timeoutMs = 15000): TableSyncTransport {
  const call = async (path: string, method: 'GET' | 'POST', body?: unknown): Promise<TransportResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = (await getApiHeaders({ 'Content-Type': 'application/json' })) as Record<string, string>;
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${encodeURIComponent(shopId)}/table-sessions${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, body: json };
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    openSession: (payload) => call('/open', 'POST', payload),
    sendOps: (sessionId, body) => call(`/${encodeURIComponent(sessionId)}/ops`, 'POST', body),
    getChanges: (since, limit = 500) => call(`/changes?since=${since}&limit=${limit}`, 'GET'),
  };
}

/** Direct (non-queued) calls that need an immediate server answer: quote / transfer / cancel / snapshot */
export async function callTableSessionApi(
  shopId: string,
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown
): Promise<TransportResponse> {
  const headers = (await getApiHeaders({ 'Content-Type': 'application/json' })) as Record<string, string>;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/shops/${encodeURIComponent(shopId)}/table-sessions${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

export interface MobileTableSyncClient {
  shopId: string;
  deviceId: string;
  storage: TableSyncStorage;
  transport: TableSyncTransport;
  outbox: TableSyncOutbox;
  catchUp: () => Promise<{ events: any[]; cursor: number }>;
  subscribe: (fn: () => void) => () => void;
}

const clients = new Map<string, Promise<MobileTableSyncClient>>();

export function getMobileTableSyncClient(shopId: string): Promise<MobileTableSyncClient> {
  const existing = clients.get(shopId);
  if (existing) return existing;
  const created = (async () => {
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((fn) => { try { fn(); } catch {} });
    const storage = createAsyncStorageTableSyncStorage(shopId);
    const transport = createMobileTableSyncTransport(shopId);
    const deviceId = await getTableSyncDeviceId();
    const outbox = createTableSyncOutbox({ storage, transport, deviceId, onInboxChange: notify, onOutboxChange: notify });
    return {
      shopId,
      deviceId,
      storage,
      transport,
      outbox,
      catchUp: () => catchUpTableChanges(transport, storage),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    };
  })();
  clients.set(shopId, created);
  return created;
}
