'use client';

import { useState, FormEvent, useEffect } from 'react';

export default function OnboardingStep2() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tenants/me')
      .then((r) => r.json())
      .then((d) => d.tenant_id && setTenantId(d.tenant_id))
      .catch(() => {});
  }, []);

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
    if (!slug || slug === autoSlug(name)) {
      setSlug(autoSlug(val));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) {
      setError('Không tìm thấy tổ chức. Vui lòng thử lại.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, name, slug, address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không tạo được chi nhánh');
      }
      const data = await res.json();
      window.location.href = `/onboarding/step-3?shop_id=${data.shop}`;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0268FF] text-white">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tạo chi nhánh đầu tiên</h1>
          <p className="mt-2 text-slate-500 text-sm">Bước 2 / 3 — Thêm địa điểm kinh doanh</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
          <div className="mb-6 flex gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1.5 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1.5 flex-1 rounded-full bg-slate-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên chi nhánh</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="VD: Cửa hàng Quận 1"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Slug chi nhánh</label>
              <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden focus-within:border-[#0268FF] focus-within:ring-2 focus-within:ring-[#0268FF]/20">
                <span className="shrink-0 bg-slate-50 px-3 py-3 text-sm text-slate-400 border-r border-slate-200">oni.vn/s/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="cua-hang-quan-1"
                  className="flex-1 px-3 py-3 text-sm focus:outline-none"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Địa chỉ <span className="text-slate-400 font-normal">(tuỳ chọn)</span>
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="VD: 123 Nguyễn Trãi, Q.1, TP.HCM"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="w-full rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Đang tạo...' : 'Tiếp theo →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
