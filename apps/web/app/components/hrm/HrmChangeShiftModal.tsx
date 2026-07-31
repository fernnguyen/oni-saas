import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export function HrmChangeShiftModal({
  shopId,
  employeeId,
  employeeName,
  currentShiftId,
  shifts,
  onClose,
  onSuccess,
}: {
  shopId: string;
  employeeId: string;
  employeeName: string;
  currentShiftId: string | null;
  shifts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [shiftId, setShiftId] = useState(currentShiftId || '');

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/attendance`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employeeId,
            work_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }),
            shift_template_id: shiftId || null,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message ?? 'Đổi ca thất bại.');
      }
    },
    onSuccess: () => {
      toast.success('Đã thay đổi ca làm việc');
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
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Đổi ca làm việc</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-sm text-slate-500 mb-4">
                Chọn ca làm việc hôm nay cho nhân viên <span className="font-semibold text-slate-800">{employeeName}</span>.
              </p>
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
              className="rounded-lg px-6 py-2 text-sm font-semibold text-white shadow-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
  );
}
