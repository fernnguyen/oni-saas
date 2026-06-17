'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { VERTICAL_REGISTRY, INDUSTRY_TYPES, type IndustryType } from '@oni/core';
import { IndustryIcon } from '../../../components/layout/IndustryIcon';

function NewShopForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedTenantId = searchParams.get('tenant_id') ?? '';

  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string; industry_type: string }[]>([]);
  const [tenantId, setTenantId] = useState(preselectedTenantId);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [industryType, setIndustryType] = useState<string>('retail');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tenants/list')
      .then((r) => r.json())
      .then((d) => {
        const list = d.tenants ?? [];
        setTenants(list);
        
        if (preselectedTenantId) {
          setTenantId(preselectedTenantId);
          const selected = list.find((t: any) => t.id === preselectedTenantId);
          if (selected?.industry_type) setIndustryType(selected.industry_type);
        } else if (list.length > 0) {
          setTenantId(list[0].id);
          if (list[0].industry_type) setIndustryType(list[0].industry_type);
        }
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
        body: JSON.stringify({ tenant_id: tenantId, name, slug, address, industry_type: industryType }),
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

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
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
                  onChange={(e) => {
                    const tid = e.target.value;
                    setTenantId(tid);
                    const selected = tenants.find((t) => t.id === tid);
                    if (selected?.industry_type) {
                      setIndustryType(selected.industry_type);
                    }
                  }}
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

          <div className="border-t border-slate-100 pt-4">
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Ngành nghề kinh doanh chi nhánh
            </label>
            <p className="text-xs text-slate-400 mb-3.5 leading-relaxed">
              Mỗi chi nhánh có thể chạy cấu hình POS và nghiệp vụ riêng biệt tối ưu cho ngành đó. Hệ thống mặc định điền theo ngành chính của Tổ chức.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
              {INDUSTRY_TYPES.map((type) => {
                const config = VERTICAL_REGISTRY[type];
                const isActive = industryType === type;
                
                const cardVisuals = {
                  retail: 'from-blue-500/10 to-indigo-500/10 border-blue-500/30 text-indigo-700 bg-blue-50/20',
                  fnb: 'from-orange-500/10 to-rose-500/10 border-orange-500/30 text-rose-700 bg-orange-50/20',
                  billiards: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-700 bg-emerald-50/20',
                  sports_court: 'from-violet-500/10 to-fuchsia-500/10 border-violet-500/30 text-violet-700 bg-violet-50/20',
                  lodging: 'from-cyan-500/10 to-blue-500/10 border-cyan-500/30 text-blue-700 bg-cyan-50/20',
                  fashion: 'from-pink-500/10 to-rose-500/10 border-pink-500/30 text-pink-700 bg-pink-50/20',
                  service_hourly: 'from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-700 bg-amber-50/20',
                };
                const vStyle = cardVisuals[type] || cardVisuals.retail;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setIndustryType(type)}
                    className={`cursor-pointer group relative rounded-2xl border-2 p-3 text-left transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-between ${isActive
                        ? `${vStyle} border-primary ring-2 ring-primary/10 shadow-sm`
                        : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 transition-transform duration-300 group-hover:scale-110 shrink-0">
                        <IndustryIcon type={type} className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-1">
                          {config.label}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">
                          {config.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}

          <div className="flex gap-3 pt-1">
            <Link href="/dashboard/tenants" className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Huỷ
            </Link>
            <button
              type="submit"
              disabled={loading || !name || !slug || !tenantId}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors cursor-pointer"
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
