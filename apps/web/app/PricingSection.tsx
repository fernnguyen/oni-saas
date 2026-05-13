'use client';

import { useState } from 'react';
import Link from 'next/link';

const CheckIcon = () => (
  <svg className="h-5 w-5 shrink-0 text-[#0268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export function PricingSection({ plans }: { plans: any[] }) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  // Format price
  const formatPrice = (price: number) => {
    if (!price || price === 0) return 'Miễn phí';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1).replace('.0', '')}M`;
    if (price >= 1000) return `${price / 1000}K`;
    return price.toString();
  };

  const getDisplayPrice = (plan: any) => {
    if (plan.code === 'plan_mini') return 'Miễn phí';
    if (plan.code === 'plan_enterprise') return 'Liên hệ';
    
    // Read from db if available
    if (billingCycle === 'yearly' && plan.price_yearly !== undefined) {
      return formatPrice(plan.price_yearly);
    }
    if (billingCycle === 'monthly' && plan.price_monthly !== undefined) {
      return formatPrice(plan.price_monthly);
    }
    
    // fallback
    return billingCycle === 'yearly' ? '9.9M' : '299K';
  };

  const getPeriod = (plan: any) => {
    if (plan.code === 'plan_enterprise') return null;
    if (plan.code === 'plan_mini') {
      return (
        <span className="ml-1 inline-flex items-center rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wide shadow-sm">
          trong 3 năm
        </span>
      );
    }
    return <span className="text-base text-slate-500 font-medium">{billingCycle === 'yearly' ? '/năm' : '/tháng'}</span>;
  };

  const getSubtext = (plan: any) => {
    if (plan.code === 'plan_mini') return 'Hỗ trợ Hộ kinh doanh chuyển đổi số';
    if (plan.code === 'plan_enterprise') return 'Tối ưu cho chuỗi lớn';
    
    if (billingCycle === 'yearly' && plan.price_yearly !== undefined) {
      const monthlyEquiv = Math.round(plan.price_yearly / 12);
      return `Chỉ ${formatPrice(monthlyEquiv)}/tháng (tiết kiệm 20%)`;
    }
    return billingCycle === 'yearly' ? 'Chỉ 825K/tháng (tiết kiệm 20%)' : 'Thanh toán hàng tháng';
  };

  return (
    <section id="pricing" className="relative py-24 md:py-32 bg-slate-50">
      <div className="pointer-events-none absolute top-0 left-1/3 h-[500px] w-[500px] rounded-full bg-blue-200/30 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center mb-16 lg:mb-20">
          <p className="text-sm font-bold uppercase tracking-widest text-[#0268FF] mb-3">Bảng giá</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Chi phí tối ưu, hiệu quả tối đa</h2>
          <p className="mt-4 text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Khởi đầu vững chắc với gói Tiên phong miễn phí 3 năm hỗ trợ Chuyển đổi số. Nâng cấp linh hoạt khi quy mô mở rộng.
          </p>
          
          <div className="mt-8 inline-flex items-center rounded-full bg-slate-200 p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hàng tháng
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                billingCycle === 'yearly' ? 'bg-white text-[#0268FF] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hàng năm <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">-20%</span>
            </button>
          </div>
        </div>

        <div className="grid gap-8 lg:gap-10 md:grid-cols-3 items-center">
          {plans.map((p) => (
            <div key={p.code} className={`relative rounded-[2rem] p-10 transition-all duration-300 ${
              p.highlight
                ? 'border-2 border-[#0268FF] bg-white shadow-2xl shadow-blue-900/10 scale-100 lg:scale-105 z-10'
                : 'border border-slate-200 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5'
            }`}>
              {p.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#0268FF] to-cyan-500 p-[2px]">
                  <span className="block rounded-full bg-[#0268FF] px-4 py-1 text-xs font-bold text-white uppercase tracking-widest">
                    {p.badge}
                  </span>
                </div>
              )}
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{p.name}</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">{getSubtext(p)}</p>
              
              <div className="flex items-baseline gap-1 mb-8 pb-8 border-b border-slate-100 whitespace-nowrap">
                <span className={`font-extrabold text-slate-900 tracking-tight text-[2.5rem] ${p.code === 'plan_mini' ? 'leading-none' : ''}`}>
                  {getDisplayPrice(p)}
                </span>
                {getPeriod(p)}
              </div>
              
              <ul className="space-y-4">
                {p.features.map((feat: string) => (
                  <li key={feat} className="flex items-start gap-3 text-slate-700 font-medium">
                    <CheckIcon />
                    <span className="leading-snug">{feat}</span>
                  </li>
                ))}
              </ul>
              
              <Link href="/register" className={`mt-10 flex w-full items-center justify-center rounded-xl px-6 py-4 text-base font-bold transition-all ${
                p.highlight
                  ? 'bg-[#0268FF] text-white shadow-xl shadow-[#0268FF]/30 hover:bg-[#0256CC] hover:shadow-2xl hover:shadow-[#0268FF]/40'
                  : 'bg-blue-50 text-[#0268FF] hover:bg-blue-100'
              }`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
