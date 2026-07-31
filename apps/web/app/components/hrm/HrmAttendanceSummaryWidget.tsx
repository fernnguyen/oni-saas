'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { HrmDailyAttendanceModal } from './HrmDailyAttendanceModal';

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
  clockIn?: string | null;
  clockOut?: string | null;
}

function vietnamMonth() {
  return new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    .slice(0, 7);
}

/**
 * HrmAttendanceSummaryWidget — month-wide matrix attendance view for dashboard.
 */
export function HrmAttendanceSummaryWidget({ shopId }: { shopId: string }) {
  const [month] = useState(vietnamMonth);
  const [viewAllDays, setViewAllDays] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: string;
    employeeName: string;
    workDate: string; // YYYY-MM-DD
    currentData?: AttendanceRow;
  } | null>(null);

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

  // Calculate days in month
  const [yearStr, monthStr] = month.split('-');
  const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  let daysArray = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return d < 10 ? `0${d}` : `${d}`;
  });

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const isCurrentMonth = todayStr.startsWith(month);
  const todayDay = parseInt(todayStr.slice(-2), 10);
  
  if (!viewAllDays) {
    if (isCurrentMonth) {
      const startDay = Math.max(1, todayDay - 9);
      daysArray = daysArray.slice(startDay - 1, todayDay);
    } else {
      daysArray = daysArray.slice(0, 10);
    }
  }

  // Group by employee
  const groupedData = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        employeeCode: string | null;
        attendance: Record<string, AttendanceRow>;
      }
    >();

    for (const row of query.data?.data ?? []) {
      if (!map.has(row.employeeId)) {
        map.set(row.employeeId, {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          employeeCode: row.employeeCode,
          attendance: {},
        });
      }
      const day = row.workDate.slice(-2); // get DD from YYYY-MM-DD
      map.get(row.employeeId)!.attendance[day] = row;
    }

    return Array.from(map.values());
  }, [query.data?.data]);

  const columns: Column<any>[] = [
    {
      key: 'employeeName',
      label: 'Nhân viên',
      width: 160,
      className: 'sticky left-0 bg-white shadow-[1px_0_0_0_#f1f5f9] z-10', // sticky column
      render: (row) => (
        <span className="font-medium text-slate-800 line-clamp-1" title={row.employeeName}>
          {row.employeeName}
          {row.employeeCode && (
            <span className="ml-1 text-xs text-slate-400">({row.employeeCode})</span>
          )}
        </span>
      ),
    },
  ];

  // Add a column for each day
  daysArray.forEach((day) => {
    const isToday = isCurrentMonth && parseInt(day, 10) === todayDay;
    columns.push({
      key: `day_${day}`,
      label: day,
      align: 'center',
      className: `px-0 min-w-[40px] max-w-[48px] !text-xs p-0 border-x border-slate-100 ${isToday ? 'bg-primary/5' : ''}`,
      render: (row) => {
        const att = row.attendance[day];
        const workDate = `${yearStr}-${monthStr}-${day}`;
        
        let display = <span className="text-slate-200">—</span>;
        
        if (att) {
          if (att.status === 'absent') {
            display = <span className="font-bold text-red-500" title="Vắng">X</span>;
          } else if (att.status === 'present') {
            const hasIn = !!att.clockIn;
            const hasOut = !!att.clockOut;
            if (hasIn && hasOut) {
              display = <span className="font-bold text-emerald-500" title="Đủ 2 ca">//</span>;
            } else if (hasIn || hasOut) {
              display = <span className="font-bold text-amber-500" title="Thiếu 1 ca">/</span>;
            } else {
              display = <span className="font-bold text-emerald-500" title="Có mặt">//</span>;
            }
          } else if (att.status === 'paid_leave' || att.status === 'unpaid_leave') {
            display = <span className="font-bold text-blue-500" title="Nghỉ phép">P</span>;
          } else if (att.status === 'holiday') {
            display = <span className="font-bold text-purple-500" title="Nghỉ lễ">L</span>;
          }
        }

        return (
          <button
            type="button"
            className="flex h-8 w-full cursor-pointer items-center justify-center hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary rounded-sm"
            onClick={() => setSelectedCell({
              employeeId: row.employeeId,
              employeeName: row.employeeName,
              workDate,
              currentData: att,
            })}
          >
            {display}
          </button>
        );
      },
    });
  });

  if (query.isError) {
    return (
      <p className="py-4 text-center text-sm text-rose-600">
        {query.error instanceof Error ? query.error.message : 'Không tải được dữ liệu.'}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <h3 className="font-semibold text-slate-800">
          Bảng công tháng {monthStr}/{yearStr}
        </h3>
        <button 
          onClick={() => setViewAllDays(!viewAllDays)}
          className="text-xs font-medium text-primary hover:underline focus:outline-none"
        >
          {viewAllDays ? 'Thu gọn (10 ngày)' : 'Xem toàn bộ tháng'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={groupedData}
          loading={query.isLoading}
          rowKey={(row) => row.employeeId}
          emptyState={
            <EmptyState
              title="Chưa có dữ liệu chấm công tháng này"
              description="Dữ liệu sẽ xuất hiện khi nhân viên check-in hoặc bạn nhập thủ công."
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Chú thích:</span>
        <div className="flex items-center gap-1.5"><span className="font-bold text-emerald-500">//</span> Đủ ca</div>
        <div className="flex items-center gap-1.5"><span className="font-bold text-amber-500">/</span> Thiếu ca</div>
        <div className="flex items-center gap-1.5"><span className="font-bold text-red-500">X</span> Vắng</div>
        <div className="flex items-center gap-1.5"><span className="font-bold text-blue-500">P</span> Phép</div>
        <div className="flex items-center gap-1.5"><span className="font-bold text-purple-500">L</span> Lễ</div>
      </div>

      {selectedCell && (
        <HrmDailyAttendanceModal
          shopId={shopId}
          employeeId={selectedCell.employeeId}
          employeeName={selectedCell.employeeName}
          workDate={selectedCell.workDate}
          currentData={selectedCell.currentData}
          onClose={() => setSelectedCell(null)}
          onSuccess={() => {
            setSelectedCell(null);
            query.refetch();
          }}
        />
      )}
    </div>
  );
}
