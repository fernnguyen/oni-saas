'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Ban,
  Plus,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { LeaveCalendar } from './LeaveCalendar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'pending_cancellation';
type LeaveType =
  | 'paid'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'compassionate'
  | 'other';
type HalfDayOption = 'full' | 'morning' | 'afternoon';

interface LeaveRequest {
  id: string;
  profileId: string;
  employeeName: string;
  employeeCode: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  halfDayOption: HalfDayOption | null;
  totalDays: number;
  paidDays: number;
  unpaidDays: number;
  reason: string | null;
  status: LeaveStatus;
  approvedBy: string | null;
  approverName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface LeaveBalance {
  profileId: string;
  year: number;
  annualLeaveQuota: number;
  carriedOver: number;
  usedPaidDays: number;
  usedSickDays: number;
  usedUnpaidDays: number;
  remainingPaidDays: number;
}

interface Props {
  shopId: string;
  selfProfileId: string | null;
  canManage: boolean;
}

// ---------------------------------------------------------------------------
// Constants / Helpers
// ---------------------------------------------------------------------------

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  paid: 'Phép năm',
  sick: 'Nghỉ ốm',
  unpaid: 'Nghỉ KL',
  maternity: 'Thai sản',
  compassionate: 'Hỉ/Hiếu',
  other: 'Khác',
};

const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'paid', label: 'Phép năm' },
  { value: 'sick', label: 'Nghỉ ốm' },
  { value: 'unpaid', label: 'Nghỉ không lương' },
  { value: 'maternity', label: 'Thai sản' },
  { value: 'compassionate', label: 'Hỉ-Hiếu' },
  { value: 'other', label: 'Khác' },
];

function countWorkdays(
  start: string,
  end: string,
  holidays: Set<string> = new Set(),
): number {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00+07:00`);
  const e = new Date(`${end}T00:00:00+07:00`);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay(); // 0=Sun, 6=Sat
    const dateStr = cur.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (dow !== 0 && dow !== 6 && !holidays.has(dateStr)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function todayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDate(str: string): string {
  if (!str) return '—';
  const d = new Date(`${str}T00:00:00+07:00`);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: LeaveStatus }) {
  type BadgeConfig = { bg: string; Icon: React.ElementType; text: string };
  const config: Record<LeaveStatus, BadgeConfig> = {
    pending: { bg: 'bg-amber-100 text-amber-700 border-amber-200', text: 'Chờ duyệt', Icon: Clock },
    approved: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', text: 'Đã duyệt', Icon: CheckCircle2 },
    rejected: { bg: 'bg-rose-100 text-rose-700 border-rose-200', text: 'Đã từ chối', Icon: XCircle },
    cancelled: { bg: 'bg-slate-100 text-slate-600 border-slate-200', text: 'Đã huỷ', Icon: Ban },
    pending_cancellation: { bg: 'bg-orange-100 text-orange-700 border-orange-200', text: 'Xin huỷ', Icon: Ban },
  };
  const { bg, text, Icon } = config[status] ?? config.cancelled;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${bg}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confirmation Modals
// ---------------------------------------------------------------------------

/** Modal confirmation when creating leave request */
function ConfirmCreateModal({
  details,
  isPending,
  onConfirm,
  onCancel,
}: {
  details: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    halfDayOption: HalfDayOption;
    totalDays: number;
    paidDays: number;
    unpaidDays: number;
    reason: string;
  };
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Xác nhận gửi đơn xin nghỉ</h3>
            <p className="text-xs text-slate-500">Vui lòng kiểm tra lại thông tin trước khi gửi.</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-sm">
          <div className="flex justify-between border-b border-slate-200/60 pb-2">
            <span className="text-slate-500">Loại nghỉ:</span>
            <span className="font-semibold text-slate-800">{LEAVE_TYPE_LABELS[details.leaveType]}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200/60 pb-2">
            <span className="text-slate-500">Thời gian nghỉ:</span>
            <span className="font-semibold text-slate-800">
              {formatDate(details.startDate)} → {formatDate(details.endDate)}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-200/60 pb-2">
            <span className="text-slate-500">Tổng số ngày tính:</span>
            <span className="font-bold text-slate-900">{details.totalDays} ngày</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>• Số ngày có lương:</span>
            <span className="font-semibold text-emerald-700">{details.paidDays} ngày</span>
          </div>
          {details.unpaidDays > 0 && (
            <div className="flex justify-between text-xs text-amber-700">
              <span>• Số ngày không lương:</span>
              <span className="font-semibold">{details.unpaidDays} ngày</span>
            </div>
          )}
          {details.reason && (
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-slate-500 text-xs block mb-1">Ghi chú / Lý do:</span>
              <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200 text-xs">
                "{details.reason}"
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Quay lại sửa
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPending ? 'Đang gửi...' : 'Xác nhận gửi đơn'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal confirmation when approving leave request */
function ApproveModal({
  request,
  isPending,
  onConfirm,
  onCancel,
}: {
  request: LeaveRequest;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Duyệt đơn xin nghỉ phép</h3>
            <p className="text-xs text-slate-500">Xác nhận chấp thuận đơn nghỉ phép này.</p>
          </div>
        </div>

        <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-4 space-y-2 text-sm">
          <div className="flex justify-between border-b border-emerald-100/60 pb-2">
            <span className="text-slate-500">Nhân viên:</span>
            <span className="font-semibold text-slate-900">
              {request.employeeName} {request.employeeCode ? `(${request.employeeCode})` : ''}
            </span>
          </div>
          <div className="flex justify-between border-b border-emerald-100/60 pb-2">
            <span className="text-slate-500">Loại nghỉ:</span>
            <span className="font-semibold text-slate-800">{LEAVE_TYPE_LABELS[request.leaveType]}</span>
          </div>
          <div className="flex justify-between border-b border-emerald-100/60 pb-2">
            <span className="text-slate-500">Thời gian nghỉ:</span>
            <span className="font-semibold text-slate-800">
              {formatDate(request.startDate)} → {formatDate(request.endDate)}
            </span>
          </div>
          <div className="flex justify-between border-b border-emerald-100/60 pb-2">
            <span className="text-slate-500">Tổng số ngày:</span>
            <span className="font-bold text-slate-900">{request.totalDays} ngày</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>• Có lương: {request.paidDays} ngày</span>
            <span>• Không lương: {request.unpaidDays} ngày</span>
          </div>
          {request.reason && (
            <div className="pt-2 border-t border-emerald-100/60">
              <span className="text-slate-500 text-xs block mb-1">Lý do nghỉ của nhân viên:</span>
              <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-emerald-200/50 text-xs">
                "{request.reason}"
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPending ? 'Đang xử lý...' : 'Xác nhận duyệt'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal confirmation when rejecting leave request (with rejection reason) */
function RejectModal({
  request,
  isPending,
  onConfirm,
  onCancel,
}: {
  request: LeaveRequest;
  isPending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-rose-100 p-2.5 text-rose-600">
            <XCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Từ chối đơn xin nghỉ</h3>
            <p className="text-xs text-slate-500">Từ chối đơn xin nghỉ phép của nhân viên.</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Nhân viên:</span>
            <span className="font-semibold text-slate-800">{request.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Thời gian:</span>
            <span className="font-semibold text-slate-800">
              {formatDate(request.startDate)} - {formatDate(request.endDate)} ({request.totalDays} ngày)
            </span>
          </div>
          {request.reason && (
            <div className="pt-1 border-t border-slate-200/60 mt-1">
              <span className="text-slate-500">Lý do xin nghỉ: </span>
              <span className="text-slate-700 italic">"{request.reason}"</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Lý do từ chối <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Nhập lý do từ chối để thông báo cho nhân viên..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={isPending}
            className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Đang xử lý...' : 'Xác nhận từ chối'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal confirmation when cancelling leave request */
function CancelModal({
  request,
  isPending,
  onConfirm,
  onCancel,
}: {
  request: LeaveRequest;
  isPending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
            <Ban className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Huỷ đơn xin nghỉ phép</h3>
            <p className="text-xs text-slate-500">Xác nhận huỷ đơn xin nghỉ phép này.</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Nhân viên:</span>
            <span className="font-semibold text-slate-800">{request.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Thời gian:</span>
            <span className="font-semibold text-slate-800">
              {formatDate(request.startDate)} - {formatDate(request.endDate)} ({request.totalDays} ngày)
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">
            Lý do huỷ <span className="text-slate-400 font-normal">(Tuỳ chọn)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            placeholder="Nhập lý do huỷ đơn..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[80px]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={isPending}
            className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Đang xử lý...' : 'Xác nhận huỷ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave Balance Card
// ---------------------------------------------------------------------------

function LeaveBalanceCard({
  shopId,
  selfProfileId,
  onOpenCreateForm,
}: {
  shopId: string;
  selfProfileId: string;
  onOpenCreateForm: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ['hrm-leave-balance', shopId, selfProfileId],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/leaves/balance?profile_id=${encodeURIComponent(selfProfileId)}&year=${currentYear}`,
        { cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? 'Không tải được số dư phép.');
      return (json.data ?? json) as LeaveBalance;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="mt-3 h-3 w-full rounded bg-slate-100" />
      </div>
    );
  }

  if (!data) return null;

  const totalUsed = data.usedPaidDays + data.usedSickDays;
  const usagePercent =
    data.annualLeaveQuota > 0
      ? Math.min(100, Math.round((totalUsed / data.annualLeaveQuota) * 100))
      : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Số dư ngày phép {currentYear}
            </h2>
            <p className="text-xs text-slate-500">Quản lý quỹ ngày phép có lương và hạn mức năm.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-all active:scale-95 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Tạo đơn xin nghỉ phép
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Tổng quota</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.annualLeaveQuota}</p>
          <p className="text-xs text-slate-400">ngày / năm</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-xs font-medium text-emerald-600">Còn lại (có lương)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{data.remainingPaidDays}</p>
          <p className="text-xs text-emerald-500">ngày có thể dùng</p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
          <p className="text-xs font-medium text-blue-600">Đã dùng (có lương)</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{data.usedPaidDays}</p>
          <p className="text-xs text-blue-400">ngày</p>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <p className="text-xs font-medium text-amber-600">Nghỉ không lương</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{data.usedUnpaidDays}</p>
          <p className="text-xs text-amber-400">ngày đã nghỉ</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
          <span>Đã dùng {totalUsed}/{data.annualLeaveQuota} ngày phép năm</span>
          <span>{usagePercent}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              usagePercent >= 90
                ? 'bg-rose-500'
                : usagePercent >= 70
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave Request SlideOver Form
// ---------------------------------------------------------------------------

function LeaveRequestFormSlideOver({
  open,
  onClose,
  shopId,
  selfProfileId,
  onSuccess,
  minAdvanceDays,
  existingLeaves,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  selfProfileId: string | null;
  onSuccess: () => void;
  minAdvanceDays: number;
  existingLeaves: LeaveRequest[];
}) {
  const minStartDate = useMemo(() => {
    if (!minAdvanceDays) return todayString();
    const d = new Date();
    d.setDate(d.getDate() + minAdvanceDays);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  }, [minAdvanceDays]);

  const [leaveType, setLeaveType] = useState<LeaveType>('paid');
  const [startDate, setStartDate] = useState(minStartDate);
  const [endDate, setEndDate] = useState(minStartDate);
  const [halfDayOption, setHalfDayOption] = useState<HalfDayOption>('full');
  const [reason, setReason] = useState('');
  const [confirmingModal, setConfirmingModal] = useState(false);
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(minStartDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const currentYear = new Date().getFullYear();
  const { data: balance } = useQuery({
    queryKey: ['hrm-leave-balance', shopId, selfProfileId],
    enabled: Boolean(selfProfileId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!selfProfileId) return null;
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/leaves/balance?profile_id=${encodeURIComponent(selfProfileId)}&year=${currentYear}`,
        { cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok) return null;
      return (json.data ?? json) as LeaveBalance;
    },
  });

  const { data: holidaysData } = useQuery({
    queryKey: ['hrm-holidays', shopId, new Date().getFullYear()],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const year = new Date().getFullYear();
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays?year=${year}`);
      const json = await res.json();
      return (json.data ?? []) as { date: string; name: string }[];
    },
  });
  const holidaysList = holidaysData ?? [];
  const holidaySet = new Set(holidaysList.map((h) => h.date));

  const [selectingEnd, setSelectingEnd] = useState(false);
  const effectiveEndDate = endDate || startDate;
  const isSingleDay = startDate === effectiveEndDate;

  const workdays = useMemo(() => {
    if (!startDate || !effectiveEndDate) return 0;
    const base = countWorkdays(startDate, effectiveEndDate, holidaySet);
    if (isSingleDay && halfDayOption !== 'full') return 0.5;
    return base;
  }, [startDate, effectiveEndDate, halfDayOption, isSingleDay, holidaySet]);

  const holidaysInRange = useMemo(() => {
    if (!startDate || !effectiveEndDate) return 0;
    const rawWithoutHolidays = countWorkdays(startDate, effectiveEndDate, new Set());
    const withHolidays = countWorkdays(startDate, effectiveEndDate, holidaySet);
    return rawWithoutHolidays - withHolidays;
  }, [startDate, effectiveEndDate, holidaySet]);

  const remainingPaid = balance?.remainingPaidDays ?? 0;
  const paidDaysUsed = Math.min(remainingPaid, workdays);
  const unpaidDays = Math.max(0, workdays - remainingPaid);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selfProfileId) throw new Error('Bạn chưa được liên kết với hồ sơ nhân viên.');

      if (minAdvanceDays > 0) {
        const today = todayString();
        const d = new Date(`${today}T00:00:00+07:00`);
        d.setDate(d.getDate() + minAdvanceDays);
        const minDate = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        if (startDate < minDate) {
          throw new Error(`Cần xin nghỉ trước ít nhất ${minAdvanceDays} ngày. Ngày bắt đầu sớm nhất: ${formatDate(minDate)}.`);
        }
      }

      if (workdays <= 0) {
        throw new Error('Khoảng ngày không hợp lệ (trùng cuối tuần hoặc ngày nghỉ lễ).');
      }

      const body: Record<string, unknown> = {
        profile_id: selfProfileId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: effectiveEndDate,
        half_day_option: isSingleDay
          ? (halfDayOption === 'morning' ? 'morning_only' : 'afternoon_only')
          : 'full_day',
        reason: reason || undefined,
        total_days: workdays,
        paid_days: paidDaysUsed,
        unpaid_days: unpaidDays,
      };

      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/leaves`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? 'Không gửi được đơn xin nghỉ.');
      return json;
    },
    onSuccess: () => {
      toast.success('Đã gửi đơn xin nghỉ thành công.');
      setConfirmingModal(false);
      onClose();
      setStartDate(minStartDate);
      setEndDate(minStartDate);
      setSelectingEnd(false);
      setReason('');
      onSuccess();
    },
    onError: (err: Error) => {
      setConfirmingModal(false);
      toast.error(err.message);
    },
  });

  const handlePreSubmit = () => {
    if (!selfProfileId) {
      toast.error('Tài khoản chưa được liên kết với nhân viên.');
      return;
    }
    if (workdays <= 0) {
      toast.error('Khoảng ngày nghỉ không có ngày làm việc hợp lệ.');
      return;
    }
    setConfirmingModal(true);
  };

  const handleSelectDate = (dateStr: string) => {
    if (selectingEnd) {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        setEndDate(dateStr);
      } else {
        setEndDate(dateStr);
        setSelectingEnd(false);
      }
    } else {
      setStartDate(dateStr);
      setEndDate(dateStr);
      setSelectingEnd(true);
    }
  };

  const myExistingLeaves = existingLeaves
    .filter(l => l.profileId === selfProfileId && (l.status === 'pending' || l.status === 'approved'))
    .map(l => ({ startDate: l.startDate, endDate: l.endDate, status: l.status }));

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Tạo đơn xin nghỉ phép"
        width={500}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handlePreSubmit}
              disabled={workdays === 0}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tiếp tục
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Loại nghỉ <span className="text-rose-500">*</span>
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {LEAVE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">
              Ngày nghỉ
              {minAdvanceDays > 0 && (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  (sớm nhất: {formatDate(minStartDate)})
                </span>
              )}
            </label>
            <LeaveCalendar
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              selectedStart={startDate}
              selectedEnd={effectiveEndDate}
              onSelectDate={handleSelectDate}
              existingLeaves={myExistingLeaves}
              holidays={holidaysList}
              isSelectingRange={selectingEnd}
            />
          </div>

          {isSingleDay && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Buổi nghỉ
              </label>
              <select
                value={halfDayOption}
                onChange={(e) => setHalfDayOption(e.target.value as HalfDayOption)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="full">Cả ngày (1.0 công)</option>
                <option value="morning">Buổi sáng (0.5 công)</option>
                <option value="afternoon">Buổi chiều (0.5 công)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Lý do xin nghỉ <span className="text-slate-400">(tuỳ chọn)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do chi tiết để quản lý duyệt..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Computed Preview */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-primary" />
              Chi tiết dự kiến tính phép
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tổng số ngày làm việc:</span>
              <span className="font-bold text-slate-900">{workdays} ngày</span>
            </div>
            {holidaysInRange > 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>• Loại trừ {holidaysInRange} ngày lễ chi nhánh:</span>
                <span>-{holidaysInRange} ngày</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">Ngày phép có lương cấn trừ:</span>
              <span className="font-semibold text-emerald-700">{paidDaysUsed} ngày</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Ngày nghỉ không lương:</span>
              <span className={`font-semibold ${unpaidDays > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {unpaidDays} ngày
              </span>
            </div>

            {unpaidDays > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  Bạn đã dùng hết {remainingPaid} ngày phép năm còn lại. {unpaidDays} ngày sẽ được tính nghỉ không lương.
                </p>
              </div>
            )}

            {workdays === 0 && startDate && endDate && startDate <= endDate && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3">
                <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-700">
                  Khoảng ngày này trùng với cuối tuần hoặc ngày lễ. Không có ngày làm việc cần nghỉ.
                </p>
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {confirmingModal && (
        <ConfirmCreateModal
          details={{
            leaveType,
            startDate,
            endDate,
            halfDayOption,
            totalDays: workdays,
            paidDays: paidDaysUsed,
            unpaidDays,
            reason,
          }}
          isPending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirmingModal(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function HrmLeaveRequestsPanel({ shopId, selfProfileId, canManage }: Props) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);

  // Active modal targets
  const [approvingRequest, setApprovingRequest] = useState<LeaveRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<LeaveRequest | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<LeaveRequest | null>(null);

  // Fetch settings to get min_leave_advance_days rule
  const { data: settingsData } = useQuery({
    queryKey: ['hrm-settings', shopId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`);
      const json = await res.json();
      return (json.data ?? null) as { attendanceRules?: { min_leave_advance_days?: number } } | null;
    },
  });
  const minAdvanceDays = settingsData?.attendanceRules?.min_leave_advance_days ?? 2;

  const query = useQuery({
    queryKey: ['hrm-leave-requests', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/leaves`,
        { cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? 'Không tải được danh sách nghỉ phép.');
      return json as { data: LeaveRequest[] };
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['hrm-leave-requests', shopId] });
    if (selfProfileId) {
      void queryClient.invalidateQueries({
        queryKey: ['hrm-leave-balance', shopId, selfProfileId],
      });
    }
  };

  const actionMutation = useMutation({
    mutationFn: async ({
      leaveId,
      action,
      rejectionReason,
      reason,
    }: {
      leaveId: string;
      action: 'approve' | 'reject' | 'cancel' | 'request_cancel' | 'reject_cancel';
      rejectionReason?: string;
      reason?: string;
    }) => {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/leaves/${encodeURIComponent(leaveId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            rejection_reason: rejectionReason ?? undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? 'Không cập nhật được trạng thái.');
      return json;
    },
    onSuccess: (_data, vars) => {
      const msgMap: Record<string, string> = {
        approve: 'Đã duyệt đơn nghỉ phép thành công.',
        reject: 'Đã từ chối đơn nghỉ phép.',
        cancel: 'Đã huỷ đơn nghỉ phép.',
      };
      toast.success(msgMap[vars.action] ?? 'Đã cập nhật.');
      setApprovingRequest(null);
      setRejectingRequest(null);
      setCancellingRequest(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const filteredData = useMemo(() => {
    const rows = query.data?.data ?? [];
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [query.data, statusFilter]);

  const STATUS_TABS: { value: LeaveStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Đã từ chối' },
  ];

  const columns: Column<LeaveRequest>[] = [
    ...(canManage
      ? ([
          {
            key: 'employeeName',
            label: 'Nhân viên',
            render: (row: LeaveRequest) => (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-semibold text-xs shrink-0 border border-slate-200">
                  {row.employeeName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-slate-900">{row.employeeName}</div>
                  {row.employeeCode && (
                    <div className="text-xs text-slate-400">{row.employeeCode}</div>
                  )}
                </div>
              </div>
            ),
          },
        ] as Column<LeaveRequest>[])
      : []),
    {
      key: 'leaveType',
      label: 'Loại nghỉ',
      render: (row) => (
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType}
        </span>
      ),
    },
    {
      key: 'startDate',
      label: 'Thời gian nghỉ',
      render: (row) => (
        <div>
          <div className="text-xs font-medium text-slate-900">
            {formatDate(row.startDate)} {row.startDate !== row.endDate ? `→ ${formatDate(row.endDate)}` : ''}
          </div>
          {row.startDate === row.endDate && row.halfDayOption && row.halfDayOption !== 'full' && (
            <span className="mt-0.5 inline-block text-[11px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
              {row.halfDayOption === 'morning' ? 'Buổi sáng (0.5 công)' : 'Buổi chiều (0.5 công)'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'totalDays',
      label: 'Số ngày nghỉ',
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900">{row.totalDays} ngày</div>
          <div className="text-[11px] text-slate-500">
            {row.paidDays > 0 && <span className="text-emerald-600 font-medium">{row.paidDays} có lương</span>}
            {row.paidDays > 0 && row.unpaidDays > 0 && <span>, </span>}
            {row.unpaidDays > 0 && <span className="text-amber-600 font-medium">{row.unpaidDays} không lương</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      label: 'Lý do / Ghi chú',
      render: (row) => (
        <div className="max-w-xs space-y-1">
          {row.reason ? (
            <p className="text-xs text-slate-700 line-clamp-2">{row.reason}</p>
          ) : (
            <span className="text-xs text-slate-400 italic">Không có ghi chú</span>
          )}
          {row.status === 'rejected' && row.rejectionReason && (
            <div className="flex items-start gap-1 rounded bg-rose-50 p-1.5 text-[11px] text-rose-700 border border-rose-100">
              <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span><strong>Từ chối:</strong> {row.rejectionReason}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => (
        <div className="space-y-1.5">
          <StatusBadge status={row.status} />
          {(row.status === 'approved' || row.status === 'rejected') && row.approverName && row.approvedAt && (
            <div className="text-[10px] text-slate-500 flex flex-col gap-0.5">
              <span>Bởi: <span className="font-medium text-slate-700">{row.approverName}</span></span>
              <span>Lúc: {new Date(row.approvedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'id' as any,
      label: 'Hành động',
      align: 'right',
      render: (row) => {
        const isOwnRequest = selfProfileId === row.profileId;
        const actions: React.ReactNode[] = [];

        if (row.status === 'pending' && canManage) {
          actions.push(
            <button
              key="approve"
              onClick={() => setApprovingRequest(row)}
              disabled={actionMutation.isPending}
              title="Duyệt đơn"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Duyệt
            </button>,
          );
          actions.push(
            <button
              key="reject"
              onClick={() => setRejectingRequest(row)}
              disabled={actionMutation.isPending}
              title="Từ chối đơn"
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Từ chối
            </button>,
          );
        }

        if (row.status === 'pending' && isOwnRequest && !canManage) {
          actions.push(
            <button
              key="cancel-own"
              onClick={() => setCancellingRequest(row)}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" />
              Huỷ đơn
            </button>,
          );
        }

        const today = todayString();
        if (row.status === 'approved' && isOwnRequest && !canManage && row.startDate >= today) {
          actions.push(
            <button
              key="request-cancel"
              onClick={() => setCancellingRequest(row)}
              disabled={actionMutation.isPending}
              title="Xin huỷ đơn này"
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" />
              Xin huỷ
            </button>,
          );
        }

        if (row.status === 'pending_cancellation' && canManage) {
          actions.push(
            <button
              key="approve-cancel"
              onClick={() => setCancellingRequest(row)}
              disabled={actionMutation.isPending}
              title="Duyệt yêu cầu huỷ"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-900 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Duyệt huỷ
            </button>,
          );
          actions.push(
            <button
              key="reject-cancel"
              onClick={() => setRejectingRequest(row)}
              disabled={actionMutation.isPending}
              title="Từ chối yêu cầu huỷ"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Từ chối huỷ
            </button>,
          );
        }

        if (row.status === 'approved' && canManage) {
          actions.push(
            <button
              key="cancel-approved"
              onClick={() => setCancellingRequest(row)}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" />
              Huỷ đơn
            </button>,
          );
        }

        if (actions.length === 0) {
          return <span className="text-xs text-slate-400">—</span>;
        }

        return (
          <div className="flex items-center justify-end gap-2">{actions}</div>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-6">
        {selfProfileId ? (
          <LeaveBalanceCard
            shopId={shopId}
            selfProfileId={selfProfileId}
            onOpenCreateForm={() => setFormOpen(true)}
          />
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">Chưa liên kết tài khoản nhân viên</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên trong hệ thống.
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Tạo đơn xin nghỉ
                </button>
              )}
            </div>
          </div>
        )}

        {/* SlideOver Form */}
        <LeaveRequestFormSlideOver
          open={formOpen}
          onClose={() => setFormOpen(false)}
          shopId={shopId}
          selfProfileId={selfProfileId}
          onSuccess={invalidate}
          minAdvanceDays={minAdvanceDays}
          existingLeaves={query.data?.data ?? []}
        />

        {/* Main Requests Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Danh sách đơn xin nghỉ phép
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {canManage
                    ? 'Quản lý và duyệt các đơn xin nghỉ phép của nhân viên toàn chi nhánh.'
                    : 'Danh sách đơn xin nghỉ phép của bạn.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_TABS.map((tab) => {
                  const count =
                    tab.value !== 'all'
                      ? (query.data?.data ?? []).filter(
                          (r) => r.status === tab.value,
                        ).length
                      : null;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setStatusFilter(tab.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                        statusFilter === tab.value
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                      {count !== null && (
                        <span className="ml-1.5 opacity-75">({count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4">
            <DataTable
              columns={columns}
              data={filteredData}
              loading={query.isLoading}
              rowKey={(row) => row.id}
              emptyState={<EmptyState title="Không có đơn nghỉ phép nào" description="Chưa có thông tin đơn nghỉ phép được ghi nhận." />}
            />
            {query.isError && (
              <p className="mt-3 text-sm text-rose-600">
                {(query.error as Error).message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Confirmation Modals */}
      {approvingRequest && (
        <ApproveModal
          request={approvingRequest}
          isPending={actionMutation.isPending}
          onConfirm={() =>
            actionMutation.mutate({
              leaveId: approvingRequest.id,
              action: 'approve',
            })
          }
          onCancel={() => setApprovingRequest(null)}
        />
      )}

      {rejectingRequest && (
        <RejectModal
          request={rejectingRequest}
          isPending={actionMutation.isPending}
          onConfirm={(reason) => {
            if (!reason.trim()) {
              toast.error('Vui lòng nhập lý do từ chối.');
              return;
            }
            actionMutation.mutate({
              leaveId: rejectingRequest.id,
              action: 'reject',
              rejectionReason: reason,
            });
          }}
          onCancel={() => setRejectingRequest(null)}
        />
      )}

      {cancellingRequest && (
        <CancelModal
          request={cancellingRequest}
          isPending={actionMutation.isPending}
          onConfirm={(reason) =>
            actionMutation.mutate({
              leaveId: cancellingRequest.id,
              action: cancellingRequest.status === 'pending' || canManage && cancellingRequest.status !== 'pending_cancellation' ? 'cancel' : 'request_cancel',
              reason,
            })
          }
          onCancel={() => setCancellingRequest(null)}
        />
      )}
    </>
  );
}
