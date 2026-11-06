'use client';

// Bar/Bếp K2 — kitchen screen (KDS-lite) + print station (docs/KITCHEN-BAR-PLAN.md).
// One page does both: it lists open tickets for the chosen station, lets the cook tick dishes,
// and (optionally, per device) auto-prints new tickets. Realtime hint on `kitchen_<shopId>`,
// polling every 10s as the fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChefHat, Maximize2, Minimize2, Printer, RotateCcw, Bell, BellOff, Ban, PackageX } from 'lucide-react';
import type { PrepStation } from '@oni/core';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { kitchenItemDetail, kitchenTime, printKitchenTicket, type KitchenPaperWidth } from '@/lib/pos/printKitchenTicket';

interface Props {
  shopId: string;
  shopName: string;
  canManage: boolean;
}

interface TicketItem {
  id: string;
  product_name: string;
  variant_label: string;
  modifiers: string;
  note: string;
  qty: number;
  status: 'pending' | 'ready' | 'voided' | 'unavailable';
  /** cancel lines: '' = not answered, 'stopped' = caught in time, 'made' = already cooked (waste) */
  void_outcome?: '' | 'stopped' | 'made';
}

interface Ticket {
  id: string;
  ticket_no: number;
  station_id: string;
  station_name: string;
  resource_name: string;
  kind: 'order' | 'void';
  status: 'open' | 'done';
  print_count: number;
  created_at: string;
  items: TicketItem[];
}

type View = 'open' | 'done';

/** Order tickets waiting this long turn amber (warning). */
const WAIT_WARN_MIN = 20;

// ── per-device preferences (localStorage, best-effort) ──────────────────────
function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setValue(v as T);
    } catch { /* private mode */ }
  }, [key]);
  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  }, [key]);
  return [value, set];
}

/** Minutes since a GMT+7 naive timestamp. */
function minutesSince(createdAt: string, now: number): number {
  const iso = (createdAt || '').replace(' ', 'T').replace(/Z$/, '');
  const t = Date.parse(`${iso.slice(0, 19)}+07:00`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json?.error ?? 'Có lỗi xảy ra'), { code: json?.code, status: res.status });
  return json as T;
}

// Bell for new tickets. Replace public/sounds/kitchen-bell.mp3 to change the sound for every kitchen
// screen (keep .mp3 or .wav: the tenant proxy only serves those extensions as static files).
const KITCHEN_BELL_SRC = '/sounds/kitchen-bell.mp3';
let _chime: HTMLAudioElement | null = null;
function playChime() {
  try {
    if (!_chime) _chime = new Audio(KITCHEN_BELL_SRC);
    _chime.currentTime = 0;
    void _chime.play().catch(() => {});
  } catch { /* no audio */ }
}

export function KitchenDisplayClient({ shopId, shopName, canManage }: Props) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const settingsHref = pathname.replace(/\/kitchen\/?$/, '/settings/kitchen');

  const [stationId, setStationId] = usePref<string>(`kds:${shopId}:station`, '');
  const [autoPrint, setAutoPrint] = usePref<'on' | 'off'>(`kds:${shopId}:autoprint`, 'off');
  const [paper, setPaper] = usePref<KitchenPaperWidth>(`kds:${shopId}:paper`, '80');
  const [sound, setSound] = usePref<'on' | 'off'>(`kds:${shopId}:sound`, 'on');
  const [view, setView] = useState<View>('open');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const stationsQ = useQuery({
    queryKey: ['prep-stations', shopId],
    queryFn: () => api<{ data: PrepStation[] }>(`/api/shops/${shopId}/prep-stations`),
    retry: (n, e: any) => e?.status !== 409 && n < 2,
  });
  const stations = useMemo(() => stationsQ.data?.data ?? [], [stationsQ.data]);
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const unsupported = (stationsQ.error as any)?.code === 'kitchen_unsupported';

  // A remembered station that was deleted → fall back to "all".
  useEffect(() => {
    if (stationId && stations.length > 0 && !stationById.has(stationId)) setStationId('');
  }, [stationId, stations, stationById, setStationId]);

  const ticketsKey = ['kitchen-tickets', shopId, view, stationId];
  const ticketsQ = useQuery({
    queryKey: ticketsKey,
    enabled: stations.length > 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: () => {
      const qs = new URLSearchParams({ status: view, limit: view === 'open' ? '200' : '60' });
      if (stationId) qs.set('station_id', stationId);
      return api<{ data: Ticket[] }>(`/api/shops/${shopId}/kitchen/tickets?${qs}`);
    },
  });
  const tickets = useMemo(() => ticketsQ.data?.data ?? [], [ticketsQ.data]);

  // Today's "Tạm hết" list (products the kitchen cannot make any more today)
  const soldOutQ = useQuery({
    queryKey: ['kitchen-unavailable', shopId],
    enabled: stations.length > 0,
    queryFn: () => api<{ data: { product_id: string; product_name: string }[] }>(`/api/shops/${shopId}/kitchen/unavailable`),
  });
  const soldOut = soldOutQ.data?.data ?? [];
  const [soldOutAsk, setSoldOutAsk] = useState<TicketItem | null>(null);

  const refetchAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['kitchen-tickets', shopId] });
    void queryClient.invalidateQueries({ queryKey: ['kitchen-unavailable', shopId] });
  }, [queryClient, shopId]);

  // Realtime hint → refetch (the payload is never trusted as data).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel(`kitchen_${shopId}`).on('broadcast', { event: 'changes' }, () => refetchAll()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [shopId, refetchAll]);

  // ── new-ticket detection: chime + auto-print ─────────────────────────────
  // The first load is a baseline (never printed again after a page reload); only tickets that
  // appear afterwards are new. Auto-print claims the ticket server-side first, so two print
  // stations for the same station never both print it.
  const seen = useRef<Set<string> | null>(null);
  const printQueue = useRef<Promise<void>>(Promise.resolve());
  const seenKey = `${view}|${stationId}`;
  const seenKeyRef = useRef(seenKey);

  useEffect(() => {
    if (seenKeyRef.current !== seenKey) {
      seenKeyRef.current = seenKey;
      seen.current = null; // filter changed → new baseline
    }
    if (!ticketsQ.data || view !== 'open') return;
    if (seen.current === null) {
      seen.current = new Set(tickets.map((t) => t.id));
      return;
    }
    const fresh = tickets.filter((t) => !seen.current!.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) seen.current.add(t.id);
    if (sound === 'on') playChime();
    if (autoPrint !== 'on') return;
    for (const t of fresh) {
      const output = stationById.get(t.station_id)?.output ?? 'print';
      if (output === 'screen' || t.print_count > 0) continue;
      printQueue.current = printQueue.current.then(async () => {
        try {
          const { ticket, claimed } = await api<{ ticket: Ticket; claimed: boolean }>(
            `/api/shops/${shopId}/kitchen/tickets/${t.id}/print`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim: true }) },
          );
          if (claimed) await printKitchenTicket(ticket, { paper });
        } catch (e) {
          toast.error(`Không in được phiếu #${t.ticket_no}: ${(e as Error).message}`);
        }
      });
    }
  }, [ticketsQ.data, tickets, view, seenKey, sound, autoPrint, paper, shopId, stationById]);

  /** Optimistic: apply `optimistic` to the visible list now, call the API, refetch either way. */
  async function run(key: string, fn: () => Promise<unknown>, optimistic?: (list: Ticket[]) => Ticket[]) {
    setBusy((b) => ({ ...b, [key]: true }));
    const prev = queryClient.getQueryData<{ data: Ticket[] }>(ticketsKey);
    if (optimistic && prev) queryClient.setQueryData(ticketsKey, { data: optimistic(prev.data) });
    try {
      await fn();
    } catch (e) {
      if (prev) queryClient.setQueryData(ticketsKey, prev);
      toast.error((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
      refetchAll();
    }
  }

  const toggleItem = (item: TicketItem) => {
    // ready ↔ pending; a "hết món" line goes back to pending (kitchen found more after all)
    const ready = item.status !== 'ready' && item.status !== 'unavailable';
    return run(
      `i:${item.id}`,
      () => api(`/api/shops/${shopId}/kitchen/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ready }),
      }),
      (list) => list.map((t) => ({
        ...t,
        items: t.items.map((i) => (i.id === item.id ? { ...i, status: ready ? 'ready' : 'pending' } : i)),
      })),
    );
  };

  /** "Hết món": this line cannot be made; optionally the product is sold out for the rest of today. */
  const markUnavailable = (item: TicketItem, soldOutToday: boolean) =>
    run(
      `i:${item.id}`,
      () => api(`/api/shops/${shopId}/kitchen/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unavailable: true, sold_out_today: soldOutToday }),
      }),
      (list) => list.map((t) => ({
        ...t,
        items: t.items.map((i) => (i.id === item.id ? { ...i, status: 'unavailable' as const } : i)),
      })),
    );

  /** Cancel line answer: "Dừng kịp" / "Đã làm rồi" (waste); null = undo the answer. */
  const answerVoid = (item: TicketItem, outcome: 'stopped' | 'made' | null) =>
    run(
      `i:${item.id}`,
      () => api(`/api/shops/${shopId}/kitchen/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ void_outcome: outcome }),
      }),
      (list) => list.map((t) => ({
        ...t,
        items: t.items.map((i) => (i.id === item.id ? { ...i, void_outcome: outcome ?? '' } : i)),
      })),
    );

  const setBackInStock = (productId: string, productName: string) =>
    run(`u:${productId}`, () => api(`/api/shops/${shopId}/kitchen/unavailable`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, product_name: productName, unavailable: false }),
    }));

  // Done (or reopened) tickets leave the current tab right away.
  const setDone = (t: Ticket, done: boolean) =>
    run(
      `t:${t.id}`,
      () => api(`/api/shops/${shopId}/kitchen/tickets/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }),
      }),
      (list) => list.filter((x) => x.id !== t.id),
    );

  const reprint = (t: Ticket) =>
    run(`p:${t.id}`, async () => {
      const { ticket } = await api<{ ticket: Ticket }>(`/api/shops/${shopId}/kitchen/tickets/${t.id}/print`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      await printKitchenTicket(ticket, { paper, reprint: ticket.print_count > 1 });
    });

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // ── empty / unsupported states ───────────────────────────────────────────
  if (unsupported || (!stationsQ.isLoading && stations.length === 0)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <ChefHat className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-3 text-lg font-bold text-slate-900">Màn hình Bar / Bếp</h1>
        <p className="mt-1 text-sm text-slate-500">
          {unsupported ? (stationsQ.error as Error).message : 'Chi nhánh chưa có trạm chế biến nào.'}
        </p>
        {!unsupported && canManage && (
          <Link href={settingsHref} className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
            Thiết lập trạm
          </Link>
        )}
      </div>
    );
  }

  const openCount = view === 'open' ? tickets.length : undefined;

  return (
    <div className={`space-y-4 ${fullscreen ? 'min-h-screen bg-slate-100 p-4' : ''}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900">Màn hình Bar / Bếp</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <Link
              href={`${pathname.replace(/\/$/, '')}/voids`}
              title="Báo cáo món huỷ sau khi đã báo bếp (hao hụt)"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Ban className="h-4 w-4" /> Huỷ món
            </Link>
          )}
          <button
            onClick={() => {
              const next = sound === 'on' ? 'off' : 'on';
              setSound(next);
              // Preview the bell; this tap also unlocks audio playback in the browser.
              if (next === 'on') playChime();
            }}
            title={sound === 'on' ? 'Tắt chuông báo phiếu mới' : 'Bật chuông báo phiếu mới'}
            aria-label={sound === 'on' ? 'Tắt chuông báo phiếu mới' : 'Bật chuông báo phiếu mới'}
            className={`rounded-lg border p-2 cursor-pointer ${sound === 'on' ? 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}
          >
            {sound === 'on' ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Station filter + view + print settings */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[{ id: '', name: 'Tất cả' }, ...stations].map((s) => (
            <button
              key={s.id || 'all'}
              onClick={() => setStationId(s.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer border ${
                stationId === s.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {(['open', 'done'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1 cursor-pointer ${view === v ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {v === 'open' ? `Đang chờ${openCount !== undefined ? ` (${openCount})` : ''}` : 'Đã xong'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={autoPrint === 'on'} onChange={(e) => setAutoPrint(e.target.checked ? 'on' : 'off')} className="h-4 w-4 accent-primary" />
          <span className="font-medium text-slate-700">Tự in phiếu mới trên máy này</span>
        </label>
        <label className="flex items-center gap-2 text-slate-600">
          Khổ giấy
          <select value={paper} onChange={(e) => setPaper(e.target.value as KitchenPaperWidth)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
            <option value="80">80mm</option>
            <option value="58">58mm</option>
          </select>
        </label>
        <span className="text-xs text-slate-400">
          {autoPrint === 'on'
            ? 'Chỉ một máy in mỗi phiếu. Mở Chrome với --kiosk-printing để in không cần hộp thoại.'
            : 'Máy này chỉ hiển thị; bấm biểu tượng máy in trên phiếu để in tay.'}
        </span>
      </div>

      {soldOut.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm">
          <PackageX className="h-4 w-4 text-rose-600" />
          <span className="font-medium text-rose-800">Tạm hết hôm nay:</span>
          {soldOut.map((p) => (
            <span key={p.product_id} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white pl-2.5 pr-1 py-0.5 text-xs font-medium text-rose-700">
              {p.product_name || p.product_id}
              <button
                onClick={() => setBackInStock(p.product_id, p.product_name)}
                disabled={busy[`u:${p.product_id}`]}
                className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
              >
                Có lại
              </button>
            </span>
          ))}
        </div>
      )}

      {soldOutAsk && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setSoldOutAsk(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Báo hết món</h3>
            <p className="mt-1 text-sm text-slate-500">
              {soldOutAsk.product_name} (x{soldOutAsk.qty}): phục vụ sẽ nhận cảnh báo ngay trên máy bán hàng.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => { const it = soldOutAsk; setSoldOutAsk(null); void markUnavailable(it, true); }}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                Hết cả hôm nay (không cho gọi thêm)
              </button>
              <button
                onClick={() => { const it = soldOutAsk; setSoldOutAsk(null); void markUnavailable(it, false); }}
                className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
              >
                Chỉ báo cho phiếu này
              </button>
              <button onClick={() => setSoldOutAsk(null)} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tickets */}
      {ticketsQ.isLoading || stationsQ.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-400 animate-pulse">Đang tải phiếu...</div>
      ) : ticketsQ.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-600">{(ticketsQ.error as Error).message}</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          <ChefHat className="mx-auto h-8 w-8" />
          <p className="mt-2 text-sm">{view === 'open' ? 'Chưa có phiếu nào đang chờ.' : 'Chưa có phiếu đã xong.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 items-start">
          {tickets.map((t) => {
            const mins = minutesSince(t.created_at, now);
            const isVoid = t.kind === 'void';
            // Same frame for every ticket. Red is reserved for cancellations (top bar + light red
            // fill); order tickets are green, turning amber (warning) once they wait WAIT_WARN_MIN.
            const late = mins >= WAIT_WARN_MIN;
            const tone = isVoid
              ? 'border-rose-300 bg-rose-50'
              : view === 'done'
              ? 'border-slate-200 bg-white'
              : late
              ? 'border-amber-300 bg-white'
              : 'border-emerald-300 bg-white';
            const bar = isVoid ? 'bg-rose-500' : view === 'done' ? 'bg-slate-300' : late ? 'bg-amber-400' : 'bg-emerald-500';
            return (
              <article key={t.id} className={`overflow-hidden rounded-2xl border-2 ${tone}`}>
                <div className={`h-1.5 ${bar}`} />
                <header className="flex items-start gap-2 px-4 pt-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900">{t.resource_name || 'Mang về'}</h2>
                      {isVoid ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
                          <Ban className="h-3 w-3" /> Huỷ món
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                          Gọi món
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      #{t.ticket_no} · {t.station_name} · {kitchenTime(t.created_at)}
                    </p>
                  </div>
                  {view === 'open' && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${late ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {mins} phút
                    </span>
                  )}
                </header>

                {/* Column header: the left number is a quantity, never a line index. */}
                <div className="mt-2 flex items-center gap-2 border-b border-slate-100 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <span className="w-10 shrink-0">SL</span>
                  <span className="flex-1">Món</span>
                  {!isVoid && <span className="shrink-0">Xong</span>}
                </div>
                <ul className="divide-y divide-slate-100">
                  {t.items.map((it) => {
                    const detail = kitchenItemDetail(it.variant_label, it.modifiers);
                    const ready = it.status === 'ready';
                    const gone = it.status === 'unavailable';
                    // an order line whose dish was cancelled entirely afterwards: do not make it
                    const struck = !isVoid && it.status === 'voided';
                    const content = (
                      <>
                        <span className={`w-10 shrink-0 text-sm font-semibold tabular-nums ${isVoid || gone ? 'text-rose-600' : ready ? 'text-slate-400' : 'text-slate-900'}`}>
                          {isVoid ? `−${Math.abs(it.qty)}` : `x${it.qty}`}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-medium leading-tight ${ready ? 'text-slate-400 line-through' : isVoid || gone || struck ? 'text-rose-700 line-through' : 'text-slate-900'}`}>
                            {it.product_name}
                          </span>
                          {gone && <span className="mt-0.5 inline-block rounded border border-rose-200 bg-rose-50 px-1 text-[10px] font-semibold text-rose-700">Hết món · bấm để hoàn tác</span>}
                          {struck && <span className="mt-0.5 inline-block rounded border border-rose-200 bg-rose-50 px-1 text-[10px] font-semibold text-rose-700">Đã huỷ – không làm</span>}
                          {detail && <span className="mt-0.5 block text-xs font-medium text-violet-600">{detail}</span>}
                          {it.note && <span className="mt-0.5 block text-xs font-medium italic text-amber-700">» {it.note}</span>}
                        </span>
                        {!isVoid && (
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${ready ? 'border-emerald-500 bg-emerald-500 text-white' : gone ? 'border-rose-300 text-rose-500' : 'border-slate-300'}`}>
                            {ready && <Check className="h-3.5 w-3.5" />}
                            {gone && <span className="text-xs font-bold leading-none">–</span>}
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li key={it.id}>
                        {isVoid ? (
                          <div className="px-4 py-2">
                            <div className="flex items-center gap-2">{content}</div>
                            {/* What happened to the cancelled dish: drives the waste report */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-12">
                              {it.void_outcome ? (
                                <>
                                  <span
                                    className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                                      it.void_outcome === 'made'
                                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                                        : 'border-slate-200 bg-white text-slate-600'
                                    }`}
                                  >
                                    {it.void_outcome === 'made' ? 'Đã làm – ghi hao hụt' : 'Dừng kịp – không làm'}
                                  </span>
                                  {view === 'open' && (
                                    <button
                                      onClick={() => answerVoid(it, null)}
                                      disabled={busy[`i:${it.id}`]}
                                      className="text-[11px] text-slate-400 underline hover:text-slate-600 disabled:opacity-50 cursor-pointer"
                                    >
                                      Sửa
                                    </button>
                                  )}
                                </>
                              ) : view === 'open' ? (
                                <>
                                  <button
                                    onClick={() => answerVoid(it, 'stopped')}
                                    disabled={busy[`i:${it.id}`]}
                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                                  >
                                    Dừng kịp
                                  </button>
                                  <button
                                    onClick={() => answerVoid(it, 'made')}
                                    disabled={busy[`i:${it.id}`]}
                                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                                  >
                                    Đã làm rồi
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-400">Chưa trả lời</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <button
                              onClick={() => toggleItem(it)}
                              disabled={busy[`i:${it.id}`] || struck}
                              className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-4 pr-2 text-left hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                              {content}
                            </button>
                            {view === 'open' && it.status === 'pending' && (
                              <button
                                onClick={() => setSoldOutAsk(it)}
                                disabled={busy[`i:${it.id}`]}
                                title="Báo hết món"
                                className="mr-2 shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 cursor-pointer"
                              >
                                Hết
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <footer className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                  <button
                    onClick={() => reprint(t)}
                    disabled={busy[`p:${t.id}`]}
                    title={t.print_count > 0 ? `In lại (đã in ${t.print_count} lần)` : 'In phiếu'}
                    className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    {t.print_count > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 rounded-full bg-slate-200 px-1 text-[10px] font-semibold text-slate-600">{t.print_count}</span>
                    )}
                  </button>
                  <div className="flex-1" />
                  {view === 'open' ? (
                    <button
                      onClick={() => setDone(t, true)}
                      disabled={busy[`t:${t.id}`]}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer ${isVoid ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                      {isVoid ? 'Đã xem' : 'Xong cả phiếu'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setDone(t, false)}
                      disabled={busy[`t:${t.id}`]}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" /> Mở lại
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
