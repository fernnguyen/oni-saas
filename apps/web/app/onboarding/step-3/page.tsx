'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { extractGoogleSheetId } from '../../../lib/googleSheets';

function Step3Content() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopId = searchParams.get('shop_id') ?? '';

  const [source, setSource] = useState<'existing' | 'template'>('existing');
  const [sheetInput, setSheetInput] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(false);
  const error = searchParams.get('error');
  const success = searchParams.get('success');
  const parsedSheetId = extractGoogleSheetId(sheetInput);

  async function connectOAuth() {
    setLoading(true);
    try {
      const res = await fetch('/api/connectors/google-sheets/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shopId,
          mode: 'oauth_init',
          source,
          sheet_input: sheetInput,
          template_name: templateName,
          return_to: '/dashboard',
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.message);
      window.location.href = data.redirect_url;
    } catch (err: any) {
      window.alert(err.message);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (success === 'connected') router.push('/dashboard');
  }, [router, success]);

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

          <div className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">Kết nối chưa thành công. Hãy kiểm tra lại link Sheet hoặc cấu hình OAuth.</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setSource('existing')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  source === 'existing' ? 'border-[#0268FF] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-800">Dùng link có sẵn</div>
                <p className="mt-1 text-xs text-slate-500">Dành cho file Google Sheet bạn đã có sẵn.</p>
              </button>
              <button
                onClick={() => setSource('template')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  source === 'template' ? 'border-[#0268FF] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-800">Tạo mới qua template ONI</div>
                <p className="mt-1 text-xs text-slate-500">ONI sẽ tự tạo file mẫu trong Google Drive của bạn.</p>
              </button>
            </div>
            {source === 'existing' ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                  <div className="font-semibold text-slate-800">Cách làm đơn giản</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                    <li>Mở Google Sheet bạn đang dùng cho chi nhánh này.</li>
                    <li>Copy link trên thanh địa chỉ.</li>
                    <li>Dán link vào ô bên dưới.</li>
                    <li>Bấm kết nối và chọn đúng tài khoản Google có quyền với file đó.</li>
                  </ol>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Link Google Sheet</label>
                  <input
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                  />
                  <p className="mt-1 text-xs text-slate-400">Bạn có thể dán nguyên link hoặc chỉ dán Sheet ID.</p>
                </div>
                {parsedSheetId && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                    Đã nhận Sheet ID: <span className="font-mono">{parsedSheetId}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                  <div className="font-semibold text-slate-800">Template ONI gồm</div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li>`Products` cho sản phẩm</li>
                    <li>`Orders` và `OrderItems` cho đơn hàng</li>
                    <li>`Customers` cho khách hàng</li>
                    <li>`Settings` cho cấu hình cơ bản</li>
                  </ul>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên file mới</label>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Chi nhánh Linh Ka"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                  />
                  <p className="mt-1 text-xs text-slate-400">ONI sẽ tạo file dạng `ONI - Tên file` trong Google Drive của bạn.</p>
                </div>
              </>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
              >
                Làm sau
              </button>
              <button
                onClick={connectOAuth}
                disabled={loading || (source === 'existing' ? !parsedSheetId : !templateName.trim())}
                className="flex-1 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50"
              >
                {loading ? 'Đang chuyển hướng...' : source === 'existing' ? 'Kết nối với Google' : 'Tạo template qua Google'}
              </button>
            </div>
          </div>
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

async function readJsonResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`API trả về dữ liệu không hợp lệ (${res.status})`);
  }
}
