'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface AttendanceRules {
  standard_workdays: Record<string, number>; // "1"=T2: 1 (full), 0.5 (half), 0 (off)
  late_half_day_threshold_minutes: number;
  late_no_day_threshold_minutes: number;
  min_hours_half_day: number;
  min_hours_full_day: number;
  allow_time_compensation: boolean;
}

const defaultRules: AttendanceRules = {
  standard_workdays: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '0': 0 }, // T2 -> T7 full, CN off
  late_half_day_threshold_minutes: 60,
  late_no_day_threshold_minutes: 240,
  min_hours_half_day: 4,
  min_hours_full_day: 8,
  allow_time_compensation: true,
};

const DAYS_OF_WEEK = [
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
  { value: 0, label: 'Chủ nhật' },
];

export function HrmAttendanceRulesPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<AttendanceRules>(defaultRules);

  const { isLoading } = useQuery({
    queryKey: ['hrm-settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Lỗi tải cấu hình');
      
      const loadedRules = payload.data?.attendanceRules;
      if (loadedRules && Object.keys(loadedRules).length > 0) {
        // If loaded rules are using the old number[] format for standard_workdays
        if (Array.isArray(loadedRules.standard_workdays)) {
           const migrated: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
           loadedRules.standard_workdays.forEach((day: number) => {
             migrated[day.toString()] = 1;
           });
           setRules({ ...defaultRules, ...loadedRules, standard_workdays: migrated });
        } else {
           setRules({ ...defaultRules, ...loadedRules });
        }
      }
      return payload.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_rules: rules }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể lưu cấu hình');
    },
    onSuccess: () => {
      toast.success('Đã lưu quy tắc chấm công');
      queryClient.invalidateQueries({ queryKey: ['hrm-settings', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="animate-pulse text-sm text-slate-500">Đang tải cấu hình...</div>;
  }

  const cycleDay = (dayStr: string) => {
    setRules((prev) => {
      const current = prev.standard_workdays[dayStr] ?? 0;
      let next = 0;
      if (current === 1) next = 0.5;
      else if (current === 0.5) next = 0;
      else next = 1;
      
      return { 
        ...prev, 
        standard_workdays: { ...prev.standard_workdays, [dayStr]: next } 
      };
    });
  };

  const updateNumberField = (field: keyof AttendanceRules, value: string) => {
    setRules((prev) => ({ ...prev, [field]: Number(value) }));
  };

  return (
    <div className="space-y-8 w-full">
      {/* Ngày làm việc */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Lịch làm việc tiêu chuẩn trong tuần</h3>
        <p className="text-sm text-slate-500 mt-1">
          Bấm để chuyển đổi giữa các trạng thái: <strong>Cả ngày</strong>, <strong>Nửa ngày</strong>, hoặc <strong>Nghỉ</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          {DAYS_OF_WEEK.map((day) => {
            const value = rules.standard_workdays[day.value.toString()] ?? 0;
            const isFull = value === 1;
            const isHalf = value === 0.5;

            return (
              <button
                type="button"
                key={day.value}
                onClick={() => cycleDay(day.value.toString())}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 w-[120px] transition-all hover:scale-[1.02] active:scale-95 ${
                  isFull
                    ? 'border-primary bg-primary/5 text-primary shadow-sm'
                    : isHalf
                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300'
                }`}
              >
                <span className="text-sm font-semibold">{day.label}</span>
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isFull ? 'bg-primary/10' : isHalf ? 'bg-amber-500/10' : 'bg-slate-200/50'
                }`}>
                  {isFull ? 'Cả ngày' : isHalf ? 'Nửa ngày' : 'Nghỉ'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Ngưỡng phạt */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Tính nửa công khi muộn/sớm</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Số phút tối đa cho phép muộn/sớm trước khi bị tính nửa công.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              value={rules.late_half_day_threshold_minutes}
              onChange={(e) => updateNumberField('late_half_day_threshold_minutes', e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-600">phút</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Không tính công khi muộn/sớm</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Số phút tối đa cho phép muộn/sớm trước khi bị mất hoàn toàn công ngày.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              value={rules.late_no_day_threshold_minutes}
              onChange={(e) => updateNumberField('late_no_day_threshold_minutes', e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-600">phút</span>
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Giờ tối thiểu */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Số giờ tối thiểu (nửa công)</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Nhân viên cần làm tối thiểu bao nhiêu giờ để được tính nửa công.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="0.5"
              value={rules.min_hours_half_day}
              onChange={(e) => updateNumberField('min_hours_half_day', e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-600">giờ</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Số giờ tối thiểu (đầy đủ)</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Nhân viên cần làm tối thiểu bao nhiêu giờ để được tính trọn 1 công.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="0.5"
              value={rules.min_hours_full_day}
              onChange={(e) => updateNumberField('min_hours_full_day', e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-600">giờ</span>
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.allow_time_compensation}
            onChange={(e) => setRules((prev) => ({ ...prev, allow_time_compensation: e.target.checked }))}
            className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <div>
            <span className="text-sm font-semibold text-slate-900">Cho phép bù giờ (Đến sớm bù về muộn)</span>
            <p className="text-sm text-slate-500">
              Nếu bật, thời gian đến làm sớm có thể trừ đi thời gian về sớm trong cùng ngày để không bị đánh lỗi.
            </p>
          </div>
        </label>
      </div>

      <div className="pt-4 flex">
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:bg-primary/90"
        >
          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu quy tắc'}
        </button>
      </div>
    </div>
  );
}
