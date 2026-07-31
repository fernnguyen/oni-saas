'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { formatHrmDate } from '@/lib/hrm/formatDate';

interface Holiday {
  id: string;
  date: string;
  name: string;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const JS_DAY_MAPPING = [1, 2, 3, 4, 5, 6, 0]; // Monday = 1, Sunday = 0

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  let day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert to Monday-start (0 = Monday, 6 = Sunday)
}

export function HrmHolidaysPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  
  const monthRefs = useRef<(HTMLDivElement | null)[]>([]);
  const todayDate = new Date();
  const currentMonth = todayDate.getMonth();
  const currentYear = todayDate.getFullYear();
  
  // Format today at local timezone
  const todayStr = new Date(todayDate.getTime() - (todayDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['hrm-holidays', shopId, year],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays?year=${year}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Lỗi tải ngày nghỉ');
      return payload.data as Holiday[];
    },
  });

  useEffect(() => {
    if (year === currentYear && !isLoading && monthRefs.current[currentMonth]) {
      // scroll after a short delay to ensure rendering
      setTimeout(() => {
        monthRefs.current[currentMonth]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }, [year, currentYear, currentMonth, isLoading]);

  const { data: rules } = useQuery({
    queryKey: ['hrm-settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`);
      const payload = await res.json();
      return payload.data?.attendanceRules ?? {};
    },
  });

  // Normalize standard_workdays
  const standardWorkdays: Record<string, number> = { '0': 0, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1 };
  if (rules?.standard_workdays) {
    if (Array.isArray(rules.standard_workdays)) {
      Object.keys(standardWorkdays).forEach(k => standardWorkdays[k] = 0);
      rules.standard_workdays.forEach((d: number) => standardWorkdays[d.toString()] = 1);
    } else {
      Object.assign(standardWorkdays, rules.standard_workdays);
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, name: newName }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể thêm ngày nghỉ');
    },
    onSuccess: () => {
      toast.success('Đã lưu ngày nghỉ lễ');
      setIsAddModalOpen(false);
      setNewDate('');
      setNewName('');
      setEditingHoliday(null);
      queryClient.invalidateQueries({ queryKey: ['hrm-holidays', shopId] });
      queryClient.invalidateQueries({ queryKey: ['hrm-attendance-month', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể xóa ngày nghỉ');
    },
    onSuccess: () => {
      toast.success('Đã xóa ngày nghỉ lễ');
      setIsAddModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['hrm-holidays', shopId] });
      queryClient.invalidateQueries({ queryKey: ['hrm-attendance-month', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newName) return;
    if (editingHoliday && editingHoliday.date !== newDate) {
      // If date changed, we delete old one and create new one
      deleteMutation.mutate(editingHoliday.id, {
        onSuccess: () => createMutation.mutate()
      });
    } else {
      createMutation.mutate();
    }
  };

  const handleDayClick = (dateStr: string) => {
    const existing = holidays.find((h) => h.date === dateStr);
    if (existing) {
      setEditingHoliday(existing);
      setNewDate(existing.date);
      setNewName(existing.name);
    } else {
      setEditingHoliday(null);
      setNewDate(dateStr);
      setNewName('');
    }
    setIsAddModalOpen(true);
  };

  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Lịch nghỉ lễ năm {year}</h3>
          <p className="text-sm text-slate-500 mt-1">Bấm vào bất kỳ ngày nào trên lịch để thêm hoặc xóa sự kiện nghỉ lễ.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setYear(year - 1)}
            className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-slate-700 px-4">Năm {year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-center mb-4 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-white border border-slate-200"></div> Ngày thường</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></div> Cuối tuần</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-100 border border-rose-200"></div> Ngày lễ</div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-slate-500 animate-pulse">Đang tải lịch...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 xl:gap-8 gap-6">
          {months.map((month) => {
            const daysInMonth = getDaysInMonth(year, month);
            const firstDayOffset = getFirstDayOfMonth(year, month);
            const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            
            // Calculate blanks before day 1
            const blanks = Array.from({ length: firstDayOffset }, (_, i) => i);

            return (
              <div 
                key={month} 
                ref={(el) => { monthRefs.current[month] = el; }}
                className={`bg-white rounded-2xl border ${month === currentMonth && year === currentYear ? 'border-primary shadow-md' : 'border-slate-200 shadow-sm'} p-5 transition-all`}
              >
                <h4 className={`text-center font-bold mb-4 text-sm ${month === currentMonth && year === currentYear ? 'text-primary' : 'text-slate-800'}`}>
                  Tháng {month + 1}
                </h4>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((w, idx) => {
                     // Check if this weekday is marked as off in standard_workdays
                     const jsDay = JS_DAY_MAPPING[idx];
                     const isWeekend = standardWorkdays[jsDay.toString()] === 0;
                     return (
                       <div key={w} className={`text-center text-xs font-semibold py-1.5 ${isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>
                         {w}
                       </div>
                     );
                  })}
                  
                  {blanks.map((b) => (
                    <div key={`blank-${b}`} className="aspect-square"></div>
                  ))}
                  
                  {daysArray.map((day) => {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dateObj = new Date(year, month, day);
                    const jsDay = dateObj.getDay();
                    
                    const isWeekend = standardWorkdays[jsDay.toString()] === 0;
                    const holiday = holidays.find(h => h.date === dateStr);
                    const isToday = dateStr === todayStr;
                    
                    let bgClass = "bg-white hover:border-primary/50 text-slate-700";
                    if (holiday) {
                      bgClass = "bg-rose-50 border-rose-200 text-rose-700 font-bold shadow-sm z-10";
                    } else if (isWeekend) {
                      bgClass = "bg-slate-50 text-slate-400";
                    }
                    
                    if (isToday) {
                      bgClass += " ring-2 ring-primary ring-offset-1";
                    }

                    return (
                      <div key={day} className="relative group aspect-square">
                        <button
                          onClick={() => handleDayClick(dateStr)}
                          className={`w-full h-full flex items-center justify-center rounded-lg border border-transparent text-sm transition-all hover:scale-105 ${bgClass}`}
                        >
                          {day}
                        </button>
                        
                        {(holiday || isToday) && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[200px] z-50 pointer-events-none">
                            <div className={`text-xs font-medium py-1.5 px-3 rounded-lg shadow-lg relative ${holiday ? 'bg-slate-800 text-white' : 'bg-primary text-white'}`}>
                              {holiday ? holiday.name : 'Hôm nay'}
                              <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${holiday ? 'border-t-slate-800' : 'border-t-primary'}`}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlideOver 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        title={editingHoliday ? "Chỉnh sửa ngày lễ" : "Thêm ngày nghỉ lễ"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <div className="flex gap-2">
              {editingHoliday && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Xóa sự kiện này?')) deleteMutation.mutate(editingHoliday.id);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-semibold"
                  title="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa sự kiện
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={createMutation.isPending || deleteMutation.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Đang lưu...' : 'Lưu lại'}
              </button>
            </div>
          </>
        }
      >
        <div className="flex items-start gap-2 bg-blue-50 text-blue-800 p-3 rounded-xl text-sm mb-6">
          <Info className="w-5 h-5 shrink-0" />
          <p>Hệ thống sẽ tự động cập nhật lại ngày công trong Bảng công tháng nếu có sự thay đổi.</p>
        </div>
        
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên ngày lễ</label>
            <input
              type="text"
              required
              placeholder="VD: Tết Nguyên Đán, Giỗ tổ Hùng Vương..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày</label>
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
