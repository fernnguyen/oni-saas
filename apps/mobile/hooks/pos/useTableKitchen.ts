// Bar/Bếp (K3.5) — kitchen state of one table for the mobile POS: per-dish sent/ready, how much is
// still unsent, and a "Gửi bếp" fallback when a "Lưu & báo bếp" did not reach the kitchen.
// Inert (no requests) unless the branch has stations and the table runs table sync v2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { kitchenDestinationLabel } from '@oni/core';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import type { MobileTableSyncV2Api } from './useTableSyncV2';

export interface MobileTableKitchenStatus {
  enabled: boolean;
  unsent_lines: number;
  unsent_qty: number;
  items: Record<string, { sent: number; ready: number; unavailable?: number; station_name?: string; station_kind?: string }>;
  unavailable_products?: string[];
  /** where the next send goes / every station of the branch (labels: "Gửi Bar") */
  unsent_stations?: { id: string; name: string; kind: string }[];
  stations?: { id: string; name: string; kind: string }[];
}

/** Station names for labels: the stations of the unsent dishes, else every station of the branch. */
export function kitchenDest(status: MobileTableKitchenStatus): string {
  return kitchenDestinationLabel(status.unsent_stations?.length ? status.unsent_stations : status.stations ?? []);
}

/** Station of one dish ("Bar"), or the only station of the branch; '' when unknown. */
export function itemStationName(status: MobileTableKitchenStatus, serverItemId?: string): string {
  const own = serverItemId ? status.items[serverItemId]?.station_name : '';
  if (own) return own;
  return status.stations?.length === 1 ? status.stations[0].name : '';
}

/** Part of a cut into sent dishes that the station already made (cancels come off the rest first). */
export function madeQtyOf(status: MobileTableKitchenStatus, serverItemId: string | undefined, voidQty: number): number {
  if (!status.enabled || !serverItemId || voidQty <= 0) return 0;
  const s = status.items[serverItemId];
  const sent = Math.max(0, s?.sent ?? 0);
  const ready = Math.min(sent, Math.max(0, s?.ready ?? 0));
  return Math.max(0, voidQty - (sent - ready));
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
  const where = itemStationName(status, serverItemId);
  if (gone > 0) return { label: gone >= sent ? 'Hết món' : `Hết ${gone}/${sent}`, tone: 'rose' as const };
  if (sent === 0) return { label: where ? `Chưa báo ${where}` : 'Chưa báo', tone: 'amber' as const };
  if (sent < qty) return { label: `Chưa báo +${qty - sent}`, tone: 'amber' as const };
  if (ready >= sent) return { label: where ? `${where} xong` : 'Đã xong', tone: 'emerald' as const };
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
