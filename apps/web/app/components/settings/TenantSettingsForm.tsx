'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';


interface Props {
  tenantId: string;
  canManage: boolean;
  isOwner?: boolean;
  initialShareCustomers?: boolean;
}

export function TenantSettingsForm({ tenantId, canManage, isOwner, initialShareCustomers }: Props) {
  const confirm = useConfirm();
  const [shareCustomers, setShareCustomers] = useState(initialShareCustomers ?? false);
  const [savingShare, setSavingShare] = useState(false);

  async function handleToggleShareCustomers() {
    if (!canManage) return;
    const newValue = !shareCustomers;
    
    const confirmTitle = newValue 
      ? 'Kích hoạt Dùng chung Khách hàng' 
      : 'Tắt Dùng chung Khách hàng';

    const ok = await confirm({
      title: confirmTitle,
      confirmLabel: 'Xác nhận',
      cancelLabel: 'Hủy',
      children: newValue ? (
        <p className="text-sm text-slate-500 leading-relaxed">
          Khi bật <strong>Dùng chung (Hybrid Sharing)</strong>, thông tin liên lạc (Tên, SĐT, Email) của khách hàng có số điện thoại sẽ được chia sẻ toàn hệ thống. Điểm tích lũy, số dư công nợ và ghi chú riêng tư vẫn được cách ly an toàn theo từng chi nhánh. Khách hàng không có số điện thoại sẽ tự động lưu riêng tư tại chi nhánh tạo.
        </p>
      ) : (
        <p className="text-sm text-slate-500 leading-relaxed">
          Khi tắt <strong>Dùng chung (Hybrid Sharing)</strong>, dữ liệu khách hàng sẽ được cách ly biệt lập theo từng chi nhánh. Chỉ những khách hàng đã phát sinh giao dịch mới tiếp tục hiển thị tại chi nhánh có liên quan.
        </p>
      )
    });

    if (!ok) return;

    setSavingShare(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_customers: newValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Lỗi khi lưu cấu hình');
      }
      setShareCustomers(newValue);
      toast.success('Đã lưu chiến lược quản lý khách hàng thành công!');
    } catch (e: any) {
      toast.error(e.message || 'Lỗi lưu cài đặt');
    } finally {
      setSavingShare(false);
    }
  }



  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mt-6">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Chiến lược quản lý dữ liệu Khách hàng</h2>
          <p className="text-xs text-slate-400 mt-0.5">Quyết định cơ chế bảo mật và chia sẻ danh bạ khách hàng giữa tất cả các chi nhánh.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">Dùng chung dữ liệu Khách hàng giữa các chi nhánh</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${shareCustomers ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                  {shareCustomers ? 'Bật dùng chung' : 'Riêng tư'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-2xl">
                Khi bật <strong>Dùng chung (Hybrid Sharing)</strong>, thông tin liên lạc (Tên, SĐT, Email) của khách hàng có số điện thoại sẽ được chia sẻ toàn hệ thống. Điểm tích lũy, số dư công nợ và ghi chú riêng tư vẫn được cách ly an toàn theo từng chi nhánh. Khách hàng không có số điện thoại sẽ tự động lưu riêng tư tại chi nhánh tạo.
              </p>
            </div>
            <div className="shrink-0 pt-0.5">
              <button
                type="button"
                disabled={!canManage || savingShare}
                onClick={handleToggleShareCustomers}
                className={`relative h-6 w-11 rounded-full transition-colors ${shareCustomers ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${shareCustomers ? 'translate-x-5' : ''}`}
                />
              </button>
            </div>
          </div>
          
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 flex items-start gap-2.5">
            <span className="text-sm">💡</span>
            <div className="text-[11px] text-slate-500 leading-normal">
              {shareCustomers 
                ? 'Đang áp dụng chính sách liên kết dữ liệu tự động (Auto-Link). Nhân viên ở bất kỳ chi nhánh nào đều có thể tra cứu nhanh thông tin khách hàng bằng số điện thoại để tạo đơn hàng mới, giúp tối ưu trải nghiệm khách hàng đa kênh.'
                : 'Đang áp dụng chính sách phân mảnh 100% dữ liệu (Silo). Dữ liệu khách hàng hoàn toàn biệt lập giữa các chi nhánh. Nhân viên chi nhánh A không thể xem hoặc tra cứu thông tin khách hàng của chi nhánh B.'
              }
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
