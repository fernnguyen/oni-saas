'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Upload, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { HrmMonthlyAttendanceSkeleton } from './HrmContentSkeletons';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { formatHrmDate } from '@/lib/hrm/formatDate';
import { HrmDailyAttendanceModal } from './HrmDailyAttendanceModal';

type AttendanceStatus = 'present' | 'absent' | 'paid_leave' | 'unpaid_leave' | 'holiday';

interface MonthlyAttendanceRow {
  attendanceId: string | null;
  employeeId: string;
  profileId: string | null;
  employeeCode: string | null;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  shiftTemplateId: string | null;
  shiftName: string | null;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus | null;
  note: string | null;
  exceptions: any;
  workdayCount?: number;
}

interface ShiftOption {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

interface Holiday {
  date: string;
  name: string;
}

interface AttendanceRules {
  standard_workdays: Record<string, number>;
  late_half_day_threshold_minutes: number;
  late_no_day_threshold_minutes: number;
  min_hours_half_day: number;
  min_hours_full_day: number;
}


function timeFromIso(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function duration(minutes: number): string {
  return minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}p` : '—';
}

function getMonthOptions() {
  const options = [];
  const d = new Date();
  d.setDate(1); // Set to 1st to prevent overflow on months with fewer days
  for (let i = 0; i < 12; i++) {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    options.push({ value: `${year}-${month}`, label: `Tháng ${month}/${year}` });
    d.setMonth(d.getMonth() - 1);
  }
  return options;
}

export function HrmMonthlyAttendancePanel({ shopId }: { shopId: string }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const monthOptions = useMemo(() => getMonthOptions(), []);
  
  const [month, setMonth] = useState(monthOptions[0].value);
  const [departmentId, setDepartmentId] = useState('');
  const [viewingErrorsForEmployee, setViewingErrorsForEmployee] = useState<{ id: string; name: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<any>(null);

  const query = useQuery({
    queryKey: ['hrm-attendance-month', shopId, month],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance?month=${encodeURIComponent(month)}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không tải được bảng công tháng.');
      }
      return payload as {
        data: MonthlyAttendanceRow[];
        shifts: ShiftOption[];
        holidays: Holiday[];
        attendanceRules: AttendanceRules;
        canManage: boolean;
        selfEmployeeId: string | null;
      };
    },
  });

  const departments = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of query.data?.data ?? []) {
      if (row.departmentId) {
        values.set(row.departmentId, row.departmentName ?? 'Chưa đặt tên');
      }
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [query.data?.data]);

  const { rules, holidays, standardWorkdays } = useMemo(() => {
    const r = (query.data?.attendanceRules ?? { standard_workdays: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '0': 0 } }) as any;
    const h = query.data?.holidays ?? [];
    
    let sw = r.standard_workdays;
    if (Array.isArray(sw)) {
       sw = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
       r.standard_workdays.forEach((d: number) => sw[d.toString()] = 1);
    }
    return { rules: r, holidays: h, standardWorkdays: sw as Record<string, number> };
  }, [query.data]);

  const { employees, daysInMonth } = useMemo(() => {
    const rawData = query.data?.data ?? [];
    
    const [year, m] = month.split('-');
    const daysCount = new Date(Number(year), Number(m), 0).getDate();
    
    const empMap = new Map<string, any>();
    
    for (const row of rawData) {
      if (departmentId && row.departmentId !== departmentId) continue;
      
      if (!empMap.has(row.employeeId)) {
        empMap.set(row.employeeId, {
          id: row.employeeId,
          code: row.employeeCode,
          name: row.employeeName,
          departmentName: row.departmentName,
          days: {},
          totalWorkdays: 0,
          errors: [],
        });
      }
      const emp = empMap.get(row.employeeId);
      
      const dayNum = parseInt(row.workDate.split('-')[2]);
      const dateObj = new Date(row.workDate);
      const dayIndex = dateObj.getDay().toString();
      const maxWorkday = standardWorkdays[dayIndex] ?? 0;
      
      const isWeekend = maxWorkday === 0;
      const isHoliday = holidays.some((h) => h.date === row.workDate);
      
      const hasMissingCheckout = row.exceptions?.missing_checkout;
      const isLate = row.lateMinutes > 0;
      const isEarly = row.earlyLeaveMinutes > 0;
      const hasError = hasMissingCheckout || isLate || isEarly || (row.status === 'absent' && !isWeekend && !isHoliday);
      
      let workday = 0;
      if (row.status === 'present') {
        const actuallyWorked = !!row.clockIn || row.workedMinutes > 0;
        const hasExceptions = row.exceptions && Object.keys(row.exceptions).length > 0;
        workday = maxWorkday === 0 ? (actuallyWorked || row.note || hasExceptions ? 1 : 0) : maxWorkday; // OT on weekend gets 1 day by default for UI, though can be customized
        if (rules.late_half_day_threshold_minutes && (row.lateMinutes + row.earlyLeaveMinutes) > rules.late_half_day_threshold_minutes) {
          if (maxWorkday === 0.5) workday = 0;
          else workday = 0.5;
        }
        if (rules.late_no_day_threshold_minutes && (row.lateMinutes + row.earlyLeaveMinutes) > rules.late_no_day_threshold_minutes) {
          workday = 0;
        }
        if (hasMissingCheckout) workday = 0; // Requires manual resolution
      } else if (row.status === 'paid_leave' || row.status === 'holiday') {
        workday = maxWorkday === 0 ? 0 : maxWorkday;
      }
      
      emp.totalWorkdays += workday;
      
      if (hasError) {
        emp.errors.push({
          date: row.workDate,
          reason: hasMissingCheckout ? 'Thiếu check-out' 
                : isLate ? `Đi muộn ${row.lateMinutes}p` 
                : isEarly ? `Về sớm ${row.earlyLeaveMinutes}p` 
                : 'Vắng mặt',
          row,
        });
      }
      
      emp.days[dayNum] = {
        row,
        isWeekend,
        isHoliday,
        hasError,
        workday
      };
    }
    
    return {
      employees: Array.from(empMap.values()),
      daysInMonth: daysCount,
    };
  }, [query.data, month, departmentId]);


  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarDays className="h-5 w-5 text-primary" />
            Bảng công tháng
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Theo dõi từng ngày, quản lý ngày nghỉ lễ, xử lý lỗi đi muộn/về sớm.
          </p>
        </div>
      </div>

      <div className="my-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">
            Tháng
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            &nbsp;
            <button
              onClick={() => setMonth(monthOptions[0].value)}
              className="mt-1 block rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Tháng này
            </button>
          </label>
          {query.data?.canManage && (
            <label className="text-sm font-medium text-slate-700">
              Phòng ban
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1 block w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
          <span className="flex items-center gap-1.5"><span className="font-bold text-emerald-500 text-sm tracking-tighter">//</span> Đủ ca</span>
          <span className="flex items-center gap-1.5"><span className="font-bold text-amber-500 text-sm">/</span> Thiếu ca</span>
          <span className="flex items-center gap-1.5"><span className="font-bold text-red-500 text-sm">X</span> Vắng</span>
          <span className="flex items-center gap-1.5"><span className="font-bold text-blue-500 text-sm">P</span> Phép</span>
          <span className="flex items-center gap-1.5"><span className="font-bold text-purple-500 text-sm">L</span> Lễ</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        {query.isLoading ? (
          <HrmMonthlyAttendanceSkeleton />
        ) : employees.length === 0 ? (
          <EmptyState title="Không có nhân viên trong bộ lọc này" />
        ) : (
          <table className="w-full min-w-max text-left text-sm text-slate-600 border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase text-slate-500 font-semibold shadow-sm">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-3 min-w-[200px] z-20 border-b border-r border-slate-200">Nhân viên</th>
                {daysArray.map((day) => (
                  <th key={day} className="px-3 py-3 text-center min-w-[60px] border-b border-r border-slate-200 whitespace-nowrap">
                    Ngày {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/50">
                  <td className="sticky left-0 bg-white px-4 py-3 z-10 border-r border-slate-200 group">
                    <div className="font-semibold text-slate-900 truncate max-w-[180px]" title={emp.name}>
                      {emp.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                      <span>{emp.code || '—'}</span>
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="font-medium text-slate-700">{emp.totalWorkdays} công</span>
                      {emp.errors.length > 0 && (
                        <button 
                          onClick={() => setViewingErrorsForEmployee({ id: emp.id, name: emp.name })}
                          className="ml-2 text-rose-600 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          ({emp.errors.length} lỗi)
                        </button>
                      )}
                    </div>
                  </td>
                  {daysArray.map((day) => {
                    const [year, m] = month.split('-');
                    const dateStr = `${year}-${m}-${String(day).padStart(2, '0')}`;
                    const dateObj = new Date(Number(year), Number(m) - 1, day);
                    const dayIndex = dateObj.getDay().toString();
                    const maxWorkday = standardWorkdays[dayIndex] ?? 0;
                    
                    const colIsWeekend = maxWorkday === 0;
                    const colIsHoliday = holidays.some((h) => h.date === dateStr);
                    
                    const cell = emp.days[day];
                    
                    if (!cell) {
                      let bgClass = "bg-slate-50/50";
                      let title = "Chưa làm việc";
                      let content = "";
                      let textClass = "text-slate-400";
                      
                      if (colIsHoliday) {
                        bgClass = "bg-rose-50/50";
                        title = "Ngày lễ";
                        content = "L";
                        textClass = "text-rose-700";
                      } else if (colIsWeekend) {
                        bgClass = "bg-slate-100/50";
                        title = "Cuối tuần";
                        content = "";
                      }
                      
                      return (
                        <td key={day} className={`px-1 py-1 text-center border-r border-slate-200 ${bgClass}`}>
                          <div className="flex items-center justify-center w-full h-full min-h-[40px]" title={title}>
                            {content && <span className={`text-xs font-bold ${textClass}`}>{content}</span>}
                          </div>
                        </td>
                      );
                    }
                    
                    const { row, isWeekend, isHoliday, hasError, workday } = cell;
                    let bgClass = "bg-white";
                    let content = '';

                    if (row.status === 'present') {
                       if (workday >= (maxWorkday || 1)) content = '//';
                       else if (workday > 0) content = '/';
                       else content = 'X';
                    } else if (row.status === 'absent') {
                       content = 'X';
                    } else if (row.status === 'paid_leave' || row.status === 'unpaid_leave') {
                       content = 'P';
                    } else if (row.status === 'holiday') {
                       content = 'L';
                    } else {
                       content = '-';
                    }
                    
                    let textClass = "text-slate-700 font-bold";
                    if (content === '//') textClass = "text-emerald-500 font-bold";
                    else if (content === '/') textClass = "text-amber-500 font-bold";
                    else if (content === 'X') textClass = "text-red-500 font-bold";
                    else if (content === 'P') textClass = "text-blue-500 font-bold";
                    else if (content === 'L') textClass = "text-purple-500 font-bold";
                    
                    return (
                      <td key={day} className={`relative px-1 py-1 text-center border-r border-slate-200 ${bgClass} ${query.data?.canManage ? 'cursor-pointer hover:bg-slate-100' : ''} transition-colors`} onClick={() => {
                        if (query.data?.canManage) {
                          setSelectedCell({
                            employeeId: emp.id,
                            employeeName: emp.name,
                            workDate: dateStr,
                            currentData: cell ? cell.row : undefined,
                          });
                        }
                      }}>
                        {hasError && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm" title="Có lỗi chấm công"></div>}
                        <div className="flex flex-col items-center justify-center min-h-[40px]" title={hasError ? 'Có lỗi chấm công' : 'Bình thường'}>
                          <span className={`text-xs font-bold ${textClass} tracking-tighter`}>
                            {content}
                          </span>
                          {row.status === 'present' && row.clockIn && (
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {timeFromIso(row.clockIn)}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* SlideOver for Error Details */}
      <SlideOver
        open={Boolean(viewingErrorsForEmployee)}
        onClose={() => setViewingErrorsForEmployee(null)}
        title={`Chi tiết lỗi: ${viewingErrorsForEmployee?.name}`}
      >
        <div className="space-y-4">
          {viewingErrorsForEmployee && employees.find(e => e.id === viewingErrorsForEmployee.id)?.errors.map((err: any, idx: number) => (
            <div key={idx} className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-rose-900">{formatHrmDate(err.date)}</p>
                <p className="text-sm text-rose-700 mt-1">{err.reason}</p>
                <p className="text-xs text-rose-600/80 mt-1">Giờ vào: {timeFromIso(err.row.clockIn) || '--:--'} | Giờ ra: {timeFromIso(err.row.clockOut) || '--:--'}</p>
              </div>
              {query.data?.canManage && (
                <button
                  onClick={() => {
                    setViewingErrorsForEmployee(null);
                    setSelectedCell({
                      employeeId: viewingErrorsForEmployee?.id,
                      employeeName: viewingErrorsForEmployee?.name,
                      workDate: err.date,
                      currentData: err.row,
                    });
                  }}
                  className="text-sm font-semibold text-rose-600 hover:text-rose-800"
                >
                  Sửa
                </button>
              )}
            </div>
          ))}
        </div>
      </SlideOver>

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
            queryClient.invalidateQueries({ queryKey: ['hrm-attendance-month', shopId] });
          }}
        />
      )}
    </div>
  );
}
