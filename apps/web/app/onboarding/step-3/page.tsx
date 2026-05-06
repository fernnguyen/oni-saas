'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function Step3Content() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopId = searchParams.get('shop_id') ?? '';

  const [mode, setMode] = useState<'choose' | 'manual' | 'oauth'>('choose');
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
      if (!verifyRes.ok) {
        const vd = await verifyRes.json();
        throw new Error(vd.message);
      }
      router.push('/dashboard');
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
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0268FF] text-white">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Kết nối nguồn dữ liệu</h1>
          <p className="mt-2 text-slate-500 text-sm">Bước 3 / 3 — Đồng bộ sản phẩm & đơn hàng</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
          <div className="mb-6 flex gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1.5 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1.5 flex-1 rounded-full bg-[#0268FF]" />
          </div>

          {mode === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => setMode('oauth')}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-slate-200 p-4 text-left hover:border-[#0268FF] hover:bg-blue-50/50 transition-colors"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                  <svg width="20" height="20" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
                  </svg>
                </span>
                <div>
                  <div className="font-semibold text-slate-800">Kết nối qua Google</div>
                  <div className="text-xs text-slate-500 mt-0.5">Uỷ quyền OAuth — xem danh sách Google Sheets của bạn</div>
                </div>
                <svg className="ml-auto h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={() => setMode('manual')}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-slate-200 p-4 text-left hover:border-[#0268FF] hover:bg-blue-50/50 transition-colors"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-mono text-sm font-bold">
                  ID
                </span>
                <div>
                  <div className="font-semibold text-slate-800">Nhập thủ công</div>
                  <div className="text-xs text-slate-500 mt-0.5">Dán Sheet ID + Access Token — phù hợp Service Account</div>
                </div>
                <svg className="ml-auto h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 transition-colors mt-2"
              >
                Bỏ qua, thiết lập sau
              </button>
            </div>
          )}

          {mode === 'oauth' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Bấm kết nối để chuyển sang trang đăng nhập Google. Sau khi xác nhận, bạn sẽ được quay về đây tự động.
              </p>
              {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}
              <div className="flex gap-3">
                <button onClick={() => setMode('choose')} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50">
                  Quay lại
                </button>
                <button
                  onClick={connectOAuth}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50"
                >
                  {loading ? 'Đang chuyển hướng...' : 'Kết nối Google'}
                </button>
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Google Sheet ID</label>
                <input
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Lấy từ URL: docs.google.com/spreadsheets/d/<strong>sheet-id</strong>/edit
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Access Token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ya29.xxx"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                />
              </div>
              {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}
              <div className="flex gap-3">
                <button onClick={() => setMode('choose')} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50">
                  Quay lại
                </button>
                <button
                  onClick={connectManual}
                  disabled={loading || !sheetId || !accessToken}
                  className="flex-1 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50"
                >
                  {loading ? 'Đang kết nối...' : 'Kết nối & Kiểm tra'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingStep3() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-slate-500">Đang tải...</div></div>}>
      <Step3Content />
    </Suspense>
  );
}
