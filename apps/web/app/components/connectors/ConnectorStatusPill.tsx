'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CONNECTOR_LABELS: Record<string, string> = {
  google_sheets: 'Google Sheet',
  supabase: 'Supabase',
};

interface ConnectorInfo {
  connector_id: string;
  shop_id: string;
  connector_type: string;
  sheet_title: string;
  sheet_url: string;
  status: string;
  updated_at: string;
}

type ActiveResponse = { connected: false } | ({ connected: true } & ConnectorInfo);

interface Props {
  permissions: string[];
  settingsHref?: string;
}

export function ConnectorStatusPill({ permissions, settingsHref }: Props) {
  const [data, setData] = useState<ActiveResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const canManage = permissions.includes('connectors.manage');
  const canView = canManage || permissions.includes('connectors.view');

  useEffect(() => {
    fetch('/api/connectors/google-sheets/active')
      .then((r) => r.json())
      .then((d: ActiveResponse) => setData(d))
      .catch(() => setData({ connected: false }));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!data || !canView) return null;

  const isConnected = data.connected && data.status !== 'error';
  const isError = data.connected && data.status === 'error';

  const pillColors = isError
    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
    : isConnected
    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';

  const dotColor = isError ? 'bg-red-500' : isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400';

  const label = isConnected
    ? 'Đã kết nối'
    : isError
    ? 'Lỗi kết nối'
    : 'Chưa kết nối';

  function handlePillClick() {
    if (!data?.connected) {
      router.push('/dashboard/connectors');
      return;
    }
    if (canManage) setOpen((v) => !v);
  }

  return (
    <div ref={ref} className="relative">
      {canManage ? (
        <button
          onClick={handlePillClick}
          className={`cursor-pointer flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${pillColors}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="max-w-[200px] truncate">
            {label}{isConnected && data.connected ? ` · ${CONNECTOR_LABELS[data.connector_type] ?? data.connector_type}` : ''}
          </span>
        </button>
      ) : (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${pillColors}`}>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="max-w-[200px] truncate">
            {label}{isConnected && data.connected ? ` · ${CONNECTOR_LABELS[data.connector_type] ?? data.connector_type}` : ''}
          </span>
        </span>
      )}

      {/* Mini info dropdown */}
      {open && data.connected && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg z-50">
          <div className="p-4 space-y-3">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Trạng thái</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
                {isError ? 'Lỗi kết nối' : 'Đang hoạt động'}
              </span>
            </div>

            {/* Sheet name */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 shrink-0">Sheet</span>
              <span className="text-xs text-slate-700 text-right truncate font-mono">{data.sheet_title || 'Google Sheet'}</span>
            </div>

            {/* Last updated */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Cập nhật</span>
              <span className="text-xs text-slate-600">{formatRelative(data.updated_at)}</span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <a
                href={data.sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex-1 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Mở sheet ↗
              </a>
              <Link
                href={`${settingsHref ?? '/dashboard/settings'}#connector`}
                onClick={() => setOpen(false)}
                className="flex-1 cursor-pointer rounded-lg bg-slate-800 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-slate-700 transition-colors"
              >
                Quản lý →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  } catch { return ''; }
}
