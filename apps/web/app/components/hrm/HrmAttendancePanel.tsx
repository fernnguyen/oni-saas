'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { HrmMonthlyAttendancePanel } from './HrmMonthlyAttendancePanel';

interface AttendanceRow {
  id: string | null;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  status: string | null;
}

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function HrmAttendancePanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const query = useQuery({
    queryKey: ['hrm-attendance', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được bảng công.');
      }
      return payload as {
        data: AttendanceRow[];
        canManage: boolean;
        selfEmployeeId: string | null;
      };
    },
  });
  const mutation = useMutation({
    mutationFn: async ({
      employeeId,
      action,
    }: {
      employeeId: string;
      action: 'check_in' | 'check_out';
    }) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, employee_id: employeeId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Chấm công thất bại.');
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật chấm công');
      void queryClient.invalidateQueries({ queryKey: ['hrm-attendance', shopId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  async function confirmAttendance(row: AttendanceRow) {
    const action = row.clockIn ? 'check_out' : 'check_in';
    const accepted = await confirm({
      title: action === 'check_in' ? 'Xác nhận vào ca?' : 'Xác nhận ra ca?',
      description: `${row.employeeName} · thao tác sẽ ghi nhận thời điểm hiện tại.`,
      confirmLabel: action === 'check_in' ? 'Check-in' : 'Check-out',
    });
    if (accepted) mutation.mutate({ employeeId: row.employeeId, action });
  }

  const canAct = (row: AttendanceRow) =>
    query.data?.canManage || query.data?.selfEmployeeId === row.employeeId;
  const columns: Column<AttendanceRow>[] = [
    { key: 'employeeCode', label: 'Mã NV', render: (row) => row.employeeCode || '—' },
    { key: 'employeeName', label: 'Nhân viên' },
    { key: 'clockIn', label: 'Vào ca', render: (row) => formatTime(row.clockIn) },
    { key: 'clockOut', label: 'Ra ca', render: (row) => formatTime(row.clockOut) },
    {
      key: 'workedMinutes',
      label: 'Thời gian',
      render: (row) =>
        row.workedMinutes > 0
          ? `${Math.floor(row.workedMinutes / 60)}h ${row.workedMinutes % 60}p`
          : '—',
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => (
        <TagBadge
          label={
            !row.clockIn
              ? 'Chưa vào ca'
              : row.clockOut
                ? 'Đã hoàn thành'
                : 'Đang làm'
          }
        />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        canAct(row) ? (
          <button
            type="button"
            disabled={mutation.isPending || Boolean(row.clockOut)}
            onClick={() => void confirmAttendance(row)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {row.clockIn ? 'Check-out' : 'Check-in'}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Chấm công hôm nay</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Owner có thể chấm công hộ; tài khoản đã liên kết chỉ chấm cho chính mình.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        loading={query.isLoading}
        rowKey={(row) => row.employeeId}
        emptyState={<EmptyState title="Chưa có nhân viên để chấm công" />}
      />
        {query.isError && (
          <p className="mt-3 text-sm text-rose-600">{query.error.message}</p>
        )}
      </div>
      <HrmMonthlyAttendancePanel shopId={shopId} />
    </div>
  );
}
