import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Gift } from 'lucide-react';

interface LeaveCalendarProps {
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  selectedStart: string | null;
  selectedEnd: string | null;
  onSelectDate: (date: string) => void;
  existingLeaves: { startDate: string; endDate: string; status: string }[];
  holidays: { date: string; name: string }[];
  isSelectingRange?: boolean;
}

export function LeaveCalendar({
  currentMonth,
  onMonthChange,
  selectedStart,
  selectedEnd,
  onSelectDate,
  existingLeaves,
  holidays,
  isSelectingRange = false,
}: LeaveCalendarProps) {
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonthRaw = new Date(year, month, 1).getDay(); // 0 is Sunday
  const firstDayOfMonth = firstDayOfMonthRaw === 0 ? 6 : firstDayOfMonthRaw - 1; // 0 is Monday

  const prevMonth = () => {
    onMonthChange(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    onMonthChange(new Date(year, month + 1, 1));
  };

  const isDateInRange = (dateStr: string, start: string, end: string) => {
    return dateStr >= start && dateStr <= end;
  };

  const getLeaveStatus = (dateStr: string) => {
    for (const leave of existingLeaves) {
      if (isDateInRange(dateStr, leave.startDate, leave.endDate)) {
        return leave.status;
      }
    }
    return null;
  };

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="h-10 w-full" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = dateObj.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const holiday = holidays.find(h => h.date === dateStr);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    
    const leaveStatus = getLeaveStatus(dateStr);
    let bgClass = 'hover:bg-slate-100 bg-white cursor-pointer';
    let textClass = 'text-slate-700';

    const isStart = selectedStart === dateStr;
    const isEnd = selectedEnd === dateStr;
    const isInSelectedRange = selectedStart && selectedEnd && isDateInRange(dateStr, selectedStart, selectedEnd);
    const isHoverRange = isSelectingRange && hoverDate && selectedStart && hoverDate >= selectedStart && isDateInRange(dateStr, selectedStart, hoverDate);

    if (leaveStatus === 'pending') {
      bgClass = 'bg-amber-100 cursor-not-allowed';
      textClass = 'text-amber-800 font-medium';
    } else if (leaveStatus === 'approved') {
      bgClass = 'bg-emerald-100 cursor-not-allowed';
      textClass = 'text-emerald-800 font-medium';
    } else if (holiday || isWeekend) {
      bgClass = 'bg-slate-50 cursor-not-allowed';
      textClass = 'text-slate-400';
    } else if (isStart || (isEnd && !isSelectingRange)) {
      bgClass = 'bg-primary text-white hover:bg-primary-dark';
      textClass = 'text-white font-medium';
    } else if (isInSelectedRange) {
      bgClass = 'bg-primary/10 text-primary-dark hover:bg-primary/20';
      textClass = 'text-primary-dark font-medium';
    } else if (isHoverRange) {
      bgClass = 'bg-primary/10 text-primary-dark';
      textClass = 'text-primary-dark font-medium';
    }

    days.push(
      <div
        key={d}
        onMouseEnter={() => setHoverDate(dateStr)}
        onMouseLeave={() => setHoverDate(null)}
        onClick={() => {
          if (!leaveStatus && !holiday && !isWeekend) {
            onSelectDate(dateStr);
          }
        }}
        className={`group relative h-10 flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${bgClass} ${textClass}`}
      >
        <span className="z-10 relative">{d}</span>
        {holiday && (
          <>
            <div className="absolute top-1 right-1 text-rose-500">
              <Gift className="h-2.5 w-2.5 opacity-60" />
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[200px] z-50 pointer-events-none">
              <div className="text-xs font-medium py-1.5 px-3 rounded-lg shadow-lg relative bg-slate-800 text-white text-center">
                {holiday.name}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-semibold text-sm">
          Tháng {month + 1}, {year}
        </div>
        <button type="button" onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
          <div key={d} className="text-xs font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days}
      </div>
      <div className="mt-4 flex gap-3 text-xs justify-center flex-wrap">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-primary"></div><span>Đã chọn</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-primary/20"></div><span>Dải ngày</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200"></div><span className="text-amber-800">Chờ duyệt</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200"></div><span className="text-emerald-800">Đã duyệt</span></div>
        <div className="flex items-center gap-1"><Gift className="h-3 w-3 text-rose-400" /><span className="text-slate-400">Nghỉ lễ</span></div>
      </div>
    </div>
  );
}
