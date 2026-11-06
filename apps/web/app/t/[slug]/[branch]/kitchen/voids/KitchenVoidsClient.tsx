'use client';

// Bar/Bếp — cancelled dishes report: what was cancelled after reaching a station, why, and what
// the kitchen did with it (stopped in time vs already made = waste). The owner's control point.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban } from 'lucide-react';

interface VoidLine {
  id: string;
  ticket_no: number;
  business_date: string;
  created_at: string;
  station_name: string;
  resource_name: string;
  product_name: string;
  variant_label: string;
  qty: number;
  reason: string;
  outcome: '' | 'stopped' | 'made';
  unit_price: number;
  value: number;
}

interface VoidReport {
  from: string;
  to: string;
  lines: VoidLine[];
  totals: { lines: number; qty: number; value: number; made_qty: number; waste_value: number; stopped_qty: number; unanswered_qty: number };
}

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const todayGMT7 = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const timeOf = (iso: string) => {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}` : iso;
};

const PRESETS = [
  { key: 'today', label: 'Hôm nay', range: (t: string) => [t, t] },
  { key: '7d', label: '7 ngày', range: (t: string) => [shiftDays(t, -6), t] },
  { key: 'month', label: 'Tháng này', range: (t: string) => [`${t.slice(0, 7)}-01`, t] },
] as const;

const OUTCOME: Record<VoidLine['outcome'], { label: string; cls: string }> = {
  made: { label: 'Đã làm – hao hụt', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  stopped: { label: 'Dừng kịp', cls: 'border-slate-200 bg-white text-slate-600' },
  '': { label: 'Chưa trả lời', cls: 'border-slate-200 bg-slate-50 text-slate-400' },
};

export function KitchenVoidsClient({ shopId, shopName }: { shopId: string; shopName: string }) {
  const pathname = usePathname();
  const backHref = pathname.replace(/\/voids\/?$/, '');
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['key']>('today');
  const [from, to] = useMemo(() => PRESETS.find((p) => p.key === preset)!.range(todayGMT7()), [preset]);

  const q = useQuery({
    queryKey: ['kitchen-voids', shopId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/kitchen/voids?from=${from}&to=${to}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Không tải được báo cáo');
      return json as VoidReport;
    },
  });
  const t = q.data?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={backHref} aria-label="Về màn hình Bar/Bếp" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="mr-auto">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900">Huỷ món sau khi đã báo bếp</h1>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-lg px-3 py-1.5 text-sm cursor-pointer ${preset === p.key ? 'bg-slate-900 font-semibold text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Món huỷ" value={t ? `${t.qty}` : '–'} hint={t ? `${t.lines} dòng · ${vnd(t.value)}` : ''} />
        <Tile label="Đã làm (hao hụt)" value={t ? vnd(t.waste_value) : '–'} hint={t ? `${t.made_qty} món` : ''} tone="amber" />
        <Tile label="Dừng kịp" value={t ? `${t.stopped_qty}` : '–'} hint="không mất nguyên liệu" />
        <Tile label="Bếp chưa trả lời" value={t ? `${t.unanswered_qty}` : '–'} hint="hỏi lại bếp/bar" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {q.isLoading ? (
          <p className="p-6 text-sm text-slate-400 animate-pulse">Đang tải...</p>
        ) : q.isError ? (
          <p className="p-6 text-sm text-rose-600">{(q.error as Error).message}</p>
        ) : !q.data || q.data.lines.length === 0 ? (
          <div className="p-8 text-center">
            <Ban className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Không có món nào bị huỷ sau khi báo bếp trong khoảng này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Giờ</th>
                  <th className="px-4 py-2">Bàn · Trạm</th>
                  <th className="px-4 py-2">Món</th>
                  <th className="px-4 py-2 text-right">SL</th>
                  <th className="px-4 py-2">Lý do</th>
                  <th className="px-4 py-2">Bếp/Bar</th>
                  <th className="px-4 py-2 text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500 tabular-nums">{timeOf(l.created_at)}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-800">{l.resource_name || 'Mang về'}</span>
                      <span className="block text-xs text-slate-400">#{l.ticket_no} · {l.station_name}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-800">
                      {l.product_name}
                      {l.variant_label && <span className="block text-xs text-violet-600">{l.variant_label}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-4 py-2 text-slate-600">{l.reason || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${OUTCOME[l.outcome].cls}`}>
                        {OUTCOME[l.outcome].label}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${l.outcome === 'made' ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                      {l.unit_price > 0 ? vnd(l.value) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-400">
        Chỉ gồm món đã gửi bếp/bar rồi mới huỷ. Giá trị theo giá bán lúc gọi món; món gọi trước khi có tính năng này có thể không có giá.
      </p>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'amber' }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xs font-medium ${tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone === 'amber' ? 'text-amber-900' : 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
