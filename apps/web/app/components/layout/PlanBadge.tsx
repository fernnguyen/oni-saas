import React from 'react';

interface PlanBadgeProps {
  planCode: string; // 'plan_mini', 'plan_pro', 'plan_enterprise'
  planName: string; 
  periodStart?: string;
  periodEnd?: string;
}

export function PlanBadge({ planCode, planName, periodStart, periodEnd }: PlanBadgeProps) {
  if (!planCode) return null;

  let durationText = 'Không giới hạn';
  if (periodEnd) {
    const end = new Date(periodEnd).getTime();
    const now = new Date().getTime();
    const diffDays = Math.ceil((end - now) / (1000 * 3600 * 24));
    
    if (diffDays > 0) {
      durationText = `Còn ${diffDays} ngày`;
    } else {
      durationText = 'Đã hết hạn';
    }
  }

  // --- Mini (Khởi đầu): Vibrant Dark Blue Gradient ---
  if (planCode === 'plan_mini') {
    return (
      <div className="hidden sm:flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 pl-2.5 pr-4 py-1.5 text-white relative overflow-hidden shrink-0">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10" />
        <IconLightning className="h-4 w-4 text-yellow-300 shrink-0 relative" />
        <div className="relative">
          <div className="font-semibold text-xs leading-tight">{planName}</div>
          <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
        </div>
      </div>
    );
  }

  // --- Enterprise (Doanh nghiệp): Black/Gold ---
  if (planCode === 'plan_enterprise') {
    return (
      <div className="hidden sm:flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 pl-2.5 pr-4 py-1.5 shrink-0 relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-yellow-500/10 blur-xl" />
        <IconDiamond className="h-4 w-4 text-yellow-400 shrink-0 relative z-10" />
        <div className="relative z-10">
          <div className="font-bold text-xs text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 leading-tight">
            {planName}
          </div>
          <div className="text-[10px] text-yellow-100/70 leading-tight">{durationText}</div>
        </div>
      </div>
    );
  }

  // --- Pro (Chuyên nghiệp): Pink/Orange (Default) ---
  return (
    <div className="hidden sm:flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#EC4899] to-[#F97316] pl-2.5 pr-4 py-1.5 text-white relative overflow-hidden shrink-0">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10" />
      <IconCrown className="h-4 w-4 text-yellow-200 shrink-0 relative" />
      <div className="relative">
        <div className="font-semibold text-xs leading-tight">{planName}</div>
        <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
      </div>
    </div>
  );
}

function IconCrown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 3a1 1 0 000 2h14a1 1 0 000-2H5z" />
    </svg>
  );
}

function IconLightning({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconDiamond({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.592 0L21.75 12M2.25 12l8.954 8.955c.44.439 1.152.439 1.592 0L21.75 12M12 2.25v19.5" />
    </svg>
  );
}
