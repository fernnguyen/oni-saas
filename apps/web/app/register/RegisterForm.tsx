'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';
import { VERTICAL_REGISTRY, INDUSTRY_TYPES, type IndustryType } from '@oni/core';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

function slugify(val: string) {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

const INDUSTRY_VISUALS: Record<IndustryType, {
  gradient: string
  bgActive: string
  bgSphere: string
  borderColor: string
}> = {
  retail: {
    gradient: 'from-blue-500 to-indigo-600',
    bgActive: 'bg-blue-50/30 ring-blue-500/20',
    bgSphere: 'from-blue-500/10 to-indigo-500/10 text-indigo-600 border-indigo-200/50',
    borderColor: 'border-indigo-500',
  },
  fnb: {
    gradient: 'from-orange-500 to-rose-500',
    bgActive: 'bg-orange-50/30 ring-orange-500/20',
    bgSphere: 'from-orange-500/10 to-rose-500/10 text-orange-600 border-orange-200/50',
    borderColor: 'border-rose-500',
  },
  billiards: {
    gradient: 'from-emerald-500 to-teal-600',
    bgActive: 'bg-emerald-50/30 ring-emerald-500/20',
    bgSphere: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-200/50',
    borderColor: 'border-emerald-500',
  },
  sports_court: {
    gradient: 'from-violet-500 to-fuchsia-600',
    bgActive: 'bg-violet-50/30 ring-violet-500/20',
    bgSphere: 'from-violet-500/10 to-fuchsia-500/10 text-violet-600 border-violet-200/50',
    borderColor: 'border-violet-500',
  },
  lodging: {
    gradient: 'from-cyan-500 to-blue-600',
    bgActive: 'bg-cyan-50/30 ring-cyan-500/20',
    bgSphere: 'from-cyan-500/10 to-blue-500/10 text-blue-600 border-blue-200/50',
    borderColor: 'border-blue-500',
  },
  fashion: {
    gradient: 'from-pink-500 to-rose-500',
    bgActive: 'bg-pink-50/30 ring-pink-500/20',
    bgSphere: 'from-pink-500/10 to-rose-500/10 text-pink-600 border-pink-200/50',
    borderColor: 'border-pink-500',
  },
  service_hourly: {
    gradient: 'from-amber-500 to-orange-600',
    bgActive: 'bg-amber-50/30 ring-amber-500/20',
    bgSphere: 'from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200/50',
    borderColor: 'border-amber-500',
  },
};

export function RegisterForm({ plans, initialDomain }: { plans: any[], initialDomain?: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialDomain || '');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialDomain);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const defaultPlan = plans.find(p => p.is_default || p.code === 'plan_mini') || plans[0];
  const [selectedPlanCode, setSelectedPlanCode] = useState(defaultPlan?.code || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [industryType, setIndustryType] = useState<IndustryType>('retail');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManuallyEdited) setSlug(slugify(val));
  }

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50);
    setSlug(clean);
    setSlugManuallyEdited(true);
  }

  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return; }
    if (slug.length < 2) { setSlugStatus('invalid'); return; }
    if (!SLUG_REGEX.test(slug)) { setSlugStatus('invalid'); return; }

    setSlugStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/register/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (slugStatus !== 'available') return;
    setLoading(true);
    setError(null);

    sessionStorage.setItem('oni_register', JSON.stringify({ slug, name, email, password, plan_code: selectedPlanCode, industry_type: industryType }));
    router.push('/register/provisioning');
  }

  const slugOk = slugStatus === 'available';
  const canSubmit = slug.length >= 2 && slugOk && name.trim().length >= 2 && email && password.length >= 8 && selectedPlanCode;

  return (
    <AuthSplitLayout
      title="Bắt đầu quản lý kinh doanh thông minh"
      subtitle="Thiết lập hệ thống quản lý riêng với tên miền tùy chỉnh, kết nối cơ sở dữ liệu và quản lý bán hàng đa kênh ngay lập tức."
    >
      <div className="mb-8 text-center lg:text-left">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-4 lg:hidden">
          <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="rounded-xl shadow-sm" />
        </Link>
        <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
          <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg shadow-sm" />
          <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Thiết lập {VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()}</h1>
        <p className="mt-1 text-sm text-slate-500">Tạo thông tin {VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()} và tài khoản admin để bắt đầu</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">

        {/* Industry Type Selection */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Chọn ngành nghề kinh doanh
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INDUSTRY_TYPES.map((type) => {
              const v = VERTICAL_REGISTRY[type];
              const selected = industryType === type;
              const visuals = INDUSTRY_VISUALS[type] ?? INDUSTRY_VISUALS.retail;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setIndustryType(type)}
                  className={`group relative flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${selected
                      ? `${visuals.bgActive} ${visuals.borderColor} ring-2 ring-slate-100/50 shadow-sm`
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                    }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${visuals.bgSphere} text-xl shadow-inner border border-slate-100 transition-transform duration-200 group-hover:scale-105`}>
                    {v.icon}
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <p className={`text-sm font-bold transition-colors ${selected ? 'text-slate-900' : 'text-slate-800 group-hover:text-slate-900'}`}>
                      {v.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400 leading-normal line-clamp-2">
                      {v.description}
                    </p>
                  </div>

                  {selected && (
                    <span className={`absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r ${visuals.gradient} text-white shadow-sm shrink-0`}>
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 shadow-inner">
            <p className="text-[11px] text-indigo-700 leading-relaxed font-medium">
              Hệ thống sẽ được cấu hình tối ưu cho ngành: <strong className="underline decoration-indigo-300 underline-offset-2">{VERTICAL_REGISTRY[industryType].label}</strong>. Bạn hoàn toàn có thể thay đổi lựa chọn này bất cứ lúc nào trong Cài đặt hệ thống.
            </p>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên {VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()} / Đơn vị</label>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Hộ kinh doanh Oni"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        {/* Subdomain */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Đường dẫn truy cập (Tên miền)</label>
          <div className={`flex overflow-hidden rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-primary/20 ${slugStatus === 'available' ? 'border-green-400' :
              slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400' :
                'border-slate-200 focus-within:border-primary'
            }`}>
            <input
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="ten-cua-hang"
              className="flex-1 px-4 py-3 text-sm focus:outline-none"
              required
            />
            <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-400 border-l border-slate-200 shrink-0">
              .{ROOT_DOMAIN}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Chữ không dấu, số và dấu gạch ngang.</p>
          {slugStatus === 'checking' && (
            <p className="mt-1 text-xs text-slate-400">Đang kiểm tra...</p>
          )}
          {slugStatus === 'available' && (
            <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Tên miền này có thể dùng
            </p>
          )}
          {slugStatus === 'taken' && (
            <p className="mt-1 text-xs text-red-500">Tên miền đã được sử dụng. Hãy chọn tên khác.</p>
          )}
          {slugStatus === 'invalid' && (
            <p className="mt-1 text-xs text-red-500">Tối thiểu 2 ký tự, chỉ dùng chữ không dấu, số và dấu gạch ngang.</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email quản trị (Admin)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tenhokinhdoanh@gmail.com"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
          <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="flex-1 px-4 py-3 text-sm focus:outline-none"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="px-3 text-slate-400 hover:text-slate-600 border-l border-slate-200 bg-slate-50"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Plan Selection */}
        {defaultPlan && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Gói dịch vụ</label>
            <div className="flex items-center gap-3 rounded-xl border border-primary bg-blue-50/50 px-4 py-3 text-primary">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 flex items-center gap-2">
                <span className="font-semibold">{defaultPlan.name}</span>
                <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">Miễn phí</span>
              </div>
              <span className="text-xs font-medium text-primary/70">Có thể nâng cấp sau</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
        >
          Hoàn tất thiết lập
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Đã có tài khoản?{' '}
        <Link href="/auth/signin" className="font-medium text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
