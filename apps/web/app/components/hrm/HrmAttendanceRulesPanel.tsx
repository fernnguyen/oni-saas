'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface AttendanceRules {
  standard_workdays: number[]; // 0=CN, 1=T2...
  late_half_day_threshold_minutes: number;
  late_no_day_threshold_minutes: number;
  min_hours_half_day: number;
  min_hours_full_day: number;
  allow_time_compensation: boolean;
}

const defaultRules: AttendanceRules = {
  standard_workdays: [1, 2, 3, 4, 5, 6], // T2 -> T7
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
        setRules({ ...defaultRules, ...loadedRules });
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

  const toggleDay = (day: number) => {
    setRules((prev) => {
      const isSelected = prev.standard_workdays.includes(day);
      if (isSelected) {
        return { ...prev, standard_workdays: prev.standard_workdays.filter((d) => d !== day) };
      }
      return { ...prev, standard_workdays: [...prev.standard_workdays, day].sort() };
    });
  };

  const updateNumberField = (field: keyof AttendanceRules, value: string) => {
    setRules((prev) => ({ ...prev, [field]: Number(value) }));
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Ngày làm việc */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Lịch làm việc tiêu chuẩn trong tuần</h3>
        <p className="text-sm text-slate-500 mt-1">
          Chọn các ngày được tính là ngày làm việc mặc định. (Các ngày không chọn sẽ là ngày nghỉ cuối tuần).
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = rules.standard_workdays.includes(day.value);
            return (
              <label
                key={day.value}
                className={`flex cursor-pointer select-none items-center gap-2 rounded-xl border px-4 py-2 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={isSelected}
                  onChange={() => toggleDay(day.value)}
                />
                <span className="text-sm font-medium">{day.label}</span>
              </label>
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
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu quy tắc'}
        </button>
      </div>
    </div>
  );
}
