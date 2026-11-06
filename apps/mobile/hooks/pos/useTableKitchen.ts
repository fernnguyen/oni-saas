// Bar/Bếp (K3.5) — kitchen state of one table for the mobile POS: per-dish sent/ready, how much is
// still unsent, and a "Gửi bếp" fallback when a "Lưu & báo bếp" did not reach the kitchen.
// Inert (no requests) unless the branch has stations and the table runs table sync v2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import type { MobileTableSyncV2Api } from './useTableSyncV2';

export interface MobileTableKitchenStatus {
  enabled: boolean;
  unsent_lines: number;
  unsent_qty: number;
  items: Record<string, { sent: number; ready: number }>;
}

const EMPTY: MobileTableKitchenStatus = { enabled: false, unsent_lines: 0, unsent_qty: 0, items: {} };

export function useTableKitchen(
  shopId: string,
  sessionId: string,
  active: boolean,
  tableSync: MobileTableSyncV2Api | null,
) {
  const [status, setStatus] = useState<MobileTableKitchenStatus>(EMPTY);
  const [sending, setSending] = useState(false);
  const syncRef = useRef(tableSync);
  syncRef.current = tableSync;
  const reqId = useRef(0);
  const on = active && Boolean(shopId && sessionId);

  const refresh = useCallback(async () => {
    if (!on) return setStatus(EMPTY);
    const id = ++reqId.current;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/table-sessions/${sessionId}/kitchen`, {
        headers: await getApiHeaders(),
      });
      if (!res.ok) return;
      const json = (await res.json()) as MobileTableKitchenStatus;
      if (id === reqId.current) setStatus(json);
    } catch {
      /* offline: keep the last state */
    }
  }, [on, shopId, sessionId]);

  // Refresh on open, whenever the table changes on the server, and every 15 s while visible
  // (the kitchen ticking dishes does not change the table itself).
  const tick = tableSync?.changeTick ?? 0;
  useEffect(() => { void refresh(); }, [refresh, tick]);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [on, refresh]);

  /** Send everything unsent for this table. Returns the number of tickets, or null on failure. */
  const send = useCallback(async (): Promise<number | null> => {
    if (!on || sending) return null;
    setSending(true);
    try {
      const sync = syncRef.current;
      if (sync) {
        await sync.flush();
        if ((await sync.pendingCount(sessionId)) > 0) return null; // still offline
      }
      const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/table-sessions/${sessionId}/kitchen`, {
        method: 'POST',
        headers: await getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ device_id: sync?.deviceId || '' }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json?.status) setStatus(json.status);
      return Array.isArray(json?.tickets) ? json.tickets.length : 0;
    } catch {
      return null;
    } finally {
      setSending(false);
    }
  }, [on, sending, shopId, sessionId]);

  return { status, sending, refresh, send };
}

/** Qty of a cart line already on kitchen tickets (0 when unknown / not on the server yet). */
export function sentQtyOf(status: MobileTableKitchenStatus, serverItemId?: string): number {
  if (!status.enabled || !serverItemId) return 0;
  return Math.max(0, status.items[serverItemId]?.sent ?? 0);
}

export function kitchenBadge(status: MobileTableKitchenStatus, serverItemId: string | undefined, qty: number) {
  if (!status.enabled || qty <= 0) return null;
  const s = serverItemId ? status.items[serverItemId] : undefined;
  const sent = Math.max(0, s?.sent ?? 0);
  const ready = Math.max(0, s?.ready ?? 0);
  if (sent === 0) return { label: 'Chưa báo bếp', tone: 'amber' as const };
  if (sent < qty) return { label: `Chưa báo +${qty - sent}`, tone: 'amber' as const };
  if (ready >= sent) return { label: 'Bếp xong', tone: 'emerald' as const };
  return { label: ready > 0 ? `Đang làm ${ready}/${sent}` : 'Đang làm', tone: 'sky' as const };
}
