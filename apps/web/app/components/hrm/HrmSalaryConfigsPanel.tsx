'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Calculator,
  CircleDollarSign,
  Layers3,
  Plus,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/app/components/ui/CurrencyInput';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { formatHrmDate } from '@/lib/hrm/formatDate';
import {
  HrmPayrollCalculatorPanel,
  type PayrollPreviewEmployee,
} from './HrmPayrollCalculatorPanel';
import {
  HrmSalaryGroupsPanel,
  type SalaryGroup,
} from './HrmSalaryGroupsPanel';

type SalaryType = 'monthly' | 'daily' | 'hourly';

interface RecurringAllowance {
  label: string;
  amount: number;
  prorate?: boolean;
}

interface SalaryConfiguration {
  id: string;
  salaryType: SalaryType;
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: RecurringAllowance[];
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

interface EmployeeSalarySummary {
  employeeId: string;
  profileId: string | null;
  employeeCode: string | null;
  employeeName: string;
  departmentName: string | null;
  bankName: string | null;
  bankAccount: string | null;
  configurations: SalaryConfiguration[];
}


interface EmployeeSalaryAssignment {
  employeeId: string;
  profileId: string;
  salaryMode: 'custom' | 'group';
  salaryGroupId: string | null;
}

type ResolvedSalaryPolicy =
  | { source: 'custom'; configuration: SalaryConfiguration; group: null }
  | { source: 'group' | 'default'; configuration: null; group: SalaryGroup }
  | { source: 'missing'; configuration: null; group: null };

interface AllowanceForm {
  label: string;
  amount: string;
  /** true = prorate by work days (default); false = always pay full amount */
  prorate: boolean;
}

interface SalaryForm {
  salary_type: SalaryType;
  base_amount: string;
  standard_work_days: string;
  standard_work_hours: string;
  overtime_multiplier: string;
  effective_from: string;
  recurring_allowances: AllowanceForm[];
  annual_leave_days: string;
}

const TYPE_LABELS: Record<SalaryType, string> = {
  monthly: 'Lương tháng',
  daily: 'Lương ngày',
  hourly: 'Lương giờ',
};

function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function currentMonthInVietnam(): string {
  return todayInVietnam().slice(0, 7);
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

function currency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function currentConfiguration(
  configurations: SalaryConfiguration[],
  effectiveOn = todayInVietnam(),
): SalaryConfiguration | null {
  return (
    configurations.find(
      (configuration) =>
        configuration.effectiveFrom <= effectiveOn &&
        (!configuration.effectiveTo || configuration.effectiveTo >= effectiveOn),
    ) ?? null
  );
}


function resolveSalaryPolicy(
  employee: EmployeeSalarySummary,
  groups: SalaryGroup[],
  assignments: EmployeeSalaryAssignment[],
  effectiveOn = todayInVietnam(),
): ResolvedSalaryPolicy {
  const assignment = assignments.find(
    (item) => item.employeeId === employee.employeeId,
  );
  if (assignment?.salaryMode === 'group') {
    const group = groups.find(
      (item) => item.id === assignment.salaryGroupId && item.active,
    );
    if (group) return { source: 'group', configuration: null, group };
    const defaultGroup = groups.find(
      (item) => item.active && item.isDefault,
    );
    return defaultGroup
      ? { source: 'default', configuration: null, group: defaultGroup }
      : { source: 'missing', configuration: null, group: null };
  }
  if (assignment?.salaryMode === 'custom') {
    const configuration = currentConfiguration(employee.configurations, effectiveOn);
    if (configuration) {
      return { source: 'custom', configuration, group: null };
    }
    return { source: 'missing', configuration: null, group: null };
  }
  const legacyConfiguration = currentConfiguration(employee.configurations, effectiveOn);
  if (legacyConfiguration) {
    return {
      source: 'custom',
      configuration: legacyConfiguration,
      group: null,
    };
  }
  const defaultGroup = groups.find((group) => group.active && group.isDefault);
  return defaultGroup
    ? { source: 'default', configuration: null, group: defaultGroup }
    : { source: 'missing', configuration: null, group: null };
}

const EMPTY_FORM: SalaryForm = {
  salary_type: 'monthly',
  base_amount: '',
  standard_work_days: '26',
  standard_work_hours: '208',
  overtime_multiplier: '1.5',
  effective_from: todayInVietnam(),
  recurring_allowances: [],
  annual_leave_days: '12',
};

export function HrmSalaryConfigsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [activeView, setActiveView] = useState<
    'calculate' | 'employees' | 'groups'
  >('calculate');
  const [calculationMonth, setCalculationMonth] = useState(
    currentMonthInVietnam,
  );
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeSalarySummary | null>(null);
  const [selectedGroupEmployee, setSelectedGroupEmployee] =
    useState<EmployeeSalarySummary | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [form, setForm] = useState<SalaryForm>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ['hrm-salary-configs', shopId],
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-configs`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không tải được cấu hình lương.',
        );
      }
      return payload as {
        data: EmployeeSalarySummary[];
        groups: SalaryGroup[];
        assignments: EmployeeSalaryAssignment[];
        canManage: boolean;
      };
    },
  });

  const configuredCount = useMemo(
    () =>
      (query.data?.data ?? []).filter(
        (employee) =>
          resolveSalaryPolicy(
            employee,
            query.data?.groups ?? [],
            query.data?.assignments ?? [],
          ).source !== 'missing',
      ).length,
    [query.data],
  );

  const previewEmployees = useMemo<PayrollPreviewEmployee[]>(() => {
    const effectiveOn = lastDayOfMonth(calculationMonth);
    return (query.data?.data ?? []).map((employee) => {
      const resolved = resolveSalaryPolicy(
        employee,
        query.data?.groups ?? [],
        query.data?.assignments ?? [],
        effectiveOn,
      );
      const policy = resolved.configuration ?? resolved.group;
      return {
        employeeId: employee.employeeId,
        employeeCode: employee.employeeCode,
        employeeName: employee.employeeName,
        departmentName: employee.departmentName,
        policySource: resolved.source,
        policyName: resolved.group?.name ?? null,
        salaryType: policy?.salaryType ?? null,
        baseAmount: policy?.baseAmount ?? null,
        standardWorkDays: policy?.standardWorkDays ?? null,
        standardWorkHours: policy?.standardWorkHours ?? null,
        overtimeMultiplier: policy?.overtimeMultiplier ?? null,
        recurringAllowances: policy?.recurringAllowances ?? [],
      };
    });
  }, [calculationMonth, query.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmployee) return;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-configs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: selectedEmployee.employeeId,
            salary_type: form.salary_type,
            base_amount: Number(form.base_amount),
            standard_work_days:
              form.salary_type === 'monthly'
                ? Number(form.standard_work_days)
                : null,
            standard_work_hours:
              form.salary_type === 'hourly'
                ? null
                : Number(form.standard_work_hours),
            overtime_multiplier: Number(form.overtime_multiplier),
            effective_from: form.effective_from,
            recurring_allowances: form.recurring_allowances.map(
              (allowance) => ({
                label: allowance.label,
                amount: Number(allowance.amount),
                prorate: allowance.prorate,
              }),
            ),
            annual_leave_days: Number(form.annual_leave_days) || 12,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không thể lưu cấu hình lương.',
        );
      }
    },
    onSuccess: () => {
      toast.success('Đã tạo cấu hình lương mới');
      setSelectedEmployee(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({
        queryKey: ['hrm-salary-configs', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupEmployee || !selectedGroupId) return;
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-groups/assignments`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: selectedGroupEmployee.employeeId,
            salary_mode: 'group',
            salary_group_id: selectedGroupId,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không thể áp dụng nhóm lương.',
        );
      }
    },
    onSuccess: () => {
      toast.success('Đã áp dụng nhóm lương');
      setSelectedGroupEmployee(null);
      setSelectedGroupId('');
      void queryClient.invalidateQueries({
        queryKey: ['hrm-salary-configs', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function confirmCustomSalary() {
    if (!selectedEmployee) return;
    const accepted = await confirm({
      title: 'Lưu cấu hình lương riêng?',
      description: `Nhân viên ${selectedEmployee.employeeName} sẽ chuyển sang chế độ lương tùy chỉnh từ ${formatHrmDate(form.effective_from)}.`,
      confirmLabel: 'Lưu cấu hình',
    });
    if (accepted) saveMutation.mutate();
  }

  async function confirmGroupAssignment() {
    if (!selectedGroupEmployee || !selectedGroupId) return;
    const group = query.data?.groups.find(
      (item) => item.id === selectedGroupId,
    );
    const accepted = await confirm({
      title: 'Áp dụng nhóm lương?',
      description: `${selectedGroupEmployee.employeeName} sẽ dùng chính sách “${group?.name ?? 'đã chọn'}”. Lịch sử lương riêng không bị xóa.`,
      confirmLabel: 'Áp dụng nhóm',
    });
    if (accepted) assignMutation.mutate();
  }

  function openConfiguration(employee: EmployeeSalarySummary) {
    const current = currentConfiguration(employee.configurations);
    setSelectedEmployee(employee);
    setForm({
      salary_type: current?.salaryType ?? 'monthly',
      base_amount: current ? String(current.baseAmount) : '',
      standard_work_days: String(current?.standardWorkDays ?? 26),
      standard_work_hours: String(current?.standardWorkHours ?? 208),
      overtime_multiplier: String(current?.overtimeMultiplier ?? 1.5),
      effective_from: todayInVietnam(),
      recurring_allowances:
        current?.recurringAllowances.map((allowance) => ({
          label: allowance.label,
          amount: String(allowance.amount),
          prorate: allowance.prorate !== false, // default true
        })) ?? [],
      annual_leave_days: String((current as any)?.annualLeaveDays ?? 12),
    });
  }

  const columns: Column<EmployeeSalarySummary>[] = [
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
      key: 'salaryType',
      label: 'Hình thức',
      render: (row) => {
        const resolved = resolveSalaryPolicy(
          row,
          query.data?.groups ?? [],
          query.data?.assignments ?? [],
        );
        const salaryType =
          resolved.configuration?.salaryType ?? resolved.group?.salaryType;
        return salaryType ? TYPE_LABELS[salaryType] : '—';
      },
    },
    {
      key: 'baseAmount',
      label: 'Mức cơ bản',
      render: (row) => {
        const resolved = resolveSalaryPolicy(
          row,
          query.data?.groups ?? [],
          query.data?.assignments ?? [],
        );
        const amount =
          resolved.configuration?.baseAmount ?? resolved.group?.baseAmount;
        return amount === undefined ? '—' : currency(amount);
      },
    },
    {
      key: 'source',
      label: 'Nguồn áp dụng',
      render: (row) => {
        const resolved = resolveSalaryPolicy(
          row,
          query.data?.groups ?? [],
          query.data?.assignments ?? [],
        );
        if (resolved.source === 'custom') return 'Tùy chỉnh riêng';
        if (resolved.source === 'group') return resolved.group.name;
        if (resolved.source === 'default') {
          return `${resolved.group.name} · mặc định`;
        }
        return '—';
      },
    },
    {
      key: 'bank',
      label: 'Tài khoản nhận',
      render: (row) =>
        row.bankAccount
          ? `${row.bankName ?? 'Ngân hàng'} · ${row.bankAccount}`
          : 'Chưa cấu hình',
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => {
        const resolved = resolveSalaryPolicy(
          row,
          query.data?.groups ?? [],
          query.data?.assignments ?? [],
        );
        return (
          <TagBadge
            label={
              resolved.source === 'missing'
                ? 'Thiếu cấu hình'
                : resolved.source === 'default'
                  ? 'Đang dùng mặc định'
                  : 'Đã cấu hình'
            }
          />
        );
      },
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        query.data?.canManage ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                const assignment = query.data?.assignments.find(
                  (item) => item.employeeId === row.employeeId,
                );
                const defaultGroup = query.data?.groups.find(
                  (group) => group.active && group.isDefault,
                );
                setSelectedGroupId(
                  assignment?.salaryMode === 'group'
                    ? assignment.salaryGroupId ?? ''
                    : defaultGroup?.id ?? '',
                );
                setSelectedGroupEmployee(row);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Chọn nhóm
            </button>
            <button
              type="button"
              onClick={() => openConfiguration(row)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              Tùy chỉnh
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-primary/10 bg-primary/[0.035] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CircleDollarSign className="h-5 w-5 text-primary" aria-hidden="true" />
            Tiền lương
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Tính lương theo công cán, nhóm lương hoặc chính sách riêng.
          </p>
        </div>
        {query.data && (
          <span className="w-fit rounded-full border border-primary/15 bg-white px-3 py-1.5 text-xs font-semibold text-primary">
            {configuredCount}/{query.data.data.length} nhân viên có chính sách
          </span>
        )}
      </div>

      <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { key: 'calculate' as const, label: 'Tính lương', icon: Calculator },
            { key: 'employees' as const, label: 'Theo nhân viên', icon: UsersRound },
            { key: 'groups' as const, label: 'Nhóm lương', icon: Layers3 },
          ].map((view) => (
            <button
              key={view.key}
              type="button"
              onClick={() => setActiveView(view.key)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                activeView === view.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <view.icon className="h-4 w-4" aria-hidden="true" />
              {view.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {activeView === 'calculate' ? (
          <HrmPayrollCalculatorPanel
            shopId={shopId}
            month={calculationMonth}
            onMonthChange={setCalculationMonth}
            employees={previewEmployees}
            salaryLoading={query.isLoading}
            salaryError={query.isError ? query.error.message : undefined}
          />
        ) : activeView === 'employees' ? (
          <DataTable
            columns={columns}
            data={query.data?.data ?? []}
            loading={query.isLoading}
            rowKey={(row) => row.employeeId}
            emptyState={
              <EmptyState title="Chưa có nhân viên để cấu hình lương" />
            }
          />
        ) : (
          <HrmSalaryGroupsPanel
            shopId={shopId}
            groups={query.data?.groups ?? []}
            canManage={query.data?.canManage ?? false}
            loading={query.isLoading}
          />
        )}
        {activeView !== 'calculate' && query.isError && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {query.error.message}
          </p>
        )}
      </div>

      <SlideOver
        open={Boolean(selectedGroupEmployee)}
        onClose={() => setSelectedGroupEmployee(null)}
        title="Áp dụng nhóm lương"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelectedGroupEmployee(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void confirmGroupAssignment()}
              disabled={assignMutation.isPending || !selectedGroupId}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {assignMutation.isPending ? 'Đang áp dụng...' : 'Áp dụng nhóm'}
            </button>
          </>
        }
      >
        {selectedGroupEmployee && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <BadgeCheck className="h-5 w-5 text-primary" />
                {selectedGroupEmployee.employeeName}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {selectedGroupEmployee.employeeCode || 'Chưa có mã'} ·{' '}
                {selectedGroupEmployee.departmentName || 'Chưa phân phòng'}
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Nhóm lương đang hoạt động
              <select
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <option value="">Chọn nhóm lương</option>
                {(query.data?.groups ?? [])
                  .filter((group) => group.active)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} · {currency(group.baseAmount)}
                      {group.isDefault ? ' · Mặc định' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              Chuyển sang nhóm không xóa lịch sử cấu hình riêng. Bạn có thể quay lại chế độ tùy chỉnh bất kỳ lúc nào.
            </p>
          </div>
        )}
      </SlideOver>

      <SlideOver
        open={Boolean(selectedEmployee)}
        onClose={() => setSelectedEmployee(null)}
        title="Tạo cấu hình lương"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelectedEmployee(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void confirmCustomSalary()}
              disabled={
                saveMutation.isPending ||
                !form.base_amount ||
                !form.effective_from
              }
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </>
        }
      >
        {selectedEmployee && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">
                {selectedEmployee.employeeName}
              </p>
              <p className="text-sm text-slate-500">
                {selectedEmployee.employeeCode || 'Chưa có mã'} ·{' '}
                {selectedEmployee.departmentName || 'Chưa phân phòng'}
              </p>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Hình thức lương
              <select
                value={form.salary_type}
                onChange={(event) => {
                  const salaryType = event.target.value as SalaryType;
                  setForm({
                    ...form,
                    salary_type: salaryType,
                    standard_work_hours:
                      salaryType === 'daily'
                        ? '8'
                        : salaryType === 'monthly'
                          ? '208'
                          : '',
                  });
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {form.salary_type === 'monthly'
                ? 'Lương cơ bản/tháng'
                : form.salary_type === 'daily'
                  ? 'Mức lương/ngày'
                  : 'Mức lương/giờ'}
              <CurrencyInput
                value={form.base_amount}
                onValueChange={(baseAmount) =>
                  setForm({ ...form, base_amount: baseAmount })
                }
                className="mt-1"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {form.salary_type === 'monthly' && (
                <label className="text-sm font-medium text-slate-700">
                  Ngày công chuẩn
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.standard_work_days}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        standard_work_days: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              )}
              {form.salary_type !== 'hourly' && (
                <label className="text-sm font-medium text-slate-700">
                  {form.salary_type === 'monthly'
                    ? 'Tổng giờ chuẩn/kỳ'
                    : 'Giờ chuẩn/ngày'}
                  <input
                    type="number"
                    min="0.01"
                    step="0.25"
                    value={form.standard_work_hours}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        standard_work_hours: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              )}
              <label className="text-sm font-medium text-slate-700">
                Hệ số tăng ca
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={form.overtime_multiplier}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      overtime_multiplier: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Hiệu lực từ
              <input
                type="date"
                value={form.effective_from}
                onChange={(event) =>
                  setForm({ ...form, effective_from: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Ngày phép năm (ngày)
              <input
                type="number"
                min="0"
                max="365"
                value={form.annual_leave_days}
                onChange={(event) =>
                  setForm({ ...form, annual_leave_days: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  Phụ cấp định kỳ
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      recurring_allowances: [
                        ...form.recurring_allowances,
                        { label: '', amount: '', prorate: true },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm khoản
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {form.recurring_allowances.map((allowance, index) => (
                  <div key={index} className="space-y-1">
                    <div className="grid grid-cols-[1fr_130px_36px] gap-2">
                      <input
                        value={allowance.label}
                        placeholder="Tên phụ cấp"
                        onChange={(event) => {
                          const values = [...form.recurring_allowances];
                          values[index] = {
                            ...allowance,
                            label: event.target.value,
                          };
                          setForm({ ...form, recurring_allowances: values });
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <CurrencyInput
                        value={allowance.amount}
                        placeholder="Số tiền"
                        onValueChange={(amount) => {
                          const values = [...form.recurring_allowances];
                          values[index] = { ...allowance, amount };
                          setForm({ ...form, recurring_allowances: values });
                        }}
                        className="text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            recurring_allowances:
                              form.recurring_allowances.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                          })
                        }
                        className="rounded-lg text-rose-600 hover:bg-rose-50"
                        aria-label="Xóa phụ cấp"
                      >
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={allowance.prorate !== false}
                        onChange={(event) => {
                          const values = [...form.recurring_allowances];
                          values[index] = { ...allowance, prorate: event.target.checked };
                          setForm({ ...form, recurring_allowances: values });
                        }}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Chia theo ngày công thực tế
                      <span className="text-slate-400">
                        {allowance.prorate !== false ? '(tỉ lệ ngày làm)' : '(trả cố định cả tháng)'}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {selectedEmployee.configurations.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  Lịch sử cấu hình
                </h3>
                <div className="mt-2 space-y-2">
                  {selectedEmployee.configurations.map((configuration) => (
                    <div
                      key={configuration.id}
                      className="rounded-xl border border-slate-200 p-3 text-sm"
                    >
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-slate-800">
                          {TYPE_LABELS[configuration.salaryType]}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {currency(configuration.baseAmount)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatHrmDate(configuration.effectiveFrom)} →{' '}
                        {formatHrmDate(
                          configuration.effectiveTo,
                          'hiện tại',
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}
