'use client';

// Bar/Bếp K3 — "Gửi bếp" for one table (web POS). Kept out of ResourceSlideOver on purpose:
// the slide-over only mounts the bar and the per-item badge. Inert (renders nothing, no requests
// beyond one status probe) when the branch has no station or the table is not a v2 session.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChefHat, Send } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import type { TableSyncV2Api } from '@/hooks/useTableSyncV2';

export interface TableKitchenStatus {
  enabled: boolean;
  unsent_lines: number;
  unsent_qty: number;
  items: Record<string, { sent: number; ready: number }>;
}

const EMPTY: TableKitchenStatus = { enabled: false, unsent_lines: 0, unsent_qty: 0, items: {} };

/**
 * Kitchen state of a table session. Refreshes when the table changes (v2 changeTick, local
 * pending ops) and when the kitchen ticks dishes (kitchen_<shopId> broadcast).
 */
export function useTableKitchen(shopId: string, sessionId: string, v2: TableSyncV2Api | null) {
  const [status, setStatus] = useState<TableKitchenStatus>(EMPTY);
  const [sending, setSending] = useState(false);
  const pendingLocal = v2 && sessionId ? v2.pendingFor(sessionId).filter((e) => e.kind === 'op').length : 0;
  const reqId = useRef(0);
  // useTableSyncV2 returns a new object every render: keep it in a ref so callbacks/effects
  // only depend on stable values (otherwise the status probe re-runs on every render).
  const v2Ref = useRef(v2);
  v2Ref.current = v2;
  const v2On = Boolean(v2);

  const refresh = useCallback(async () => {
    if (!v2On || !sessionId) return setStatus(EMPTY);
    const id = ++reqId.current;
    try {
      const res = await fetch(`/api/shops/${shopId}/table-sessions/${sessionId}/kitchen`);
      if (!res.ok) return; // 409 = no v2 / unsupported → stay hidden
      const json = (await res.json()) as TableKitchenStatus;
      if (id === reqId.current) setStatus(json);
    } catch { /* offline: keep last state */ }
  }, [shopId, sessionId, v2On]);

  // Table changed on the server, or this device's queue changed.
  const tick = v2?.changeTick ?? 0;
  useEffect(() => { void refresh(); }, [refresh, tick, pendingLocal]);

  // Kitchen ticked something → refresh the badges.
  useEffect(() => {
    if (!status.enabled) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel(`kitchen_${shopId}`).on('broadcast', { event: 'changes' }, () => void refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [shopId, status.enabled, refresh]);

  const send = useCallback(async () => {
    const v2 = v2Ref.current;
    if (!v2 || !sessionId || sending) return;
    setSending(true);
    try {
      // Items still in this device's outbox must reach the server first.
      await v2.flush();
      if ((await v2.pendingCount(sessionId)) > 0) {
        toast.warning('Chưa gửi được món lên máy chủ (mất mạng?). Thử lại khi có mạng.');
        return;
      }
      const res = await fetch(`/api/shops/${shopId}/table-sessions/${sessionId}/kitchen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: v2.deviceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Gửi bếp thất bại');
      if (json.status) setStatus(json.status);
      const n = Array.isArray(json.tickets) ? json.tickets.length : 0;
      if (n > 0) toast.success(`Đã gửi ${n} phiếu xuống bar/bếp`);
      else toast.info('Không có món mới để gửi');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [sessionId, sending, shopId]);

  return { status, sending, send, pendingLocal, refresh };
}

/** "Món chưa báo bếp (N) · Gửi bếp" — hidden when Bar/Bếp is off for this branch. */
export function TableKitchenBar({ kitchen }: { kitchen: ReturnType<typeof useTableKitchen> }) {
  const { status, sending, send, pendingLocal } = kitchen;
  if (!status.enabled) return null;
  const unsent = status.unsent_lines + pendingLocal;
  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${
        unsent > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <ChefHat className={`h-4 w-4 shrink-0 ${unsent > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
      <span className={`flex-1 text-xs font-medium ${unsent > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
        {unsent > 0 ? `Món chưa báo bếp: ${status.unsent_qty || unsent}` : 'Đã báo bếp đủ món'}
      </span>
      <button
        onClick={() => void send()}
        disabled={sending || unsent === 0}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-40 cursor-pointer"
      >
        <Send className="h-3.5 w-3.5" />
        {sending ? 'Đang gửi...' : 'Gửi bếp'}
      </button>
    </div>
  );
}

/** Per-line kitchen state next to the dish name. */
export function KitchenItemBadge({ status, itemId, qty }: { status: TableKitchenStatus; itemId?: string; qty: number }) {
  if (!status.enabled || qty <= 0) return null;
  const s = itemId && !itemId.startsWith('pending-') && !itemId.startsWith('temp-') ? status.items[itemId] : undefined;
  const sent = Math.max(0, s?.sent ?? 0);
  const ready = Math.max(0, s?.ready ?? 0);
  let label: string;
  let cls: string;
  if (sent === 0) {
    label = 'Chưa báo bếp';
    cls = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (sent < qty) {
    label = `Chưa báo +${qty - sent}`;
    cls = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (ready >= sent) {
    label = 'Bếp xong';
    cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else {
    label = ready > 0 ? `Đang làm ${ready}/${sent}` : 'Đang làm';
    cls = 'bg-sky-50 text-sky-700 border-sky-200';
  }
  return <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[10px] font-semibold ${cls}`}>{label}</span>;
}
