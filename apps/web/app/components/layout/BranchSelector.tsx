'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

interface LimitStatus {
  current: number;
  limit: number;
  atLimit: boolean;
}

interface BranchSelectorProps {
  tenantId: string;
  currentSlug: string;
  currentName: string;
  currentAddress?: string | null;
  collapsed?: boolean;
  canCreate?: boolean;
}

function autoSlug(val: string) {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function CreateBranchModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (slug: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    setSlug((prev) => (prev === '' || prev === autoSlug(name) ? autoSlug(val) : prev));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, name, slug, address: address || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) throw new Error(data.message || 'Đã đạt giới hạn gói hiện tại');
        throw new Error(data.message || 'Không tạo được chi nhánh');
      }
      onCreated(slug, name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Tạo chi nhánh mới</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên chi nhánh</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="VD: Cơ sở 1 – Quận 1"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="co-so-1"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            {slug && (
              <p className="mt-1 text-xs text-slate-400">
                URL: <span className="font-mono text-primary">/{slug}/</span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Địa chỉ <span className="font-normal text-slate-400">(tuỳ chọn)</span>
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Nguyễn Trãi, Q.1, TP.HCM"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? 'Đang tạo...' : 'Tạo chi nhánh'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BranchSelector({
  tenantId,
  currentSlug,
  currentName,
  currentAddress,
  collapsed,
  canCreate,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [limitStatus, setLimitStatus] = useState<LimitStatus | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  function loadBranches() {
    fetch(`/api/branches?tenant_id=${tenantId}`)
      .then((r) => r.json())
      .then((d) => {
        setBranches(d.branches ?? []);
        setLimitStatus(d.limit ?? null);
      });
  }

  useEffect(() => {
    loadBranches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function switchBranch(slug: string, name?: string) {
    setOpen(false);
    if (slug === currentSlug) return;
    const newPath = pathname.replace(/^\/[^/]+/, '/' + slug);
    router.push(newPath);
    toast.success(`Đã chuyển sang chi nhánh ${name ?? slug}`);
  }

  function handleCreated(slug: string, name: string) {
    setShowCreate(false);
    loadBranches();
    switchBranch(slug, name);
  }

  const initial = currentName.charAt(0).toUpperCase();
  const canSwitch = branches.length > 1 || !!canCreate;

  if (collapsed) {
    return (
      <div className="flex justify-center py-2 border-b border-slate-200">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
          {initial}
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className="relative py-2">
        <button
          onClick={() => canSwitch && setOpen((o) => !o)}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
            canSwitch ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 leading-none">Chi nhánh</p>
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{currentName}</p>
          </div>
          {canSwitch && (
            <svg
              className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {open && (
          <div className="absolute left-2 w-[260px] top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-50 py-1 overflow-hidden">
            {branches.map((b) => {
              const isCurrent = b.slug === currentSlug;
              return (
                <button
                  key={b.id}
                  onClick={() => switchBranch(b.slug, b.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                    isCurrent ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isCurrent ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate leading-tight">{b.name}</p>
                    {b.address && (
                      <p className="text-[11px] text-slate-400 truncate leading-snug">{b.address}</p>
                    )}
                  </div>
                  {isCurrent && (
                    <svg
                      className="h-3.5 w-3.5 text-primary shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}

            {canCreate && (
              <>
                {branches.length > 0 && <div className="my-1 h-px bg-slate-100 mx-2" />}
                {limitStatus?.atLimit ? (
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-amber-700">
                          Đã đạt giới hạn ({limitStatus.current}/{limitStatus.limit} chi nhánh)
                        </p>
                        <p className="text-[11px] text-amber-600 mt-0.5">Nâng cấp gói để thêm</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setShowCreate(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-600">Chi nhánh mới</span>
                      {limitStatus && limitStatus.limit !== -1 && (
                        <span className="ml-1.5 text-[11px] text-slate-400">
                          ({limitStatus.current}/{limitStatus.limit})
                        </span>
                      )}
                    </div>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBranchModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
