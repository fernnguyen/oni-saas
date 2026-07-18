'use client';

import { useState } from 'react';
import Link from 'next/link';

// ─── Icons ──────────────────────────────────────────────────────────────────
const CheckIcon = ({ className = '' }: { className?: string }) => (
  <svg className={`h-4 w-4 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const CrossIcon = () => (
  <svg className="h-4 w-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ─── Metadata → human-readable label helper ──────────────────────────────
function formatLimit(val: number | undefined | null): string {
  if (val === undefined || val === null) return '∞';
  if (val === -1) return 'Không giới hạn';
  return val.toLocaleString('vi-VN');
}

function formatBool(val: boolean | undefined): 'yes' | 'no' {
  return val === true ? 'yes' : 'no';
}

// ─── Feature row definition ──────────────────────────────────────────────
type RowType = 'limit' | 'bool' | 'text';
interface FeatureRow {
  key: string;
  label: string;
  labelByPlan?: Record<string, string>;
  type: RowType;
  unit?: string;
  hint?: string;
  hintByPlan?: Record<string, string>;
}

const FEATURE_ROWS: FeatureRow[] = [
  { key: 'create_shop',          label: 'Chi nhánh (POS)',          type: 'limit', unit: 'chi nhánh' },
  { key: 'create_shop_user',     label: 'Nhân viên / chi nhánh',    type: 'limit', unit: 'nhân viên' },
  { key: 'max_products',         label: 'Sản phẩm',                 type: 'limit', unit: 'sản phẩm' },
  { key: 'max_orders_per_month', label: 'Đơn hàng / tháng',         type: 'limit', unit: 'đơn' },
  { key: 'create_connector',     label: 'Kết nối dữ liệu (BYOD)',   type: 'limit', unit: 'connector', hint: 'Supabase, PostgreSQL riêng' },
  { key: 'create_domain',        label: 'Tên miền riêng',           type: 'limit', unit: 'domain' },
  { key: 'tax_report',           label: 'Báo cáo thuế',            type: 'bool',
    labelByPlan: { plan_mini: 'Báo cáo thuế S1a-HKD' },
    hintByPlan:  { plan_mini: 'Tự động tổng hợp từ dữ liệu bán hàng' } },
  { key: 'qr_table_ordering',    label: 'QR Order (đặt bàn)',        type: 'bool' },
  { key: 'crm',                  label: 'CRM & Thẻ thành viên',     type: 'bool' },
  { key: 'can_use_push_notify',  label: 'Push Notification',         type: 'bool' },
];

// Extra text-based features per plan (hardcoded marketing lines)
const EXTRA_FEATURES: Record<string, string[]> = {
  plan_mini:       [
    'POS bán hàng đầy đủ',
    'Sổ quỹ thu chi',
    'Quản lý kho & tồn kho',
    'Quản lý đối tác (NCC)',
    'Báo cáo doanh thu',
    'Quản lý công nợ',
    'Hỗ trợ qua cộng đồng',
  ],
  plan_pro:        ['Mọi tính năng Tiên phong', 'AI phân tích & Dự báo', 'Zalo & Telegram Alerts', '2FA & Audit log', 'Hỗ trợ ưu tiên (email + chat)'],
  plan_enterprise: ['Mọi tính năng Pro', 'Dedicated PostgreSQL (BYOD)', 'API & Webhook nâng cao', 'SLA 99.9%', 'Onboarding chuyên biệt 1-1'],
};

// ─── Per-plan metadata defaults (fallback khi DB chưa có key) ───────────
// Đảm bảo hiển thị đúng ngay cả khi migration chưa được apply
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
    can_use_push_notify: false,
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
    can_use_push_notify: true,
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
    can_use_push_notify: true,
  },
};

function getMeta(plan: any): Record<string, any> {
  const defaults = META_DEFAULTS[plan.code] || {};
  return { ...defaults, ...(plan.metadata || {}) };
}

// ─── Pricing card component ───────────────────────────────────────────────
function PlanCard({
  plan,
  billingCycle,
  formatPrice,
}: {
  plan: any;
  billingCycle: 'monthly' | 'yearly';
  formatPrice: (n: number) => string;
}) {
  const meta = getMeta(plan);
  const isMini = plan.code === 'plan_mini';
  const isEnterprise = plan.code === 'plan_enterprise';
  const extras = EXTRA_FEATURES[plan.code] || [];

  const displayPrice = isMini
    ? 'Miễn phí'
    : isEnterprise
    ? 'Liên hệ'
    : billingCycle === 'yearly'
    ? formatPrice(plan.price_yearly)
    : formatPrice(plan.price_monthly);

  const period = isMini ? null : isEnterprise ? null : billingCycle === 'yearly' ? '/năm' : '/tháng';

  const subtext = isMini
    ? 'Miễn phí vĩnh viễn · Bán hàng ngay hôm nay'
    : isEnterprise
    ? 'Tối ưu cho chuỗi lớn'
    : (() => {
        if (billingCycle === 'yearly' && plan.price_yearly && plan.price_monthly) {
          const equiv = Math.round(plan.price_yearly / 12);
          const pct   = Math.round(((plan.price_monthly - equiv) / plan.price_monthly) * 100);
          return `≈ ${formatPrice(equiv)}/tháng (tiết kiệm ${pct}%)`;
        }
        return 'Thanh toán hàng tháng';
      })();

  return (
    <div
      className={`relative flex flex-col rounded-[2rem] p-8 transition-all duration-300 ${
        plan.highlight
          ? 'border-2 border-primary bg-white shadow-2xl shadow-orange-900/10 scale-100 lg:scale-105 z-10'
          : 'border border-slate-200 bg-white hover:border-orange-200 hover:shadow-xl hover:shadow-orange-900/5'
      }`}
    >
      {/* Popular badge */}
      {plan.badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-orange-400 p-[2px]">
          <span className="block rounded-full bg-primary px-4 py-1 text-xs font-bold text-white uppercase tracking-widest">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Plan name */}
      <h3 className="text-2xl font-bold text-slate-900 mb-1">{plan.name}</h3>
      <p className="text-sm text-slate-500 font-medium mb-6 min-h-[1.25rem]">{subtext}</p>

      {/* Price */}
      <div className="flex items-baseline gap-1 mb-6 pb-6 border-b border-slate-100 whitespace-nowrap">
        <span className={`font-extrabold text-slate-900 tracking-tight text-[2.5rem] leading-none`}>
          {displayPrice}
        </span>
        {isMini && (
          <span className="ml-2 inline-flex items-center rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wide shadow-sm">
            Vĩnh viễn
          </span>
        )}
        {period && <span className="text-base text-slate-500 font-medium">{period}</span>}
      </div>

      {/* ── Metadata limits ── */}
      <div className="mb-6 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Giới hạn sử dụng</p>
        {FEATURE_ROWS.map((row) => {
          const rawVal = meta[row.key];
          const rowLabel = row.labelByPlan?.[plan.code] ?? row.label;
          const rowHint  = row.hintByPlan?.[plan.code] ?? row.hint;
          if (row.type === 'limit') {
            const num = rawVal as number | undefined;
            const label = num === -1 || num === undefined ? 'Không giới hạn' : `${formatLimit(num)} ${row.unit}`;
            const isUnlimited = num === -1 || num === undefined;
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 font-medium">{rowLabel}</span>
                <span
                  className={`font-bold tabular-nums ${
                    isUnlimited
                      ? 'text-emerald-600'
                      : num === 0
                      ? 'text-slate-350'
                      : 'text-slate-800'
                  }`}
                >
                  {num === 0 ? '—' : label}
                </span>
              </div>
            );
          } else {
            // boolean
            const active = rawVal === true;
            return (
              <div key={row.key} className="flex flex-col gap-0.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-medium ${
                    active && row.key === 'tax_report' && plan.code === 'plan_mini'
                      ? 'text-primary font-semibold'
                      : 'text-slate-500'
                  }`}>{rowLabel}</span>
                  {active ? (
                    <CheckIcon className={row.key === 'tax_report' && plan.code === 'plan_mini' ? 'text-primary' : 'text-emerald-500'} />
                  ) : (
                    <CrossIcon />
                  )}
                </div>
                {active && rowHint && (
                  <span className="text-[10px] text-slate-400 leading-snug">{rowHint}</span>
                )}
              </div>
            );
          }
        })}
      </div>

      {/* ── Extra marketing features ── */}
      {extras.length > 0 && (
        <div className="mb-6 pt-5 border-t border-slate-100 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Bao gồm</p>
          {extras.map((feat) => (
            <div key={feat} className="flex items-start gap-2.5 text-sm text-slate-700 font-medium">
              <CheckIcon className="text-primary mt-0.5" />
              <span className="leading-snug">{feat}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto pt-4">
        <Link
          href="/register"
          className={`flex w-full items-center justify-center rounded-xl px-6 py-4 text-base font-bold transition-all ${
            plan.highlight
              ? 'bg-primary text-white shadow-xl shadow-primary/30 hover:bg-primary-dark hover:shadow-2xl hover:shadow-primary/40'
              : 'bg-orange-50 text-primary hover:bg-orange-100'
          }`}
        >
          {plan.cta}
        </Link>
      </div>
    </div>
  );
}

// ─── Comparison Table (desktop) ───────────────────────────────────────────
function ComparisonTable({ plans }: { plans: any[] }) {
  return (
    <div className="mt-20 hidden lg:block overflow-x-auto">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400 mb-8">So sánh chi tiết các gói</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-4 pr-8 text-sm font-bold text-slate-500 w-52">Tính năng</th>
            {plans.map((p) => (
              <th key={p.code} className="text-center py-4 px-4 text-sm font-extrabold text-slate-900">
                {p.name}
                {p.highlight && (
                  <span className="ml-2 rounded-full bg-primary/10 text-primary text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
                    Phổ biến
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {FEATURE_ROWS.map((row) => (
            <tr key={row.key} className="hover:bg-slate-50/50 transition-colors">
              <td className="py-3.5 pr-8 text-xs font-semibold text-slate-600">
                {row.label}
                {row.hint && <span className="block text-[10px] text-slate-400 font-normal mt-0.5">{row.hint}</span>}
              </td>
              {plans.map((p) => {
                const meta = getMeta(p);
                const rawVal = meta[row.key];
                if (row.type === 'limit') {
                  const num = rawVal as number | undefined;
                  const isUnlimited = num === -1 || num === undefined;
                  return (
                    <td key={p.code} className="py-3.5 px-4 text-center text-xs font-bold">
                      {num === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : isUnlimited ? (
                        <span className="text-emerald-600">Không giới hạn</span>
                      ) : (
                        <span className="text-slate-800">{formatLimit(num)}</span>
                      )}
                    </td>
                  );
                } else {
                  const active = rawVal === true;
                  return (
                    <td key={p.code} className="py-3.5 px-4 text-center">
                      {active ? (
                        <span className="inline-flex items-center justify-center">
                          <CheckIcon className="text-emerald-500" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center">
                          <CrossIcon />
                        </span>
                      )}
                    </td>
                  );
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────
export function PricingSection({ plans }: { plans: any[] }) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const formatPrice = (price: number) => {
    if (!price || price === 0) return 'Miễn phí';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1).replace('.0', '')}M`;
    if (price >= 1000) return `${price / 1000}K`;
    return price.toString();
  };

  return (
    <section id="pricing" className="relative py-24 md:py-32 bg-slate-50">
      <div className="pointer-events-none absolute top-0 left-1/3 hidden h-[500px] w-[500px] rounded-full bg-orange-200/30 blur-[120px] md:block" />
      <div className="relative mx-auto max-w-7xl px-6">

        {/* Header */}
        <div className="text-center mb-16 lg:mb-20">
          <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Bảng giá</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Chi phí tối ưu, hiệu quả tối đa</h2>
          <p className="mt-4 text-lg text-slate-500 font-medium max-w-xl mx-auto">
            Khởi đầu vững chắc với gói Tiên phong miễn phí vĩnh viễn. Nâng cấp linh hoạt khi quy mô mở rộng.
          </p>

          {/* Billing toggle */}
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
                billingCycle === 'yearly' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hàng năm <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">-17%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div
          className={`grid gap-8 lg:gap-10 items-start justify-center ${
            plans.length === 1
              ? 'grid-cols-1 max-w-md mx-auto'
              : plans.length === 2
              ? 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto'
              : 'grid-cols-1 md:grid-cols-3 max-w-7xl mx-auto'
          }`}
        >
          {plans.map((p) => (
            <PlanCard key={p.code} plan={p} billingCycle={billingCycle} formatPrice={formatPrice} />
          ))}
        </div>

      </div>
    </section>
  );
}
