'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Info,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { Ban, Loader2, Send, HandCoins } from 'lucide-react';

type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';

interface SalaryAdvance {
  id: string;
  profileId: string;
  employeeName: string;
  employeeCode: string | null;
  amount: string | number;
  requestDate: string;
  payPeriod: string;
  status: AdvanceStatus;
  reason: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  disbursedAt: string | null;
  isDeducted: boolean;
  createdAt: string;
}

interface Props {
  shopId: string;
  selfProfileId: string | null;
  canManage: boolean;
}

function StatusBadge({ status }: { status: AdvanceStatus }) {
  type BadgeConfig = { bg: string; Icon: React.ElementType; text: string };
  const config: Record<AdvanceStatus, BadgeConfig> = {
    pending: { bg: 'bg-amber-100 text-amber-700 border-amber-200', text: 'Chờ duyệt', Icon: Clock },
    approved: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', text: 'Đã duyệt', Icon: CheckCircle2 },
    disbursed: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', text: 'Đã chi', Icon: CheckCircle2 },
    rejected: { bg: 'bg-rose-100 text-rose-700 border-rose-200', text: 'Từ chối', Icon: XCircle },
    cancelled: { bg: 'bg-slate-100 text-slate-600 border-slate-200', text: 'Đã huỷ', Icon: XCircle },
  };
  const { bg, text, Icon } = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${bg}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

export function HrmSalaryAdvancesPanel({ shopId, selfProfileId, canManage }: Props) {
  const queryClient = useQueryClient();
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  
  // UI States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SalaryAdvance | null>(null);
  const [isProcessOpen, setIsProcessOpen] = useState(false);

  // Queries
  const { data: advances = [], isLoading } = useQuery({
    queryKey: ['hrm', shopId, 'salary-advances', filterPeriod],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filterPeriod) p.set('pay_period', filterPeriod);
      if (!canManage && selfProfileId) p.set('profile_id', selfProfileId);
      const res = await fetch(`/api/shops/${shopId}/hrm/salary-advances?${p.toString()}`);
      if (!res.ok) throw new Error('Lỗi tải danh sách ứng lương');
      const json = await res.json();
      return json.data as SalaryAdvance[];
    }
  });

  // Mutations
  const processMutation = useMutation({
    mutationFn: async (vars: { advanceId: string; status: 'approved' | 'rejected'; fundId?: string; reason?: string }) => {
      const res = await fetch(`/api/shops/${shopId}/hrm/salary-advances/${vars.advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: vars.status,
          fund_id: vars.fundId,
          rejection_reason: vars.reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Lỗi xử lý yêu cầu');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Xử lý thành công');
      queryClient.invalidateQueries({ queryKey: ['hrm', shopId, 'salary-advances'] });
      setIsProcessOpen(false);
      setSelectedRequest(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const columns: Column<SalaryAdvance>[] = [
    {
      key: 'employee',
      header: 'Nhân viên',
      render: (r: SalaryAdvance) => (
        <div>
          <div className="font-semibold text-slate-800">{r.employeeName}</div>
          <div className="text-xs text-slate-500">{r.employeeCode || '—'}</div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Số tiền',
      render: (r: SalaryAdvance) => (
        <div className="font-bold text-slate-800">
          {Number(r.amount).toLocaleString('vi-VN')} đ
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Ngày / Kỳ lương',
      render: (r: SalaryAdvance) => (
        <div>
          <div className="text-sm font-medium text-slate-900">
            Kỳ {r.payPeriod.split('-').reverse().join('/')}
          </div>
          <div className="text-xs text-slate-500">
            Xin ứng: {new Date(r.requestDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Lý do',
      render: (r: SalaryAdvance) => <span className="text-sm text-slate-600 line-clamp-2">{r.reason || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (r: SalaryAdvance) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (r: SalaryAdvance) => (
        <div className="flex justify-end gap-2">
          {canManage && r.status === 'pending' && (
            <button
              onClick={() => { setSelectedRequest(r); setIsProcessOpen(true); }}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Duyệt / Từ chối
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            Tạm ứng lương
          </h2>
          <p className="text-sm text-slate-500">Quản lý các khoản ứng lương và tự động khấu trừ.</p>
        </div>
        {selfProfileId && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
          >
            <Plus className="w-4 h-4" />
            Tạo phiếu ứng lương
          </button>
        )}
      </div>

      {!selfProfileId && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Chưa liên kết tài khoản nhân viên</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên trong hệ thống nên không thể tạo yêu cầu ứng lương. Quản trị viên (Owner) vẫn có thể xem và duyệt yêu cầu của nhân viên khác bên dưới.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Đang tải dữ liệu...</div>
        ) : advances.length === 0 ? (
          <EmptyState
            icon={<Banknote className="w-12 h-12 text-slate-300 mx-auto" />}
            title="Chưa có khoản ứng lương nào"
            description="Tạo yêu cầu ứng lương mới để ghi nhận vào hệ thống."
          />
        ) : (
          <DataTable data={advances} columns={columns} />
        )}
      </div>

      <CreateAdvanceForm
        shopId={shopId}
        selfProfileId={selfProfileId!}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ['hrm', shopId, 'salary-advances'] });
        }}
      />

      {/* Process Modal */}
      <SlideOver
        open={isProcessOpen}
        onClose={() => { setIsProcessOpen(false); setSelectedRequest(null); }}
        title="Duyệt ứng lương"
      >
        {selectedRequest && (
          <ProcessAdvanceForm
            shopId={shopId}
            request={selectedRequest}
            onProcess={(status, fundId, reason) => processMutation.mutate({ advanceId: selectedRequest.id, status, fundId, reason })}
            isProcessing={processMutation.isPending}
          />
        )}
      </SlideOver>
    </div>
  );
}

function CreateAdvanceForm({ shopId, selfProfileId, open, onClose, onSuccess }: { shopId: string; selfProfileId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [payPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reason, setReason] = useState('');
  const [confirmingModal, setConfirmingModal] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/hrm/salary-advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selfProfileId,
          amount: parseFloat(amount.replace(/\D/g, '')),
          pay_period: payPeriod,
          request_date: new Date().toISOString().split('T')[0],
          reason,
        }),
      });
      if (!res.ok) throw new Error('Không thể tạo yêu cầu');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Gửi yêu cầu thành công');
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <SlideOver open={open} onClose={onClose} title="Tạo yêu cầu ứng lương">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Kỳ lương (Cố định)</label>
            <div className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-500 font-medium">
              Tháng {payPeriod.split('-')[1].replace(/^0/, '')}/{payPeriod.split('-')[0]}
            </div>
            <p className="text-xs text-slate-500">Yêu cầu ứng lương luôn được ghi nhận vào kỳ lương hiện tại.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Số tiền ứng (VNĐ)</label>
            <input
              type="text"
              placeholder="Ví dụ: 10,000,000"
              value={amount}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-bold text-slate-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Lý do (tuỳ chọn)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              placeholder="Ghi chú thêm (tuỳ chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>
        <div className="border-t border-slate-100 p-5 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            onClick={() => {
              if (!amount) return toast.error('Vui lòng nhập số tiền');
              setConfirmingModal(true);
            }}
            disabled={!amount}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-all disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Gửi yêu cầu
          </button>
        </div>
      </div>

      {confirmingModal && (
        <ConfirmCreateModal
          amount={amount}
          payPeriod={payPeriod}
          isPending={submitMutation.isPending}
          onConfirm={() => submitMutation.mutate()}
          onCancel={() => setConfirmingModal(false)}
        />
      )}
    </SlideOver>
  );
}

function ProcessAdvanceForm({ shopId, request, onProcess, isProcessing }: { shopId: string; request: SalaryAdvance; onProcess: (s: 'approved' | 'rejected', f?: string, r?: string) => void, isProcessing: boolean }) {
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [fundId, setFundId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmingAction, setConfirmingAction] = useState<'approve' | 'reject' | null>(null);

  // Lấy danh sách quỹ thanh toán
  const { data: funds = [], isLoading } = useQuery({
    queryKey: ['payment-funds', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    }
  });

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Nhân viên</p>
            <p className="font-semibold text-slate-900">{request.employeeName}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Số tiền ứng</p>
            <p className="font-bold text-orange-600">{Number(request.amount).toLocaleString('vi-VN')} đ</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Kỳ lương</p>
            <p className="font-medium text-slate-800">Kỳ {request.payPeriod.split('-').reverse().join('/')}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Lý do ứng</p>
            <p className="font-medium text-slate-800">{request.reason || '—'}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
        <button
          onClick={() => setAction('approve')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${action === 'approve' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Duyệt & Giải ngân
        </button>
        <button
          onClick={() => setAction('reject')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${action === 'reject' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Từ chối
        </button>
      </div>

      {action === 'approve' ? (
        <div className="space-y-4">
          <div className="bg-blue-50 text-blue-800 p-3 rounded-lg flex gap-3 text-sm border border-blue-100">
            <Info className="w-5 h-5 shrink-0" />
            <p>Hệ thống sẽ <strong>tự động tạo Phiếu chi</strong> trong Sổ quỹ và trừ tiền ngay lập tức khi bạn bấm Duyệt.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Chọn quỹ thanh toán <span className="text-red-500">*</span></label>
            {isLoading ? (
              <div className="text-sm text-slate-500">Đang tải danh sách quỹ...</div>
            ) : (
              <select value={fundId} onChange={e => setFundId(e.target.value)} className="w-full h-10 px-3 border border-slate-200 rounded-lg focus:border-emerald-500 outline-none">
                <option value="">-- Chọn quỹ --</option>
                {funds.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} {f.current_balance ? `(Dư: ${parseFloat(f.current_balance).toLocaleString('vi-VN')}đ)` : ''}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lý do từ chối</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full p-3 border border-slate-200 rounded-lg outline-none resize-none" placeholder="Nhập lý do từ chối..." />
        </div>
      )}

      <div className="mt-auto pt-6 flex gap-3">
        {action === 'approve' ? (
          <button
            onClick={() => setConfirmingAction('approve')}
            disabled={isProcessing || !fundId}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {isProcessing ? 'Đang xử lý...' : <><CheckCircle2 className="w-5 h-5" /> Duyệt và Chi tiền</>}
          </button>
        ) : (
          <button
            onClick={() => setConfirmingAction('reject')}
            disabled={isProcessing}
            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {isProcessing ? 'Đang xử lý...' : <><XCircle className="w-5 h-5" /> Từ chối yêu cầu</>}
          </button>
        )}
      </div>

      {confirmingAction === 'approve' && (
        <ConfirmProcessModal
          action="approve"
          request={request}
          fundName={funds.find((f: any) => f.id === fundId)?.name}
          isPending={isProcessing}
          onConfirm={() => {
            setConfirmingAction(null);
            onProcess('approved', fundId, undefined);
          }}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {confirmingAction === 'reject' && (
        <ConfirmProcessModal
          action="reject"
          request={request}
          reason={reason}
          isPending={isProcessing}
          onConfirm={() => {
            setConfirmingAction(null);
            onProcess('rejected', undefined, reason);
          }}
          onCancel={() => setConfirmingAction(null)}
        />
      )}
    </div>
  );
}

function ConfirmCreateModal({
  amount,
  payPeriod,
  isPending,
  onConfirm,
  onCancel,
}: {
  amount: string;
  payPeriod: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
            <HandCoins className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Xác nhận xin ứng lương</h3>
            <p className="text-xs text-slate-500">Xác nhận gửi yêu cầu ứng lương cho kỳ này.</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Kỳ lương:</span>
            <span className="font-semibold text-slate-800">Kỳ {payPeriod.split('-').reverse().join('/')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Số tiền ứng:</span>
            <span className="font-semibold text-emerald-600">{amount} đ</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Xác nhận gửi
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmProcessModal({
  action,
  request,
  fundName,
  reason,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: 'approve' | 'reject';
  request: SalaryAdvance;
  fundName?: string;
  reason?: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isApprove = action === 'approve';
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${isApprove ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
            {isApprove ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {isApprove ? 'Xác nhận duyệt và chi tiền' : 'Xác nhận từ chối'}
            </h3>
            <p className="text-xs text-slate-500">
              {isApprove 
                ? 'Hệ thống sẽ tạo phiếu chi trong Sổ quỹ và trừ tiền ứng lương.' 
                : 'Yêu cầu ứng lương này sẽ bị từ chối và thông báo đến nhân viên.'}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Nhân viên:</span>
            <span className="font-semibold text-slate-800">{request.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Kỳ lương:</span>
            <span className="font-semibold text-slate-800">Kỳ {request.payPeriod.split('-').reverse().join('/')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Số tiền:</span>
            <span className="font-semibold text-orange-600">{Number(request.amount).toLocaleString('vi-VN')} đ</span>
          </div>
          {isApprove && fundName && (
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
              <span className="text-slate-500">Quỹ chi tiền:</span>
              <span className="font-semibold text-emerald-600">{fundName}</span>
            </div>
          )}
          {!isApprove && reason && (
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
              <span className="text-slate-500">Lý do từ chối:</span>
              <span className="font-medium text-slate-700">{reason}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 ${
              isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isApprove ? 'Duyệt & Chi' : 'Từ chối'}
          </button>
        </div>
      </div>
    </div>
  );
}
