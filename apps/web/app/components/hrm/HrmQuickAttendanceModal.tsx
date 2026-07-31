import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, FileText, CheckCircle, LogOut, Settings, CalendarX } from 'lucide-react';

export function HrmQuickAttendanceModal({
  shopId,
  employeeId,
  employeeName,
  employeePhone,
  departmentName,
  action,
  canManage,
  initialClockIn,
  initialClockOut,
  initialStatus,
  initialShiftId,
  shifts,
  onClose,
  onSuccess,
}: {
  shopId: string;
  employeeId: string;
  employeeName: string;
  employeePhone?: string | null;
  departmentName?: string | null;
  action: 'check_in' | 'check_out' | 'manage';
  canManage?: boolean;
  initialClockIn?: string | null;
  initialClockOut?: string | null;
  initialStatus?: string | null;
  initialShiftId?: string | null;
  shifts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isCheckIn = action === 'check_in';
  const isCheckOut = action === 'check_out';
  const isManage = action === 'manage' || canManage;

  const formatInitialTime = (isoString?: string | null) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  };

  const defaultTime = getVietnamTime();

  const initialTimeInStr = formatInitialTime(initialClockIn);
  const initialTimeOutStr = formatInitialTime(initialClockOut);

  const [clockInTime, setClockInTime] = useState<string>(
    initialTimeInStr || (isCheckIn ? defaultTime : '')
  );
  const [clockOutTime, setClockOutTime] = useState<string>(
    initialTimeOutStr || (isCheckOut ? defaultTime : '')
  );
  const [status, setStatus] = useState<string>(initialStatus || 'present');
  const [note, setNote] = useState<string>('');
  const [shiftId, setShiftId] = useState<string>(initialShiftId || '');

  const getIsoString = (timeStr: string) => {
    if (!timeStr) return null;
    const now = new Date();
    const [hh, mm] = timeStr.split(':').map(Number);
    const customDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    customDate.setHours(hh, mm, 0, 0);
    return customDate.toISOString();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canManage && (isCheckIn || isCheckOut)) {
        const response = await fetch(
          `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              employee_id: employeeId,
              custom_time: getIsoString(isCheckIn ? clockInTime : clockOutTime),
              note: note || undefined,
              shift_template_id: shiftId || undefined,
            }),
          },
        );
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error?.message ?? 'Chấm công thất bại.');
        }
      } else {
        const response = await fetch(
          `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_id: employeeId,
              work_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
              clock_in: status === 'present' ? getIsoString(clockInTime) : getIsoString(initialTimeInStr),
              clock_out: status === 'present' ? getIsoString(clockOutTime) : getIsoString(initialTimeOutStr),
              status: status,
              note: note || undefined,
              shift_template_id: shiftId || undefined,
            }),
          },
        );
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error?.message ?? 'Cập nhật thất bại.');
        }
      }
    },
    onSuccess: () => {
      toast.success(isManage ? 'Cập nhật thành công' : isCheckIn ? 'Check-in thành công' : 'Check-out thành công');
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm !m-0" 
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                {isCheckIn ? (
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                ) : isCheckOut ? (
                  <LogOut className="h-5 w-5 text-rose-500" />
                ) : (
                  <Settings className="h-5 w-5 text-slate-500" />
                )}
                {isCheckIn ? 'Check-in' : isCheckOut ? 'Check-out' : 'Quản lý chấm công'}
              </h2>
              <div className="mt-1 font-medium text-slate-800 flex items-center gap-2">
                {employeeName}
              </div>
              {(departmentName || employeePhone) && (
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  {departmentName && <span>{departmentName}</span>}
                  {departmentName && employeePhone && <span>•</span>}
                  {employeePhone && (
                    <a href={`tel:${employeePhone}`} className="text-blue-600 hover:underline">
                      {employeePhone}
                    </a>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 mb-auto"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4">
            {isManage && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <CalendarX className="w-4 h-4 text-slate-400" />
                  Trạng thái
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    // Do not clear the time if they change to "vắng mặt" or other statuses.
                    // This preserves their actual check-in data so it isn't lost if we update.
                  }}
                  className="w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500 h-10 px-3 border outline-none"
                >
                  <option value="present">Làm việc (Present)</option>
                  <option value="absent">Vắng mặt (Absent)</option>
                  <option value="paid_leave">Nghỉ phép có lương</option>
                  <option value="unpaid_leave">Nghỉ không lương</option>
                </select>
              </div>
            )}

            {status === 'present' && (
              <div className={isManage ? "grid grid-cols-2 gap-4" : ""}>
                {(isCheckIn || isManage) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {isCheckIn && !isManage ? 'Thời gian Check-in' : 'Giờ vào'}
                    </label>
                    <input
                      type="time"
                      value={clockInTime}
                      onChange={(e) => setClockInTime(e.target.value)}
                      className="w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500 h-10 px-3 border outline-none"
                    />
                  </div>
                )}

                {(isCheckOut || isManage) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {isCheckOut && !isManage ? 'Thời gian Check-out' : 'Giờ ra'}
                    </label>
                    <input
                      type="time"
                      value={clockOutTime}
                      onChange={(e) => setClockOutTime(e.target.value)}
                      className="w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500 h-10 px-3 border outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Ca làm việc
              </label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500 h-10 px-3 border outline-none"
              >
                <option value="">-- Tự động theo phân ca --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                Ghi chú / Giải trình (Tuỳ chọn)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Quên chấm công sáng, check-in muộn do tắc đường..."
                className="w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500 p-3 border outline-none"
                rows={3}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 bg-slate-50/50 rounded-b-2xl">
            <button
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={`rounded-lg px-6 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50
                ${isCheckIn ? 'bg-emerald-600 hover:bg-emerald-700' : isCheckOut ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}
              `}
            >
              {mutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
            </button>
          </div>
        </div>
      </div>
  );
}
