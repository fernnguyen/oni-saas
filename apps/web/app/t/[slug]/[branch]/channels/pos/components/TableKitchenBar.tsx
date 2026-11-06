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
  items: Record<string, { sent: number; ready: number; unavailable?: number }>;
  unavailable_products?: string[];
}

const EMPTY: TableKitchenStatus = { enabled: false, unsent_lines: 0, unsent_qty: 0, items: {}, unavailable_products: [] };

/**
 * Kitchen state of a table session. Refreshes when the table changes (v2 changeTick, local
 * pending ops) and when the kitchen ticks dishes (kitchen_<shopId> broadcast).
 */
export function useTableKitchen(
  shopId: string,
  sessionId: string,
  v2: TableSyncV2Api | null,
  opts: { canVoid?: boolean } = {},
) {
  const [status, setStatus] = useState<TableKitchenStatus>(EMPTY);
  const [sending, setSending] = useState(false);
  /** Dish notes typed before "Gửi bếp" (order_item_id → note); sent with the next send. */
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** Open "reason for cancelling a dish already sent" prompt, resolved by VoidReasonDialog. */
  const [voidAsk, setVoidAsk] = useState<{ name: string; qty: number; resolve: (reason: string | null) => void } | null>(null);
  const canVoid = Boolean(opts.canVoid);
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
        body: JSON.stringify({
          device_id: v2.deviceId,
          notes: Object.fromEntries(Object.entries(notes).filter(([, n]) => n.trim())),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Gửi bếp thất bại');
      if (json.status) setStatus(json.status);
      setNotes({});
      const n = Array.isArray(json.tickets) ? json.tickets.length : 0;
      if (n > 0) toast.success(`Đã gửi ${n} phiếu xuống bar/bếp`);
      else toast.info('Không có món mới để gửi');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [sessionId, sending, shopId, notes]);

  /** "Đã có hàng": take a product off today's sold-out list from the POS (no kitchen/manager needed). */
  const setBackInStock = useCallback(async (productId: string, productName: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/shops/${shopId}/kitchen/unavailable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_name: productName, unavailable: false }),
      });
      if (!res.ok) throw new Error();
      setStatus((st) => ({ ...st, unavailable_products: (st.unavailable_products || []).filter((id) => id !== productId) }));
      return true;
    } catch {
      toast.error('Chưa bỏ được trạng thái tạm hết, thử lại.');
      return false;
    }
  }, [shopId]);

  const setNote = useCallback((itemId: string, note: string) => {
    setNotes((prev) => ({ ...prev, [itemId]: note.slice(0, 200) }));
  }, []);

  /**
   * Call BEFORE reducing/removing a line. Only cuts into what the kitchen already received need
   * approval: the user must hold orders.delete and pick a reason; the caller then sends the op with
   * `note: reason` + `kitchen_fire` so the cancel ticket (with its reason) reaches the station now.
   */
  const confirmReduce = useCallback(
    async (item: { id?: string; product_name?: string }, newQty: number): Promise<{ ok: boolean; reason?: string }> => {
      const id = String(item.id || '');
      if (!status.enabled || !id) return { ok: true };
      const sent = Math.max(0, status.items[id]?.sent ?? 0);
      const voidQty = sent - Math.max(0, newQty);
      if (sent <= 0 || voidQty <= 0) return { ok: true };
      // The kitchen itself reported it sold out: removing that part is not the floor's fault.
      if (voidQty <= Math.max(0, status.items[id]?.unavailable ?? 0)) return { ok: true, reason: 'Hết món' };
      const name = item.product_name || 'Món';
      if (!canVoid) {
        toast.error(`"${name}" đã báo bếp. Cần quyền huỷ đơn để bớt hoặc huỷ món này.`);
        return { ok: false };
      }
      const reason = await new Promise<string | null>((resolve) => setVoidAsk({ name, qty: voidQty, resolve }));
      setVoidAsk(null);
      return reason ? { ok: true, reason } : { ok: false };
    },
    [status, canVoid],
  );

  return { status, sending, send, pendingLocal, refresh, notes, setNote, confirmReduce, voidAsk, setBackInStock };
}

/** Op fields for a reduction approved by confirmReduce: reason on the cancel ticket, sent now. */
export function voidOpFields(reason?: string): { note?: string; kitchen_fire?: boolean } {
  return reason ? { note: `Lý do: ${reason}`, kitchen_fire: true } : {};
}

const VOID_REASONS = ['Khách đổi ý', 'Nhập nhầm', 'Hết món', 'Ra món chậm'];

/** Qty of a line the kitchen reported sold out and the floor has not removed yet. */
export function outstandingUnavailable(status: TableKitchenStatus, itemId?: string): number {
  const id = String(itemId || '');
  return status.enabled && id ? Math.max(0, status.items[id]?.unavailable ?? 0) : 0;
}

function VoidReasonDialog({ ask }: { ask: NonNullable<ReturnType<typeof useTableKitchen>['voidAsk']> }) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const reason = choice === 'other' ? other.trim() : choice;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => ask.resolve(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">Huỷ món đã báo bếp</h3>
        <p className="mt-1 text-sm text-slate-500">
          {ask.name}: huỷ {ask.qty} phần đã gửi xuống bếp. Bếp sẽ nhận phiếu huỷ kèm lý do.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {VOID_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setChoice(r)}
              className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${choice === r ? 'border-rose-400 bg-rose-50 font-medium text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setChoice('other')}
            className={`col-span-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${choice === 'other' ? 'border-rose-400 bg-rose-50 font-medium text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Lý do khác
          </button>
        </div>
        {choice === 'other' && (
          <input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={120}
            placeholder="Nhập lý do..."
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => ask.resolve(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">
            Giữ món
          </button>
          <button
            onClick={() => reason && ask.resolve(reason)}
            disabled={!reason}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
          >
            Huỷ món
          </button>
        </div>
      </div>
    </div>
  );
}

/** Note link / text under a dish that is not (fully) sent yet. */
export function KitchenItemNote({ kitchen, itemId, qty }: { kitchen: ReturnType<typeof useTableKitchen>; itemId?: string; qty: number }) {
  const [editing, setEditing] = useState(false);
  const id = String(itemId || '');
  const real = id && !id.startsWith('pending-') && !id.startsWith('temp-');
  const sent = real ? Math.max(0, kitchen.status.items[id]?.sent ?? 0) : 0;
  if (!kitchen.status.enabled || !real || qty <= sent) return null;
  const note = kitchen.notes[id] || '';
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={note}
        maxLength={200}
        placeholder="Ghi chú cho bếp (ít đá, không hành...)"
        onBlur={(e) => { kitchen.setNote(id, e.target.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs focus:outline-none"
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-0.5 block max-w-full truncate text-left text-[11px] font-medium cursor-pointer">
      {note ? <span className="italic text-amber-700">» {note}</span> : <span className="text-slate-400 hover:text-primary">+ Ghi chú cho bếp</span>}
    </button>
  );
}

/** "Món chưa báo bếp (N) · Gửi bếp" — hidden when Bar/Bếp is off for this branch. */
export function TableKitchenBar({
  kitchen,
  lines = [],
  onRemoveSoldOut,
}: {
  kitchen: ReturnType<typeof useTableKitchen>;
  /** Lines shown on screen (id + qty): covers the few seconds before the status refresh lands */
  lines?: { id?: string; qty: number | string; product_id?: string; product_name?: string }[];
  /** "Bỏ món" on a line the kitchen reported sold out */
  onRemoveSoldOut?: (itemId: string, qty: number) => void;
}) {
  const { status, sending, send, pendingLocal } = kitchen;
  if (!status.enabled) return null;
  const visibleUnsent = lines.reduce((n, l) => {
    const qty = Number(l.qty) || 0;
    const id = String(l.id || '');
    const sent = id && !id.startsWith('pending-') && !id.startsWith('temp-') ? Math.max(0, status.items[id]?.sent ?? 0) : 0;
    return n + Math.max(0, qty - sent);
  }, 0);
  const unsentQty = Math.max(status.unsent_qty, visibleUnsent);
  const unsent = Math.max(status.unsent_lines + pendingLocal, visibleUnsent > 0 ? 1 : 0);
  const soldOutLines = lines
    .map((l) => ({ l, n: outstandingUnavailable(status, l.id) }))
    .filter((x) => x.n > 0);
  return (
    <>
    {kitchen.voidAsk && <VoidReasonDialog ask={kitchen.voidAsk} />}
    {soldOutLines.length > 0 && (
      <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
        <p className="text-xs font-semibold text-rose-800">Bếp báo hết món – báo khách và bỏ món:</p>
        <ul className="mt-1 space-y-1">
          {soldOutLines.map(({ l, n }) => (
            <li key={l.id} className="flex items-center gap-2 text-xs text-rose-700">
              <span className="flex-1 truncate">{l.product_name} · hết {n}</span>
              {onRemoveSoldOut && (
                <button
                  onClick={() => onRemoveSoldOut(String(l.id), n)}
                  className="rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                >
                  Bỏ món
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
    <div
      className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${
        unsent > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <ChefHat className={`h-4 w-4 shrink-0 ${unsent > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
      <span className={`flex-1 text-xs font-medium ${unsent > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
        {unsent > 0 ? `Món chưa báo bếp: ${unsentQty || unsent}` : 'Đã báo bếp đủ món'}
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
    </>
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
  const gone = Math.max(0, s?.unavailable ?? 0);
  if (gone > 0) {
    label = gone >= sent ? 'Hết món' : `Hết ${gone}/${sent}`;
    cls = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (sent === 0) {
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
