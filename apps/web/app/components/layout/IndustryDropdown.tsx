'use client';

import Link from 'next/link';
import { 
  ChevronDown 
} from 'lucide-react';
import { ALL_SECTORS } from './industriesData';

export function IndustryDropdown() {
  return (
    <div className="relative group/menu inline-block">
      <button 
        id="nav-industry-trigger"
        className="flex items-center gap-1 py-2 text-sm font-semibold text-slate-650 hover:text-primary transition-colors cursor-pointer group-hover/menu:text-primary outline-none"
      >
        Ngành nghề hỗ trợ
        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-hover/menu:rotate-180" />
      </button>

      {/* Mega menu dropdown */}
      <div 
        id="nav-industry-menu"
        className="absolute top-full left-[-40px] md:left-[-180px] lg:left-[-240px] mt-2 w-[320px] sm:w-[500px] md:w-[760px] lg:w-[840px] rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl shadow-slate-900/10 transition-all duration-300 transform scale-95 opacity-0 invisible group-hover/menu:scale-100 group-hover/menu:opacity-100 group-hover/menu:visible z-50 flex flex-col gap-4"
      >
        <div className="border-b border-slate-100 pb-3 mb-1 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-450 uppercase tracking-widest">Ngành hàng hỗ trợ chuyên sâu</p>
          <span className="text-[10px] font-semibold text-emerald-650 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100/50">Tự động cấu hình</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ALL_SECTORS.map((group) => (
            <div key={group.groupId} className="flex flex-col gap-3">
              <div className={`px-3 py-1.5 rounded-xl border ${group.color} text-xs font-black uppercase tracking-wider text-center`}>
                {group.groupLabel}
              </div>
              
              <div className="grid grid-cols-1 gap-1">
                {group.items.map((item, idx) => {
                  const ItemIcon = item.icon;
                  return (
                    <Link 
                      key={idx} 
                      href={item.href}
                      className="group/item flex items-center gap-2.5 py-1.5 px-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all text-left"
                    >
                      <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-150 text-slate-500 group-hover/item:text-primary group-hover/item:bg-white group-hover/item:border-primary/25 transition-all">
                        <ItemIcon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-650 group-hover/item:text-primary transition-colors">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 mt-1">
          <div className="text-[11px] text-slate-500 font-semibold text-center sm:text-left">
            🎯 Chọn mô hình của bạn khi đăng ký. Hệ thống tự thích ứng giao diện POS và báo cáo.
          </div>
          <Link href="/register" className="text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap rounded-lg px-4 py-2 shadow-sm hover:shadow-md">
            Dùng thử miễn phí &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
