'use client';

import { useState } from 'react';
import { extractGoogleSheetId } from '../../../lib/googleSheets';

interface Props {
  shopId: string;
  onConnected: () => void;
  onClose?: () => void;
  returnTo?: string;
}

type Phase =
  | { type: 'idle' }
  | { type: 'connecting' }
  | { type: 'seeding' }
  | { type: 'done'; created: string[]; seeded: string[]; skipped: string[] }
  | { type: 'error'; message: string };

const SERVICE_ACCOUNT_EMAIL = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '';

export function SetupModal({ shopId, onConnected, onClose }: Props) {
  const [sheetInput, setSheetInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ type: 'idle' });
  const [copied, setCopied] = useState(false);

  const parsedSheetId = extractGoogleSheetId(sheetInput);
  const busy = phase.type === 'connecting' || phase.type === 'seeding';

  async function handleVerify() {
    if (!parsedSheetId) return;
    setPhase({ type: 'connecting' });

    // Step 1 — connect + verify access
    let connectorId: string;
    try {
      const res = await fetch('/api/connectors/google-sheets/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, sheet_input: sheetInput }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setPhase({ type: 'error', message: data.message ?? 'Kết nối thất bại. Hãy thử lại.' });
        return;
      }
      connectorId = data.connector_id;
    } catch {
      setPhase({ type: 'error', message: 'Lỗi kết nối mạng. Hãy thử lại.' });
      return;
    }

    // Step 2 — seed schema (non-blocking for UX; we show result)
    setPhase({ type: 'seeding' });
    try {
      const res = await fetch('/api/connectors/google-sheets/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: connectorId }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        // Seed failed but connect succeeded — still usable, just warn
        setPhase({
          type: 'done',
          created: [],
          seeded: [],
          skipped: [],
        });
      } else {
        setPhase({ type: 'done', created: data.created ?? [], seeded: data.seeded ?? [], skipped: data.skipped ?? [] });
      }
    } catch {
      setPhase({ type: 'done', created: [], seeded: [], skipped: [] });
    }

    setTimeout(onConnected, 2200);
  }

  async function copyEmail() {
    if (!SERVICE_ACCOUNT_EMAIL) return;
    await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => !busy && e.target === e.currentTarget && onClose?.()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-900">Kết nối Google Sheet</h2>
          {onClose && !busy && (
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 text-slate-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {phase.type === 'idle' || phase.type === 'error' ? (
          <>
            <p className="mt-1 text-sm text-slate-500">Làm theo 3 bước để kết nối sheet với ONI.</p>

            {/* Safe-overwrite notice */}
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Nếu sheet đã có dữ liệu</span>, hãy dùng sheet mới hoàn toàn để tránh xung đột.
                ONI chỉ thêm tab và cột còn thiếu — không bao giờ xóa dữ liệu cũ.
              </p>
            </div>

            <ol className="mt-5 space-y-5">
              {/* Step 1 */}
              <li className="flex gap-3">
                <Step n={1} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">Tạo một Google Sheet mới</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Vào <span className="font-medium">sheets.google.com</span> và tạo một file trắng.
                  </p>
                </div>
              </li>

              {/* Step 2 */}
              <li className="flex gap-3">
                <Step n={2} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    Nhấn <span className="font-semibold">Share</span> và thêm email dưới đây với quyền <span className="font-semibold">Editor</span>
                  </p>
                  {SERVICE_ACCOUNT_EMAIL ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="flex-1 truncate font-mono text-xs text-slate-700">{SERVICE_ACCOUNT_EMAIL}</span>
                      <button
                        onClick={copyEmail}
                        className="cursor-pointer shrink-0 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {copied ? 'Đã copy!' : 'Copy'}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-red-500">Service account chưa được cấu hình. Liên hệ admin.</p>
                  )}
                </div>
              </li>

              {/* Step 3 */}
              <li className="flex gap-3">
                <Step n={3} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">Dán link sheet vào đây rồi bấm Xác nhận</p>
                  <input
                    value={sheetInput}
                    onChange={(e) => { setSheetInput(e.target.value); if (phase.type === 'error') setPhase({ type: 'idle' }); }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                  />
                  {parsedSheetId && phase.type !== 'error' && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Sheet ID: <span className="font-mono">{parsedSheetId}</span>
                    </p>
                  )}
                </div>
              </li>
            </ol>

            {phase.type === 'error' && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {phase.message}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              {onClose && (
                <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  Đóng
                </button>
              )}
              <button
                onClick={handleVerify}
                disabled={!parsedSheetId || !SERVICE_ACCOUNT_EMAIL}
                className="cursor-pointer flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Xác nhận kết nối
              </button>
            </div>
          </>
        ) : phase.type === 'connecting' || phase.type === 'seeding' ? (
          <SeedingProgress phase={phase.type} />
        ) : (
          <SeedResult {...phase} />
        )}
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
      {n}
    </span>
  );
}

function SeedingProgress({ phase }: { phase: 'connecting' | 'seeding' }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-800">
          {phase === 'connecting' ? 'Đang xác nhận quyền truy cập...' : 'Đang khởi tạo cấu trúc sheet...'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {phase === 'seeding' ? 'ONI đang tạo các tab và cột theo schema chuẩn.' : 'Kiểm tra service account với Google Sheets API.'}
        </p>
      </div>
    </div>
  );
}

function SeedResult({ created, seeded, skipped }: { created: string[]; seeded: string[]; skipped: string[] }) {
  const totalNew = created.length + seeded.length;
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Kết nối thành công!</p>
          <p className="text-xs text-slate-500">
            {totalNew > 0
              ? `Đã khởi tạo ${totalNew} tab mới. ${skipped.length > 0 ? `${skipped.length} tab có sẵn được giữ nguyên.` : ''}`
              : 'Sheet đã có đầy đủ cấu trúc — không có thay đổi nào.'}
          </p>
        </div>
      </div>

      {created.length > 0 && (
        <TabGroup label="Đã tạo + khởi tạo cột" color="blue" tabs={created} />
      )}
      {seeded.length > 0 && (
        <TabGroup label="Đã thêm cột vào tab có sẵn" color="indigo" tabs={seeded} />
      )}
      {skipped.length > 0 && (
        <TabGroup label="Giữ nguyên (đã có dữ liệu)" color="slate" tabs={skipped} />
      )}

      <p className="mt-5 text-center text-xs text-slate-400">Đang chuyển hướng...</p>
    </div>
  );
}

function TabGroup({ label, color, tabs }: { label: string; color: 'blue' | 'indigo' | 'slate'; tabs: string[] }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <span key={t} className={`rounded-md px-2 py-0.5 font-mono text-xs ${colors[color]}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`API trả về dữ liệu không hợp lệ (${res.status})`);
  }
}
