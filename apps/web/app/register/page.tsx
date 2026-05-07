'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

function slugify(val: string) {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

export default function RegisterPage() {
  const router = useRouter();
  const [slug, setSlug]           = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

    sessionStorage.setItem('oni_register', JSON.stringify({ slug, name, email, password }));
    router.push('/register/provisioning');
  }

  const slugOk = slugStatus === 'available';
  const canSubmit = slug.length >= 2 && slugOk && name.trim().length >= 2 && email && password.length >= 8;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0268FF] text-white font-bold text-lg">O</div>
          <h1 className="text-2xl font-bold text-slate-900">Tạo workspace</h1>
          <p className="mt-1 text-sm text-slate-500">Thiết lập subdomain và tài khoản admin để bắt đầu</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm space-y-5">

          {/* Progress bar */}
          <div className="flex gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1 flex-1 rounded-full bg-[#0268FF]" />
            <div className="h-1 flex-1 rounded-full bg-[#0268FF]" />
          </div>

          <form onSubmit={onSubmit} className="space-y-5">

            {/* Subdomain */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Subdomain</label>
              <div className={`flex overflow-hidden rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-[#0268FF]/20 ${
                slugStatus === 'available' ? 'border-green-400' :
                slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400' :
                'border-slate-200 focus-within:border-[#0268FF]'
              }`}>
                <input
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="your-company"
                  className="flex-1 px-4 py-3 text-sm focus:outline-none"
                  required
                />
                <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-400 border-l border-slate-200 shrink-0">
                  .{ROOT_DOMAIN}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Chữ thường, số và dấu gạch ngang.</p>
              {slugStatus === 'checking' && (
                <p className="mt-1 text-xs text-slate-400">Đang kiểm tra...</p>
              )}
              {slugStatus === 'available' && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Subdomain này có thể dùng
                </p>
              )}
              {slugStatus === 'taken' && (
                <p className="mt-1 text-xs text-red-500">Subdomain đã được sử dụng. Hãy chọn tên khác.</p>
              )}
              {slugStatus === 'invalid' && (
                <p className="mt-1 text-xs text-red-500">Tối thiểu 2 ký tự, chỉ dùng chữ thường, số và dấu gạch ngang.</p>
              )}
            </div>

            {/* Company name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên doanh nghiệp</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Inc."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email admin</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
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

            {/* Plan — Mini only for now */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Gói dịch vụ</label>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 bg-slate-50 text-sm text-slate-600">
                <svg className="h-4 w-4 text-[#0268FF] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span className="flex-1">Starter — Miễn phí</span>
                <span className="text-xs text-slate-400">Có thể nâng cấp sau</span>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
            >
              Tạo workspace
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            Đã có workspace?{' '}
            <Link href="/auth/signin" className="font-medium text-[#0268FF] hover:underline">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
