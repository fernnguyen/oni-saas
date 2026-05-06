'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

export default function NewTenantPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tạo được tổ chức');

      // After creating tenant, go to shops/new pre-selected with this tenant
      const tenantId = data.tenant?.id ?? data.tenant;
      if (tenantId) {
        window.location.href = `/dashboard/shops/new?tenant_id=${tenantId}`;
      } else {
        window.location.href = '/dashboard/tenants';
      }
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
          <h1 className="text-xl font-bold text-slate-900">Tạo tổ chức mới</h1>
          <p className="text-sm text-slate-500">Sau khi tạo, bạn có thể thêm chi nhánh ngay lập tức</p>
        </div>
      </div>

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên tổ chức / doanh nghiệp</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="VD: Cửa hàng Cà phê Minh"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
              required
            />
          </div>
          <input type="hidden" value={slug} />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <Link
              href="/dashboard/tenants"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Huỷ
            </Link>
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="flex-1 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Đang tạo...' : 'Tạo & thêm chi nhánh →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
