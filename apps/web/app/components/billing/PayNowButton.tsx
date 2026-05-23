'use client';

import React, { useEffect, useState } from 'react';

interface PayNowButtonProps {
  orderId: string;
  expiresAt: string;
}

export function PayNowButton({ orderId, expiresAt }: PayNowButtonProps) {
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const checkExpiry = () => {
      const expired = new Date() > new Date(expiresAt);
      setIsExpired(expired);
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (isExpired) return null;

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-sepay-qr', { detail: { orderId } }))}
      className="ml-3 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-blue-600 hover:text-white border border-blue-500 hover:bg-blue-600 rounded-lg transition-all active:scale-95 cursor-pointer shadow-sm"
    >
      Thanh toán ngay
      <svg className="h-3 w-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
