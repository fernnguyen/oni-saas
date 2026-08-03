'use client';

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
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

interface PaymentFund {
  id: string;
  name: string;
  type: string;
  currentBalance: number;
  isDefault: boolean;
}

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

/** Format a YYYY-MM string to Vietnamese "Tháng 7/2026" */
function monthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  if (!year || !month) return ym;
  return `Tháng ${Number(month)}/${year}`;
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
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [lastPostingRef, setLastPostingRef] = useState<string | null>(null);

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

  const fundsQuery = useQuery({
    queryKey: ['hrm-payment-funds', shopId, currentRunSummary?.id],
    enabled: payModalOpen && Boolean(currentRunSummary?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(currentRunSummary?.id ?? '')}/funds`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được danh sách quỹ.');
      }
      const funds = (payload.data ?? []) as PaymentFund[];
      // Auto-select default fund when modal opens
      if (funds.length > 0 && !selectedFundId) {
        const defaultFund = funds.find((f) => f.isDefault) ?? funds[0];
        setSelectedFundId(defaultFund.id);
      }
      return funds;
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const run = detailQuery.data?.data;
      if (!run || !selectedFundId) return;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/pay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fund_id: selectedFundId,
            expected_version: run.version,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể thanh toán lương.');
      }
      return payload.data as {
        payrollRun: typeof run;
        posting: { id: string; cashbookTransactionId: string; fundId: string; amount: number; postedAt: string };
      };
    },
    onSuccess: (data) => {
      if (data) {
        setLastPostingRef(data.posting.cashbookTransactionId);
      }
      toast.success('Đã thanh toán lương và ghi sổ quỹ thành công');
      setPayModalOpen(false);
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
            deductions: [
              ...selectedItem.breakdown.adjustments.deductions.filter(d => d.label.startsWith('Hoàn ứng: ')),
              ...adjustmentItems(
                adjustmentForm.deductionLabel,
                adjustmentForm.deductionAmount,
              )
            ],
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

    // Warn if finalizing before month end
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodEnd = new Date(run.periodEnd + 'T00:00:00');
    const isEarlyFinalize = today < periodEnd;
    const earlyNote = isEarlyFinalize
      ? ` ⚠️ Lưu ý: Hôm nay chưa phải cuối kỳ (${run.periodEnd}). Chốt sớm có thể chưa phản ánh đủ công cán.`
      : '';

    const accepted = await confirm({
      title: 'Chốt kỳ lương?',
      description: `${run.items.length} nhân viên · tổng thực nhận ${currency(run.totalNet)}. Sau khi chốt, kỳ lương trở thành snapshot và không thể tính lại hoặc sửa khoản cộng/trừ. Bước này chưa chi tiền; hệ thống sẽ yêu cầu chọn quỹ ở bước Thanh toán lương.${earlyNote}`,
      confirmLabel: 'Chốt kỳ lương',
      variant: 'danger',
    });
    if (accepted) finalizeMutation.mutate();
  }

  async function confirmPay() {
    const run = detailQuery.data?.data;
    if (!run || !selectedFundId) return;
    const selectedFund = fundsQuery.data?.find((f) => f.id === selectedFundId);
    const [periodYear, periodMonth] = run.periodStart.split('-');
    const accepted = await confirm({
      title: 'Xác nhận thanh toán lương?',
      description: `Kỳ ${periodMonth}/${periodYear} · ${currency(run.totalNet)} · Quỹ: ${selectedFund?.name ?? selectedFundId}. Thao tác này sẽ tạo phiếu chi sổ quỹ và chuyển kỳ lương sang trạng thái Đã thanh toán.`,
      confirmLabel: 'Thanh toán lương',
      variant: 'danger',
    });
    if (accepted) payMutation.mutate();
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
    const manualDeductions = item.breakdown.adjustments.deductions.filter(d => !d.label.startsWith('Hoàn ứng: '));
    const deduction = firstAdjustment(
      manualDeductions,
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
      key: 'advancePay',
      label: 'Tạm ứng',
      render: (row) => {
        const advance = row.breakdown.adjustments.deductions
          .filter(d => d.label.startsWith('Hoàn ứng: '))
          .reduce((sum, d) => sum + d.amount, 0);
        return currency(advance);
      },
    },
    {
      key: 'deductionTotal',
      label: 'Khấu trừ khác',
      render: (row) => {
        const advance = row.breakdown.adjustments.deductions
          .filter(d => d.label.startsWith('Hoàn ứng: '))
          .reduce((sum, d) => sum + d.amount, 0);
        return currency(row.deductionTotal - advance);
      },
    },
    {
      key: 'netPay',
      label: 'Thực nhận',
      render: (row) => <span className="font-semibold">{currency(row.netPay)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-1">
          {run?.status === 'draft' && runsQuery.data?.canManage && (
            <button
              type="button"
              onClick={() => openAdjustment(row)}
              className="rounded-lg p-2 text-primary hover:bg-primary/5"
              aria-label={`Điều chỉnh lương ${row.employeeName}`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {(run?.status === 'finalized' || run?.status === 'paid') && (
            <a
              href={`/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/payslip/${encodeURIComponent(row.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-primary"
              aria-label={`Xem phiếu lương ${row.employeeName}`}
              title="Xem phiếu lương"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      ),
    },
  ];


  const loading =
    salaryLoading || attendanceQuery.isLoading || runsQuery.isLoading;
  const displayedNet = run?.totalNet ?? previewTotals.netPay;
  const displayedReady = run?.items.length ?? previewTotals.ready;

  return (
    <div className="relative">
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
          <div className="relative">
            <input
              type="month"
              aria-label="Tháng tính lương"
              value={month}
              onChange={(event) => {
                if (event.target.value) onMonthChange(event.target.value);
              }}
              className="absolute inset-0 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm opacity-0"
            />
            <div className="pointer-events-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {monthLabel(month)}
            </div>
          </div>
          {run && (
            <a
              href={`/api/shops/${encodeURIComponent(shopId)}/hrm/payroll-runs/${encodeURIComponent(run.id)}/export`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất CSV
            </a>
          )}
          {run?.status === 'finalized' && runsQuery.data?.canPay && (
            <button
              id="hrm-pay-payroll-btn"
              type="button"
              onClick={() => {
                setPayModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
            >
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Thanh toán lương
            </button>
          )}
          {run?.status === 'draft' && runsQuery.data?.canManage && (
            <button
              type="button"
              onClick={() => void confirmFinalize()}
              disabled={finalizeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Chốt kỳ lương (chưa chi)
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

      {calculateMutation.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-slate-600">Đang tính lương...</p>
          </div>
        </div>
      )}

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
      {run?.status === 'paid' && lastPostingRef && (
        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Banknote className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Đã thanh toán · Mã phiếu chi: <span className="font-mono font-semibold">{lastPostingRef}</span>
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {run?.status === 'paid'
          ? 'Kỳ lương đã thanh toán và ghi sổ quỹ. Không thể chỉnh sửa.'
          : run?.status === 'finalized'
            ? 'Kỳ lương đã chốt, sẵn sàng thanh toán. Chọn quỹ và xác nhận để ghi sổ.'
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

      {/* ── Payment Fund Selection Modal ─────────────────────────────────── */}
      {payModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2
              id="pay-modal-title"
              className="flex items-center gap-2 text-base font-semibold text-slate-900"
            >
              <Banknote className="h-5 w-5 text-blue-600" aria-hidden="true" />
              Chọn quỹ thanh toán lương
            </h2>

            {run && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kỳ lương</span>
                  <span className="font-medium">
                    {run.periodStart.slice(5, 7)}/{run.periodStart.slice(0, 4)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-500">Tổng thực nhận</span>
                  <span className="font-semibold text-slate-900">{currency(run.totalNet)}</span>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label
                htmlFor="pay-fund-select"
                className="block text-sm font-medium text-slate-700"
              >
                Quỹ nguồn
              </label>
              {fundsQuery.isLoading ? (
                <p className="mt-2 text-sm text-slate-400">Đang tải danh sách quỹ...</p>
              ) : fundsQuery.isError ? (
                <p className="mt-2 text-sm text-red-600">Không tải được quỹ. Thử lại sau.</p>
              ) : (fundsQuery.data?.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-amber-600">
                  Chưa có quỹ nào trong chi nhánh này. Vui lòng tạo quỹ trong sổ quỹ trước.
                </p>
              ) : (
                <select
                  id="pay-fund-select"
                  value={selectedFundId}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {fundsQuery.data?.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name} — {currency(fund.currentBalance)}
                      {fund.isDefault ? ' (mặc định)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedFundId && run && (() => {
              const fund = fundsQuery.data?.find((f) => f.id === selectedFundId);
              const insufficientBalance = fund && fund.currentBalance < run.totalNet;
              return insufficientBalance ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Số dư quỹ ({currency(fund.currentBalance)}) thấp hơn tổng lương cần thanh toán ({currency(run.totalNet)}).
                  Vui lòng nạp thêm hoặc chọn quỹ khác.
                </p>
              ) : null;
            })()}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                id="pay-modal-cancel"
                onClick={() => {
                  setPayModalOpen(false);
                  payMutation.reset();
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                Hủy
              </button>
              <button
                id="pay-modal-confirm"
                type="button"
                onClick={() => void confirmPay()}
                disabled={
                  payMutation.isPending ||
                  !selectedFundId ||
                  (fundsQuery.data?.length ?? 0) === 0
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {payMutation.isPending ? 'Đang thanh toán...' : 'Xác nhận thanh toán'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
