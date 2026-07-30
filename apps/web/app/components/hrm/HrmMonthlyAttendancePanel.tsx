'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { formatHrmDate } from '@/lib/hrm/formatDate';

type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'paid_leave'
  | 'unpaid_leave'
  | 'holiday';

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
}

interface ShiftOption {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
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

function vietnamMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
}

function defaultDay(month: string): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return today.startsWith(month) ? today : `${month}-01`;
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
  return minutes > 0
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}p`
    : '—';
}

function statusLabel(status: AttendanceStatus | null): string {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    'Chưa ghi công'
  );
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseAttendanceCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const headers = parseCsvLine(lines[0] ?? '');
  const required = ['employee_id', 'work_date', 'status'];
  if (!required.every((header) => headers.includes(header))) {
    throw new Error(
      'CSV cần có các cột employee_id, work_date và status.',
    );
  }
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    );
    return {
      employee_id: row.employee_id,
      work_date: row.work_date,
      status: row.status,
      shift_template_id: row.shift_template_id || null,
      clock_in: row.clock_in || null,
      clock_out: row.clock_out || null,
      note: row.note || null,
    };
  });
}

export function HrmMonthlyAttendancePanel({ shopId }: { shopId: string }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState(vietnamMonth);
  const [selectedDay, setSelectedDay] = useState(() =>
    defaultDay(vietnamMonth()),
  );
  const [departmentId, setDepartmentId] = useState('');
  const [editingRow, setEditingRow] = useState<MonthlyAttendanceRow | null>(
    null,
  );
  const [form, setForm] = useState<AttendanceForm | null>(null);

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
        throw new Error(
          payload.error?.message ?? 'Không tải được bảng công tháng.',
        );
      }
      return payload as {
        data: MonthlyAttendanceRow[];
        shifts: ShiftOption[];
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
    return [...values.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], 'vi'),
    );
  }, [query.data?.data]);

  const visibleRows = useMemo(
    () =>
      (query.data?.data ?? []).filter(
        (row) =>
          row.workDate === selectedDay &&
          (!departmentId || row.departmentId === departmentId),
      ),
    [departmentId, query.data?.data, selectedDay],
  );

  const totals = useMemo(() => {
    const rows = (query.data?.data ?? []).filter(
      (row) => !departmentId || row.departmentId === departmentId,
    );
    return {
      present: rows.filter((row) => row.status === 'present').length,
      worked: rows.reduce((sum, row) => sum + row.workedMinutes, 0),
      overtime: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
    };
  }, [departmentId, query.data?.data]);

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
      void queryClient.invalidateQueries({
        queryKey: ['hrm-attendance-month', shopId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['hrm-attendance', shopId],
      });
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

  async function handleImport(file: File) {
    try {
      const rows = parseAttendanceCsv(await file.text());
      if (rows.length === 0) throw new Error('File CSV không có dữ liệu.');
      const endpoint = `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance/import`;
      const preview = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'import', dry_run: true, rows }),
      });
      const previewPayload = await preview.json();
      if (!preview.ok) {
        throw new Error(
          previewPayload.error?.message ?? 'Dữ liệu import không hợp lệ.',
        );
      }
      const accepted = await confirm({
        title: 'Xác nhận import bảng công',
        description: `${previewPayload.validRows} dòng hợp lệ sẽ được ghi trong một transaction.`,
        confirmLabel: 'Import',
      });
      if (!accepted) return;
      const committed = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'import', dry_run: false, rows }),
      });
      const committedPayload = await committed.json();
      if (!committed.ok) {
        throw new Error(
          committedPayload.error?.message ?? 'Không thể import bảng công.',
        );
      }
      toast.success(`Đã import ${committedPayload.validRows} dòng bảng công`);
      void queryClient.invalidateQueries({
        queryKey: ['hrm-attendance-month', shopId],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không thể đọc file CSV.',
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const columns: Column<MonthlyAttendanceRow>[] = [
    {
      key: 'employeeCode',
      label: 'Mã NV',
      render: (row) => row.employeeCode || '—',
    },
    { key: 'employeeName', label: 'Nhân viên' },
    {
      key: 'departmentName',
      label: 'Phòng ban',
      render: (row) => row.departmentName || 'Chưa phân phòng',
    },
    {
      key: 'shiftName',
      label: 'Ca',
      render: (row) => row.shiftName || '—',
    },
    {
      key: 'clock',
      label: 'Vào – Ra',
      render: (row) =>
        row.clockIn
          ? `${timeFromIso(row.clockIn)} – ${timeFromIso(row.clockOut) || '…'}`
          : '—',
    },
    {
      key: 'workedMinutes',
      label: 'Giờ công',
      render: (row) => duration(row.workedMinutes),
    },
    {
      key: 'overtimeMinutes',
      label: 'Tăng ca',
      render: (row) => duration(row.overtimeMinutes),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => <TagBadge label={statusLabel(row.status)} />,
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        query.data?.canManage ? (
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="rounded-lg p-2 text-primary hover:bg-blue-50"
            aria-label={`Sửa công ${row.employeeName} ngày ${formatHrmDate(row.workDate)}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarDays className="h-5 w-5 text-primary" />
            Bảng công tháng
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Theo dõi từng ngày, chỉnh công có audit và snapshot phòng ban.
          </p>
        </div>
        {query.data?.canManage && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Import CSV
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Ngày có mặt</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {totals.present}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Tổng giờ công</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {duration(totals.worked)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Tổng tăng ca</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {duration(totals.overtime)}
          </p>
        </div>
      </div>

      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Tháng
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setSelectedDay(defaultDay(event.target.value));
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Ngày
          <input
            type="date"
            value={selectedDay}
            min={`${month}-01`}
            max={`${month}-31`}
            onChange={(event) => setSelectedDay(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Phòng ban
          <select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
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

      <DataTable
        columns={columns}
        data={visibleRows}
        loading={query.isLoading}
        rowKey={(row) => `${row.employeeId}:${row.workDate}`}
        emptyState={<EmptyState title="Không có nhân viên trong bộ lọc này" />}
      />
      {query.isError && (
        <p className="mt-3 text-sm text-rose-600">{query.error.message}</p>
      )}

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
              <p className="font-semibold text-slate-900">
                {editingRow.employeeName}
              </p>
              <p className="text-sm text-slate-500">
                {formatHrmDate(form.work_date)}
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Trạng thái
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as AttendanceStatus,
                  })
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
              Ghi chú
              <textarea
                value={form.note}
                rows={3}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <p className="text-xs leading-5 text-slate-500">
              Mẫu CSV: employee_id, work_date, status, shift_template_id,
              clock_in, clock_out, note.
            </p>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
