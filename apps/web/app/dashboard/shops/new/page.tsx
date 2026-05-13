'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function NewShopForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedTenantId = searchParams.get('tenant_id') ?? '';

  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [tenantId, setTenantId] = useState(preselectedTenantId);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tenants/list')
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants ?? []);
        if (!preselectedTenantId && d.tenants?.length > 0) setTenantId(d.tenants[0].id);
      })
      .catch(() => {});
  }, [preselectedTenantId]);

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

  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(val));
  }

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  // Each shop gets its own subdomain: shop-slug.oni.vn
  const urlPreview = slug ? `${slug}.oni.vn` : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) { setError('Chọn tổ chức trước'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, name, slug, address }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tạo được chi nhánh');
      router.push(`/dashboard/connectors?tenant_id=${tenantId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/tenants" className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tạo chi nhánh mới</h1>
          <p className="text-sm text-slate-500">
            {selectedTenant ? <>Thuộc: <span className="font-medium text-slate-700">{selectedTenant.name}</span></> : 'Chọn tổ chức để tiếp tục'}
          </p>
        </div>
      </div>

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7">
        <form onSubmit={onSubmit} className="space-y-5">
          {(tenants.length > 1 || !preselectedTenantId) && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tổ chức</label>
              {tenants.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Chưa có tổ chức.{' '}
                  <Link href="/dashboard/tenants/new" className="font-medium underline">Tạo tổ chức trước</Link>
                </div>
              ) : (
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                >
                  <option value="">— Chọn tổ chức —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên chi nhánh</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="VD: Cơ sở 1 – Quận 1"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Slug chi nhánh</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="co-so-1"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            {urlPreview && (
              <p className="mt-1.5 text-xs text-slate-400">
                Subdomain: <span className="font-mono text-primary">{urlPreview}</span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Địa chỉ <span className="text-slate-400 font-normal">(tuỳ chọn)</span>
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Nguyễn Trãi, Q.1, TP.HCM"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}

          <div className="flex gap-3 pt-1">
            <Link href="/dashboard/tenants" className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Huỷ
            </Link>
            <button
              type="submit"
              disabled={loading || !name || !slug || !tenantId}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {loading ? 'Đang tạo...' : 'Tạo chi nhánh'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewShopPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm">Đang tải...</div>}>
      <NewShopForm />
    </Suspense>
  );
}
