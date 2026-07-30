'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';

type SalaryType = 'monthly' | 'daily' | 'hourly';

interface RecurringAllowance {
  label: string;
  amount: number;
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
  bankAccountMasked: string | null;
  configurations: SalaryConfiguration[];
}

interface AllowanceForm {
  label: string;
  amount: string;
}

interface SalaryForm {
  salary_type: SalaryType;
  base_amount: string;
  standard_work_days: string;
  standard_work_hours: string;
  overtime_multiplier: string;
  effective_from: string;
  recurring_allowances: AllowanceForm[];
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

function currency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function currentConfiguration(
  configurations: SalaryConfiguration[],
): SalaryConfiguration | null {
  const today = todayInVietnam();
  return (
    configurations.find(
      (configuration) =>
        configuration.effectiveFrom <= today &&
        (!configuration.effectiveTo || configuration.effectiveTo >= today),
    ) ?? null
  );
}

const EMPTY_FORM: SalaryForm = {
  salary_type: 'monthly',
  base_amount: '',
  standard_work_days: '26',
  standard_work_hours: '208',
  overtime_multiplier: '1.5',
  effective_from: todayInVietnam(),
  recurring_allowances: [],
};

export function HrmSalaryConfigsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeSalarySummary | null>(null);
  const [form, setForm] = useState<SalaryForm>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ['hrm-salary-configs', shopId],
    staleTime: 0,
    gcTime: 0,
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
        canManage: boolean;
      };
    },
  });

  const configuredCount = useMemo(
    () =>
      (query.data?.data ?? []).filter((employee) =>
        currentConfiguration(employee.configurations),
      ).length,
    [query.data?.data],
  );

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
              }),
            ),
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
        })) ?? [],
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
        const current = currentConfiguration(row.configurations);
        return current ? TYPE_LABELS[current.salaryType] : '—';
      },
    },
    {
      key: 'baseAmount',
      label: 'Mức cơ bản',
      render: (row) => {
        const current = currentConfiguration(row.configurations);
        return current ? currency(current.baseAmount) : '—';
      },
    },
    {
      key: 'effective',
      label: 'Hiệu lực',
      render: (row) =>
        currentConfiguration(row.configurations)?.effectiveFrom ?? '—',
    },
    {
      key: 'bank',
      label: 'Tài khoản nhận',
      render: (row) =>
        row.bankAccountMasked
          ? `${row.bankName ?? 'Ngân hàng'} · ${row.bankAccountMasked}`
          : 'Chưa cấu hình',
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => (
        <TagBadge
          label={
            currentConfiguration(row.configurations)
              ? 'Đã cấu hình'
              : 'Thiếu cấu hình'
          }
        />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        query.data?.canManage ? (
          <button
            type="button"
            onClick={() => openConfiguration(row)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
          >
            Cấu hình
          </button>
        ) : null,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            Cấu hình tiền lương
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Tạo lịch sử hiệu lực; mức cũ không bị ghi đè.
          </p>
        </div>
        {query.data && (
          <div className="rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">
              {configuredCount}/{query.data.data.length}
            </span>{' '}
            nhân viên đã cấu hình
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        loading={query.isLoading}
        rowKey={(row) => row.employeeId}
        emptyState={<EmptyState title="Chưa có nhân viên để cấu hình lương" />}
      />
      {query.isError && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {query.error.message}
        </p>
      )}

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
              onClick={() => saveMutation.mutate()}
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
              <input
                type="number"
                min="0"
                step="1000"
                value={form.base_amount}
                onChange={(event) =>
                  setForm({ ...form, base_amount: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
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
                        { label: '', amount: '' },
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
                  <div key={index} className="grid grid-cols-[1fr_130px_36px] gap-2">
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
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={allowance.amount}
                      placeholder="Số tiền"
                      onChange={(event) => {
                        const values = [...form.recurring_allowances];
                        values[index] = {
                          ...allowance,
                          amount: event.target.value,
                        };
                        setForm({ ...form, recurring_allowances: values });
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                        {configuration.effectiveFrom} →{' '}
                        {configuration.effectiveTo ?? 'hiện tại'}
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
