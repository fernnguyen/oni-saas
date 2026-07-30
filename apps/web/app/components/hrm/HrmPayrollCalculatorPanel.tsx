'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, CalendarDays, Clock3, WalletCards } from 'lucide-react';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { TagBadge } from '@/app/components/ui/TagBadge';
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

  const rows = useMemo<PayrollPreviewRow[]>(() => {
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

  const totals = useMemo(
    () => ({
      ready: rows.filter((row) => row.netPay !== null).length,
      missing: rows.filter(
        (row) => row.policySource === 'missing' || row.calculationError,
      ).length,
      netPay: rows.reduce((sum, row) => sum + (row.netPay ?? 0), 0),
    }),
    [rows],
  );

  const columns: Column<PayrollPreviewRow>[] = [
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
      key: 'overtimeMinutes',
      label: 'Tăng ca',
      render: (row) => duration(row.overtimeMinutes),
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

  const loading = salaryLoading || attendanceQuery.isLoading;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
            Bảng tính lương tháng
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Tạm tính từ công cán và chính sách có hiệu lực trong kỳ.
          </p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Tháng tính lương
          <input
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) onMonthChange(event.target.value);
            }}
            className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
          />
        </label>
      </div>

      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/10 bg-primary/[0.04] p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <WalletCards className="h-4 w-4 text-primary" />
            Tổng thực nhận dự kiến
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {currency(totals.netPay)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            Nhân viên đã tính
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {totals.ready}
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-4 w-4 text-amber-600" />
            Cần bổ sung cấu hình
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {totals.missing}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        rowKey={(row) => row.employeeId}
        emptyState={<EmptyState title="Chưa có nhân viên để tính lương" />}
      />

      {(salaryError || attendanceQuery.isError) && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {salaryError ?? attendanceQuery.error?.message}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Đây là số liệu dự kiến; chưa tạo kỳ lương, chưa chốt thanh toán và chưa
        ghi vào sổ quỹ.
      </p>
    </div>
  );
}
