'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';

export interface HrmCustomField {
  id: string;
  key: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string[];
  required: boolean;
}

const EMPTY_FORM = {
  key: '',
  label: '',
  field_type: 'text',
  options: '',
  required: false,
  tenant_wide: false,
};

const TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản',
  number: 'Số',
  date: 'Ngày',
  boolean: 'Có/Không',
  select: 'Một lựa chọn',
  multiselect: 'Nhiều lựa chọn',
};

export function HrmCustomFieldsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const query = useQuery({
    queryKey: ['hrm-custom-fields', shopId],
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được trường tùy chỉnh.');
      }
      return payload as { data: HrmCustomField[]; canManage: boolean };
    },
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            options: form.options
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể tạo trường.');
      }
    },
    onSuccess: () => {
      toast.success('Đã tạo trường hồ sơ');
      setOpen(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({
        queryKey: ['hrm-custom-fields', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const columns: Column<HrmCustomField>[] = [
    { key: 'label', label: 'Tên trường' },
    { key: 'key', label: 'Mã field' },
    {
      key: 'fieldType',
      label: 'Kiểu dữ liệu',
      render: (row) => <TagBadge label={TYPE_LABELS[row.fieldType] ?? row.fieldType} />,
    },
    {
      key: 'required',
      label: 'Bắt buộc',
      render: (row) => (row.required ? 'Có' : 'Không'),
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Trường hồ sơ tùy chỉnh</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Bổ sung thông tin phù hợp riêng với ngành nghề.
          </p>
        </div>
        {query.data?.canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm trường
          </button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        loading={query.isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            title="Chưa có trường tùy chỉnh"
            description="Các field cơ bản vẫn sử dụng bình thường."
          />
        }
      />
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Thêm trường hồ sơ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={createMutation.isPending || !form.key || !form.label}
              onClick={() => createMutation.mutate()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo trường'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Tên hiển thị
            <input
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Số chứng chỉ, khu vực phụ trách..."
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Mã field
            <input
              value={form.key}
              onChange={(event) =>
                setForm({
                  ...form,
                  key: event.target.value.toLowerCase().replace(/\s+/g, '_'),
                })
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="so_chung_chi"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Kiểu dữ liệu
            <select
              value={form.field_type}
              onChange={(event) => setForm({ ...form, field_type: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {(form.field_type === 'select' || form.field_type === 'multiselect') && (
            <label className="block text-sm font-medium text-slate-700">
              Các lựa chọn, cách nhau bằng dấu phẩy
              <input
                value={form.options}
                onChange={(event) => setForm({ ...form, options: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(event) => setForm({ ...form, required: event.target.checked })}
            />
            Bắt buộc nhập
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.tenant_wide}
              onChange={(event) => setForm({ ...form, tenant_wide: event.target.checked })}
            />
            Áp dụng toàn tenant
          </label>
        </div>
      </SlideOver>
    </div>
  );
}
