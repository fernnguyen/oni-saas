'use client';

import { useEffect, useState } from 'react';

export default function ReservedSubdomainsPage() {
  const [subdomains, setSubdomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubdomain, setNewSubdomain] = useState('');
  const [error, setError] = useState('');

  const fetchSubdomains = async () => {
    try {
      const res = await fetch('/api/super/reserved-subdomains');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSubdomains(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubdomains();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubdomain) return;
    try {
      const res = await fetch('/api/super/reserved-subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: newSubdomain }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add');
      }
      setNewSubdomain('');
      fetchSubdomains();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (subdomain: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa subdomain: ${subdomain}?`)) return;
    try {
      const res = await fetch(`/api/super/reserved-subdomains?subdomain=${encodeURIComponent(subdomain)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      fetchSubdomains();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tên miền dự trữ (Reserved Subdomains)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quản lý danh sách các subdomain không cho phép đăng ký (ví dụ: admin, mail, api).
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <form onSubmit={handleAdd} className="flex items-end gap-4">
            <div className="flex-1">
              <label htmlFor="subdomain" className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Thêm subdomain
              </label>
              <input
                type="text"
                id="subdomain"
                value={newSubdomain}
                onChange={(e) => setNewSubdomain(e.target.value)}
                required
                pattern="[a-zA-Z0-9-]+"
                placeholder="Ví dụ: admin"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={!newSubdomain}
              className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Thêm
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Subdomain</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ngày tạo</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400">Đang tải...</td>
                </tr>
              ) : subdomains.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400">Chưa có tên miền dự trữ nào</td>
                </tr>
              ) : (
                subdomains.map((item: any) => (
                  <tr key={item.subdomain} className="hover:bg-slate-50 group">
                    <td className="px-5 py-3 font-medium text-slate-800 font-mono">{item.subdomain}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(item.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.subdomain)}
                        className="text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50"
                        title="Xóa"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
