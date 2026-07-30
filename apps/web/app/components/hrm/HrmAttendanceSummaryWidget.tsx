'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { TagBadge } from '@/app/components/ui/TagBadge';

type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'paid_leave'
  | 'unpaid_leave'
  | 'holiday';

interface AttendanceRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  departmentName: string | null;
  workDate: string;
  shiftName: string | null;
  workedMinutes: number;
  status: AttendanceStatus | null;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  absent: 'Vắng',
  paid_leave: 'Nghỉ phép',
  unpaid_leave: 'Nghỉ không lương',
  holiday: 'Nghỉ lễ',
};

const STATUS_COLOR: Record<AttendanceStatus, 'green' | 'red' | 'yellow' | 'blue' | 'purple'> = {
  present: 'green',
  absent: 'red',
  paid_leave: 'blue',
  unpaid_leave: 'yellow',
  holiday: 'purple',
};

function vietnamMonth() {
  return new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    .slice(0, 7);
}

function defaultDay(month: string) {
  const today = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  return today.startsWith(month) ? today : `${month}-01`;
}

/**
 * HrmAttendanceSummaryWidget — compact read-only attendance view for dashboard.
 *
 * Shows today's attendance records for the current month.
 * No editing, no import — those are in HrmAttendancePanel (full page).
 */
export function HrmAttendanceSummaryWidget({ shopId }: { shopId: string }) {
  const [month] = useState(vietnamMonth);
  const [selectedDay] = useState(() => defaultDay(vietnamMonth()));

  const query = useQuery({
    queryKey: ['hrm-attendance-month-widget', shopId, month],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance?month=${encodeURIComponent(month)}`,
        { cache: 'no-store' },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Lỗi tải chấm công');
      return payload as { data: AttendanceRow[]; canManage: boolean };
    },
  });

  const todayRows = useMemo(
    () => (query.data?.data ?? []).filter((r) => r.workDate === selectedDay),
    [query.data?.data, selectedDay],
  );

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'employeeName',
      label: 'Nhân viên',
      render: (row) => (
        <span className="font-medium text-slate-800">
          {row.employeeName}
          {row.employeeCode && (
            <span className="ml-1.5 text-xs text-slate-400">
              ({row.employeeCode})
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'shiftName',
      label: 'Ca',
      render: (row) => (
        <span className="text-slate-600">{row.shiftName ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) =>
        row.status ? (
          <TagBadge
            label={STATUS_LABEL[row.status]}
            color={STATUS_COLOR[row.status]}
          />
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ];

  if (query.isError) {
    return (
      <p className="py-4 text-center text-sm text-rose-600">
        {query.error instanceof Error
          ? query.error.message
          : 'Không tải được dữ liệu.'}
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={todayRows}
      loading={query.isLoading}
      rowKey={(row) => `${row.employeeId}:${row.workDate}`}
      emptyState={
        <EmptyState
          title="Không có dữ liệu chấm công hôm nay"
          description="Dữ liệu sẽ xuất hiện khi nhân viên check-in hoặc bạn nhập thủ công."
        />
      }
    />
  );
}
