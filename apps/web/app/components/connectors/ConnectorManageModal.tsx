'use client';

import { useState } from 'react';

interface ConnectorInfo {
  connector_id: string;
  shop_id: string;
  shop_name: string;
  sheet_id: string;
  sheet_title: string;
  sheet_url: string;
  status: string;
  updated_at: string;
}

type ActionState =
  | { type: 'idle' }
  | { type: 'loading'; action: 'verify' | 'seed' }
  | { type: 'done'; action: 'verify' | 'seed'; ok: boolean; message: string };

interface Props {
  connector: ConnectorInfo;
  canManage: boolean;
  onChangeSheet: () => void;
  onClose: () => void;
  onStatusChange: (status: string, title?: string) => void;
}

export function ConnectorManageModal({ connector, canManage, onChangeSheet, onClose, onStatusChange }: Props) {
  const [actionState, setActionState] = useState<ActionState>({ type: 'idle' });
  const busy = actionState.type === 'loading';

  async function handleVerify() {
    setActionState({ type: 'loading', action: 'verify' });
    try {
      const res = await fetch('/api/connectors/google-sheets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: connector.connector_id }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionState({ type: 'done', action: 'verify', ok: true, message: `Kết nối hoạt động tốt. Sheet: "${data.title ?? connector.sheet_title}"` });
        onStatusChange('active', data.title ?? connector.sheet_title);
      } else {
        setActionState({ type: 'done', action: 'verify', ok: false, message: data.message ?? 'Không thể xác nhận kết nối.' });
        onStatusChange('error');
      }
    } catch {
      setActionState({ type: 'done', action: 'verify', ok: false, message: 'Lỗi kết nối mạng.' });
    }
  }

  async function handleRebuild() {
    setActionState({ type: 'loading', action: 'seed' });
    try {
      const res = await fetch('/api/connectors/google-sheets/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: connector.connector_id }),
      });
      const data = await res.json();
      if (data.ok) {
        const newTabs = [...(data.created ?? []), ...(data.seeded ?? [])];
        const msg = newTabs.length > 0
          ? `Đã thêm ${newTabs.length} tab/cột mới: ${newTabs.join(', ')}.`
          : 'Schema đã đầy đủ — không có thay đổi.';
        setActionState({ type: 'done', action: 'seed', ok: true, message: msg });
      } else {
        setActionState({ type: 'done', action: 'seed', ok: false, message: data.message ?? 'Rebuild thất bại.' });
      }
    } catch {
      setActionState({ type: 'done', action: 'seed', ok: false, message: 'Lỗi kết nối mạng.' });
    }
  }

  const statusBadge =
    connector.status === 'active'
      ? { label: 'Đang hoạt động', dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50 border-green-200' }
      : { label: 'Lỗi kết nối', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50 border-red-200' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => !busy && e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Kết nối dữ liệu</h2>
            <p className="text-xs text-slate-400 mt-0.5">{connector.shop_name}</p>
          </div>
          {!busy && (
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Sheet info card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm">
                <SheetIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{connector.sheet_title || 'Google Sheet'}</p>
                <p className="text-xs text-slate-400 truncate font-mono">{connector.sheet_id}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${statusBadge.bg} ${statusBadge.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                {statusBadge.label}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Cập nhật {formatRelative(connector.updated_at)}</span>
              <a
                href={connector.sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                Mở sheet
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          {/* Action result */}
          {actionState.type === 'done' && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${actionState.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
              {actionState.message}
            </div>
          )}

          {/* Actions */}
          {canManage ? (
            <div className="space-y-2">
              <ActionButton
                label="Xác nhận kết nối"
                description="Kiểm tra service account vẫn có quyền truy cập sheet"
                icon={<VerifyIcon />}
                loading={actionState.type === 'loading' && actionState.action === 'verify'}
                disabled={busy}
                onClick={handleVerify}
              />
              <ActionButton
                label="Rebuild cấu trúc sheet"
                description="Thêm các tab và cột còn thiếu theo schema ONI mới nhất"
                icon={<RebuildIcon />}
                loading={actionState.type === 'loading' && actionState.action === 'seed'}
                disabled={busy}
                onClick={handleRebuild}
              />
              <ActionButton
                label="Đổi sang sheet khác"
                description="Kết nối với một Google Sheet mới, giữ nguyên dữ liệu sheet cũ"
                icon={<ChangeIcon />}
                disabled={busy}
                onClick={onChangeSheet}
                variant="warning"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 text-center">
              Chỉ Owner / Admin mới có thể thay đổi kết nối dữ liệu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  description,
  icon,
  loading,
  disabled,
  onClick,
  variant = 'default',
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'default' | 'warning';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === 'warning'
          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${variant === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
        {loading ? <Spinner /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${variant === 'warning' ? 'text-amber-800' : 'text-slate-800'}`}>{label}</p>
        <p className={`text-xs ${variant === 'warning' ? 'text-amber-600' : 'text-slate-400'}`}>{description}</p>
      </div>
    </button>
  );
}

function SheetIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 18 18" fill="none">
      <rect width="18" height="18" rx="3" fill="#0F9D58" />
      <path d="M4 5h10v8H4z" fill="white" fillOpacity=".2" />
      <path d="M5 7h8M5 9h8M5 11h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function VerifyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RebuildIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ChangeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
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
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  } catch {
    return '';
  }
}
