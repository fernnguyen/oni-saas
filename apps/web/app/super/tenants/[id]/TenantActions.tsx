'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface TenantActionsProps {
  tenantId: string;
  tenantName: string;
  editHref: string;
}

export function TenantActions({ tenantId, tenantName, editHref }: TenantActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function postAction(action: string) {
    setLoading(action);
    await fetch(`/api/super/tenants/${tenantId}/${action}`, { method: 'POST' });
    setLoading(null);
    router.refresh();
  }

  function handleDelete() {
    if (!confirm(`Xoá vĩnh viễn "${tenantName}"? Không thể hoàn tác.`)) return;
    postAction('delete');
  }

  function handleSuspend() {
    if (!confirm(`Tạm khóa "${tenantName}"? Tenant sẽ không thể truy cập.`)) return;
    postAction('suspend');
  }

  function handleCancel() {
    if (!confirm(`Huỷ subscription của "${tenantName}"?`)) return;
    postAction('cancel');
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={editHref}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Edit
      </a>
      <button
        onClick={handleSuspend}
        disabled={loading === 'suspend'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {loading === 'suspend' ? '...' : 'Suspend'}
      </button>
      <button
        onClick={handleCancel}
        disabled={loading === 'cancel'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {loading === 'cancel' ? '...' : 'Cancel'}
      </button>
      <button
        onClick={handleDelete}
        disabled={loading === 'delete'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-60"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        {loading === 'delete' ? '...' : 'Delete'}
      </button>
    </div>
  );
}
