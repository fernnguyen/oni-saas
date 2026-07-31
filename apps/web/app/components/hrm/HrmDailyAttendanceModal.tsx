'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Clock, Calendar, FileText, AlertCircle } from 'lucide-react';
import { TagBadge } from '@/app/components/ui/TagBadge';

export function HrmDailyAttendanceModal({
  shopId,
  employeeId,
  employeeName,
  workDate,
  currentData,
  onClose,
  onSuccess,
}: {
  shopId: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  currentData?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [shiftId, setShiftId] = useState<string>(currentData?.shiftTemplateId || '');
  const [clockIn, setClockIn] = useState<string>(currentData?.clockIn ? new Date(currentData.clockIn).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '');
  const [clockOut, setClockOut] = useState<string>(currentData?.clockOut ? new Date(currentData.clockOut).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '');
  const [shiftId2, setShiftId2] = useState<string>(currentData?.shiftTemplateId2 || '');
  const [clockIn2, setClockIn2] = useState<string>(currentData?.clockIn2 ? new Date(currentData.clockIn2).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '');
  const [clockOut2, setClockOut2] = useState<string>(currentData?.clockOut2 ? new Date(currentData.clockOut2).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '');
  const [showShift2, setShowShift2] = useState<boolean>(!!currentData?.shiftTemplateId2 || !!currentData?.clockIn2 || !!currentData?.clockOut2);
  const [note, setNote] = useState<string>(currentData?.note || '');
  const [status, setStatus] = useState<string>(currentData?.status || 'present');

  // get shifts from cache
  const queryClient = useQueryClient();
  const month = workDate.slice(0, 7);
  const cache: any = queryClient.getQueryData(['hrm-attendance-month-widget', shopId, month]);
  const shifts: any[] = cache?.shifts || [];

  const mutation = useMutation({
    mutationFn: async () => {
      // Format clock in/out relative to workDate
      const formatTime = (time: string) => {
        if (!time) return null;
        // Basic naive conversion (assuming same timezone)
        return `${workDate}T${time}:00+07:00`;
      };

      const res = await fetch(`/api/shops/${shopId}/hrm/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          work_date: workDate,
          shift_template_id: shiftId || null,
          clock_in: formatTime(clockIn),
          clock_out: formatTime(clockOut),
          shift_template_id_2: showShift2 ? (shiftId2 || null) : null,
          clock_in_2: showShift2 ? formatTime(clockIn2) : null,
          clock_out_2: showShift2 ? formatTime(clockOut2) : null,
          note: note || null,
          status: status || 'present',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Lỗi cập nhật chấm công');
      }
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Cập nhật chấm công</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {employeeName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-slate-800 leading-tight">{employeeName}</p>
              <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(workDate).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Trạng thái (Status)</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
              >
                <option value="present">Có mặt (Present)</option>
                <option value="absent">Vắng mặt (Absent)</option>
                <option value="paid_leave">Nghỉ phép có lương</option>
                <option value="unpaid_leave">Nghỉ phép không lương</option>
                <option value="holiday">Nghỉ lễ</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ca làm việc (Shift Override)</label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
              >
                <option value="">-- Mặc định --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Giờ vào
                </label>
                <input
                  type="time"
                  value={clockIn}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClockIn(e.target.value)}
                  placeholder="--:--"
                  className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Giờ ra
                </label>
                <input
                  type="time"
                  value={clockOut}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClockOut(e.target.value)}
                  placeholder="--:--"
                  className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
                />
              </div>
            </div>

            {!showShift2 ? (
              <button
                type="button"
                onClick={() => setShowShift2(true)}
                className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
              >
                + Thêm ca 2 (Ca gãy)
              </button>
            ) : (
              <div className="pt-4 border-t border-slate-100 space-y-4 relative">
                <button
                  type="button"
                  onClick={() => { setShowShift2(false); setShiftId2(''); setClockIn2(''); setClockOut2(''); }}
                  className="absolute -top-3 right-0 text-xs text-red-500 hover:underline bg-white px-2"
                >
                  Xóa ca 2
                </button>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ca làm việc 2</label>
                  <select
                    value={shiftId2}
                    onChange={(e) => setShiftId2(e.target.value)}
                    className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
                  >
                    <option value="">-- Mặc định --</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />
                      Giờ vào 2
                    </label>
                    <input
                      type="time"
                      value={clockIn2}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClockIn2(e.target.value)}
                      placeholder="--:--"
                      className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />
                      Giờ ra 2
                    </label>
                    <input
                      type="time"
                      value={clockOut2}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClockOut2(e.target.value)}
                      placeholder="--:--"
                      className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary h-10 px-3 border outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {(status === 'absent' || (clockIn && !clockOut) || (!clockIn && clockOut)) && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <p>Hệ thống ghi nhận trạng thái vắng/thiếu ca. Vui lòng nhập giải trình.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slate-400" />
                Giải trình / Ghi chú
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary p-3 border outline-none resize-none"
                placeholder="Nhập lý do đi trễ, về sớm, quên chấm công..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50 rounded-b-2xl">
          <button 
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
            onClick={onClose} 
            disabled={mutation.isPending}
          >
            Hủy
          </button>
          <button 
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={() => mutation.mutate()} 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}
