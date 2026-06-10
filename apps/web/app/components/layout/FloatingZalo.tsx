'use client';
import { useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

export function FloatingZalo() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 group flex items-center gap-3">
      <a 
        href="https://zalo.me/g/owlxjd9bqfhocunnrjos" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-3 hover:-translate-y-1 transition-all duration-300"
        aria-label="Liên hệ Zalo Support"
      >
        <div className="bg-white/95 backdrop-blur-md pl-5 pr-2 py-2 rounded-full shadow-2xl border border-blue-100/50 flex items-center gap-3">
          <span className="text-sm font-extrabold text-blue-600 drop-shadow-sm">Tham gia cộng đồng trên Zalo</span>
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-30 animate-pulse"></div>
            <Image src="/partners/zalo.svg" alt="Zalo Support Group" width={44} height={44} className="relative z-10 hover:scale-110 transition-transform" />
          </div>
        </div>
      </a>
      <button 
        onClick={() => setIsVisible(false)}
        className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-slate-200 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Đóng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
