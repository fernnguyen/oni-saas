'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/app/components/ui/CurrencyInput';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { HrmSalaryGroupsSkeleton } from './HrmContentSkeletons';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';

export type SalaryType = 'monthly' | 'daily' | 'hourly';

export interface SalaryGroup {
  id: string;
  name: string;
  salaryType: SalaryType;
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: Array<{ label: string; amount: number; prorate?: boolean }>;
  isDefault: boolean;
  active: boolean;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GroupForm {
  name: string;
  salary_type: SalaryType;
  base_amount: string;
  standard_work_days: string;
  standard_work_hours: string;
  overtime_multiplier: string;
  recurring_allowances: Array<{ label: string; amount: string; prorate: boolean }>;
  is_default: boolean;
  active: boolean;
}

const EMPTY_FORM: GroupForm = {
  name: '',
  salary_type: 'monthly',
  base_amount: '',
  standard_work_days: '26',
  standard_work_hours: '208',
  overtime_multiplier: '1.5',
  recurring_allowances: [],
  is_default: false,
  active: true,
};

const TYPE_LABELS: Record<SalaryType, string> = {
  monthly: 'Lương tháng',
  daily: 'Lương ngày',
  hourly: 'Lương giờ',
};

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

export function HrmSalaryGroupsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editingGroup, setEditingGroup] = useState<SalaryGroup | 'new' | null>(
    null,
  );
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ['hrm-salary-groups', shopId],
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-groups`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được nhóm lương.');
      }
      return payload as { data: SalaryGroup[]; canManage: boolean };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingGroup) return;
      const isNew = editingGroup === 'new';
      const endpoint = isNew
        ? `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-groups`
        : `/api/shops/${encodeURIComponent(shopId)}/hrm/salary-groups/${encodeURIComponent(editingGroup.id)}`;
      const response = await fetch(endpoint, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
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
          recurring_allowances: form.recurring_allowances.map((allowance) => ({
            label: allowance.label,
            amount: Number(allowance.amount),
            prorate: allowance.prorate,
          })),
          is_default: form.is_default,
          active: form.active,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể lưu nhóm lương.');
      }
    },
    onSuccess: () => {
      toast.success(
        editingGroup === 'new'
          ? 'Đã tạo nhóm lương'
          : 'Đã cập nhật nhóm lương',
      );
      setEditingGroup(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({
        queryKey: ['hrm-salary-groups', shopId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['hrm-salary-configs', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingGroup('new');
  }

  function openEdit(group: SalaryGroup) {
    setForm({
      name: group.name,
      salary_type: group.salaryType,
      base_amount: String(group.baseAmount),
      standard_work_days: String(group.standardWorkDays ?? 26),
      standard_work_hours: String(group.standardWorkHours ?? 208),
      overtime_multiplier: String(group.overtimeMultiplier),
      recurring_allowances: group.recurringAllowances.map((allowance) => ({
        label: allowance.label,
        amount: String(allowance.amount),
        prorate: allowance.prorate !== false,
      })),
      is_default: group.isDefault,
      active: group.active,
    });
    setEditingGroup(group);
  }

  async function confirmSave() {
    const accepted = await confirm({
      title:
        editingGroup === 'new'
          ? 'Tạo nhóm lương mới?'
          : 'Lưu thay đổi nhóm lương?',
      description: form.is_default
        ? 'Nhóm này sẽ trở thành mặc định của chi nhánh; nhóm mặc định cũ sẽ được bỏ chọn.'
        : 'Thay đổi sẽ được dùng cho các nhân viên đang áp dụng nhóm này.',
      confirmLabel: editingGroup === 'new' ? 'Tạo nhóm' : 'Lưu thay đổi',
    });
    if (accepted) saveMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <BadgeDollarSign className="h-5 w-5 text-primary" />
            Nhóm tiền lương
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Tạo chính sách dùng chung và chọn một nhóm mặc định cho chi nhánh.
          </p>
        </div>
        {query.data?.canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Tạo nhóm lương
          </button>
        )}
      </div>

      {query.isLoading && (
        <HrmSalaryGroupsSkeleton />
      )}

      {!query.isLoading && (query.data?.data.length ?? 0) === 0 && (
        <EmptyState
          title="Chưa có nhóm lương"
          description="Tạo một nhóm mặc định để áp dụng nhanh cho nhân viên chưa có cấu hình riêng."
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(query.data?.data ?? []).map((group) => (
          <article
            key={group.id}
            className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition ${
              group.active
                ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'
                : 'border-slate-200 bg-slate-50 opacity-75'
            }`}
          >
            {group.isDefault && (
              <div className="absolute right-0 top-0 rounded-bl-xl bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Mặc định
              </div>
            )}
            <div className="flex items-start justify-between gap-3 pr-16">
              <div>
                <h4 className="font-semibold text-slate-900">{group.name}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {TYPE_LABELS[group.salaryType]}
                </p>
              </div>
              <TagBadge label={group.active ? 'Hoạt động' : 'Tạm ngưng'} />
            </div>
            <p className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
              {currency(group.baseAmount)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <UsersRound className="h-3.5 w-3.5" />
                {group.employeeCount} nhân viên
              </span>
              {group.isDefault && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Fallback
                </span>
              )}
            </div>
            {query.data?.canManage && (
              <button
                type="button"
                onClick={() => openEdit(group)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Chỉnh sửa
              </button>
            )}
          </article>
        ))}
      </div>

      {query.isError && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {query.error.message}
        </p>
      )}

      <SlideOver
        open={Boolean(editingGroup)}
        onClose={() => setEditingGroup(null)}
        title={editingGroup === 'new' ? 'Tạo nhóm lương' : 'Sửa nhóm lương'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingGroup(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void confirmSave()}
              disabled={
                saveMutation.isPending || !form.name.trim() || !form.base_amount
              }
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu nhóm'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Tên nhóm
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Ví dụ: Nhân viên bán hàng"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>

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
            Mức lương cơ bản
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
                Giờ chuẩn
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
                  <div className="grid grid-cols-[1fr_150px_36px] gap-2">
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
                      onValueChange={(amount) => {
                        const values = [...form.recurring_allowances];
                        values[index] = { ...allowance, amount };
                        setForm({ ...form, recurring_allowances: values });
                      }}
                      placeholder="Số tiền"
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

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(event) =>
                setForm({
                  ...form,
                  is_default: event.target.checked,
                  active: event.target.checked ? true : form.active,
                })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Dùng làm nhóm mặc định
              </span>
              <span className="block text-xs text-slate-500">
                Áp dụng khi nhân viên chưa chọn nhóm hoặc cấu hình riêng.
              </span>
            </span>
          </label>

          {editingGroup !== 'new' && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={form.active}
                disabled={form.is_default}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Nhóm đang hoạt động
                </span>
                <span className="block text-xs text-slate-500">
                  Tạm ngưng sẽ chặn gán mới; dữ liệu cũ vẫn được giữ.
                </span>
              </span>
            </label>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
