'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';
import { VERTICAL_REGISTRY, INDUSTRY_TYPES, type IndustryType } from '@oni/core';
import { Turnstile } from '../components/auth/Turnstile';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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

export function RegisterForm({ plans, initialDomain, initialIndustry, registrationMode = 'free' }: { plans: any[], initialDomain?: string, initialIndustry?: string, registrationMode?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [slug, setSlug] = useState(initialDomain || '');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialDomain);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const defaultPlan = plans.find(p => p.is_default || p.code === 'plan_mini') || plans[0];
  const [selectedPlanCode, setSelectedPlanCode] = useState(defaultPlan?.code || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [industryType, setIndustryType] = useState<IndustryType>(() => {
    if (initialIndustry) {
      const normalized = initialIndustry.toLowerCase();
      // Check if it matches INDUSTRY_TYPES directly
      if (INDUSTRY_TYPES.includes(normalized as any)) {
        return normalized as IndustryType;
      }
      
      // Look up sub-industries/slug mapping
      const mapping: Record<string, IndustryType> = {
        // Retail
        'nha-thuoc-quay-duoc': 'retail',
        'dien-thoai-dien-may': 'retail',
        'tap-hoa-sieu-thi': 'retail',
        'my-pham-hoa-my-pham': 'retail',
        'vat-lieu-xay-dung-son': 'retail',
        'nong-san-thuc-pham-sach': 'retail',
        'me-be': 'retail',
        'sach-van-phong-pham': 'retail',
        // Fashion
        'thoi-trang-phu-kien': 'fashion',
        // FnB
        'cafe-tra-sua': 'fnb',
        'nha-hang-quan-an': 'fnb',
        'bar-pub-club': 'fnb',
        // Billiards
        'quan-billiards-bi-a': 'billiards',
        // Sports Court
        'san-pickleball-the-thao': 'sports_court',
        'sports-court': 'sports_court',
        // Lodging
        'khach-san-nha-nghi': 'lodging',
        'homestay-villa': 'lodging',
        // Service Hourly
        'beauty-spa-massage': 'service_hourly',
        'hair-salon-nails': 'service_hourly',
        'karaoke-giai-tri': 'service_hourly',
        'phong-kham-tu-nhan': 'service_hourly',
        'fitness-yoga-center': 'service_hourly',
        'service-hourly': 'service_hourly',
      };
      
      if (mapping[normalized]) {
        return mapping[normalized];
      }
    }
    return 'retail';
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from sessionStorage on mount to prevent hydration mismatch and preserve user inputs
  useEffect(() => {
    const saved = sessionStorage.getItem('oni_register');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.slug) setSlug(parsed.slug);
        if (parsed.name) setName(parsed.name);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.password) setPassword(parsed.password);
        if (parsed.plan_code) setSelectedPlanCode(parsed.plan_code);
        if (parsed.industry_type) setIndustryType(parsed.industry_type);
        if (parsed.invitation_code) setInvitationCode(parsed.invitation_code);
        setSlugManuallyEdited(true);
        // Automatically take the user directly back to Step 2!
        setStep(2);

        // Also check if there was a general registration error passed back
        const regError = sessionStorage.getItem('oni_register_error');
        if (regError) {
          setError(regError);
          sessionStorage.removeItem('oni_register_error');
        }

        // Check if there were field-specific registration errors
        const savedFieldErrors = sessionStorage.getItem('oni_register_field_errors');
        if (savedFieldErrors) {
          setFieldErrors(JSON.parse(savedFieldErrors));
          sessionStorage.removeItem('oni_register_field_errors');
        }
      } catch (err) {
        console.error('Failed to restore registration state:', err);
      }
    }
  }, []);

  function handleNameChange(val: string) {
    setName(val);
    setFieldErrors(prev => ({ ...prev, name: '' }));
    if (!slugManuallyEdited) {
      const newSlug = slugify(val);
      setSlug(newSlug);
      setFieldErrors(prev => ({ ...prev, slug: '' }));
    }
  }

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50);
    setSlug(clean);
    setSlugManuallyEdited(true);
    setFieldErrors(prev => ({ ...prev, slug: '' }));
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
    if (slugStatus !== 'available' || (TURNSTILE_SITE_KEY && !turnstileToken)) return;
    setLoading(true);
    setError(null);
    setFieldErrors({});

    if (registrationMode === 'code') {
      try {
        const res = await fetch(`/api/register/check-code?code=${encodeURIComponent(invitationCode.trim())}`);
        const checkResult = await res.json();
        if (!checkResult.valid) {
          setError(checkResult.message || 'Mã mời không hợp lệ.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Invitation code validation error:', err);
        setError('Có lỗi xảy ra khi xác thực mã mời. Vui lòng thử lại.');
        setLoading(false);
        return;
      }
    }

    sessionStorage.setItem('oni_register', JSON.stringify({ slug, name, email, password, plan_code: selectedPlanCode, industry_type: industryType, turnstile_token: turnstileToken, invitation_code: invitationCode }));
    router.push('/register/provisioning');
  }

  const slugOk = slugStatus === 'available';
  const isCodeRequired = registrationMode === 'code';
  const hasValidCode = isCodeRequired ? invitationCode.trim().length > 0 : true;
  const canSubmit = slug.length >= 2 && slugOk && name.trim().length >= 2 && email && password.length >= 8 && selectedPlanCode && hasValidCode && (TURNSTILE_SITE_KEY ? turnstileToken : true);

  if (registrationMode === 'disabled') {
    return (
      <AuthSplitLayout
        title="Đăng ký đang tạm khóa"
        subtitle="Hệ thống ONI.vn hiện đang tạm khóa đăng ký tự do để phục vụ nâng cấp hệ thống."
      >
        <div className="text-center py-10 px-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 mx-auto shadow-inner">
            <svg className="h-8 w-8 text-amber-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Đăng ký tạm khóa</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            Hệ thống ONI.vn hiện đang ở chế độ **Admin-Only** (Chỉ Admin tạo tài khoản). Việc đăng ký thành viên trực tuyến hiện đang tạm đóng.
          </p>
          <div className="rounded-xl bg-slate-50 p-4 max-w-sm mx-auto text-xs text-slate-500 leading-normal border border-slate-100">
            Nếu bạn là khách hàng mới và muốn dùng thử hệ thống, xin vui lòng liên hệ trực tiếp với chúng tôi qua email <strong className="text-primary select-all font-semibold">support@oni.vn</strong> để được hỗ trợ cấp tài khoản dùng thử.
          </div>
          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-all duration-200 shadow-sm hover:shadow"
            >
              ← Quay lại trang chủ
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

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

        {/* Step Indicator Header */}
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 pb-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              step === 1 ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              step === 1 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
            }`}>1</span>
            Ngành nghề
          </button>
          <div className="flex-1 h-px bg-slate-100 mx-4 -mt-2" />
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep(2)}
            className={`flex items-center gap-2 pb-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              step === 2 ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-605'
            }`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              step === 2 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
            }`}>2</span>
            Thiết lập cửa hàng
          </button>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {step === 1 ? 'Chọn ngành nghề kinh doanh' : `Thiết lập ${VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()}`}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {step === 1 
            ? 'ONI sẽ tối ưu cấu hình và giao diện POS phù hợp nhất với lĩnh vực kinh doanh của bạn.' 
            : `Tạo thông tin ${VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()} và tài khoản admin để bắt đầu.`
          }
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Industry Type Selection */}
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
            <div className="flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 shadow-inner">
              <p className="text-[11px] text-indigo-700 leading-relaxed font-medium">
                Hệ thống sẽ được cấu hình tối ưu cho ngành: <strong className="underline decoration-indigo-300 underline-offset-2">{VERTICAL_REGISTRY[industryType].label}</strong>. Bạn hoàn toàn có thể thay đổi lựa chọn này bất cứ lúc nào trong Cài đặt hệ thống.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark shadow-md shadow-blue-500/10 hover:shadow transition-all duration-200 cursor-pointer"
            >
              Tiếp tục thiết lập
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên {VERTICAL_REGISTRY[industryType].workspaceLabel.toLowerCase()} / Đơn vị</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Hộ kinh doanh Oni"
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.name ? 'border-red-400 focus:border-red-400 focus:ring-red-200/50' : 'border-slate-200 focus:border-primary focus:ring-primary/20'
                }`}
                required
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                  <span className="shrink-0">⚠️</span> {fieldErrors.name}
                </p>
              )}
            </div>

            {/* Subdomain */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Đường dẫn truy cập (Tên miền)</label>
              <div className={`flex overflow-hidden rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-primary/20 ${
                  fieldErrors.slug || slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400 focus-within:ring-red-200/50' :
                  slugStatus === 'available' ? 'border-green-400' :
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
              {fieldErrors.slug && (
                <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                  <span className="shrink-0">⚠️</span> {fieldErrors.slug}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email quản trị (Admin)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors(prev => ({ ...prev, email: '' }));
                }}
                placeholder="tenhokinhdoanh@gmail.com"
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.email ? 'border-red-400 focus:border-red-400 focus:ring-red-200/50' : 'border-slate-200 focus:border-primary focus:ring-primary/20'
                }`}
                required
              />
              <p className="mt-1.5 text-[10px] text-slate-400 leading-normal">Nhập email đang hoạt động để nhận mã OTP xác thực tài khoản.</p>
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                  <span className="shrink-0">⚠️</span> {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
              <div className={`flex overflow-hidden rounded-xl border focus-within:ring-2 ${
                  fieldErrors.password ? 'border-red-400 focus-within:border-red-400 focus-within:ring-red-200/50' : 'border-slate-200 focus-within:border-primary focus-within:ring-primary/20'
                }`}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors(prev => ({ ...prev, password: '' }));
                  }}
                  placeholder="Tối thiểu 8 ký tự"
                  className="flex-1 px-4 py-3 text-sm focus:outline-none"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-3 text-slate-400 hover:text-slate-650 border-l border-slate-200 bg-slate-50"
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
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                  <span className="shrink-0">⚠️</span> {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Invitation Code (If enabled) */}
            {registrationMode === 'code' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <span>Mã mời / Code đăng ký</span>
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 border border-amber-200/50 uppercase tracking-wider">Bắt buộc</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={invitationCode}
                    onChange={(e) => {
                      setInvitationCode(e.target.value);
                      setFieldErrors(prev => ({ ...prev, invitationCode: '' }));
                    }}
                    placeholder="Nhập mã mời của bạn (ví dụ: ONI-XXXXX)"
                    className={`w-full rounded-xl border pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 font-medium placeholder-slate-400 ${
                      fieldErrors.invitationCode ? 'border-red-400 focus:border-red-400 focus:ring-red-200/50' : 'border-slate-200 focus:border-primary focus:ring-primary/20'
                    }`}
                    required
                  />
                  <div className="absolute left-3.5 text-slate-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 leading-normal">Đăng ký hiện tại đang ở chế độ giới hạn. Bạn cần có mã mời hợp lệ được cấp bởi ONI để đăng ký.</p>
                {fieldErrors.invitationCode && (
                  <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                    <span className="shrink-0">⚠️</span> {fieldErrors.invitationCode}
                  </p>
                )}
              </div>
            )}

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

            {/* Cloudflare Turnstile */}
            {TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
              />
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-md shadow-blue-500/10 cursor-pointer"
              >
                {loading ? 'Đang khởi tạo...' : 'Hoàn tất thiết lập'}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer"
              >
                ← Quay lại chọn ngành nghề
              </button>
            </div>
          </div>
        )}
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
