'use client';

import { useState, FormEvent } from 'react';

export default function NewTenantPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không tạo được gian hàng');
      }
      window.location.href = '/dashboard/tenants';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Tạo gian hàng</h1>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="mb-1 block text-sm font-medium">Tên gian hàng</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug (subdomain)</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="vd: cafeminh"
            className="w-full rounded border px-3 py-2"
            required
          />
          <p className="mt-1 text-xs text-slate-500">Sẽ hiển thị dưới dạng: slug.oni.vn</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? 'Đang tạo...' : 'Tạo'}
        </button>
      </form>
    </div>
  );
}
