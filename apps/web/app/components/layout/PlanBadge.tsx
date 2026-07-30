'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

// ─── Props & Types ──────────────────────────────────────────────────────────
interface PlanBadgeProps {
  tenantId:    string;
  planCode:    string; // 'plan_mini', 'plan_pro', 'plan_enterprise'
  planName:    string;
  periodStart?: string;
  periodEnd?:   string;
  canUpgrade?:  boolean;
  collapsed?:   boolean;
  /** Render as a compact inline pill (for horizontal nav bar) */
  inline?:      boolean;
  /** In inline mode: show icon only, no text label */
  iconOnly?:    boolean;
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

const PLAN_LEVELS: Record<string, number> = {
  plan_mini: 1,
  plan_pro: 2,
  plan_enterprise: 3
};

// ─── Client-side Memory Cache for Plans ──────────────────────────────────────
let plansClientCache: { data: PlanRow[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory client cache

// ─── Per-plan metadata defaults & dynamic feature mapping ───────────────────
const META_DEFAULTS: Record<string, Record<string, any>> = {
  plan_mini: {
    create_shop: 1,
    create_shop_user: 1,
    max_products: 100,
    max_orders_per_month: 300,
    create_connector: 1,
    create_domain: 0,
    tax_report: true,
    qr_table_ordering: false,
    crm: false,
  },
  plan_pro: {
    create_shop: 10,
    create_shop_user: 20,
    max_products: -1,
    max_orders_per_month: -1,
    create_connector: 2,
    create_domain: 3,
    tax_report: true,
    qr_table_ordering: true,
    crm: true,
  },
  plan_enterprise: {
    create_shop: -1,
    create_shop_user: -1,
    max_products: -1,
    max_orders_per_month: -1,
    create_connector: -1,
    create_domain: -1,
    tax_report: true,
    qr_table_ordering: true,
    crm: true,
  },
};

function getPlanMeta(p: PlanRow): Record<string, any> {
  const rawMeta = typeof p.metadata === 'string' ? (JSON.parse(p.metadata) || {}) : (p.metadata || {});
  const defaults = META_DEFAULTS[p.code] || {};
  return { ...defaults, ...rawMeta };
}

function formatLimitVal(val: number | undefined | null, suffix: string = ''): string {
  if (val === undefined || val === null || val === -1) return 'Không giới hạn';
  if (val === 0) return 'Không hỗ trợ';
  return `${val.toLocaleString('vi-VN')}${suffix}`;
}

function getPlanLimitsSummary(meta: Record<string, any>, code: string): Record<string, string> {
  const shopStr = formatLimitVal(meta.create_shop);
  const prodStr = formatLimitVal(meta.max_products);
  const orderStr = (meta.max_orders_per_month === -1 || meta.max_orders_per_month === undefined)
    ? 'Không giới hạn'
    : `${meta.max_orders_per_month.toLocaleString('vi-VN')} / tháng`;
  const userStr = formatLimitVal(meta.create_shop_user);

  let dbStr = 'Shared';
  if (meta.create_connector === -1) dbStr = 'Không giới hạn';
  else if (meta.create_connector > 1 || code === 'plan_pro') dbStr = 'BYOD (Riêng tư)';
  else if (code === 'plan_enterprise') dbStr = 'Dedicated CSDL';

  return {
    'Chi nhánh': shopStr,
    'Sản phẩm': prodStr,
    'Đơn hàng': orderStr,
    'Nhân viên': userStr,
    'CSDL': dbStr,
  };
}

function getPlanFeaturesList(meta: Record<string, any>, code: string): string[] {
  const features: string[] = [];

  if (meta.create_shop === -1) features.push('Không giới hạn chi nhánh');
  else features.push(`${meta.create_shop} chi nhánh hoạt động`);

  if (meta.max_products === -1) features.push('Không giới hạn sản phẩm & đơn hàng');
  else features.push(`Tối đa ${meta.max_products.toLocaleString('vi-VN')} sản phẩm`);

  if (meta.max_products !== -1) {
    if (meta.max_orders_per_month === -1) features.push('Không giới hạn đơn hàng / tháng');
    else features.push(`Tối đa ${meta.max_orders_per_month.toLocaleString('vi-VN')} đơn hàng / tháng`);
  }

  if (meta.create_shop_user === -1) features.push('Không giới hạn nhân viên');
  else features.push(`Tối đa ${meta.create_shop_user} nhân viên`);

  if (code === 'plan_mini') {
    features.push('CSDL dùng chung (Shared PostgreSQL)');
    features.push('Báo cáo thuế S1a-HKD (tự động)');
    features.push('Quản lý sổ quỹ, kho, đối tác');
    features.push('Hỗ trợ qua cộng đồng (Community)');
  } else if (code === 'plan_pro') {
    features.push(`Cơ sở dữ liệu riêng (BYOD - ${meta.create_connector ?? 2} Connectors)`);
    if (meta.create_domain) features.push(`Tên miền tùy chỉnh (${meta.create_domain} domains)`);
    if (meta.qr_table_ordering) features.push('QR Table Ordering (đặt bàn tại chỗ)');
    if (meta.crm) features.push('CRM & Thẻ thành viên thông minh');
    features.push('Zalo & Telegram Alerts tự động');
    features.push('Báo cáo thuế & AI Insights nâng cao');
    features.push('Hỗ trợ ưu tiên (Email & Chat 24/7)');
  } else if (code === 'plan_enterprise') {
    features.push('Dedicated PostgreSQL / Supabase BYOD');
    features.push('Không giới hạn tên miền riêng');
    features.push('Custom Notifications & API/Webhooks');
    features.push('SLA cam kết ổn định 99.9%');
    features.push('Onboarding & Đào tạo chuyên biệt 1-1');
  }

  if (meta.hrm === true) {
    features.push('HRM: chấm công & tính lương cơ bản');
  }

  return features;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function PlanBadge({ tenantId, planCode, planName, periodStart, periodEnd, canUpgrade = false, collapsed = false, inline = false, iconOnly = false }: PlanBadgeProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
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
  const [confirmPlan, setConfirmPlan] = useState<PlanRow | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = getSupabaseBrowserClient();

  // Fetch plans on mount/open (with client-side in-memory & API caching)
  useEffect(() => {
    if (!isOpen) return;

    const now = Date.now();
    if (plansClientCache && (now - plansClientCache.timestamp < CACHE_TTL_MS)) {
      const filtered = plansClientCache.data.filter((p) => {
        const meta = getPlanMeta(p);
        return meta?.show_public !== false || p.code === planCode;
      });
      setPlans(filtered);
      setPlansLoading(false);
      return;
    }

    setPlansLoading(true);
    async function fetchPlans() {
      try {
        const res = await fetch('/api/plans');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const rawPlans = data as PlanRow[];
            plansClientCache = { data: rawPlans, timestamp: Date.now() };
            const filtered = rawPlans.filter((p) => {
              const meta = getPlanMeta(p);
              return meta?.show_public !== false || p.code === planCode;
            });
            setPlans(filtered);
            return;
          }
        }
        // Fallback to direct Supabase query if /api/plans is unreachable
        const { data: dbData } = await supabase
          .from('plans')
          .select('id, code, name, price_monthly, price_yearly, metadata')
          .order('id', { ascending: true });
        if (dbData && dbData.length > 0) {
          const rawPlans = dbData as PlanRow[];
          plansClientCache = { data: rawPlans, timestamp: Date.now() };
          const filtered = rawPlans.filter((p) => {
            const meta = getPlanMeta(p);
            return meta?.show_public !== false || p.code === planCode;
          });
          setPlans(filtered);
        }
      } catch (err) {
        console.error('Lỗi tải danh sách gói cước:', err);
      } finally {
        setPlansLoading(false);
      }
    }
    fetchPlans();
  }, [isOpen, planCode, supabase]);

  // Expiration / Duration details
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
    return d.toLocaleDateString('vi-VN');
  };

  const endDateFormatted = planCode === 'plan_mini' ? 'Vĩnh viễn' : (periodEnd ? formatDateTime(periodEnd) : 'Không giới hạn');
  const isMini = planCode === 'plan_mini';
  const isEnterprise = planCode === 'plan_enterprise';
  const isPro = planCode === 'plan_pro';

  // Formatting helpers
  const formatPriceVal = (price: number) => {
    if (!price || price === 0) return 'Miễn phí';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1).replace('.0', '')}M`;
    if (price >= 1000) return `${price / 1000}K`;
    return price.toString();
  };

  const getPlanPriceText = (p: PlanRow, cycle: BillingInterval) => {
    if (p.code === 'plan_mini') return 'Miễn phí';
    if (p.code === 'plan_enterprise') return 'Liên hệ';
    const price = cycle === 'yearly' ? p.price_yearly : p.price_monthly;
    return formatPriceVal(price);
  };

  // Reset modal state
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setOrder(null);
      setError(null);
      setTimeLeft(15 * 60);
      setConfirmPlan(null);
      stopTimer();
      stopPolling();
    }
  }, [isOpen]);

  // Externally triggered events
  useEffect(() => {
    const handleOpenModal = () => {
      setIsOpen(true);
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
          setBillingCycle(data.billing_interval === 'yearly' ? 'yearly' : 'monthly');
        }
      } catch (err) {
        console.error('[PlanBadge] Qr fetch error:', err);
        setError('Không thể tải thông tin thanh toán.');
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

  // Timers and polling for QR checkouts
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
      } catch { /* ignore */ }
    }, 3000);
    return stopPolling;
  }, [step, order]);

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
      setError('Không thể khởi tạo cổng thanh toán.');
    } finally {
      setLoadingQr(false);
    }
  };

  const copyTransferContent = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.transfer_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = timeLeft === 0 || error === 'expired';

  // Dynamic header styles exactly matching active plan badge colors
  const getHeaderStyles = () => {
    if (isMini) {
      return {
        bg: "bg-gradient-to-r from-blue-600 to-indigo-500 text-white border-b border-blue-600/20",
        text: "text-white",
        subtext: "text-blue-100",
        iconColor: "text-white",
        closeBtn: "text-white/80 hover:text-white hover:bg-white/10",
        badge: "bg-white/20 text-white border-white/25"
      };
    }
    if (isEnterprise) {
      return {
        bg: "bg-gradient-to-r from-slate-900 to-slate-800 text-white border-b border-slate-700",
        text: "text-white",
        subtext: "text-slate-300",
        iconColor: "text-yellow-400",
        closeBtn: "text-white/80 hover:text-white hover:bg-white/10",
        badge: "bg-white/10 text-zinc-300 border-white/15"
      };
    }
    // Pro (Chuyên nghiệp - Hồng cam)
    return {
      bg: "bg-gradient-to-r from-[#EC4899] to-[#F97316] text-white border-b border-[#F97316]/20",
      text: "text-white",
      subtext: "text-pink-50",
      iconColor: "text-white",
      closeBtn: "text-white/80 hover:text-white hover:bg-white/10",
      badge: "bg-white/20 text-white border-white/25"
    };
  };

  const headerStyle = getHeaderStyles();


  return (
    <>
      {/* ── Trigger button: inline pill OR full badge ── */}
      {inline ? (() => {
        const gradientCls = isMini
          ? 'from-blue-600 to-indigo-500'
          : isEnterprise
          ? 'from-slate-800 to-slate-700'
          : 'from-[#EC4899] to-[#F97316]';
        return (
          <button
            onClick={() => setIsOpen(true)}
            className={`flex items-center gap-1.5 h-7 bg-gradient-to-r ${gradientCls} text-white text-xs font-semibold shrink-0 cursor-pointer hover:opacity-90 transition-opacity ${
              iconOnly ? 'w-7 justify-center rounded-lg px-0' : 'px-2.5 rounded-lg'
            }`}
            style={{ border: 'none' }}
            title={planName}
          >
            {isMini && <IconLightning className="h-3.5 w-3.5 shrink-0" />}
            {isEnterprise && <IconDiamond className="h-3.5 w-3.5 shrink-0 text-yellow-400" />}
            {(!isMini && !isEnterprise) && <IconCrown className="h-3.5 w-3.5 shrink-0 text-yellow-200" />}
            {!iconOnly && <span className="max-w-[80px] truncate">{planName}</span>}
          </button>
        );
      })() : (
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 text-white relative overflow-hidden shrink-0 cursor-pointer hover:opacity-90 transition-all ${collapsed ? 'w-10 h-10 rounded-full mx-auto justify-center p-0' : 'w-full rounded-xl'}`}
        style={{ border: 'none', background: 'none' }}
      >
        {isMini && (
          <div className={`flex items-center bg-gradient-to-r from-blue-600 to-indigo-500 text-white relative overflow-hidden ${collapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'rounded-xl gap-2 pl-2.5 pr-4 py-1.5 w-full h-full text-left'}`}>
            {!collapsed && <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10" />}
            <IconLightning className={`shrink-0 relative ${collapsed ? 'h-5 w-5' : 'h-4 w-4'} text-white`} />
            {!collapsed && (
              <div className="relative">
                <div className="font-bold text-xs leading-tight">{planName}</div>
                <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
              </div>
            )}
          </div>
        )}

        {isEnterprise && (
          <div className={`flex items-center bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700 shrink-0 relative overflow-hidden ${collapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'rounded-xl gap-2 pl-2.5 pr-4 py-1.5 w-full h-full text-left'}`}>
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
                <div className="font-bold text-xs leading-tight">{planName}</div>
                <div className="text-[10px] text-white/80 leading-tight">{durationText}</div>
              </div>
            )}
          </div>
        )}
      </button>
      )}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-black/45 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          {/* Modal Container: scaled up to max-w-6xl for full plan card comparison */}
          <div className={`relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full ${step === 'select' ? 'max-w-6xl' : 'max-w-md'} mx-auto my-auto overflow-hidden flex flex-col transition-all duration-300 border-slate-200 dark:border-zinc-800`}>
            
            {/* Header section (Reduced padding to save vertical space) */}
            <div className={`py-3 px-4 relative shrink-0 border-b border-slate-200 dark:border-zinc-850 ${headerStyle.bg}`}>
              {isEnterprise ? (
                <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-yellow-500/10 blur-xl pointer-events-none" />
              ) : (
                <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-white/10 pointer-events-none" />
              )}
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    
                    <h3 className={`font-black text-lg tracking-tight flex items-center gap-2 ${headerStyle.text}`}>
                      {isMini && <IconLightning className={`h-4.5 w-4.5 ${headerStyle.iconColor}`} />}
                      {isPro && <IconCrown className={`h-4.5 w-4.5 ${headerStyle.iconColor}`} />}
                      {isEnterprise && <IconDiamond className={`h-4.5 w-4.5 ${headerStyle.iconColor}`} />}
                      {planName}
                    </h3>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${headerStyle.badge}`}>
                      Gói hiện tại
                    </span>
                  </div>
                  <p className={`text-[11px] font-medium ${headerStyle.subtext}`}>
                    Hạn sử dụng: <strong className="font-bold">{endDateFormatted}</strong> {periodEnd && `(${durationText})`}
                  </p>
                </div>
                
                <button 
                  onClick={() => setIsOpen(false)}
                  className={`absolute top-0 right-0 sm:relative sm:top-auto sm:right-auto p-2.5 rounded-full transition-colors z-20 cursor-pointer ${headerStyle.closeBtn}`}
                >
                  <IconClose />
                </button>
              </div>
            </div>

            {/* Step 1: Selector & Cards Comparison (Full-screen style, similar to landing page) */}
            {step === 'select' && (
              <div className="p-6 sm:p-8 overflow-y-auto flex-1 max-h-[70vh] custom-scrollbar space-y-8">
                
                {/* Selector Header & Billing Cycle */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                  <div>
                    <h4 className="text-lg font-extrabold text-slate-800 dark:text-white">Lựa chọn nâng cấp hoặc gia hạn</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Thời hạn được cộng dồn liền mạch vào chu kỳ thanh toán hiện tại của bạn.
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-full bg-slate-100 dark:bg-zinc-800 p-1">
                    <button
                      onClick={() => setBillingCycle('monthly')}
                      className={`rounded-full px-5 py-1.5 text-xs font-bold transition-all ${
                        billingCycle === 'monthly' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Hàng tháng
                    </button>
                    <button
                      onClick={() => setBillingCycle('yearly')}
                      className={`rounded-full px-5 py-1.5 text-xs font-bold transition-all ${
                        billingCycle === 'yearly' ? 'bg-white dark:bg-zinc-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Hàng năm <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] text-green-700 font-black">-15%</span>
                    </button>
                  </div>
                </div>

                {plansLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
                    <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Đang tải thông tin gói cước...</span>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-3">
                    {plans.map((p) => {
                      const isCurrent = p.code === planCode;
                      const isEnterprisePlan = p.code === 'plan_enterprise';
                      const isMiniPlan = p.code === 'plan_mini';
                      const meta = getPlanMeta(p);
                      const features = getPlanFeaturesList(meta, p.code);
                      const limits = getPlanLimitsSummary(meta, p.code);
                      
                      const displayPrice = getPlanPriceText(p, billingCycle);
                      const period = isMiniPlan ? null : isEnterprisePlan ? null : billingCycle === 'yearly' ? '/năm' : '/tháng';
                      
                      let cardBorder = isCurrent 
                        ? 'border-2 border-primary ring-4 ring-primary/5 bg-blue-50/10 dark:bg-zinc-800/10 relative'
                        : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 relative';

                      return (
                        <div key={p.code} className={`flex flex-col rounded-3xl p-6 transition-all duration-300 hover:shadow-lg ${cardBorder}`}>
                          
                          {/* Active Plan Indicator Checkmark */}
                          {isCurrent && (
                            <div className="absolute top-4 right-4 text-primary bg-primary/10 p-1 rounded-full border border-primary/20 shadow-sm animate-in zoom-in duration-300">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          )}

                          {/* Plan Identity */}
                          <div className="mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
                              {p.code === 'plan_pro' ? 'Khuyên Dùng' : 'Gói Dịch Vụ'}
                            </span>
                            <h5 className="font-extrabold text-xl text-slate-900 dark:text-white flex items-center gap-1.5">
                              {p.name}
                            </h5>
                          </div>

                          {/* Price block */}
                          <div className="flex items-baseline gap-1 mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
                            <span className="font-black text-slate-900 dark:text-white text-3xl leading-none">
                              {displayPrice}
                            </span>
                            {isMiniPlan && (
                              <span className="ml-1.5 inline-flex items-center rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide">
                                Vĩnh viễn
                              </span>
                            )}
                            {period && <span className="text-xs text-slate-500 font-medium">{period}</span>}
                          </div>

                          {/* Dynamic statistics summary limits (compact grid) */}
                          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-2xl p-4 mb-5 border border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            {Object.entries(limits).map(([key, value]) => (
                              <div key={key} className="flex flex-col">
                                <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wide">{key}</span>
                                <span className="font-extrabold text-slate-700 dark:text-slate-350">{value}</span>
                              </div>
                            ))}
                          </div>

                          {/* Features list */}
                          <div className="space-y-2.5 mb-6">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Tính năng chính</span>
                            {features.map((feat, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs text-slate-650 dark:text-zinc-400">
                                <IconCheck className="text-primary mt-0.5 shrink-0" />
                                <span className="leading-normal font-medium">{feat}</span>
                              </div>
                            ))}
                          </div>

                          {/* Action Button */}
                          <div className="mt-auto pt-4">
                            {(() => {
                              const currentLevel = PLAN_LEVELS[planCode] || 1;
                              const targetLevel = PLAN_LEVELS[p.code] || 1;

                              let actionText = '';
                              let actionAllowed = true;
                              
                              if (isCurrent) {
                                if (isMiniPlan) {
                                  actionText = 'Gói miễn phí vĩnh viễn';
                                  actionAllowed = false;
                                } else {
                                  actionText = 'Gia hạn gói cước';
                                }
                              } else {
                                if (isEnterprisePlan) {
                                  actionText = 'Gửi yêu cầu tư vấn';
                                } else if (targetLevel > currentLevel) {
                                  actionText = 'Nâng cấp gói cước';
                                } else {
                                  actionText = 'Hạ cấp gói cước';
                                }
                              }

                              return (
                                <button
                                  disabled={!actionAllowed || loadingQr}
                                  onClick={() => setConfirmPlan(p)}
                                  className={`w-full py-3 rounded-xl text-xs font-black transition-all shadow-md ${
                                    !actionAllowed
                                      ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-650 cursor-not-allowed shadow-none'
                                      : isCurrent
                                      ? 'bg-slate-800 hover:bg-slate-700 text-white shadow-slate-800/10'
                                      : isEnterprisePlan
                                      ? 'bg-white hover:bg-slate-50 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-750 shadow-sm'
                                      : 'bg-primary hover:bg-primary-dark text-white shadow-primary/20'
                                  }`}
                                >
                                  {actionText}
                                </button>
                              );
                            })()}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-center text-xs font-bold">
                    {error}
                  </div>
                )}

              </div>
            )}

            {/* Confirmation Dialog Overlay */}
            {confirmPlan && (() => {
              const currentLevel = PLAN_LEVELS[planCode] || 1;
              const targetLevel = PLAN_LEVELS[confirmPlan.code] || 1;
              const isCurrent = confirmPlan.code === planCode;
              const isEnterprisePlan = confirmPlan.code === 'plan_enterprise';
              
              let actionTitle = 'Xác nhận đăng ký';
              let actionVerb = 'đăng ký';
              if (isCurrent) {
                actionTitle = 'Xác nhận gia hạn';
                actionVerb = 'gia hạn';
              } else if (targetLevel > currentLevel) {
                actionTitle = 'Xác nhận nâng cấp';
                actionVerb = 'nâng cấp lên';
              } else if (targetLevel < currentLevel) {
                actionTitle = 'Xác nhận hạ cấp';
                actionVerb = 'hạ cấp xuống';
              }
              
              const priceText = getPlanPriceText(confirmPlan, billingCycle);
              const cycleText = billingCycle === 'yearly' ? 'năm' : 'tháng';

              return (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/55 backdrop-blur-[2px] animate-in fade-in duration-200">
                  <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-800 p-6 shadow-2xl border border-slate-200 dark:border-zinc-700 animate-in zoom-in-95 duration-200 text-left">
                    <h5 className="font-extrabold text-slate-900 dark:text-white text-base mb-2">
                      {actionTitle}
                    </h5>
                    <div className="text-xs text-slate-550 dark:text-zinc-400 leading-relaxed mb-6 space-y-3">
                      {isEnterprisePlan ? (
                        <p>
                          Bạn có chắc chắn muốn gửi yêu cầu tư vấn gói <strong className="text-slate-800 dark:text-white font-bold">{confirmPlan.name}</strong> để nhận hỗ trợ giải pháp riêng biệt và báo giá chi tiết từ Oni?
                        </p>
                      ) : confirmPlan.code === 'plan_mini' ? (
                        <p>
                          Bạn có chắc chắn muốn hạ cấp xuống gói <strong className="text-slate-800 dark:text-white font-bold">{confirmPlan.name}</strong> (Miễn phí)?
                        </p>
                      ) : isCurrent ? (
                        <div className="space-y-2.5">
                          <p>
                            Bạn đang thực hiện gia hạn gói <strong className="text-slate-800 dark:text-white font-bold">{confirmPlan.name}</strong> với giá <strong className="text-primary font-bold">{priceText}</strong>/{cycleText}.
                          </p>
                          <div className="bg-slate-50 dark:bg-zinc-900/50 p-3 rounded-xl border border-slate-100 dark:border-zinc-750 text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                            <div>• Hạn dùng hiện tại: <strong className="text-slate-700 dark:text-zinc-200">{endDateFormatted}</strong> ({durationText})</div>
                            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                              ✓ Thời hạn mới sẽ tự động được cộng dồn tiếp tục kể từ ngày hết hạn cũ. Bạn hoàn toàn không bị mất bất kỳ ngày sử dụng nào.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p>
                          Bạn có chắc chắn muốn {actionVerb} gói <strong className="text-slate-800 dark:text-white font-bold">{confirmPlan.name}</strong> với giá <strong className="text-primary font-bold">{priceText}</strong>/{cycleText}?
                        </p>
                      )}
                      {targetLevel < currentLevel && (
                        <span className="block text-red-500 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-100 dark:border-red-900/20">
                          ⚠️ Cảnh báo: Việc hạ cấp gói cước có thể làm khóa bớt một số tính năng hoặc giới hạn dữ liệu hiện tại của bạn.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setConfirmPlan(null)}
                        className="rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        Hủy bỏ
                      </button>
                      <button
                        onClick={() => {
                          const planToSub = confirmPlan;
                          setConfirmPlan(null);
                          if (isEnterprisePlan) {
                            window.location.href = `mailto:support@oni.vn?subject=Yeu cau tu van goi Enterprise cho Tenant ${tenantId}`;
                          } else {
                            handleSubscribe(planToSub);
                          }
                        }}
                        className="rounded-xl bg-primary hover:bg-primary-dark px-4 py-2 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
                      >
                        Xác nhận
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Step 2: VietQR Checkout view */}
            {step === 'qr' && (
              <div className="p-6 space-y-5 animate-in slide-in-from-right-4 duration-300">
                {loadingQr || !order ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <svg className="animate-spin h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-zinc-500 font-medium">Đang khởi tạo cổng thanh toán...</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <h2 className="text-xl font-black dark:text-white">Cổng Thanh Toán VietQR</h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Gói {order.plan_name} ({billingCycle === 'yearly' ? '1 Năm' : '1 Tháng'})
                      </p>
                    </div>

                    <div className="flex justify-center pt-2">
                      {isExpired ? (
                        <div className="w-52 h-52 rounded-[24px] bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center gap-3">
                          <p className="text-xs font-bold text-zinc-500">Mã QR đã hết hạn</p>
                          <button
                            onClick={() => { setError(null); setStep('select'); }}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-colors"
                          >
                            Tạo mã mới
                          </button>
                        </div>
                      ) : (
                        <div className="relative p-1.5 bg-white rounded-[24px] border border-slate-200 shadow-sm">
                          <img src={order.qr_url} alt="VietQR" className="w-[180px] h-[180px] rounded-[16px] object-cover" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 text-xs bg-slate-50 dark:bg-zinc-800/50 rounded-2xl p-4.5 border border-slate-100 dark:border-slate-800/80">
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
                        <span className="font-black text-blue-600 text-sm">{(order.amount_vnd || 0).toLocaleString('vi-VN')} đ</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <span className="text-zinc-500 font-medium">Nội dung CK</span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-blue-600 tracking-widest bg-blue-50 px-2 py-1 rounded-lg">{order.transfer_content}</span>
                          <button onClick={copyTransferContent} className="p-1 rounded bg-zinc-100 hover:bg-zinc-200 transition-colors">
                            {copied ? <IconCheck /> : <IconCopy />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs px-1">
                      <div className="flex items-center gap-2 font-medium text-emerald-600">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Hệ thống chờ quét mã tự động...
                      </div>
                      {!isExpired && (
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${timeLeft < 120 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-600'}`}>
                          {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    <div className="pt-2 text-center">
                      <button onClick={() => setStep('select')} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                        ← Quay lại bảng giá
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Success payment view */}
            {step === 'success' && (
              <div className="p-8 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner border border-emerald-100">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-900 dark:text-white">Thành toán thành công!</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-medium leading-relaxed">
                    Hệ thống đã tự động gia hạn gói cước <strong>{order?.plan_name}</strong> thành công.<br/>Chúc bạn buôn bán may mắn và hanh thông!
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition-all shadow-md mt-4"
                >
                  Bắt đầu bán hàng ngay
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

// ─── Local SVG Icons ────────────────────────────────────────────────────────
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

function IconCheck({ className = 'text-emerald-500' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
