'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { extractGoogleSheetId } from '../../../lib/googleSheets';

interface Props {
  shopId: string;
  onConnected: () => void;
  onClose?: () => void;
  returnTo?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_missing_params: 'Google trả về thiếu dữ liệu xác thực. Hãy thử lại.',
  token_exchange_failed: 'Không đổi được mã xác thực từ Google. Kiểm tra cấu hình OAuth.',
  token_missing: 'Google không trả về access token hợp lệ.',
  sheet_access_denied: 'Google đã đăng nhập nhưng tài khoản này chưa có quyền mở Sheet bạn nhập.',
  template_create_failed: 'Đã đăng nhập Google nhưng chưa tạo được file template mới.',
  template_seed_failed: 'Đã tạo file nhưng chưa ghi được cấu trúc mẫu của ONI.',
  save_failed: 'Đã nhận xác thực từ Google nhưng chưa lưu được kết nối.',
};

export function SetupModal({ shopId, onConnected, onClose, returnTo = '/' }: Props) {
  const searchParams = useSearchParams();
  const [source, setSource] = useState<'existing' | 'template'>('existing');
  const [sheetInput, setSheetInput] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(false);
  const error = searchParams.get('error');
  const success = searchParams.get('success');
  const parsedSheetId = extractGoogleSheetId(sheetInput);

  useEffect(() => {
    if (success === 'connected') onConnected();
  }, [onConnected, success]);

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
          return_to: returnTo,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-900">Kết nối dữ liệu</h2>
          {onClose && (
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 text-slate-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Chọn một trong hai cách: dùng Google Sheet có sẵn hoặc để ONI tạo file mới từ template.
        </p>

        <div className="mt-6 space-y-4">
          {success === 'connected' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Kết nối thành công. Google Sheet đã được xác nhận quyền truy cập.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {ERROR_MESSAGES[error] ?? 'Kết nối chưa thành công. Hãy kiểm tra lại cấu hình.'}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setSource('existing')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                source === 'existing' ? 'border-[#0268FF] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-semibold text-slate-800">Dùng link có sẵn</div>
              <p className="mt-1 text-xs text-slate-500">Bạn đã có file Google Sheet và chỉ cần nối nó với ONI.</p>
            </button>
            <button
              onClick={() => setSource('template')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                source === 'template' ? 'border-[#0268FF] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-semibold text-slate-800">Tạo mới qua template ONI</div>
              <p className="mt-1 text-xs text-slate-500">ONI sẽ tạo file mới với các tab mẫu cơ bản cho bạn.</p>
            </button>
          </div>

          {source === 'existing' ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-800">Cách làm nhanh</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>Mở file Google Sheet bạn muốn dùng.</li>
                  <li>Copy toàn bộ đường link trên thanh địa chỉ.</li>
                  <li>Dán vào ô bên dưới rồi bấm kết nối.</li>
                  <li>Chọn đúng tài khoản Google có quyền mở file đó.</li>
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
                <p className="mt-1.5 text-xs text-slate-400">Bạn có thể dán nguyên link hoặc chỉ dán riêng Sheet ID.</p>
              </div>
              {parsedSheetId && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                  Đã nhận Sheet ID: <span className="font-mono">{parsedSheetId}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-800">ONI sẽ chuẩn bị sẵn</div>
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
                <p className="mt-1.5 text-xs text-slate-400">
                  ONI sẽ tạo file dạng <span className="font-mono">ONI - Tên file</span> trong Google Drive của bạn.
                </p>
              </div>
            </>
          )}

          <div className="flex gap-3">
            {onClose && (
              <button onClick={onClose} className="flex-1 rounded border px-4 py-2 text-sm">
                Đóng
              </button>
            )}
            <button
              onClick={connectOAuth}
              disabled={loading || (source === 'existing' ? !parsedSheetId : !templateName.trim())}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Đang chuyển hướng...' : source === 'existing' ? 'Kết nối với Google' : 'Tạo template qua Google'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
