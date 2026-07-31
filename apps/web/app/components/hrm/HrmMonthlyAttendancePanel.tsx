'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Upload, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { formatHrmDate } from '@/lib/hrm/formatDate';

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
  standard_workdays: number[];
  late_half_day_threshold_minutes: number;
  late_no_day_threshold_minutes: number;
  min_hours_half_day: number;
  min_hours_full_day: number;
}

interface AttendanceForm {
  employee_id: string;
  work_date: string;
  shift_template_id: string;
  clock_in: string;
  clock_out: string;
  status: AttendanceStatus;
  note: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Có mặt' },
  { value: 'absent', label: 'Vắng' },
  { value: 'paid_leave', label: 'Nghỉ có lương' },
  { value: 'unpaid_leave', label: 'Nghỉ không lương' },
  { value: 'holiday', label: 'Ngày lễ' },
];

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
  
  const [editingRow, setEditingRow] = useState<MonthlyAttendanceRow | null>(null);
  const [form, setForm] = useState<AttendanceForm | null>(null);
  const [viewingErrorsForEmployee, setViewingErrorsForEmployee] = useState<{ id: string; name: string } | null>(null);

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

  const { employees, daysInMonth } = useMemo(() => {
    const rawData = query.data?.data ?? [];
    const holidays = query.data?.holidays ?? [];
    const rules = query.data?.attendanceRules ?? { standard_workdays: [1, 2, 3, 4, 5, 6] };
    
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
      const isWeekend = !rules.standard_workdays.includes(dateObj.getDay());
      const isHoliday = holidays.some((h) => h.date === row.workDate);
      
      const hasMissingCheckout = row.exceptions?.missing_checkout;
      const isLate = row.lateMinutes > 0;
      const isEarly = row.earlyLeaveMinutes > 0;
      const hasError = hasMissingCheckout || isLate || isEarly || (row.status === 'absent' && !isWeekend && !isHoliday);
      
      let workday = 0;
      if (row.status === 'present') {
        workday = 1;
        if (rules.late_half_day_threshold_minutes && (row.lateMinutes + row.earlyLeaveMinutes) > rules.late_half_day_threshold_minutes) {
          workday = 0.5;
        }
        if (rules.late_no_day_threshold_minutes && (row.lateMinutes + row.earlyLeaveMinutes) > rules.late_no_day_threshold_minutes) {
          workday = 0;
        }
        if (hasMissingCheckout) workday = 0; // Requires manual resolution
      } else if (row.status === 'paid_leave' || row.status === 'holiday') {
        workday = 1;
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

  const saveMutation = useMutation({
    mutationFn: async (value: AttendanceForm) => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance/days`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'manual',
            rows: [
              {
                ...value,
                shift_template_id: value.shift_template_id || null,
                clock_in: value.clock_in || null,
                clock_out: value.clock_out || null,
                note: value.note || null,
              },
            ],
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể lưu ngày công.');
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật ngày công');
      setEditingRow(null);
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['hrm-attendance-month', shopId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEdit(row: MonthlyAttendanceRow) {
    setEditingRow(row);
    setForm({
      employee_id: row.employeeId,
      work_date: row.workDate,
      shift_template_id: row.shiftTemplateId ?? '',
      clock_in: timeFromIso(row.clockIn),
      clock_out: timeFromIso(row.clockOut),
      status: row.status ?? 'present',
      note: row.note ?? '',
    });
  }

  async function confirmSaveAttendance() {
    if (!form || !editingRow) return;
    const accepted = await confirm({
      title: 'Lưu thay đổi ngày công?',
      description: `${editingRow.employeeName} · ${formatHrmDate(form.work_date)}. Thao tác sẽ được ghi audit.`,
      confirmLabel: 'Lưu ngày công',
    });
    if (accepted) saveMutation.mutate(form);
  }

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

      <div className="my-4 flex flex-wrap items-end gap-3">
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
        <button
          onClick={() => setMonth(monthOptions[0].value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          Tháng này
        </button>
        <label className="text-sm font-medium text-slate-700 ml-auto">
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
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500 animate-pulse">Đang tải bảng công...</div>
        ) : employees.length === 0 ? (
          <EmptyState title="Không có nhân viên trong bộ lọc này" />
        ) : (
          <table className="w-full text-left text-sm text-slate-600 border-collapse">
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
                    const cell = emp.days[day];
                    if (!cell) {
                      return (
                        <td key={day} className="px-1 py-1 text-center border-r border-slate-200 bg-slate-50/50">
                          <div className="w-full h-full min-h-[40px]" title="Chưa làm việc"></div>
                        </td>
                      );
                    }
                    
                    const { row, isWeekend, isHoliday, hasError } = cell;
                    let bgClass = "bg-white";
                    let content = row.status === 'present' ? 'V' : '-';
                    
                    if (isHoliday || isWeekend) {
                      bgClass = "bg-slate-100/50";
                      content = 'Nghỉ';
                      if (row.status === 'present') {
                        content = 'OT';
                        bgClass = "bg-emerald-50";
                      }
                    } else if (hasError) {
                      bgClass = "bg-rose-50";
                    }
                    
                    return (
                      <td key={day} className={`px-1 py-1 text-center border-r border-slate-200 ${bgClass} cursor-pointer hover:bg-slate-100 transition-colors`} onClick={() => {
                        if (query.data?.canManage) openEdit(row);
                      }}>
                        <div className="flex flex-col items-center justify-center min-h-[40px]" title={hasError ? 'Có lỗi chấm công' : 'Bình thường'}>
                          <span className={`text-xs font-semibold ${hasError ? 'text-rose-600' : 'text-slate-700'}`}>
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
              <button 
                onClick={() => openEdit(err.row)}
                className="text-sm font-semibold text-rose-600 hover:text-rose-800"
              >
                Sửa
              </button>
            </div>
          ))}
        </div>
      </SlideOver>

      {/* SlideOver for Edit */}
      <SlideOver
        open={Boolean(editingRow && form)}
        onClose={() => {
          setEditingRow(null);
          setForm(null);
        }}
        title="Chỉnh ngày công"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setEditingRow(null);
                setForm(null);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!form || saveMutation.isPending}
              onClick={() => void confirmSaveAttendance()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu ngày công'}
            </button>
          </>
        }
      >
        {form && editingRow && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{editingRow.employeeName}</p>
              <p className="text-sm text-slate-500">{formatHrmDate(form.work_date)}</p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Trạng thái
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as AttendanceStatus })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Ca làm
              <select
                value={form.shift_template_id}
                disabled={form.status !== 'present'}
                onChange={(event) =>
                  setForm({ ...form, shift_template_id: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
              >
                <option value="">Không gán ca</option>
                {(query.data?.shifts ?? []).map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name}
                    {!shift.active ? ' (đã tắt)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-700">
                Giờ vào
                <input
                  type="time"
                  value={form.clock_in}
                  disabled={form.status !== 'present'}
                  onChange={(event) =>
                    setForm({ ...form, clock_in: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Giờ ra
                <input
                  type="time"
                  value={form.clock_out}
                  disabled={form.status !== 'present'}
                  onChange={(event) =>
                    setForm({ ...form, clock_out: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Ghi chú / Giải trình
              <textarea
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                rows={3}
              />
            </label>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
