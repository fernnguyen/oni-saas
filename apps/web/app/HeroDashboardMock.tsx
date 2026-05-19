'use client';
import { useState, useEffect } from 'react';

export function HeroDashboardMock() {
  const [mounted, setMounted] = useState(false);
  const chartData = [40, 70, 45, 90, 65, 85, 100];
  
  const activities = [
    { id: 1, name: 'Đơn #1024', val: '+340K', bg: 'bg-emerald-500', text: 'text-emerald-600', shadow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' },
    { id: 2, name: 'Nhập kho', val: '50 SP', bg: 'bg-blue-500', text: 'text-blue-600', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]' },
    { id: 3, name: 'Cảnh báo', val: 'Sắp hết', bg: 'bg-amber-500', text: 'text-amber-600', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]' },
  ];

  useEffect(() => {
    // Start animation after a short delay so it feels like loading data
    const timer = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex gap-4">
      {/* Chart area */}
      <div className="flex-1 rounded-lg border border-slate-100 p-4 bg-slate-50 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tăng trưởng tuần</span>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">+14.5%</span>
        </div>
        <div className="flex items-end justify-between h-20 gap-2 mt-2">
          {chartData.map((h, i) => (
            <div key={i} className="w-full bg-blue-100 rounded-t-sm relative group cursor-pointer h-full">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm transition-all duration-1000 ease-out group-hover:opacity-80 group-hover:scale-y-105 origin-bottom" 
                style={{ 
                  height: mounted ? `${h}%` : '0%',
                  transitionDelay: mounted ? `${i * 100}ms` : '0ms'
                }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg">
                  {h}M
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-bold">
          <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
        </div>
      </div>
      
      {/* Recent Activity */}
      <div className="w-1/3 rounded-lg border border-slate-100 p-4 bg-white flex flex-col">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Hoạt động mới</span>
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          {activities.map((act, i) => (
            <div 
              key={act.id} 
              className="flex items-center gap-2 transition-all duration-700 ease-out"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(10px)',
                transitionDelay: mounted ? `${700 + i * 200}ms` : '0ms'
              }}
            >
              <div className={`h-2 w-2 rounded-full ${act.bg} ${act.shadow}`} />
              <div className="flex-1">
                <div className="text-xs font-bold text-slate-800">{act.name}</div>
              </div>
              <span className={`text-xs font-bold ${act.text}`}>{act.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
