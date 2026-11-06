'use client';

// Bar/Bếp K0 — stations + category routing (docs/KITCHEN-BAR-PLAN.md).
// Tickets / kitchen screen come in K1–K3; this page only stores the setup.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChefHat, CupSoda, Star, Pencil, Trash2, Sparkles, Info } from 'lucide-react';
import {
  getPrepStationPresets,
  PREP_STATION_KIND_LABELS,
  PREP_STATION_KINDS,
  PREP_STATION_OUTPUT_LABELS,
  PREP_STATION_OUTPUTS,
  type PrepStation,
  type PrepStationKind,
  type PrepStationOutput,
  type PrepStationRoute,
} from '@oni/core';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';

interface Props {
  shopId: string;
  shopName: string;
  industryType: string;
  canManage: boolean;
}

interface StationForm {
  name: string;
  kind: PrepStationKind;
  output: PrepStationOutput;
}

const EMPTY_FORM: StationForm = { name: '', kind: 'kitchen', output: 'print' };

class UnsupportedError extends Error {}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (res.status === 409 && json?.code === 'kitchen_unsupported') throw new UnsupportedError(json.error);
  if (!res.ok) throw new Error(json?.error ?? 'Có lỗi xảy ra');
  return json as T;
}

function KindIcon({ kind, className }: { kind: PrepStationKind; className?: string }) {
  return kind === 'bar' ? <CupSoda className={className} /> : <ChefHat className={className} />;
}

export function KitchenStationsClient({ shopId, shopName, industryType, canManage }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const pathname = usePathname();
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StationForm>(EMPTY_FORM);
  const [routeDraft, setRouteDraft] = useState<Record<string, string>>({});
  const [routeDirty, setRouteDirty] = useState(false);

  const stationsQ = useQuery({
    queryKey: ['prep-stations', shopId],
    queryFn: () => fetchJson<{ data: PrepStation[] }>(`/api/shops/${shopId}/prep-stations`),
    retry: (count, err) => !(err instanceof UnsupportedError) && count < 2,
  });
  const unsupported = stationsQ.error instanceof UnsupportedError;
  const stations = useMemo(() => stationsQ.data?.data ?? [], [stationsQ.data]);
  const defaultStation = stations.find((s) => s.is_default);

  const routesQ = useQuery({
    queryKey: ['prep-station-routes', shopId],
    enabled: stations.length > 0,
    queryFn: () => fetchJson<{ data: PrepStationRoute[] }>(`/api/shops/${shopId}/prep-stations/routes`),
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', shopId, 'kitchen-routing'],
    enabled: stations.length > 0,
    queryFn: () => fetchJson<{ data: Record<string, string>[] }>(`/api/shops/${shopId}/categories?limit=1000`),
  });

  // Parents first, children indented under them.
  const categories = useMemo(() => {
    const rows = (categoriesQ.data?.data ?? []).filter((c) => c.id);
    const byParent = new Map<string, Record<string, string>[]>();
    for (const c of rows) {
      const p = c.parent_id && rows.some((x) => x.id === c.parent_id) ? c.parent_id : '';
      byParent.set(p, [...(byParent.get(p) ?? []), c]);
    }
    const sortFn = (a: Record<string, string>, b: Record<string, string>) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name).localeCompare(String(b.name), 'vi');
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parent: string, depth: number) => {
      for (const c of (byParent.get(parent) ?? []).sort(sortFn)) {
        out.push({ id: c.id, name: c.name, depth });
        if (depth < 4) walk(c.id, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [categoriesQ.data]);

  useEffect(() => {
    if (!routesQ.data || routeDirty) return;
    const map: Record<string, string> = {};
    for (const r of routesQ.data.data) if (r.target_type === 'category') map[r.target_id] = r.station_id;
    setRouteDraft(map);
  }, [routesQ.data, routeDirty]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['prep-stations', shopId] });
    queryClient.invalidateQueries({ queryKey: ['prep-station-routes', shopId] });
  };

  const saveStation = useMutation({
    mutationFn: (payload: StationForm) =>
      fetchJson(editingId ? `/api/shops/${shopId}/prep-stations/${editingId}` : `/api/shops/${shopId}/prep-stations`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật trạm' : 'Đã thêm trạm');
      setSlideOpen(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/shops/${shopId}/prep-stations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      }),
    onSuccess: () => {
      toast.success('Đã đổi trạm mặc định');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPresets = useMutation({
    mutationFn: async () => {
      for (const p of getPrepStationPresets(industryType)) {
        await fetchJson(`/api/shops/${shopId}/prep-stations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
      }
    },
    onSuccess: () => {
      toast.success('Đã tạo trạm theo gợi ý');
      invalidateAll();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidateAll();
    },
  });

  const saveRoutes = useMutation({
    mutationFn: () =>
      fetchJson<{ saved: number }>(`/api/shops/${shopId}/prep-stations/routes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: routeDraft }),
      }),
    onSuccess: () => {
      toast.success('Đã lưu phân luồng món');
      setRouteDirty(false);
      queryClient.invalidateQueries({ queryKey: ['prep-station-routes', shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDelete(s: PrepStation) {
    await confirm({
      title: `Xoá trạm "${s.name}"?`,
      description:
        'Các danh mục đang gán cho trạm này sẽ chuyển về trạm mặc định.' +
        (s.is_default && stations.length > 1 ? ' Trạm mặc định sẽ chuyển sang trạm khác.' : ''),
      confirmLabel: 'Xoá trạm',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await fetchJson(`/api/shops/${shopId}/prep-stations/${s.id}`, { method: 'DELETE' });
          toast.success('Đã xoá trạm');
          setRouteDirty(false);
          invalidateAll();
        } catch (e) {
          toast.error((e as Error).message);
          throw e;
        }
      },
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSlideOpen(true);
  }

  function openEdit(s: PrepStation) {
    setEditingId(s.id);
    setForm({ name: s.name, kind: s.kind, output: s.output });
    setSlideOpen(true);
  }

  const presets = getPrepStationPresets(industryType);
  const routedCount = Object.values(routeDraft).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Bar / Bếp</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Khai báo nơi chế biến và món nào được gửi tới đâu.
            {stationsQ.isFetching && <span className="ml-2 text-xs text-slate-400 animate-pulse">Đang cập nhật...</span>}
          </p>
        </div>
        {canManage && !unsupported && stations.length > 0 && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            + Thêm trạm
          </button>
        )}
      </div>

      <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Món thêm vào bàn sẽ tự tạo phiếu cho đúng trạm. Xem, tích món và in phiếu ở trang{' '}
          <Link href={pathname.replace(/\/settings\/kitchen\/?$/, '/kitchen')} className="font-semibold underline">Màn hình Bar/Bếp</Link>.
          Khi chưa có trạm nào, quầy thu ngân hoạt động như hiện tại.
        </p>
      </div>

      {unsupported ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <EmptyState
            title="Chưa hỗ trợ nguồn dữ liệu này"
            description={(stationsQ.error as Error).message}
          />
        </div>
      ) : stationsQ.isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-400 animate-pulse">Đang tải...</div>
      ) : stationsQ.isError ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-600">{(stationsQ.error as Error).message}</div>
      ) : stations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <EmptyState
            icon={<ChefHat className="h-10 w-10 text-slate-300" />}
            title="Chưa có trạm chế biến"
            description={
              presets.length
                ? `Gợi ý cho ngành của bạn: ${presets.map((p) => p.name).join(' + ')}. Bạn có thể đổi tên hoặc thêm trạm sau.`
                : 'Thêm trạm Bếp hoặc Bar để bắt đầu.'
            }
            action={
              canManage ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {presets.length > 0 && (
                    <button
                      onClick={() => createPresets.mutate()}
                      disabled={createPresets.isPending}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      {createPresets.isPending ? 'Đang tạo...' : 'Tạo theo gợi ý'}
                    </button>
                  )}
                  <button
                    onClick={openCreate}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Tự thêm trạm
                  </button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-slate-100 p-2">
                    <KindIcon kind={s.kind} className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{s.name}</h3>
                      {s.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Mặc định
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {PREP_STATION_KIND_LABELS[s.kind]} · {PREP_STATION_OUTPUT_LABELS[s.output]}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    {!s.is_default && (
                      <button
                        onClick={() => setDefault.mutate(s.id)}
                        disabled={setDefault.isPending}
                        className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Đặt mặc định
                      </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={() => openEdit(s)} aria-label="Sửa trạm" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 cursor-pointer">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(s)} aria-label="Xoá trạm" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 cursor-pointer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">Phân luồng theo danh mục</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Danh mục không chọn trạm sẽ gửi tới trạm mặc định{defaultStation ? ` (${defaultStation.name})` : ''}.
                  {' '}Đã gán riêng {routedCount}/{categories.length} danh mục.
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => saveRoutes.mutate()}
                  disabled={!routeDirty || saveRoutes.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40 cursor-pointer"
                >
                  {saveRoutes.isPending ? 'Đang lưu...' : 'Lưu phân luồng'}
                </button>
              )}
            </div>
            {categoriesQ.isLoading || routesQ.isLoading ? (
              <div className="p-4 text-sm text-slate-400 animate-pulse">Đang tải danh mục...</div>
            ) : categories.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">Chưa có danh mục sản phẩm. Mọi món sẽ gửi tới trạm mặc định.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 min-w-0 truncate text-sm text-slate-800" style={{ paddingLeft: c.depth * 16 }}>
                      {c.depth > 0 && <span className="text-slate-300 mr-1">└</span>}
                      {c.name}
                    </span>
                    <select
                      value={routeDraft[c.id] ?? ''}
                      disabled={!canManage}
                      onChange={(e) => {
                        setRouteDraft((d) => ({ ...d, [c.id]: e.target.value }));
                        setRouteDirty(true);
                      }}
                      className="w-44 sm:w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none"
                    >
                      <option value="">Mặc định{defaultStation ? ` (${defaultStation.name})` : ''}</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Sửa trạm' : 'Thêm trạm chế biến'}
        footer={
          <div className="flex items-center gap-3 w-full justify-end">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error('Vui lòng nhập tên trạm');
                  return;
                }
                saveStation.mutate({ ...form, name: form.name.trim() });
              }}
              disabled={saveStation.isPending}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
            >
              {saveStation.isPending ? 'Đang lưu...' : 'Lưu trạm'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên trạm *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Bếp nóng, Bar, Quầy nước"
              maxLength={100}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại</label>
            <div className="grid grid-cols-3 gap-2">
              {PREP_STATION_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${form.kind === k ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {PREP_STATION_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cách nhận món</label>
            <select
              value={form.output}
              onChange={(e) => setForm((f) => ({ ...f, output: e.target.value as PrepStationOutput }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {PREP_STATION_OUTPUTS.map((o) => (
                <option key={o} value={o}>{PREP_STATION_OUTPUT_LABELS[o]}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Có thể đổi bất cứ lúc nào.</p>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
