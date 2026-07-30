'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
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
  active: boolean;
  usageCount: number;
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
  const [editingField, setEditingField] = useState<HrmCustomField | null>(null);
  const [deleteField, setDeleteField] = useState<HrmCustomField | null>(null);
  const query = useQuery({
    queryKey: ['hrm-custom-fields', shopId, 'settings'],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields?include_inactive=1`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được trường tùy chỉnh.');
      }
      return payload as { data: HrmCustomField[]; canManage: boolean };
    },
  });
  const invalidateFields = () =>
    queryClient.invalidateQueries({
      queryKey: ['hrm-custom-fields', shopId],
    });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingField
        ? `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields/${encodeURIComponent(editingField.id)}`
        : `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields`;
      const response = await fetch(
        url,
        {
          method: editingField ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            options: form.options
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            ...(editingField ? { active: editingField.active } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể tạo trường.');
      }
    },
    onSuccess: () => {
      toast.success(editingField ? 'Đã cập nhật trường' : 'Đã tạo trường hồ sơ');
      setOpen(false);
      setForm(EMPTY_FORM);
      setEditingField(null);
      void invalidateFields();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleMutation = useMutation({
    mutationFn: async (field: HrmCustomField) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields/${encodeURIComponent(field.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: field.label,
            field_type: field.fieldType,
            options: field.options,
            required: field.required,
            active: !field.active,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể đổi trạng thái.');
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái trường');
      void invalidateFields();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: async (field: HrmCustomField) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields/${encodeURIComponent(field.id)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể xóa trường.');
      }
    },
    onSuccess: () => {
      toast.success('Đã xóa trường tùy chỉnh');
      setDeleteField(null);
      void invalidateFields();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function openCreate() {
    setEditingField(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(field: HrmCustomField) {
    setEditingField(field);
    setForm({
      key: field.key,
      label: field.label,
      field_type: field.fieldType,
      options: field.options.join(', '),
      required: field.required,
      tenant_wide: false,
    });
    setOpen(true);
  }
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
    {
      key: 'usageCount',
      label: 'Đang dùng',
      render: (row) => `${row.usageCount} hồ sơ`,
    },
    {
      key: 'active',
      label: 'Trạng thái',
      render: (row) => (
        <TagBadge label={row.active ? 'Đang dùng' : 'Đã tắt'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        query.data?.canManage ? (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label={`Sửa ${row.label}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleMutation.mutate(row)}
              disabled={toggleMutation.isPending}
              className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 disabled:opacity-40"
              aria-label={row.active ? `Tắt ${row.label}` : `Bật ${row.label}`}
            >
              <Power className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteField(row)}
              disabled={row.usageCount > 0}
              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`Xóa ${row.label}`}
              title={
                row.usageCount > 0
                  ? 'Field đã có dữ liệu, chỉ có thể ngừng sử dụng'
                  : 'Xóa field'
              }
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null,
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
            onClick={openCreate}
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
        onClose={() => {
          setOpen(false);
          setEditingField(null);
        }}
        title={editingField ? 'Sửa trường hồ sơ' : 'Thêm trường hồ sơ'}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditingField(null);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending || !form.key || !form.label}
              onClick={() => saveMutation.mutate()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMutation.isPending
                ? 'Đang lưu...'
                : editingField
                  ? 'Lưu thay đổi'
                  : 'Tạo trường'}
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
              disabled={Boolean(editingField)}
              onChange={(event) =>
                setForm({
                  ...form,
                  key: event.target.value.toLowerCase().replace(/\s+/g, '_'),
                })
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50"
              placeholder="so_chung_chi"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Kiểu dữ liệu
            <select
              value={form.field_type}
              disabled={Boolean(editingField)}
              onChange={(event) => setForm({ ...form, field_type: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50"
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
          {!editingField && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.tenant_wide}
                onChange={(event) =>
                  setForm({ ...form, tenant_wide: event.target.checked })
                }
              />
              Áp dụng toàn tenant
            </label>
          )}
        </div>
      </SlideOver>
      <ConfirmDialog
        open={Boolean(deleteField)}
        onClose={() => setDeleteField(null)}
        onConfirm={() => {
          if (deleteField) deleteMutation.mutate(deleteField);
        }}
        title="Xóa trường tùy chỉnh?"
        description="Chỉ field chưa có dữ liệu mới được xóa. Thao tác này không thể hoàn tác."
        confirmLabel="Xóa field"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
