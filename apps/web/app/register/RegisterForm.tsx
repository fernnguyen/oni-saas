'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';

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

export function RegisterForm({ plans }: { plans: any[] }) {
  const router = useRouter();
  const [slug, setSlug]           = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const defaultPlan = plans.find(p => p.is_default || p.code === 'plan_mini') || plans[0];
  const [selectedPlanCode, setSelectedPlanCode] = useState(defaultPlan?.code || '');
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
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

    sessionStorage.setItem('oni_register', JSON.stringify({ slug, name, email, password, plan_code: selectedPlanCode }));
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0268FF] text-white font-bold text-lg">O</div>
        </Link>
        <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0268FF] text-white font-bold text-sm">O</div>
          <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Thiết lập hệ thống</h1>
        <p className="mt-1 text-sm text-slate-500">Tạo thông tin cửa hàng và tài khoản admin để bắt đầu</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">

        {/* Company name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên cửa hàng / Hộ kinh doanh</label>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Hộ kinh doanh Oni"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
            required
          />
        </div>

        {/* Subdomain */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Đường dẫn truy cập (Tên miền)</label>
          <div className={`flex overflow-hidden rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-[#0268FF]/20 ${
            slugStatus === 'available' ? 'border-green-400' :
            slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400' :
            'border-slate-200 focus-within:border-[#0268FF]'
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
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
          <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-[#0268FF] focus-within:ring-2 focus-within:ring-[#0268FF]/20">
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
            <div className="flex items-center gap-3 rounded-xl border border-[#0268FF] bg-blue-50/50 px-4 py-3 text-[#0268FF]">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 flex items-center gap-2">
                <span className="font-semibold">{defaultPlan.name}</span>
                <span className="rounded-md bg-[#0268FF] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">Miễn phí</span>
              </div>
              <span className="text-xs font-medium text-[#0268FF]/70">Có thể nâng cấp sau</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
        >
          Hoàn tất thiết lập
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Đã có tài khoản?{' '}
        <Link href="/auth/signin" className="font-medium text-[#0268FF] hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
