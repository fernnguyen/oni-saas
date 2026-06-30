'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

interface PlanBadgeProps {
  tenantId:    string;
  planCode:    string; // 'plan_mini', 'plan_pro', 'plan_enterprise'
  planName:    string;
  periodStart?: string;
  periodEnd?:   string;
  canUpgrade?:  boolean;
  collapsed?:   boolean;
}

interface PlanRow {
  id:            number;
  code:          string;
  name:          string;
  price_monthly: number;
  price_yearly:  number;
  metadata: Record<string, any>;
}

interface SepayOrder {
  order_id:         string;
  reference_code:   string;
  transfer_content: string;
  amount_vnd:       number;
  qr_url:           string;
  bank_name:        string;
  account_number:   string;
  account_name:     string;
  expires_at:       string;
  plan_name:        string;
}

type CheckoutStep = 'select' | 'qr' | 'success';
type BillingInterval = 'monthly' | 'yearly';

export function PlanBadge({ tenantId, planCode, planName, periodStart, periodEnd, canUpgrade = false, collapsed = false }: PlanBadgeProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  // Checkout states
  const [step, setStep] = useState<CheckoutStep>('select');
  const [billingCycle, setBillingCycle] = useState<BillingInterval>('yearly');
  const [loadingQr, setLoadingQr] = useState(false);
  const [order, setOrder] = useState<SepayOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = getSupabaseBrowserClient();

  // Fetch plans once on mount
  useEffect(() => {
    setPlansLoading(true);
    supabase
      .from('plans')
      .select('id, code, name, price_monthly, price_yearly, metadata')
      .order('id', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const rawPlans = data as PlanRow[];
          // Filter plans: show only public plans OR the organization's current plan
          const filtered = rawPlans.filter((p) => {
            let meta = p.metadata;
            if (typeof meta === 'string') {
              try {
                meta = JSON.parse(meta);
              } catch {
                meta = {};
              }
            }
            const isShowPublic = meta?.show_public !== false && meta?.show_public !== 'false';
            return isShowPublic || p.code === planCode;
          });
          setPlans(filtered);
        }
      })
      .then(() => setPlansLoading(false), () => setPlansLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCode]);

  if (!planCode) return null;

  let durationText = 'Không giới hạn';
  let diffDays = 0;
  
  if (planCode === 'plan_mini') {
    durationText = 'Vĩnh viễn';
  } else if (periodEnd) {
    const end = new Date(periodEnd).getTime();
    const now = new Date().getTime();
    const diffMs = end - now;
    if (diffMs > 0) {
      diffDays = Math.floor(diffMs / (1000 * 3600 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 3600 * 24)) / (1000 * 3600));
      if (diffDays > 0) {
        durationText = `Còn ${diffDays} ngày ${diffHours > 0 ? diffHours + ' giờ' : ''}`.trim();
      } else {
        durationText = `Còn ${diffHours} giờ`;
      }
    } else {
      durationText = 'Quá hạn';
    }
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Không giới hạn';
    const d = new Date(dateStr);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
  };

  const startDateFormatted = periodStart ? formatDateTime(periodStart) : 'Mặc định';
  const endDateFormatted = planCode === 'plan_mini' ? 'Vĩnh viễn' : (periodEnd ? formatDateTime(periodEnd) : 'Không giới hạn');

  const isMini = planCode === 'plan_mini';
  const isEnterprise = planCode === 'plan_enterprise';
  const isPro = planCode === 'plan_pro';

  let modalHeaderClass = "bg-gradient-to-r from-[#EC4899] to-[#F97316]";
  if (isMini) modalHeaderClass = "bg-gradient-to-r from-blue-600 to-indigo-500";
  if (isEnterprise) modalHeaderClass = "bg-gradient-to-r from-slate-900 to-slate-800";

  const maxWClass = isExpanded ? "max-w-3xl" : "max-w-sm";

  const fmtLimit = (n: number | undefined) => n === -1 ? '∞' : (n ?? '—');
  const fmtPrice = (p: PlanRow, cycle: BillingInterval) => {
    const v = cycle === 'yearly' ? p.price_yearly : p.price_monthly;
    if (v == null) return 'Liên hệ';
    if (v === 0) return p.id === 1 ? 'Miễn phí' : 'Liên hệ';
    return v.toLocaleString('vi-VN') + (cycle === 'yearly' ? ' đ/năm' : ' đ/tháng');
  };

  // Reset states on modal open/close
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setOrder(null);
      setError(null);
      setTimeLeft(15 * 60);
      stopTimer();
      stopPolling();
    }
  }, [isOpen]);

  // Listen for custom events to open modal from anywhere
  useEffect(() => {
    const handleOpenModal = () => {
      setIsOpen(true);
      setIsExpanded(true); // Always expand to show pricing when triggered externally
    };

    const handleOpenSepayQr = async (e: Event) => {
      const customEvent = e as CustomEvent<{ orderId: string }>;
      const orderId = customEvent.detail?.orderId;
      if (!orderId) return;

      setIsOpen(true);
      setStep('qr');
      setLoadingQr(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('check-sepay-order', {
          body: { order_id: orderId },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        if (data?.status === 'expired') {
          setError('expired');
        } else {
          setOrder(data as SepayOrder);
          // Set billing cycle state based on fetched order
          setBillingCycle(data.billing_interval === 'yearly' ? 'yearly' : 'monthly');
        }
      } catch (err) {
        console.error('[PlanBadge] open-sepay-qr fetch error:', err);
        setError('Không thể tải thông tin thanh toán. Vui lòng thử lại.');
      } finally {
        setLoadingQr(false);
      }
    };

    window.addEventListener('open-plan-modal', handleOpenModal);
    window.addEventListener('open-sepay-qr', handleOpenSepayQr);
    return () => {
      window.removeEventListener('open-plan-modal', handleOpenModal);
      window.removeEventListener('open-sepay-qr', handleOpenSepayQr);
    };
  }, [supabase.functions]);

  // Countdown timer for QR
  useEffect(() => {
    if (step !== 'qr' || !order) return;
    
    const calculateTimeLeft = () => {
      const expires = new Date(order.expires_at).getTime();
      const now = new Date().getTime();
      return Math.max(0, Math.floor((expires - now) / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { stopTimer(); return 0; }
        return t - 1;
      });
    }, 1000);
    return stopTimer;
  }, [step, order]);

  // Poll trạng thái đơn hàng mỗi 3 giây
  useEffect(() => {
    if (step !== 'qr' || !order) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('check-sepay-order', {
          body: { order_id: order.order_id },
        });
        if (fnError) return;
        if (data?.status === 'completed') {
          stopPolling(); stopTimer();
          setStep('success');
        } else if (data?.status === 'expired') {
          stopPolling(); stopTimer();
          setError('expired');
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
    return stopPolling;
  }, [step, order]);

  // Khi thanh toán thành công, refresh server data để badge hiển thị plan mới ngay
  useEffect(() => {
    if (step === 'success') router.refresh();
  }, [step]);

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  const handleSubscribe = async (targetPlan: PlanRow) => {
    setError(null);
    setLoadingQr(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-sepay-order', {
        body: {
          plan_code:        targetPlan.code,
          billing_interval: billingCycle,
          tenant_id:        tenantId,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setOrder({ ...data, plan_name: targetPlan.name } as SepayOrder);
      setStep('qr');
    } catch (err) {
      console.error('[PlanBadge] create-sepay-order error:', err);
      setError('Không thể tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      setLoadingQr(false);
    }
  };

  const copyRef = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.transfer_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtVnd = (n: number | undefined | null) => {
    if (n == null) return '0 đ';
    return n.toLocaleString('vi-VN') + ' đ';
  };
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const isExpired = timeLeft === 0 || error === 'expired';

  return (
    <>
      <button 
        onClick={() => { setIsOpen(true); setIsExpanded(false); }}
        className={`flex items-center gap-2 text-white relative overflow-hidden shrink-0 cursor-pointer hover:opacity-90 transition-all ${collapsed ? 'w-10 h-10 rounded-full mx-auto justify-center p-0' : 'w-full rounded-xl'}`}
        style={{ border: 'none', background: 'none' }}
      >
        {isMini && (
          <div className={`flex items-center bg-gradient-to-r from-blue-600 to-indigo-500 text-white relative overflow-hidden ${collapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'rounded-xl gap-2 pl-2.5 pr-4 py-1.5 w-full h-full text-left'}`}>
            {!collapsed && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10" />}
            <IconLightning className={`shrink-0 relative ${collapsed ? 'h-5 w-5' : 'h-4 w-4'} text-white`} />
            {!collapsed && (
              <div className="relative">
                <div className="font-semibold text-xs leading-tight">{planName}</div>
                <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
              </div>
            )}
          </div>
        )}

        {isEnterprise && (
          <div className={`flex items-center bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700 shrink-0 relative overflow-hidden border ${collapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'rounded-xl gap-2 pl-2.5 pr-4 py-1.5 w-full h-full text-left'}`}>
            {!collapsed && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-yellow-500/10 blur-xl" />}
            <IconDiamond className={`shrink-0 relative z-10 text-yellow-400 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
            {!collapsed && (
              <div className="relative z-10">
                <div className="font-bold text-xs text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 leading-tight">
                  {planName}
                </div>
                <div className="text-[10px] text-yellow-100/70 leading-tight">{durationText}</div>
              </div>
            )}
          </div>
        )}

        {(!isMini && !isEnterprise) && (
          <div className={`flex items-center bg-gradient-to-r from-[#EC4899] to-[#F97316] text-white relative overflow-hidden shrink-0 ${collapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'rounded-xl gap-2 pl-2.5 pr-4 py-1.5 w-full h-full text-left'}`}>
            {!collapsed && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10" />}
            <IconCrown className={`shrink-0 relative text-yellow-200 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
            {!collapsed && (
              <div className="relative">
                <div className="font-semibold text-xs leading-tight">{planName}</div>
                <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
              </div>
            )}
          </div>
        )}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`relative bg-white dark:bg-zinc-900 rounded-[28px] shadow-2xl w-full ${step === 'select' ? maxWClass : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300`}>
            
            {/* Header Area */}
            <div className={`p-6 text-white relative shrink-0 ${modalHeaderClass}`}>
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 -translate-y-12 translate-x-12" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  {isMini && <IconLightning className="h-6 w-6 text-white" />}
                  {isPro && <IconCrown className="h-6 w-6 text-yellow-200" />}
                  {isEnterprise && <IconDiamond className="h-6 w-6 text-yellow-400" />}
                  <span className="font-black text-xl tracking-tight">{planName}</span>
                </div>
                <p className="text-white/80 text-sm font-medium">Trung tâm quản lý dịch vụ & thanh toán</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/20 transition-colors z-20 cursor-pointer"
              >
                <IconClose />
              </button>
            </div>

            {/* STEP 1: SELECT / COMPARE */}
            {step === 'select' && (
              <div className="p-6 overflow-y-auto overflow-x-hidden relative flex-1 custom-scrollbar">
                
                {!isExpanded && (
                  <div className="animate-in fade-in duration-200">
                    <div className="grid grid-cols-2 gap-4 pb-4">
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                        <div className="text-xs text-zinc-500 font-medium mb-1">Thời gian bắt đầu</div>
                        <div className="font-bold text-zinc-800 dark:text-zinc-100 text-sm">{startDateFormatted}</div>
                      </div>
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                        <div className="text-xs text-zinc-500 font-medium mb-1">Thời hạn kết thúc</div>
                        <div className="font-bold text-zinc-800 dark:text-zinc-100 text-sm">{endDateFormatted}</div>
                      </div>
                    </div>

                    {diffDays > 0 && diffDays <= 14 && !isMini && (
                      <div className="flex items-start gap-3 p-3 mb-4 bg-orange-50 border border-orange-100 rounded-xl text-orange-800 text-sm">
                        <IconWarning className="h-5 w-5 shrink-0 text-orange-500 mt-0.5" />
                        <p className="font-medium">Gói cước sắp hết hạn. Vui lòng gia hạn trước ngày {endDateFormatted} để không bị gián đoạn.</p>
                      </div>
                    )}

                    <div className="border-t border-zinc-100 dark:border-zinc-700 pt-4">
                      <h4 className="text-sm font-bold text-zinc-800 dark:text-white mb-3">Quyền lợi hiện tại</h4>
                      <ul className="text-sm text-zinc-600 dark:text-zinc-300 space-y-3">
                        <li className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0"><IconCheck /></div>
                          Quyền truy cập Dashboard quản trị trung tâm
                        </li>
                        <li className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0"><IconCheck /></div>
                          Biên dịch & Đồng bộ Dữ liệu 2 chiều (Adapters)
                        </li>
                        {isMini && (
                          <li className="flex items-center gap-3 opacity-70">
                            <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0"><IconDash /></div>
                            Giới hạn tối đa 1 cửa hàng & 3 nhân sự
                          </li>
                        )}
                        {isPro && (
                          <li className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0"><IconCheck /></div>
                            Lên đến 10 cửa hàng & 20 nhân sự
                          </li>
                        )}
                        {isEnterprise && (
                          <li className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0"><IconCheck /></div>
                            Không giới hạn cửa hàng & nhân sự (VIP)
                          </li>
                        )}
                      </ul>
                    </div>

                    {canUpgrade && (
                      <div className="pt-6">
                        <button 
                          onClick={() => setIsExpanded(true)}
                          className="w-full flex justify-center items-center py-3.5 px-4 rounded-2xl font-bold text-sm text-white bg-primary hover:bg-blue-600 focus:ring-4 focus:ring-blue-100 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                        >
                          Nâng cấp / Gia hạn gói
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* EXPANDED VIEW - THE PRICING TABLE */}
                {isExpanded && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                      <div>
                        <h4 className="text-xl font-black text-zinc-900 dark:text-white">So sánh & Nâng cấp</h4>
                        <p className="text-sm text-zinc-500 mt-1">
                          Thời gian gia hạn được <strong className="text-zinc-700 dark:text-zinc-300">cộng dồn liền mạch</strong> từ ngày cuối của kỳ hiện tại.
                        </p>
                      </div>
                      <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl shrink-0 border border-zinc-200 dark:border-zinc-700">
                        <button className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${billingCycle==='monthly' ? 'bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white': 'text-zinc-500 hover:text-zinc-700'}`} onClick={()=>setBillingCycle('monthly')}>Hàng tháng</button>
                        <button className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${billingCycle==='yearly' ? 'bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white': 'text-zinc-500 hover:text-zinc-700'}`} onClick={()=>setBillingCycle('yearly')}>
                          Hàng năm <span className="text-[10px] font-black bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">-15%</span>
                        </button>
                      </div>
                    </div>

                    {plansLoading ? (
                      <div className="flex justify-center py-12 text-zinc-400 text-sm">Đang tải...</div>
                    ) : (
                    <div className="overflow-x-auto rounded-[24px] border border-zinc-200 dark:border-zinc-700">
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            <th className="p-5 border-b border-zinc-200 dark:border-zinc-700 font-bold text-zinc-500">Tính năng \ Gói</th>
                            {plans.map(p => (
                              <th key={p.code} className="p-5 border-b border-zinc-200 dark:border-zinc-700 text-center">
                                <div className="font-black text-base text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1.5 mb-1.5">
                                  {p.code === 'plan_mini' && <IconLightning className="w-4 h-4 text-blue-500" />}
                                  {p.code === 'plan_pro' && <IconCrown className="w-4 h-4 text-orange-500" />}
                                  {p.code === 'plan_enterprise' && <IconDiamond className="w-4 h-4 text-zinc-800 dark:text-white" />}
                                  {p.name}
                                </div>
                                <div className="text-zinc-500 font-medium h-6">{fmtPrice(p, billingCycle)}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-zinc-900">
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Chi nhánh đa kho</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{fmtLimit(p.metadata?.create_shop)}</td>)}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Giới hạn hoá đơn bán hàng /tháng</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{fmtLimit(p.metadata?.max_orders_per_month)}</td>)}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Giới hạn số lượng sản phẩm</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{fmtLimit(p.metadata?.max_products)}</td>)}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Nhân sự vận hành (Users)</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{fmtLimit(p.metadata?.create_shop_user)}</td>)}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Connectors & API / Chi nhánh</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{fmtLimit(p.metadata?.create_connector)}</td>)}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Custom Domain</td>
                            {plans.map(p => {
                              const d = p.metadata?.create_domain;
                              return <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center text-zinc-800 dark:text-zinc-200 font-bold">{d === -1 ? '∞' : d === 0 ? <IconDash /> : d}</td>;
                            })}
                          </tr>
                          <tr>
                            <td className="p-4 px-5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 font-medium">Quản trị phân quyền Admin</td>
                            {plans.map(p => <td key={p.code} className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-center">{p.code === 'plan_mini' ? <IconDash /> : <div className="flex justify-center"><IconCheck /></div>}</td>)}
                          </tr>
                          <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                            <td className="p-5"></td>
                            {plans.map(p => {
                              const isCurrent = p.code === planCode;
                              const isEnterprisePlan = p.code === 'plan_enterprise';
                              const isFree = p.id === 1 && !isCurrent;
                              let actionText = isCurrent ? (p.code === 'plan_mini' ? 'Đang sử dụng' : 'Gia hạn Online') : (isEnterprisePlan ? 'Liên hệ VIP' : 'Nâng cấp ngay');
                              const actionAllowed = !(p.code === 'plan_mini' && !isCurrent) && !isFree;
                              return (
                                <td key={p.code} className="p-5 text-center">
                                  {actionAllowed ? (
                                    <button
                                      disabled={loadingQr}
                                      onClick={() => isEnterprisePlan ? (window.location.href = 'mailto:support@oni.vn') : handleSubscribe(p)}
                                      className={`w-full py-3 px-4 rounded-2xl text-sm font-bold transition-all ${isCurrent ? 'bg-zinc-800 text-white hover:bg-zinc-700 shadow-md' : (isEnterprisePlan ? 'bg-white border-2 border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50' : 'bg-primary text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20')}`}
                                    >
                                      {loadingQr ? '...' : actionText}
                                    </button>
                                  ) : (
                                    <button disabled className="w-full py-3 px-4 rounded-2xl text-sm font-bold bg-zinc-100 text-zinc-400 cursor-not-allowed">{actionText}</button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    )}

                    {error && (
                      <p className="mt-4 text-sm text-red-500 text-center font-medium">{error}</p>
                    )}
                    <div className="mt-6 text-center">
                      <button onClick={() => setIsExpanded(false)} className="text-sm font-bold text-zinc-400 hover:text-zinc-600 transition-colors">
                        ← Trở lại xem quyền lợi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: QR CHECKOUT (SEPAY) */}
            {step === 'qr' && (
              <div className="p-6 space-y-5 animate-in slide-in-from-right-4 duration-300">
                {loadingQr || !order ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <svg className="animate-spin h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-zinc-500 font-medium">Đang tải thông tin thanh toán...</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <h2 className="text-2xl font-black dark:text-white">Thanh toán VietQR</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Gói {order.plan_name} ({billingCycle === 'yearly' ? '1 Năm' : '1 Tháng'})
                      </p>
                    </div>

                    <div className="flex justify-center pt-2">
                      {isExpired ? (
                        <div className="w-56 h-56 rounded-[24px] bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center gap-4">
                          <p className="text-sm font-bold text-zinc-500">Mã QR đã hết hạn</p>
                          <button
                            onClick={() => { setError(null); setStep('select'); setIsExpanded(true); }}
                            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-2xl transition-colors"
                          >
                            Tạo mã mới
                          </button>
                        </div>
                      ) : (
                        <div className="relative p-2 bg-white rounded-[24px] border border-slate-200 shadow-sm">
                          <img src={order.qr_url} alt="VietQR" className="w-[200px] h-[200px] rounded-[16px] object-cover" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 text-sm bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-medium">Ngân hàng</span>
                        <span className="font-bold">{order.bank_name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-medium">Số tài khoản</span>
                        <span className="font-bold">{order.account_number}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-medium">Chủ tài khoản</span>
                        <span className="font-bold">{order.account_name}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-zinc-500 font-medium">Số tiền</span>
                        <span className="font-black text-blue-600 text-base">{fmtVnd(order.amount_vnd)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <span className="text-zinc-500 font-medium">Nội dung CK</span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-blue-600 tracking-widest bg-blue-50 px-2 py-1 rounded-lg">{order.transfer_content}</span>
                          <button onClick={copyRef} className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors">
                            {copied ? <IconCheck /> : <IconCopy />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm px-1">
                      <div className="flex items-center gap-2 font-medium text-emerald-600">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        Đang chờ thanh toán...
                      </div>
                      {!isExpired && (
                        <span className={`font-mono font-bold px-2 py-1 rounded-lg ${timeLeft < 120 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-600'}`}>
                          {fmtTime(timeLeft)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 3: SUCCESS */}
            {step === 'success' && (
              <div className="p-8 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2 shadow-inner border border-emerald-100">
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Thanh toán thành công!</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 font-medium leading-relaxed">
                    Hệ thống đã ghi nhận gian hạn gói <strong>{order?.plan_name}</strong> thành công.<br/>Bạn có thể sử dụng giải pháp lập tức.
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-2xl transition-all shadow-md mt-4"
                >
                  Tiếp tục quản trị
                </button>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}
    </>
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

function IconClose() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconDash() {
  return (
    <svg className="w-4 h-4 text-zinc-300 mx-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
    </svg>
  );
}

function IconWarning({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}
