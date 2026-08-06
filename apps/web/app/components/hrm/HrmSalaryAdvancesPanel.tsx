'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  XCircle,
  Clock,
  Plus,
  AlertCircle,
  Send,
  BadgeCheck,
  Loader2,
  CalendarDays,
  RotateCcw,
  CircleDollarSign,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import {
  HrmSalaryAdvancesSkeleton,
  HrmSelectSkeleton,
} from './HrmContentSkeletons';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { formatHrmDateTime, formatHrmPayPeriod, formatHrmPayPeriodLong } from '@/lib/hrm/formatDate';

type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';
type CreateAdvanceAction = 'submit' | 'approve' | 'disburse';

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
  approvedByName: string | null;
  approvedAt: string | null;
  disbursedByName: string | null;
  disbursedAt: string | null;
  isDeducted: boolean;
  createdAt: string;
}

interface SalaryAdvanceEmployee {
  profileId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
}

interface PaymentFund {
  id: string;
  name: string;
  current_balance?: string | number;
  is_default?: string | boolean;
}

interface Props {
  shopId: string;
  selfProfileId: string | null;
  canManage: boolean;
}

function currentPayPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}`;
}

function formatPayPeriod(payPeriod: string): string {
  return formatHrmPayPeriodLong(payPeriod);
}

function recentPayPeriods(count = 12): string[] {
  const [currentYear, currentMonth] = currentPayPeriod()
    .split('-')
    .map(Number);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function StatusBadge({ status }: { status: AdvanceStatus }) {
  type BadgeConfig = { bg: string; Icon: React.ElementType; text: string };
  const config: Record<AdvanceStatus, BadgeConfig> = {
    pending: { bg: 'bg-amber-100 text-amber-700 border-amber-200', text: 'Chờ duyệt', Icon: Clock },
    approved: { bg: 'bg-primary/10 text-primary border-primary/20', text: 'Đã duyệt', Icon: BadgeCheck },
    disbursed: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', text: 'Đã chi', Icon: CircleDollarSign },
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
  const [filterPeriod, setFilterPeriod] = useState<string>(currentPayPeriod);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  // UI States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SalaryAdvance | null>(null);
  const [isProcessOpen, setIsProcessOpen] = useState(false);

  // Queries
  const {
    data: salaryAdvanceData,
    error: salaryAdvanceError,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['hrm', shopId, 'salary-advances', filterPeriod],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filterPeriod) p.set('pay_period', filterPeriod);
      if (!canManage && selfProfileId) p.set('profile_id', selfProfileId);
      const query = p.toString();
      const res = await fetch(
        `/api/shops/${shopId}/hrm/salary-advances${query ? `?${query}` : ''}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error?.message ?? json.error ?? 'Lỗi tải danh sách ứng lương',
        );
      }
      return {
        advances: json.data as SalaryAdvance[],
        employees: (json.employees ?? []) as SalaryAdvanceEmployee[],
      };
    }
  });
  const advances = salaryAdvanceData?.advances ?? [];
  const employees = salaryAdvanceData?.employees ?? [];
  const normalizedEmployeeSearch = employeeSearch
    .trim()
    .toLocaleLowerCase('vi-VN');
  const visibleAdvances = normalizedEmployeeSearch
    ? advances.filter((advance) =>
        advance.employeeName
          .toLocaleLowerCase('vi-VN')
          .includes(normalizedEmployeeSearch),
      )
    : advances;
  const payPeriodOptions = Array.from(
    new Set([...recentPayPeriods(), ...advances.map((advance) => advance.payPeriod)]),
  ).sort((left, right) => right.localeCompare(left));

  // Mutations
  const [overdraftWarning, setOverdraftWarning] = useState<{
    advanceId: string;
    status: 'approved' | 'disbursed';
    fundId?: string;
    available: number;
    required: number;
  } | null>(null);

  const processMutation = useMutation({
    mutationFn: async (vars: { advanceId: string; status: 'approved' | 'disbursed' | 'rejected'; fundId?: string; reason?: string; force?: boolean }) => {
      const res = await fetch(`/api/shops/${shopId}/hrm/salary-advances/${vars.advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: vars.status,
          fund_id: vars.fundId,
          rejection_reason: vars.reason,
          force: vars.force,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        const err = new Error(
          data.error?.message ?? data.error ?? 'Lỗi xử lý yêu cầu',
        ) as Error & { code?: string; status?: number };
        err.code = data.error?.code;
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.status === 'approved'
          ? 'Đã duyệt yêu cầu ứng lương'
          : vars.status === 'disbursed'
            ? 'Đã chi tiền ứng lương và ghi Sổ quỹ'
            : 'Đã từ chối yêu cầu ứng lương',
      );
      queryClient.invalidateQueries({ queryKey: ['hrm', shopId, 'salary-advances'] });
      setIsProcessOpen(false);
      setSelectedRequest(null);
      setOverdraftWarning(null);
    },
    onError: (err: Error & { code?: string; status?: number }, vars) => {
      if (err.code === 'HRM_INSUFFICIENT_FUND_BALANCE' && vars.status === 'disbursed') {
        // Parse available/required from error message nếu có, fallback to 0
        const match = err.message.match(/hiện có ([\.\d,]+)đ, cần ([\.\d,]+)đ/);
        const available = match ? parseFloat(match[1].replace(/\./g, '')) : 0;
        const required = match ? parseFloat(match[2].replace(/\./g, '')) : 0;
        setOverdraftWarning({
          advanceId: vars.advanceId,
          status: vars.status,
          fundId: vars.fundId,
          available,
          required,
        });
        return;
      }
      toast.error(err.message);
    },
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
      key: 'createdAt',
      header: 'Ngày tạo / Kỳ lương',
      sortable: true,
      render: (r: SalaryAdvance) => (
        <div>
          <div className="font-medium text-slate-700">
            {formatHrmDateTime(r.createdAt)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatPayPeriod(r.payPeriod)}
          </div>
        </div>
      ),
    },
    {
      key: 'approvedAt',
      header: 'Duyệt / Người duyệt',
      sortable: true,
      render: (r: SalaryAdvance) =>
        r.approvedAt || r.approvedByName ? (
          <div>
            <div className="font-medium text-slate-700">
              {formatHrmDateTime(r.approvedAt)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {r.approvedByName || '—'}
            </div>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'disbursedAt',
      header: 'Chi / Người chi',
      sortable: true,
      render: (r: SalaryAdvance) =>
        r.disbursedAt || r.disbursedByName ? (
          <div>
            <div className="font-medium text-slate-700">
              {formatHrmDateTime(r.disbursedAt)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {r.disbursedByName || '—'}
            </div>
          </div>
        ) : (
          '—'
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
          {canManage && (r.status === 'pending' || r.status === 'approved') && (
            <button
              onClick={() => { setSelectedRequest(r); setIsProcessOpen(true); }}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {r.status === 'approved' ? 'Chi tiền' : 'Duyệt / Từ chối'}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5 text-emerald-600" />
            Tạm ứng lương
          </h2>
          <p className="text-sm text-slate-500">
            {isLoading ? <span className="inline-block h-3 w-16 animate-pulse rounded bg-slate-200 align-middle" /> : `${advances.length} phiếu`}
            {isFetching && !isLoading && (
              <span className="ml-2 text-xs text-slate-400">
                Đang cập nhật...
              </span>
            )}
          </p>
        </div>
        {(selfProfileId || canManage) && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
          >
            <Plus className="w-4 h-4" />
            Tạo phiếu ứng lương
          </button>
        )}
      </div>

      {!selfProfileId && !canManage && (
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

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SearchBar
            value={employeeSearch}
            onChange={setEmployeeSearch}
            placeholder="Tìm theo tên nhân viên..."
            hideFilter
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="salary-advance-period-filter" className="sr-only">
            Lọc theo kỳ lương
          </label>
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <select
              id="salary-advance-period-filter"
              value={filterPeriod}
              onChange={(event) => setFilterPeriod(event.target.value)}
              className="max-w-[190px] rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-slate-600 shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:min-w-[180px]"
            >
              <option value="">Tất cả kỳ lương</option>
              {payPeriodOptions.map((period) => (
                <option key={period} value={period}>
                  {formatPayPeriod(period)}
                  {period === currentPayPeriod() ? ' · Kỳ này' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            title="Tải lại dữ liệu"
          >
            <RotateCcw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {isFetching ? 'Đang tải...' : 'Làm mới'}
            </span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
        {isLoading ? (
          <HrmSalaryAdvancesSkeleton />
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle className="mx-auto h-12 w-12 text-rose-300" />}
            title="Chưa tải được dữ liệu ứng lương"
            description={
              salaryAdvanceError instanceof Error
                ? salaryAdvanceError.message
                : 'Vui lòng thử tải lại dữ liệu.'
            }
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Thử lại
              </button>
            }
          />
        ) : advances.length === 0 ? (
          <EmptyState
            icon={<Banknote className="w-12 h-12 text-slate-300 mx-auto" />}
            title={
              filterPeriod
                ? `Chưa có phiếu trong ${formatPayPeriod(filterPeriod)}`
                : 'Chưa có khoản ứng lương nào'
            }
            description={
              filterPeriod
                ? 'Kỳ đang chọn chưa có dữ liệu. Bạn có thể xem tất cả kỳ lương.'
                : 'Tạo yêu cầu ứng lương mới để ghi nhận vào hệ thống.'
            }
            action={
              filterPeriod ? (
                <button
                  type="button"
                  onClick={() => setFilterPeriod('')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Xem tất cả kỳ lương
                </button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            data={visibleAdvances}
            columns={columns}
            emptyState={
              <EmptyState
                title="Không tìm thấy nhân viên"
                description={`Không có phiếu ứng lương khớp với “${employeeSearch.trim()}”.`}
                action={
                  <button
                    type="button"
                    onClick={() => setEmployeeSearch('')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Xóa tìm kiếm
                  </button>
                }
              />
            }
          />
        )}
      </div>

      <CreateAdvanceForm
        shopId={shopId}
        selfProfileId={selfProfileId}
        canManage={canManage}
        employees={employees}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ['hrm', shopId, 'salary-advances'] });
        }}
      />

      {selectedRequest && (
        <ProcessAdvanceDialog
          shopId={shopId}
          request={selectedRequest}
          open={isProcessOpen}
          onClose={() => {
            setIsProcessOpen(false);
            setSelectedRequest(null);
          }}
          onProcess={(status, fundId, reason) =>
            processMutation.mutate({
              advanceId: selectedRequest.id,
              status,
              fundId,
              reason,
            })
          }
          isProcessing={processMutation.isPending}
        />
      )}

      {overdraftWarning && (
        <OverdraftWarningDialog
          available={overdraftWarning.available}
          required={overdraftWarning.required}
          isProcessing={processMutation.isPending}
          onConfirm={() => {
            processMutation.mutate({
              advanceId: overdraftWarning.advanceId,
              status: overdraftWarning.status,
              fundId: overdraftWarning.fundId,
              force: true,
            });
          }}
          onCancel={() => setOverdraftWarning(null)}
        />
      )}
    </div>
  );
}

function CreateAdvanceForm({
  shopId,
  selfProfileId,
  canManage,
  employees,
  open,
  onClose,
  onSuccess,
}: {
  shopId: string;
  selfProfileId: string | null;
  canManage: boolean;
  employees: SalaryAdvanceEmployee[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(
    canManage ? '' : (selfProfileId ?? ''),
  );
  const [payPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reason, setReason] = useState('');
  const [fundId, setFundId] = useState('');
  const [createOverdraftWarning, setCreateOverdraftWarning] = useState<{
    action: CreateAdvanceAction;
    available: number;
    required: number;
  } | null>(null);
  const selectedEmployee = employees.find(
    (employee) => employee.profileId === selectedProfileId,
  );

  const {
    data: funds = [],
    isLoading: fundsLoading,
    isError: fundsError,
    error: fundsQueryError,
  } = useQuery<PaymentFund[]>({
    queryKey: ['payment-funds', shopId],
    enabled: open && canManage,
    queryFn: async () => {
      const response = await fetch(`/api/shops/${shopId}/payment-funds`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ??
            payload.error ??
            'Không tải được danh sách quỹ',
        );
      }
      return (payload.data ?? []) as PaymentFund[];
    },
  });

  useEffect(() => {
    if (!canManage || fundId || funds.length === 0) return;
    const defaultFund = funds.find(
      (fund) => fund.is_default === true || fund.is_default === 'TRUE',
    );
    setFundId(defaultFund?.id ?? funds[0].id);
  }, [canManage, fundId, funds]);

  const submitMutation = useMutation({
    mutationFn: async (vars: { action: CreateAdvanceAction; force?: boolean }) => {
      const { action, force } = vars;
      const res = await fetch(`/api/shops/${shopId}/hrm/salary-advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          amount: parseFloat(amount.replace(/\D/g, '')),
          pay_period: payPeriod,
          request_date: new Date().toISOString().split('T')[0],
          reason,
          action: canManage && action !== 'submit' ? action : undefined,
          fund_id: canManage && action === 'disburse' ? fundId : undefined,
          force: action === 'disburse' ? force : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(
          payload.error?.message ?? 'Không thể tạo phiếu ứng lương',
        ) as Error & { code?: string };
        err.code = payload.error?.code;
        throw err;
      }
      return payload as {
        data: { status: 'pending' | 'approved' | 'disbursed' };
      };
    },
    onSuccess: (payload) => {
      toast.success(
        payload.data.status === 'disbursed'
          ? 'Đã tạo phiếu ứng lương, chi tiền và ghi Sổ quỹ'
          : payload.data.status === 'approved'
            ? 'Đã tạo và duyệt phiếu ứng lương'
            : 'Gửi yêu cầu thành công',
      );
      setAmount('');
      setReason('');
      setCreateOverdraftWarning(null);
      if (canManage) setSelectedProfileId('');
      onSuccess();
    },
    onError: (err: Error & { code?: string }, vars) => {
      if (err.code === 'HRM_INSUFFICIENT_FUND_BALANCE' && vars.action === 'disburse') {
        const match = err.message.match(/hiện có ([\.\d,]+)đ, cần ([\.\d,]+)đ/);
        const available = match ? parseFloat(match[1].replace(/\./g, '')) : 0;
        const required = match ? parseFloat(match[2].replace(/\./g, '')) : 0;
        setCreateOverdraftWarning({ action: vars.action, available, required });
        return;
      }
      toast.error(err.message);
    },
  });

  async function confirmCreate(action: CreateAdvanceAction) {
    if (submitMutation.isPending) return;
    if (!selectedProfileId) {
      toast.error('Vui lòng chọn nhân viên');
      return;
    }
    if (!amount) {
      toast.error('Vui lòng nhập số tiền');
      return;
    }
    if (action === 'disburse' && !fundId) {
      toast.error('Vui lòng chọn quỹ chi tiền');
      return;
    }

    const employeeLabel = selectedEmployee?.employeeName
      ? `${selectedEmployee.employeeName} · `
      : '';
    const selectedFund = funds.find((fund) => fund.id === fundId);
    const isDisbursement = action === 'disburse';
    const isApproval = action === 'approve';
    await confirm({
      title: isDisbursement
        ? 'Tạo và chi tiền ứng lương?'
        : isApproval
          ? 'Tạo và duyệt phiếu ứng lương?'
          : 'Gửi yêu cầu ứng lương?',
      description: `${employeeLabel}${amount} đ · ${formatPayPeriod(payPeriod)}.${isDisbursement ? ` Xác nhận sẽ trừ tiền từ quỹ “${selectedFund?.name ?? fundId}” và tự động tạo Phiếu chi trong Sổ quỹ.` : isApproval ? ' Phiếu sẽ chuyển sang trạng thái Đã duyệt và chưa phát sinh Phiếu chi.' : ' Yêu cầu sẽ được gửi đến quản lý để duyệt và chi tiền.'}`,
      confirmLabel: isDisbursement
        ? 'Tạo và chi tiền'
        : isApproval
          ? 'Tạo và duyệt'
          : 'Gửi yêu cầu',
      variant: isDisbursement ? 'success' : 'default',
      onConfirm: async () => {
        await submitMutation.mutateAsync({ action });
      },
    });
  }

  const formIncomplete = !amount || !selectedProfileId;
  const pendingAction = submitMutation.isPending
    ? submitMutation.variables?.action
    : null;

  return (
    <>
      <SlideOver
      open={open}
      onClose={() => {
        if (!submitMutation.isPending) onClose();
      }}
      title={canManage ? 'Tạo phiếu ứng lương' : 'Tạo yêu cầu ứng lương'}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={submitMutation.isPending}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hủy
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => void confirmCreate('approve')}
                  disabled={submitMutation.isPending || formIncomplete}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === 'approve' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {pendingAction === 'approve'
                    ? 'Đang tạo và duyệt...'
                    : 'Tạo và duyệt'}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmCreate('disburse')}
                  disabled={
                    submitMutation.isPending ||
                    formIncomplete ||
                    !fundId ||
                    fundsLoading ||
                    fundsError
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === 'disburse' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                  )}
                  {pendingAction === 'disburse'
                    ? 'Đang tạo và chi tiền...'
                    : 'Tạo và chi tiền'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void confirmCreate('submit')}
                disabled={submitMutation.isPending || formIncomplete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === 'submit' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {pendingAction === 'submit'
                  ? 'Đang gửi yêu cầu...'
                  : 'Gửi yêu cầu'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
          {canManage && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Nhân viên
              </label>
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                disabled={submitMutation.isPending}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Chọn nhân viên cần ứng lương</option>
                {employees.map((employee) => (
                  <option key={employee.profileId} value={employee.profileId}>
                    {employee.employeeName}
                    {employee.employeeCode ? ` · ${employee.employeeCode}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Owner có thể tạo phiếu ở trạng thái Đã duyệt hoặc chi tiền ngay
                từ quỹ được chọn.
              </p>
            </div>
          )}
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
              disabled={submitMutation.isPending}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-bold text-slate-900"
            />
          </div>
          {canManage && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Quỹ xuất tiền
              </label>
              {fundsLoading ? (
                <HrmSelectSkeleton label="Đang tải danh sách quỹ xuất tiền" />
              ) : fundsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {fundsQueryError.message}
                </div>
              ) : (
                <select
                  value={fundId}
                  onChange={(event) => setFundId(event.target.value)}
                  disabled={submitMutation.isPending}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Chọn quỹ xuất tiền</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name} · Dư{' '}
                      {Number(fund.current_balance ?? 0).toLocaleString('vi-VN')} đ
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800">
                <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Quỹ chỉ bắt buộc khi chọn <strong>Tạo và chi tiền</strong>.
                  Hệ thống sẽ trừ quỹ và tự động tạo Phiếu chi trong Sổ quỹ.
                </p>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Lý do (tuỳ chọn)</label>
            <textarea
              value={reason}
              disabled={submitMutation.isPending}
              onChange={e => setReason(e.target.value)}
              rows={4}
              placeholder="Ghi chú thêm (tuỳ chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
      </div>
    </SlideOver>
    {createOverdraftWarning && (
      <OverdraftWarningDialog
        available={createOverdraftWarning.available}
        required={createOverdraftWarning.required}
        isProcessing={submitMutation.isPending}
        onConfirm={() => {
          submitMutation.mutate({
            action: createOverdraftWarning.action,
            force: true,
          });
        }}
        onCancel={() => setCreateOverdraftWarning(null)}
      />
    )}
    </>
  );
}

function ProcessAdvanceDialog({
  shopId,
  request,
  open,
  onClose,
  onProcess,
  isProcessing,
}: {
  shopId: string;
  request: SalaryAdvance;
  open: boolean;
  onClose: () => void;
  onProcess: (
    status: 'approved' | 'disbursed' | 'rejected',
    fundId?: string,
    reason?: string,
  ) => void;
  isProcessing: boolean;
}) {
  const [action, setAction] = useState<'approve' | 'disburse' | 'reject'>(
    'disburse',
  );
  const [fundId, setFundId] = useState('');
  const [reason, setReason] = useState('');
  const canReject = request.status === 'pending';
  const needsFund = action === 'disburse';

  const {
    data: funds = [],
    isLoading,
    isError,
    error,
  } = useQuery<PaymentFund[]>({
    queryKey: ['payment-funds', shopId],
    enabled: open && needsFund,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error?.message ?? json.error ?? 'Không tải được danh sách quỹ',
        );
      }
      return (json.data ?? []) as PaymentFund[];
    },
  });

  useEffect(() => {
    if (fundId || funds.length === 0) return;
    const defaultFund = funds.find(
      (fund) => fund.is_default === true || fund.is_default === 'TRUE',
    );
    setFundId(defaultFund?.id ?? funds[0].id);
  }, [fundId, funds]);

  function handleConfirm() {
    if (isProcessing) return;
    if (action === 'approve') {
      onProcess('approved');
      return;
    }
    if (action === 'disburse') {
      if (!fundId) {
        toast.error('Vui lòng chọn quỹ chi tiền');
        return;
      }
      onProcess('disbursed', fundId);
      return;
    }
    onProcess('rejected', undefined, reason);
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={
        action === 'reject'
          ? 'Từ chối yêu cầu ứng lương'
          : action === 'approve'
            ? 'Duyệt yêu cầu ứng lương'
            : request.status === 'approved'
            ? 'Xác nhận chi tiền ứng lương'
            : 'Duyệt và chi tiền ứng lương'
      }
      description={
        action === 'disburse'
          ? 'Chọn quỹ chi tiền. Khi xác nhận, hệ thống sẽ duyệt yêu cầu, trừ quỹ và tự động tạo Phiếu chi.'
          : action === 'approve'
            ? 'Yêu cầu sẽ chuyển sang trạng thái Đã duyệt nhưng chưa xuất quỹ và chưa tạo Phiếu chi.'
            : 'Xác nhận từ chối yêu cầu ứng lương này.'
      }
      confirmLabel={
        isProcessing
          ? action === 'reject'
            ? 'Đang từ chối...'
            : action === 'approve'
              ? 'Đang duyệt...'
              : 'Đang duyệt và chi...'
          : action === 'reject'
            ? 'Xác nhận từ chối'
            : action === 'approve'
              ? 'Duyệt'
              : request.status === 'approved'
                ? 'Xác nhận chi tiền'
                : 'Duyệt & Chi tiền'
      }
      variant={
        action === 'reject'
          ? 'danger'
          : action === 'disburse'
            ? 'success'
            : 'default'
      }
      loading={isProcessing}
      disableOutsideClick={isProcessing}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Nhân viên</p>
              <p className="font-semibold text-slate-900">
                {request.employeeName}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Số tiền ứng</p>
              <p className="font-bold text-orange-600">
                {Number(request.amount).toLocaleString('vi-VN')} đ
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Kỳ lương</p>
              <p className="font-medium text-slate-800">
                Kỳ {formatHrmPayPeriod(request.payPeriod)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Lý do ứng</p>
              <p className="font-medium text-slate-800">
                {request.reason || '—'}
              </p>
            </div>
          </div>
        </div>

        {canReject ? (
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setAction('approve')}
              disabled={isProcessing}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-all ${action === 'approve' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Duyệt
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAction('disburse')}
              disabled={isProcessing}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-all ${action === 'disburse' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                Duyệt & Chi
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAction('reject')}
              disabled={isProcessing}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-all ${action === 'reject' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Từ chối
            </button>
          </div>
        ) : null}

        {action === 'disburse' ? (
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              Chọn quỹ chi <span className="text-rose-500">*</span>
            </label>
            {isLoading ? (
              <HrmSelectSkeleton label="Đang tải danh sách quỹ chi" />
            ) : isError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error.message}
              </div>
            ) : (
              <select
                value={fundId}
                onChange={(event) => setFundId(event.target.value)}
                disabled={isProcessing}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Chọn quỹ chi tiền</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name} · Số dư{' '}
                    {Number(fund.current_balance ?? 0).toLocaleString('vi-VN')}{' '}
                    đ
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
              <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>Xác nhận sẽ tạo Phiếu chi ứng lương từ quỹ đã chọn.</p>
            </div>
          </div>
        ) : action === 'approve' ? (
          <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm leading-5 text-slate-700">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Chỉ duyệt yêu cầu. Bạn có thể chọn <strong>Chi tiền</strong> sau;
              khi đó hệ thống mới yêu cầu chọn quỹ và tạo Phiếu chi.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              Lý do từ chối
            </label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isProcessing}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Nhập lý do từ chối..."
            />
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}

function OverdraftWarningDialog({
  available,
  required,
  isProcessing,
  onConfirm,
  onCancel,
}: {
  available: number;
  required: number;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={true}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Số dư quỹ đang thiếu"
      description={`Số dư quỹ hiện có ${available.toLocaleString('vi-VN')} đ, không đủ để chi ${required.toLocaleString('vi-VN')} đ. Bạn có muốn tiếp tục chi và cân đối sổ quỹ sau không?`}
      confirmLabel={isProcessing ? 'Đang xử lý...' : 'Vẫn chi và cân đối sau'}
      cancelLabel="Hủy"
      variant="danger"
      loading={isProcessing}
    />
  );
}
