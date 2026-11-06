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
  items: Record<string, { sent: number; ready: number; unavailable?: number }>;
  unavailable_products?: string[];
}

const EMPTY: MobileTableKitchenStatus = { enabled: false, unsent_lines: 0, unsent_qty: 0, items: {}, unavailable_products: [] };

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

/** Qty of a line the kitchen reported sold out and the floor has not removed yet. */
export function soldOutQtyOf(status: MobileTableKitchenStatus, serverItemId?: string): number {
  if (!status.enabled || !serverItemId) return 0;
  return Math.max(0, status.items[serverItemId]?.unavailable ?? 0);
}

export function kitchenBadge(status: MobileTableKitchenStatus, serverItemId: string | undefined, qty: number) {
  if (!status.enabled || qty <= 0) return null;
  const s = serverItemId ? status.items[serverItemId] : undefined;
  const sent = Math.max(0, s?.sent ?? 0);
  const ready = Math.max(0, s?.ready ?? 0);
  const gone = Math.max(0, s?.unavailable ?? 0);
  if (gone > 0) return { label: gone >= sent ? 'Hết món' : `Hết ${gone}/${sent}`, tone: 'rose' as const };
  if (sent === 0) return { label: 'Chưa báo bếp', tone: 'amber' as const };
  if (sent < qty) return { label: `Chưa báo +${qty - sent}`, tone: 'amber' as const };
  if (ready >= sent) return { label: 'Bếp xong', tone: 'emerald' as const };
  return { label: ready > 0 ? `Đang làm ${ready}/${sent}` : 'Đang làm', tone: 'sky' as const };
}

/** Today's "Tạm hết" list of the branch (product ids). */
export async function fetchSoldOutProducts(shopId: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/kitchen/unavailable`, { headers: await getApiHeaders() });
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data.map((p: { product_id: string }) => p.product_id) : [];
  } catch {
    return null;
  }
}

/** "Đã có hàng": anyone at the POS can take a product off the list (SME: cashier = cook). */
export async function setProductBackInStock(shopId: string, productId: string, productName: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/kitchen/unavailable`, {
      method: 'POST',
      headers: await getApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ product_id: productId, product_name: productName, unavailable: false }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
