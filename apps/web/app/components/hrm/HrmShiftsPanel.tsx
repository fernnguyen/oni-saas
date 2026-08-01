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
import { useConfirm } from '@/app/components/ui/ConfirmProvider';

interface HrmShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  active: boolean;
  usageCount: number;
}

const EMPTY_FORM = {
  name: '',
  start_time: '08:00',
  end_time: '17:00',
  break_minutes: '60',
  late_grace_minutes: '5',
};

export function HrmShiftsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingShift, setEditingShift] = useState<HrmShift | null>(null);
  const [deleteShift, setDeleteShift] = useState<HrmShift | null>(null);
  const query = useQuery({
    queryKey: ['hrm-shifts', shopId],
    staleTime: 5 * 60_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts?include_inactive=1`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được ca làm.');
      }
      return payload as { data: HrmShift[]; canManage: boolean };
    },
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['hrm-shifts', shopId] });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        editingShift
          ? `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts/${encodeURIComponent(editingShift.id)}`
          : `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts`,
        {
          method: editingShift ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            break_minutes: Number(form.break_minutes),
            late_grace_minutes: Number(form.late_grace_minutes),
            ...(editingShift ? { active: editingShift.active } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể lưu ca làm.');
      }
    },
    onSuccess: () => {
      toast.success(editingShift ? 'Đã cập nhật ca làm' : 'Đã tạo ca làm');
      setOpen(false);
      setEditingShift(null);
      setForm(EMPTY_FORM);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleMutation = useMutation({
    mutationFn: async (shift: HrmShift) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts/${encodeURIComponent(shift.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: shift.name,
            start_time: shift.startTime,
            end_time: shift.endTime,
            break_minutes: shift.breakMinutes,
            late_grace_minutes: shift.lateGraceMinutes,
            active: !shift.active,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể đổi trạng thái ca.');
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái ca');
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: async (shift: HrmShift) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts/${encodeURIComponent(shift.id)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể xóa ca làm.');
      }
    },
    onSuccess: () => {
      toast.success('Đã xóa ca làm');
      setDeleteShift(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate() {
    setEditingShift(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(shift: HrmShift) {
    setEditingShift(shift);
    setForm({
      name: shift.name,
      start_time: shift.startTime,
      end_time: shift.endTime,
      break_minutes: String(shift.breakMinutes),
      late_grace_minutes: String(shift.lateGraceMinutes),
    });
    setOpen(true);
  }

  async function confirmSaveShift() {
    const accepted = await confirm({
      title: editingShift ? 'Lưu thay đổi ca làm?' : 'Tạo ca làm mới?',
      description: `${form.name || 'Ca làm'} · ${form.start_time} – ${form.end_time}.`,
      confirmLabel: editingShift ? 'Lưu ca' : 'Tạo ca',
    });
    if (accepted) saveMutation.mutate();
  }

  async function confirmToggleShift(shift: HrmShift) {
    const accepted = await confirm({
      title: shift.active ? 'Ngừng sử dụng ca này?' : 'Bật lại ca này?',
      description: shift.active
        ? 'Bảng công cũ vẫn được giữ; ca sẽ không còn dùng cho gán mới.'
        : 'Ca làm sẽ xuất hiện lại trong lựa chọn chấm công.',
      confirmLabel: shift.active ? 'Ngừng sử dụng' : 'Bật ca',
    });
    if (accepted) toggleMutation.mutate(shift);
  }

  const columns: Column<HrmShift>[] = [
    { key: 'name', label: 'Tên ca' },
    {
      key: 'time',
      label: 'Thời gian',
      render: (row) => (
        <span>
          {row.startTime} – {row.endTime}
          {row.endTime <= row.startTime ? ' · qua ngày' : ''}
        </span>
      ),
    },
    {
      key: 'breakMinutes',
      label: 'Nghỉ',
      render: (row) => `${row.breakMinutes} phút`,
    },
    {
      key: 'lateGraceMinutes',
      label: 'Grace',
      render: (row) => `${row.lateGraceMinutes} phút`,
    },
    {
      key: 'usageCount',
      label: 'Đã dùng',
      render: (row) => `${row.usageCount} ngày công`,
    },
    {
      key: 'active',
      label: 'Trạng thái',
      render: (row) => <TagBadge label={row.active ? 'Đang dùng' : 'Đã tắt'} />,
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
              aria-label={`Sửa ${row.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void confirmToggleShift(row)}
              className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
              aria-label={row.active ? `Tắt ${row.name}` : `Bật ${row.name}`}
            >
              <Power className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteShift(row)}
              disabled={row.usageCount > 0}
              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
              title={
                row.usageCount > 0
                  ? 'Ca đã có bảng công, chỉ có thể ngừng sử dụng'
                  : 'Xóa ca'
              }
              aria-label={`Xóa ${row.name}`}
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
          <h2 className="text-lg font-semibold text-slate-900">Ca làm HRM</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Độc lập với ca bán hàng POS; hỗ trợ ca qua ngày.
          </p>
        </div>
        {query.data?.canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Thêm ca
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
            title="Chưa có ca làm"
            description="Tạo ca đầu tiên để chuẩn hóa bảng công."
          />
        }
      />
      {query.isError && (
        <p className="mt-3 text-sm text-rose-600">{query.error.message}</p>
      )}
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={editingShift ? 'Sửa ca làm' : 'Thêm ca làm'}
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
              onClick={() => void confirmSaveShift()}
              disabled={saveMutation.isPending || !form.name.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu ca'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Tên ca
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Ca sáng, Ca đêm..."
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Bắt đầu
              <input
                type="time"
                value={form.start_time}
                onChange={(event) =>
                  setForm({ ...form, start_time: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Kết thúc
              <input
                type="time"
                value={form.end_time}
                onChange={(event) =>
                  setForm({ ...form, end_time: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
          </div>
          {form.end_time <= form.start_time && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Ca này kết thúc vào ngày hôm sau.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Phút nghỉ
              <input
                type="number"
                min="0"
                max="720"
                value={form.break_minutes}
                onChange={(event) =>
                  setForm({ ...form, break_minutes: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Cho phép trễ
              <input
                type="number"
                min="0"
                max="240"
                value={form.late_grace_minutes}
                onChange={(event) =>
                  setForm({ ...form, late_grace_minutes: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
          </div>
        </div>
      </SlideOver>
      <ConfirmDialog
        open={Boolean(deleteShift)}
        onClose={() => setDeleteShift(null)}
        onConfirm={() => {
          if (deleteShift) deleteMutation.mutate(deleteShift);
        }}
        title="Xóa ca làm?"
        description="Chỉ ca chưa được dùng trong bảng công mới có thể xóa."
        confirmLabel="Xóa ca"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
