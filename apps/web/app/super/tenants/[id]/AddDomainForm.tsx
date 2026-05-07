'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AddDomainFormProps {
  tenantId: string;
  defaultShopId: string;
  rootDomain: string;
}

export function AddDomainForm({ tenantId, defaultShopId, rootDomain }: AddDomainFormProps) {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim()) return;
    setLoading(true);
    setError('');

    const res = await fetch(`/api/super/tenants/${tenantId}/domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug.trim(), shop_id: defaultShopId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Có lỗi xảy ra');
    } else {
      setSlug('');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs font-medium text-slate-600 mb-2">Thêm subdomain</p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#0268FF] bg-white">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="myshop"
            className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
          />
          <span className="pr-3 text-sm text-slate-400 shrink-0">.{rootDomain}</span>
        </div>
        <button
          type="submit"
          disabled={loading || !slug.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-3 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors disabled:opacity-60 shrink-0"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {loading ? '...' : 'Add'}
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
