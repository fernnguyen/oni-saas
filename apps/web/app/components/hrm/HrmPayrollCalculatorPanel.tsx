'use client';

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Pencil,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/app/components/ui/CurrencyInput';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import {
  calculatePayroll,
  type PayrollSalaryType,
} from '@/lib/hrm/domain/payrollCalculator';

type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'paid_leave'
  | 'unpaid_leave'
  | 'holiday';

interface MonthlyAttendanceRow {
  employeeId: string;
  workedMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus | null;
}

export interface PayrollPreviewEmployee {
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  departmentName: string | null;
  policySource: 'custom' | 'group' | 'default' | 'missing';
  policyName: string | null;
  salaryType: PayrollSalaryType | null;
  baseAmount: number | null;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number | null;
  recurringAllowances: Array<{ label: string; amount: number }>;
}

interface PayrollPreviewRow extends PayrollPreviewEmployee {
  paidWorkDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  grossPay: number | null;
  netPay: number | null;
  calculationError: boolean;
}

const PAID_STATUSES = new Set<AttendanceStatus>([
  'present',
  'paid_leave',
  'holiday',
]);

function currency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}g ${remaining}p` : `${hours}g`;
}

function policyLabel(row: PayrollPreviewEmployee): string {
  if (row.policySource === 'custom') return 'Tùy chỉnh riêng';
  if (row.policySource === 'default') {
    return `${row.policyName ?? 'Nhóm mặc định'} · mặc định`;
  }
  return row.policyName ?? 'Chưa cấu hình';
}

interface PayrollMoneyItem {
  label: string;
  amount: number;
}

interface PayrollRunSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'finalized' | 'paid';
  standardWorkDays: number;
  totalGross: number;
  totalAllowances: number;
  totalDeductions: number;
  totalNet: number;
  version: number;
  calculatedAt: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
}

interface PayrollRunItem {
  id: string;
  profileId: string;
  employeeName: string;
  employeeCode: string | null;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  workUnits: number;
  regularPay: number;
  overtimePay: number;
  allowanceTotal: number;
  bonusTotal: number;
  commissionTotal: number;
  deductionTotal: number;
  netPay: number;
  breakdown: {
    adjustments: {
      additionalAllowances: PayrollMoneyItem[];
      bonuses: PayrollMoneyItem[];
      commissions: PayrollMoneyItem[];
      deductions: PayrollMoneyItem[];
    };
  };
  manualNote: string | null;
}

interface PayrollRunDetail extends PayrollRunSummary {
  items: PayrollRunItem[];
}

interface AdjustmentForm {
  allowanceLabel: string;
  allowanceAmount: string;
  bonusLabel: string;
  bonusAmount: string;
  commissionLabel: string;
  commissionAmount: string;
  deductionLabel: string;
  deductionAmount: string;
  manualNote: string;
}

const EMPTY_ADJUSTMENT_FORM: AdjustmentForm = {
  allowanceLabel: 'Phụ cấp phát sinh',
  allowanceAmount: '',
  bonusLabel: 'Thưởng',
  bonusAmount: '',
  commissionLabel: 'Hoa hồng',
  commissionAmount: '',
  deductionLabel: 'Khấu trừ',
  deductionAmount: '',
  manualNote: '',
};

function firstAdjustment(
  values: PayrollMoneyItem[] | undefined,
  fallbackLabel: string,
): { label: string; amount: string } {
  const first = values?.[0];
  return {
    label: first?.label ?? fallbackLabel,
    amount: first ? String(first.amount) : '',
  };
}

function adjustmentItems(label: string, amount: string): PayrollMoneyItem[] {
  const value = Number(amount || 0);
  return value > 0 ? [{ label: label.trim(), amount: value }] : [];
}

function runStatusLabel(status: PayrollRunSummary['status']): string {
  if (status === 'draft') return 'Bản nháp';
  if (status === 'finalized') return 'Đã chốt';
  return 'Đã thanh toán';
}

export function HrmPayrollCalculatorPanel({
  shopId,
  month,
  onMonthChange,
  employees,
  salaryLoading,
  salaryError,
}: {
  shopId: string;
  month: string;
  onMonthChange: (month: string) => void;
  employees: PayrollPreviewEmployee[];
  salaryLoading: boolean;
  salaryError?: string;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<PayrollRunItem | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>(
    EMPTY_ADJUSTMENT_FORM,
  );

  const attendanceQuery = useQuery({
    queryKey: ['hrm-attendance-month', shopId, month],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance?month=${encodeURIComponent(month)}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không tải được công cán để tính lương.',
        );
      }
      return payload as { data: MonthlyAttendanceRow[] };
    },
  });

  const runsQuery = useQuery({
    queryKey: ['hrm-payroll-runs', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được kỳ lương.');
      }
      return payload as {
        data: PayrollRunSummary[];
        canManage: boolean;
        canPay: boolean;
      };
    },
  });

  const currentRunSummary = useMemo(
    () =>
      runsQuery.data?.data.find((run) => run.periodStart.startsWith(month)) ??
      null,
    [month, runsQuery.data?.data],
  );

  const detailQuery = useQuery({
    queryKey: ['hrm-payroll-run', shopId, currentRunSummary?.id],
    enabled: Boolean(currentRunSummary?.id),
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(currentRunSummary?.id ?? '')}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không tải được chi tiết kỳ lương.',
        );
      }
      return payload as {
        data: PayrollRunDetail;
        canManage: boolean;
        canPay: boolean;
      };
    },
  });

  const previewRows = useMemo<PayrollPreviewRow[]>(() => {
    const attendanceByEmployee = new Map<
      string,
      { paidWorkDays: number; workedMinutes: number; overtimeMinutes: number }
    >();

    for (const attendance of attendanceQuery.data?.data ?? []) {
      const aggregate = attendanceByEmployee.get(attendance.employeeId) ?? {
        paidWorkDays: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
      };
      if (attendance.status && PAID_STATUSES.has(attendance.status)) {
        aggregate.paidWorkDays += 1;
      }
      aggregate.workedMinutes += attendance.workedMinutes;
      aggregate.overtimeMinutes += attendance.overtimeMinutes;
      attendanceByEmployee.set(attendance.employeeId, aggregate);
    }

    return employees.map((employee) => {
      const attendance = attendanceByEmployee.get(employee.employeeId) ?? {
        paidWorkDays: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
      };
      if (
        !employee.salaryType ||
        employee.baseAmount === null ||
        employee.overtimeMultiplier === null
      ) {
        return {
          ...employee,
          ...attendance,
          grossPay: null,
          netPay: null,
          calculationError: false,
        };
      }

      try {
        const calculation = calculatePayroll({
          salaryType: employee.salaryType,
          baseAmount: employee.baseAmount,
          standardWorkDays: employee.standardWorkDays,
          standardWorkHoursMilli:
            employee.standardWorkHours === null
              ? null
              : Math.round(employee.standardWorkHours * 1000),
          paidWorkDaysMilli: attendance.paidWorkDays * 1000,
          workedMinutes: attendance.workedMinutes,
          overtimeMinutes: attendance.overtimeMinutes,
          overtimeMultiplierBasisPoints: Math.round(
            employee.overtimeMultiplier * 10_000,
          ),
          recurringAllowances: employee.recurringAllowances,
        });
        return {
          ...employee,
          ...attendance,
          grossPay: calculation.grossPay,
          netPay: calculation.netPay,
          calculationError: false,
        };
      } catch {
        return {
          ...employee,
          ...attendance,
          grossPay: null,
          netPay: null,
          calculationError: true,
        };
      }
    });
  }, [attendanceQuery.data?.data, employees]);

  const previewTotals = useMemo(
    () => ({
      ready: previewRows.filter((row) => row.netPay !== null).length,
      missing: previewRows.filter(
        (row) => row.policySource === 'missing' || row.calculationError,
      ).length,
      netPay: previewRows.reduce((sum, row) => sum + (row.netPay ?? 0), 0),
    }),
    [previewRows],
  );

  const invalidatePayroll = () => {
    void queryClient.invalidateQueries({
      queryKey: ['hrm-payroll-runs', shopId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['hrm-payroll-run', shopId],
    });
  };

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const currentVersion =
        detailQuery.data?.data.version ?? currentRunSummary?.version ?? null;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: month,
            standard_work_days: 26,
            expected_version: currentVersion,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không thể tính bảng lương.',
        );
      }
      return payload.data as PayrollRunDetail;
    },
    onSuccess: (updatedRun) => {
      const previousNet =
        detailQuery.data?.data.totalNet ?? previewTotals.netPay;
      const difference = updatedRun.totalNet - previousNet;
      toast.success(
        currentRunSummary
          ? `Đã tính lại kỳ lương · chênh lệch ${difference >= 0 ? '+' : ''}${currency(difference)}`
          : 'Đã tạo kỳ lương nháp',
      );
      invalidatePayroll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const run = detailQuery.data?.data;
      if (!run) return;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_version: run.version }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể chốt kỳ lương.');
      }
    },
    onSuccess: () => {
      toast.success('Đã chốt kỳ lương');
      invalidatePayroll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const run = detailQuery.data?.data;
      if (!run || !selectedItem) return;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/items/${encodeURIComponent(selectedItem.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_version: run.version,
            additional_allowances: adjustmentItems(
              adjustmentForm.allowanceLabel,
              adjustmentForm.allowanceAmount,
            ),
            bonuses: adjustmentItems(
              adjustmentForm.bonusLabel,
              adjustmentForm.bonusAmount,
            ),
            commissions: adjustmentItems(
              adjustmentForm.commissionLabel,
              adjustmentForm.commissionAmount,
            ),
            deductions: adjustmentItems(
              adjustmentForm.deductionLabel,
              adjustmentForm.deductionAmount,
            ),
            manual_note: adjustmentForm.manualNote,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không thể lưu điều chỉnh lương.',
        );
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật điều chỉnh lương');
      setSelectedItem(null);
      setAdjustmentForm(EMPTY_ADJUSTMENT_FORM);
      invalidatePayroll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function confirmCalculate() {
    const accepted = await confirm({
      title: currentRunSummary ? 'Tính lại kỳ lương?' : 'Tạo kỳ lương nháp?',
      description: currentRunSummary
        ? 'Hệ thống sẽ đọc lại công cán và chính sách lương. Các khoản điều chỉnh thủ công hiện có được giữ lại.'
        : `Tạo bảng lương nháp cho tháng ${month.slice(5, 7)}/${month.slice(0, 4)} từ công cán hiện tại.`,
      confirmLabel: currentRunSummary ? 'Tính lại' : 'Tạo kỳ lương',
    });
    if (accepted) calculateMutation.mutate();
  }

  async function confirmFinalize() {
    const run = detailQuery.data?.data;
    if (!run) return;
    const accepted = await confirm({
      title: 'Chốt kỳ lương?',
      description: `${run.items.length} nhân viên · tổng thực nhận ${currency(run.totalNet)}. Sau khi chốt, kỳ lương trở thành snapshot và không thể tính lại hoặc sửa khoản cộng/trừ.`,
      confirmLabel: 'Chốt kỳ lương',
      variant: 'danger',
    });
    if (accepted) finalizeMutation.mutate();
  }

  function openAdjustment(item: PayrollRunItem) {
    const allowance = firstAdjustment(
      item.breakdown.adjustments.additionalAllowances,
      'Phụ cấp phát sinh',
    );
    const bonus = firstAdjustment(item.breakdown.adjustments.bonuses, 'Thưởng');
    const commission = firstAdjustment(
      item.breakdown.adjustments.commissions,
      'Hoa hồng',
    );
    const deduction = firstAdjustment(
      item.breakdown.adjustments.deductions,
      'Khấu trừ',
    );
    setAdjustmentForm({
      allowanceLabel: allowance.label,
      allowanceAmount: allowance.amount,
      bonusLabel: bonus.label,
      bonusAmount: bonus.amount,
      commissionLabel: commission.label,
      commissionAmount: commission.amount,
      deductionLabel: deduction.label,
      deductionAmount: deduction.amount,
      manualNote: item.manualNote ?? '',
    });
    setSelectedItem(item);
  }

  async function confirmAdjustment() {
    if (!selectedItem || adjustmentForm.manualNote.trim().length < 3) return;
    const accepted = await confirm({
      title: 'Lưu điều chỉnh lương?',
      description: `${selectedItem.employeeName}: các khoản cộng/trừ sẽ được tính lại và lưu cùng lý do điều chỉnh.`,
      confirmLabel: 'Lưu điều chỉnh',
    });
    if (accepted) adjustmentMutation.mutate();
  }

  const previewColumns: Column<PayrollPreviewRow>[] = [
    {
      key: 'employeeCode',
      label: 'Mã NV',
      render: (row) => row.employeeCode || '—',
    },
    { key: 'employeeName', label: 'Nhân viên' },
    {
      key: 'departmentName',
      label: 'Phòng ban',
      render: (row) => row.departmentName || 'Chưa phân phòng',
    },
    {
      key: 'policy',
      label: 'Chính sách',
      render: (row) => policyLabel(row),
    },
    {
      key: 'paidWorkDays',
      label: 'Ngày công',
      render: (row) => row.paidWorkDays.toLocaleString('vi-VN'),
    },
    {
      key: 'workedMinutes',
      label: 'Giờ công',
      render: (row) => duration(row.workedMinutes),
    },
    {
      key: 'netPay',
      label: 'Thực nhận dự kiến',
      render: (row) => (row.netPay === null ? '—' : currency(row.netPay)),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => (
        <TagBadge
          label={
            row.calculationError
              ? 'Cần kiểm tra'
              : row.policySource === 'missing'
                ? 'Thiếu cấu hình'
                : 'Đã tính'
          }
        />
      ),
    },
  ];

  const run = detailQuery.data?.data ?? null;
  const runColumns: Column<PayrollRunItem>[] = [
    {
      key: 'employeeCode',
      label: 'Mã NV',
      render: (row) => row.employeeCode || '—',
    },
    { key: 'employeeName', label: 'Nhân viên' },
    {
      key: 'workUnits',
      label: 'Công tính lương',
      render: (row) =>
        `${row.workUnits.toLocaleString('vi-VN')} ${row.salaryType === 'hourly' ? 'giờ' : 'ngày'}`,
    },
    {
      key: 'regularPay',
      label: 'Lương theo công',
      render: (row) => currency(row.regularPay),
    },
    {
      key: 'overtimePay',
      label: 'Tăng ca',
      render: (row) => currency(row.overtimePay),
    },
    {
      key: 'allowanceTotal',
      label: 'Phụ cấp',
      render: (row) => currency(row.allowanceTotal),
    },
    {
      key: 'bonusAndCommission',
      label: 'Thưởng / HH',
      render: (row) => currency(row.bonusTotal + row.commissionTotal),
    },
    {
      key: 'deductionTotal',
      label: 'Khấu trừ',
      render: (row) => currency(row.deductionTotal),
    },
    {
      key: 'netPay',
      label: 'Thực nhận',
      render: (row) => <span className="font-semibold">{currency(row.netPay)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        run?.status === 'draft' && runsQuery.data?.canManage ? (
          <button
            type="button"
            onClick={() => openAdjustment(row)}
            className="rounded-lg p-2 text-primary hover:bg-primary/5"
            aria-label={`Điều chỉnh lương ${row.employeeName}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null,
    },
  ];

  const loading =
    salaryLoading || attendanceQuery.isLoading || runsQuery.isLoading;
  const displayedNet = run?.totalNet ?? previewTotals.netPay;
  const displayedReady = run?.items.length ?? previewTotals.ready;

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
              Bảng lương tháng
            </h3>
            {run && <TagBadge label={runStatusLabel(run.status)} />}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Tính từ công cán và chính sách có hiệu lực trong kỳ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            aria-label="Tháng tính lương"
            value={month}
            onChange={(event) => {
              if (event.target.value) onMonthChange(event.target.value);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          {run && (
            <a
              href={`/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/export`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất CSV
            </a>
          )}
          {run?.status === 'draft' && runsQuery.data?.canManage && (
            <button
              type="button"
              onClick={() => void confirmFinalize()}
              disabled={finalizeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Chốt kỳ lương
            </button>
          )}
          {(!currentRunSummary || currentRunSummary.status === 'draft') &&
            runsQuery.data?.canManage && (
            <button
              type="button"
              onClick={() => void confirmCalculate()}
              disabled={calculateMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {currentRunSummary ? 'Tính lại' : 'Tạo kỳ lương'}
            </button>
          )}
        </div>
      </div>

      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/10 bg-primary/[0.04] p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <WalletCards className="h-4 w-4 text-primary" />
            {run ? 'Tổng thực nhận' : 'Tổng dự kiến'}
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {currency(displayedNet)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            Nhân viên đã tính
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {displayedReady}
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-4 w-4 text-amber-600" />
            {run ? 'Phiên bản kỳ lương' : 'Cần bổ sung cấu hình'}
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {run ? `v${run.version}` : previewTotals.missing}
          </p>
        </div>
      </div>

      {run ? (
        <DataTable
          columns={runColumns}
          data={run.items}
          loading={detailQuery.isLoading}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="Kỳ lương chưa có dữ liệu" />}
        />
      ) : (
        <DataTable
          columns={previewColumns}
          data={previewRows}
          loading={loading}
          rowKey={(row) => row.employeeId}
          emptyState={<EmptyState title="Chưa có nhân viên để tính lương" />}
        />
      )}

      {(salaryError ||
        attendanceQuery.isError ||
        runsQuery.isError ||
        detailQuery.isError) && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {salaryError ??
            attendanceQuery.error?.message ??
            runsQuery.error?.message ??
            detailQuery.error?.message}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {run?.status === 'finalized'
          ? 'Kỳ lương đã chốt và đang chờ thanh toán. Ghi sổ quỹ được thực hiện ở phase thanh toán tiếp theo.'
          : run
            ? 'Kỳ lương nháp có thể tính lại hoặc điều chỉnh trước khi chốt.'
            : 'Số liệu hiện tại là bản xem trước và chưa tạo kỳ lương.'}
      </p>

      <SlideOver
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title="Điều chỉnh dòng lương"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void confirmAdjustment()}
              disabled={
                adjustmentMutation.isPending ||
                adjustmentForm.manualNote.trim().length < 3
              }
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {adjustmentMutation.isPending ? 'Đang lưu...' : 'Lưu điều chỉnh'}
            </button>
          </>
        }
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">
                {selectedItem.employeeName}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Lương theo công {currency(selectedItem.regularPay)} · Thực nhận{' '}
                {currency(selectedItem.netPay)}
              </p>
            </div>
            {[
              {
                label: 'Phụ cấp phát sinh',
                nameKey: 'allowanceLabel' as const,
                amountKey: 'allowanceAmount' as const,
              },
              {
                label: 'Thưởng',
                nameKey: 'bonusLabel' as const,
                amountKey: 'bonusAmount' as const,
              },
              {
                label: 'Hoa hồng',
                nameKey: 'commissionLabel' as const,
                amountKey: 'commissionAmount' as const,
              },
              {
                label: 'Khấu trừ',
                nameKey: 'deductionLabel' as const,
                amountKey: 'deductionAmount' as const,
              },
            ].map((field) => (
              <div key={field.amountKey} className="grid grid-cols-[1fr_150px] gap-2">
                <label className="text-sm font-medium text-slate-700">
                  {field.label}
                  <input
                    value={adjustmentForm[field.nameKey]}
                    onChange={(event) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        [field.nameKey]: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Số tiền
                  <CurrencyInput
                    value={adjustmentForm[field.amountKey]}
                    onValueChange={(value) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        [field.amountKey]: value,
                      })
                    }
                    className="mt-1"
                  />
                </label>
              </div>
            ))}
            <label className="block text-sm font-medium text-slate-700">
              Lý do điều chỉnh
              <textarea
                value={adjustmentForm.manualNote}
                onChange={(event) =>
                  setAdjustmentForm({
                    ...adjustmentForm,
                    manualNote: event.target.value,
                  })
                }
                rows={3}
                placeholder="Ví dụ: Thưởng doanh số tháng 7"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
