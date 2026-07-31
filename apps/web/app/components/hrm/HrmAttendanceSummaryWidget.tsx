'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
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
export function HrmAttendanceSummaryWidget({ shopId, branchSlug }: { shopId: string; branchSlug: string }) {
  const [month, setMonth] = useState(vietnamMonth);
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
  const currentMonthValue = todayStr.slice(0, 7);
  const isCurrentMonth = todayStr.startsWith(month);
  const todayDay = parseInt(todayStr.slice(-2), 10);
  
  // Generate month options (past 12 months up to current month)
  const monthOptions = useMemo(() => {
    const options = [];
    const [currY, currM] = currentMonthValue.split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      let m = currM - i;
      let y = currY;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const val = `${y}-${m < 10 ? '0' + m : m}`;
      options.push({ value: val, label: `Tháng ${m}/${y}` });
    }
    return options;
  }, [currentMonthValue]);

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
      width: 200,
      className: 'sticky left-0 bg-white shadow-[1px_0_0_0_#f1f5f9] z-10 w-[200px] min-w-[200px] max-w-[200px] shrink-0 truncate', // sticky column with fixed width
      render: (row) => {
        let cong = 0;
        let loi = 0;
        Object.values(row.attendance).forEach((att: any) => {
          if (att.status === 'present') {
            let shiftCong = 1;
            let hasError = false;
            if (att.errors?.length > 0) {
              hasError = true;
              if (att.errors.some((e: any) => e.type === 'LATE_CRITICAL' || e.type === 'EARLY_CRITICAL' || e.type === 'MISSING_OUT')) {
                shiftCong = 0.5;
              }
            }
            cong += shiftCong;
            if (hasError) loi += 1;
          } else if (att.status === 'absent') {
            loi += 1;
          }
        });

        return (
          <div className="flex flex-col">
            <span className="font-medium text-slate-800 line-clamp-1" title={row.employeeName}>
              {row.employeeName}
              {row.employeeCode && (
                <span className="ml-1 text-xs text-slate-400">({row.employeeCode})</span>
              )}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5">
              {cong} công {loi > 0 && <span className="text-red-500 ml-1">({loi} lỗi)</span>}
            </span>
          </div>
        );
      },
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
            className="relative flex h-8 w-full cursor-pointer items-center justify-center hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary rounded-sm"
            onClick={() => setSelectedCell({
              employeeId: row.employeeId,
              employeeName: row.employeeName,
              workDate,
              currentData: att,
            })}
          >
            {display}
            {att?.errors?.length > 0 && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white" title="Có lỗi" />
            )}
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
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-800">
            Bảng công tháng
          </h3>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              if (e.target.value !== currentMonthValue) setViewAllDays(true);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-white cursor-pointer"
          >
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setMonth(currentMonthValue);
              setViewAllDays(false);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
            title="Quay về tháng này"
          >
            Tháng này
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setViewAllDays(!viewAllDays)}
            className="text-xs font-medium text-slate-600 hover:text-primary hover:underline focus:outline-none"
          >
            {viewAllDays ? 'Thu gọn' : 'Xem toàn bộ tháng'}
          </button>
          <span className="h-4 w-px bg-slate-200 hidden sm:block" />
          <Link
            href={`/${branchSlug}/hrm/attendance`}
            className="text-xs font-semibold text-primary hover:underline hidden sm:block"
          >
            Xem chi tiết →
          </Link>
        </div>
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
