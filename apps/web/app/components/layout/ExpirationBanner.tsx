'use client';

import React, { useEffect, useState } from 'react';

interface ExpirationBannerProps {
  periodEnd?: string;
  systemSettings?: any;
  planCode?: string;
}

export function ExpirationBanner({ periodEnd, systemSettings, planCode }: ExpirationBannerProps) {
  const [diffDays, setDiffDays] = useState<number | null>(null);

  useEffect(() => {
    if (!periodEnd) return;
    const calculateDiff = () => {
      const end = new Date(periodEnd).getTime();
      const now = new Date().getTime();
      const diffMs = end - now;
      setDiffDays(Math.ceil(diffMs / (1000 * 3600 * 24)));
    };
    calculateDiff();
    const interval = setInterval(calculateDiff, 60 * 60 * 1000); // Check every hour
    return () => clearInterval(interval);
  }, [periodEnd]);

  if (diffDays === null) return null;

  const bannerDays = systemSettings?.plan_expiration_banner_days ?? 7;
  const downgradeBannerDays = systemSettings?.plan_lock_grace_days ?? 3; // Reusing this for downgrade banner days

  if (diffDays > bannerDays) return null;

  const isDowngraded = diffDays <= 0 && diffDays >= -downgradeBannerDays && planCode === 'plan_mini'; 
  const isExpiredWarning = diffDays > 0 && diffDays <= bannerDays;

  if (!isDowngraded && !isExpiredWarning) {
    // Past downgrade banner period
    return null; 
  }

  return (
    <div className={`p-4 mb-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm border gap-4 ${
      isDowngraded 
        ? 'bg-red-50 border-red-200 text-red-800' 
        : 'bg-orange-50 border-orange-200 text-orange-800'
    }`}>
      <div className="flex items-start md:items-center gap-3">
        <svg className={`w-6 h-6 shrink-0 mt-0.5 md:mt-0 ${isDowngraded ? 'text-red-500' : 'text-orange-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          {isDowngraded ? (
            <>
              <p className="font-bold text-sm">Gói dịch vụ đã hết hạn!</p>
              <p className="text-xs mt-0.5 opacity-90">Hệ thống đã chuyển về gói Tiên phong miễn phí. Bạn có thể gia hạn lại gói Chuyên nghiệp để khôi phục toàn bộ tính năng như trước đây.</p>
            </>
          ) : (
            <>
              <p className="font-bold text-sm">Gói dịch vụ sắp hết hạn</p>
              <p className="text-xs mt-0.5 opacity-90">Dịch vụ của bạn sẽ hết hạn sau {diffDays} ngày nữa. Vui lòng gia hạn để không bị gián đoạn hoạt động kinh doanh.</p>
            </>
          )}
        </div>
      </div>
      <button 
        onClick={() => window.dispatchEvent(new CustomEvent('open-plan-modal'))}
        className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-colors shrink-0 w-full md:w-auto ${
          isDowngraded 
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20' 
            : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20'
        }`}
      >
        Gia hạn ngay
      </button>
    </div>
  );
}
