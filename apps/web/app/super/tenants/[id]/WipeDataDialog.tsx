'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';

interface WipeDataDialogProps {
  tenantId: string;
  shopId: string;
  shopName: string;
}

export function WipeDataDialog({ tenantId, shopId, shopName }: WipeDataDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [confirmText, setConfirmText] = useState('');
  const [wipeOptions, setWipeOptions] = useState({
    wipe_products: true,
    wipe_customers: true,
    wipe_orders: true,
    wipe_cashbook: true,
  });

  async function handleWipe(e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    if (confirmText !== 'WIPE') {
      toast.error('Vui lòng nhập WIPE để xác nhận');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/super/tenants/${tenantId}/shops/${shopId}/wipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wipeOptions),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || 'Dữ liệu đã được xóa sạch');
        setIsOpen(false);
        setConfirmText('');
        router.refresh();
      } else {
        toast.error(`Lỗi: ${data.error || 'Failed to wipe data'}`);
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const toggleOption = (key: keyof typeof wipeOptions) => {
    setWipeOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100 transition-colors mt-6"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-red-100 p-2 text-red-600">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="text-left text-red-900">
            <p className="text-sm font-bold">Xóa sạch dữ liệu cửa hàng (Wipe Data)</p>
            <p className="text-xs text-red-700/80">Thao tác nguy hiểm, xóa toàn bộ sản phẩm, khách hàng, đơn hàng...</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-red-600">Thực hiện &rarr;</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-red-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-red-100 bg-red-50/50">
              <div className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-5 w-5" />
                <h3 className="font-bold text-red-700">Dọn dẹp dữ liệu chi nhánh</h3>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setConfirmText('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200 flex gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                <p>
                  Bạn đang chuẩn bị xóa dữ liệu của chi nhánh <strong>{shopName}</strong>. 
                  Hành động này <strong className="text-red-600">không thể hoàn tác</strong>. 
                  Vui lòng chọn các mục cần xóa bên dưới:
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wipeOptions.wipe_products}
                    onChange={() => toggleOption('wipe_products')}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Sản phẩm & Tồn kho</span>
                    <p className="text-xs text-slate-500">Xóa sản phẩm, danh mục, đơn vị quy đổi, tồn kho, định mức (BOM)...</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wipeOptions.wipe_customers}
                    onChange={() => toggleOption('wipe_customers')}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Khách hàng & Đối tác</span>
                    <p className="text-xs text-slate-500">Xóa khách hàng, lịch sử tích điểm, công nợ. (Giữ lại khách mặc định).</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wipeOptions.wipe_orders}
                    onChange={() => toggleOption('wipe_orders')}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Đơn hàng</span>
                    <p className="text-xs text-slate-500">Xóa toàn bộ đơn hàng (bán, trả), chi tiết đơn hàng...</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wipeOptions.wipe_cashbook}
                    onChange={() => toggleOption('wipe_cashbook')}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Sổ quỹ & Thu chi</span>
                    <p className="text-xs text-slate-500">Xóa toàn bộ phiếu thu, phiếu chi, lịch sử giao dịch dòng tiền.</p>
                  </div>
                </label>
              </div>

              <div className="pt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nhập chữ <strong className="text-red-600">WIPE</strong> để xác nhận
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="WIPE"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setConfirmText('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleWipe}
                  disabled={loading || confirmText !== 'WIPE' || !Object.values(wipeOptions).some(Boolean)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Đang dọn dẹp...' : 'Đồng ý Xóa sạch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
