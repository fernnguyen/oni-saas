'use client';

import { useState } from 'react';

type Mode = 'choose' | 'manual' | 'oauth';

interface Props {
  shopId: string;
  onConnected: () => void;
}

export function SetupModal({ shopId, onConnected }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [sheetId, setSheetId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectManual() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connectors/google-sheets/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, mode: 'manual', sheet_id: sheetId, access_token: accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const verifyRes = await fetch('/api/connectors/google-sheets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: data.connector.id }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.message);

      onConnected();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function connectOAuth() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connectors/google-sheets/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, mode: 'oauth_init' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      window.location.href = data.redirect_url;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Kết nối dữ liệu</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chi nhánh này chưa có nguồn dữ liệu. Chọn cách kết nối Google Sheets.
        </p>

        {mode === 'choose' && (
          <div className="mt-6 space-y-3">
            <button
              onClick={() => setMode('oauth')}
              className="flex w-full items-center gap-4 rounded-lg border border-slate-200 p-4 text-left hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <svg width="20" height="20" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
                </svg>
              </span>
              <div>
                <div className="font-medium text-slate-800">Đăng nhập Google</div>
                <div className="text-xs text-slate-500">Uỷ quyền qua OAuth — Google Drive hiện danh sách Sheet của bạn</div>
              </div>
            </button>

            <button
              onClick={() => setMode('manual')}
              className="flex w-full items-center gap-4 rounded-lg border border-slate-200 p-4 text-left hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-mono text-sm font-bold">
                ID
              </span>
              <div>
                <div className="font-medium text-slate-800">Nhập thủ công</div>
                <div className="text-xs text-slate-500">Dán Sheet ID + Access Token — phù hợp Service Account</div>
              </div>
            </button>
          </div>
        )}

        {mode === 'oauth' && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">
              Bấm kết nối bên dưới để chuyển sang trang đăng nhập Google. Sau khi xác nhận, bạn sẽ được quay về đây.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setMode('choose')} className="flex-1 rounded border px-4 py-2 text-sm">
                Quay lại
              </button>
              <button
                onClick={connectOAuth}
                disabled={loading}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? 'Đang chuyển hướng...' : 'Kết nối Google'}
              </button>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Google Sheet ID</label>
              <input
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="w-full rounded border px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-xs text-slate-400">
                Lấy từ URL: docs.google.com/spreadsheets/d/<strong>sheet-id</strong>/edit
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Access Token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="ya29.xxx"
                className="w-full rounded border px-3 py-2 text-sm font-mono"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setMode('choose')} className="flex-1 rounded border px-4 py-2 text-sm">
                Quay lại
              </button>
              <button
                onClick={connectManual}
                disabled={loading || !sheetId || !accessToken}
                className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? 'Đang kết nối...' : 'Kết nối & Kiểm tra'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
