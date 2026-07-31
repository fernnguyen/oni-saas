'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { useState } from 'react';
import { Clock, CheckCircle2, Timer, Settings, LogIn, LogOut, AlertCircle, CalendarX } from 'lucide-react';
import { HrmQuickAttendanceModal } from './HrmQuickAttendanceModal';
import { HrmChangeShiftModal } from './HrmChangeShiftModal';

interface AttendanceRow {
  id: string | null;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  employeePhone?: string | null;
  departmentName?: string | null;
  shiftTemplateId?: string | null;
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
  const [selectedRow, setSelectedRow] = useState<AttendanceRow | null>(null);
  const [selectedAction, setSelectedAction] = useState<'check_in' | 'check_out' | 'manage'>('check_in');
  const [changingShiftRow, setChangingShiftRow] = useState<AttendanceRow | null>(null);
  
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
        shifts: any[];
        canManage: boolean;
        selfEmployeeId: string | null;
      };
    },
  });

  const canAct = (row: AttendanceRow) =>
    query.data?.canManage || query.data?.selfEmployeeId === row.employeeId;
  const columns: Column<AttendanceRow>[] = [
    { key: 'employeeCode', label: 'Mã NV', render: (row) => row.employeeCode || '—' },
    { 
      key: 'employeeName', 
      label: 'Nhân viên',
      render: (row) => (
        <div>
          <div className="font-medium">{row.employeeName}</div>
          {row.employeePhone && <div className="text-xs text-slate-500">{row.employeePhone}</div>}
        </div>
      )
    },
    { key: 'departmentName', label: 'Bộ phận', render: (row) => row.departmentName || '—' },
    {
      key: 'shiftTemplateId',
      label: 'Ca làm việc',
      render: (row) => {
        const isManager = query.data?.canManage;
        const shiftName =
          query.data?.shifts?.find((s) => s.id === row.shiftTemplateId)?.name ||
          'Tự động / Không có';

        if (isManager) {
          return (
            <button
              onClick={() => setChangingShiftRow(row)}
              className="group flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium"
            >
              {shiftName}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
            </button>
          );
        }
        return <span className="text-slate-600">{shiftName}</span>;
      },
    },
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
      render: (row) => {
        const status = row.status?.toLowerCase();
        
        if (status === 'paid_leave' || status === 'unpaid_leave' || status === 'leave') {
          const leaveLabel = status === 'paid_leave' ? 'Nghỉ (Có lương)' : status === 'unpaid_leave' ? 'Nghỉ (Không lương)' : 'Nghỉ';
          return (
            <div className="flex items-center gap-1.5 text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md w-max text-xs font-medium">
              <CalendarX className="w-3.5 h-3.5" />
              {leaveLabel}
            </div>
          );
        }

        const shift = query.data?.shifts?.find((s) => s.id === row.shiftTemplateId);
        let isAbsent = status === 'absent';
        let isLateMissing = false;
        
        if (!isAbsent && !row.clockIn && shift && shift.endTime) {
          const now = new Date();
          const currentHourMin = now.getHours() * 60 + now.getMinutes();
          const [h, m] = shift.endTime.split(':').map(Number);
          if (currentHourMin > (h * 60 + m)) {
            isLateMissing = true;
          }
        }

        if (isAbsent) {
          return (
            <div className="flex items-center gap-1.5 text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md w-max text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Vắng mặt
            </div>
          );
        }

        if (isLateMissing) {
          return (
            <div className="flex items-center gap-1.5 text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md w-max text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Không chấm công
            </div>
          );
        }

        if (!row.clockIn) {
          return (
            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100/75 px-2 py-0.5 rounded-md w-max text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              Chưa vào ca
            </div>
          );
        }
        if (row.clockOut) {
          return (
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md w-max text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã hoàn thành
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md w-max text-xs font-medium">
            <Timer className="w-3.5 h-3.5 animate-pulse" />
            Đang làm
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Thao tác',
      align: 'right',
      render: (row) => {
        const isManager = query.data?.canManage;
        
        let action: 'check_in' | 'check_out' | 'manage' = 'check_in';
        let btnText = 'Check-in';
        let btnColor = 'bg-emerald-600 hover:bg-emerald-700';
        let Icon = LogIn;

        if (row.clockIn && row.clockOut) {
          action = 'manage';
          btnText = 'Quản lý';
          btnColor = 'bg-slate-600 hover:bg-slate-700';
          Icon = Settings;
        } else if (row.clockIn && !row.clockOut) {
          action = 'check_out';
          btnText = 'Check-out';
          btnColor = 'bg-rose-600 hover:bg-rose-700';
          Icon = LogOut;
        } else if (row.status === 'absent' || row.status === 'paid_leave' || row.status === 'unpaid_leave') {
          action = 'manage';
          btnText = 'Quản lý';
          btnColor = 'bg-slate-600 hover:bg-slate-700';
          Icon = Settings;
        }

        if (!isManager && action === 'manage') {
          return <span className="text-sm text-slate-400">Không có quyền</span>;
        }

        return (
          <button
            onClick={() => {
              setSelectedRow(row);
              setSelectedAction(action);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors ${btnColor}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {btnText}
          </button>
        );
      },
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

      {selectedRow && (
        <HrmQuickAttendanceModal
          shopId={shopId}
          employeeId={selectedRow.employeeId}
          employeeName={selectedRow.employeeName}
          employeePhone={selectedRow.employeePhone}
          departmentName={selectedRow.departmentName}
          action={selectedAction}
          canManage={query.data?.canManage}
          initialClockIn={selectedRow.clockIn}
          initialClockOut={selectedRow.clockOut}
          initialStatus={selectedRow.status || undefined}
          initialShiftId={selectedRow.shiftTemplateId}
          shifts={query.data?.shifts ?? []}
          onClose={() => setSelectedRow(null)}
          onSuccess={() => {
            setSelectedRow(null);
            void queryClient.invalidateQueries({ queryKey: ['hrm-attendance', shopId] });
          }}
        />
      )}

      {changingShiftRow && (
        <HrmChangeShiftModal
          shopId={shopId}
          employeeId={changingShiftRow.employeeId}
          employeeName={changingShiftRow.employeeName}
          currentShiftId={changingShiftRow.shiftTemplateId || null}
          shifts={query.data?.shifts ?? []}
          onClose={() => setChangingShiftRow(null)}
          onSuccess={() => {
            setChangingShiftRow(null);
            void queryClient.invalidateQueries({ queryKey: ['hrm-attendance', shopId] });
          }}
        />
      )}
    </div>
  );
}
