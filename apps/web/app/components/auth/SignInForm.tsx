'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AuthSplitLayout } from '../layout/AuthSplitLayout';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

interface Props {
  tenantName?: string;
  tenantSlug?: string;
}

export function SignInForm({ tenantName, tenantSlug }: Props) {
  const searchParams = useSearchParams();
  const [subdomain, setSubdomain] = useState(tenantSlug || '');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'oauth_failed') {
      setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
    }
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subdomain.trim()) {
      setError('Vui lòng nhập subdomain workspace.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password,
          tenant_slug: subdomain.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Đăng nhập thất bại');
      }

      if (data.mfa_required) {
        if (tenantSlug) {
          window.location.href = '/auth/2fa?next=/';
        } else {
          const protocol = window.location.protocol;
          window.location.href = `${protocol}//${subdomain}.${ROOT_DOMAIN}/auth/2fa?next=/`;
        }
        return;
      }

      // Redirect to tenant workspace
      if (tenantSlug) {
        window.location.href = '/';
      } else {
        const protocol = window.location.protocol;
        window.location.href = `${protocol}//${subdomain}.${ROOT_DOMAIN}`;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const redirectTo = new URL('/api/auth/callback', window.location.origin);
    redirectTo.searchParams.set('next', '/');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const isPreFilled = !!tenantSlug;

  return (
    <AuthSplitLayout 
      title={tenantName ? `Chào mừng đến với\n${tenantName}` : "Chào mừng quay lại"} 
      subtitle="Đăng nhập vào workspace của bạn để quản lý đơn hàng, công nợ và khách hàng."
      features={tenantName ? [
        { label: "BẢO MẬT", value: "Bảo mật cao cấp" },
        { label: "QUẢN LÝ", value: "Đa chi nhánh" },
      ] : undefined}
    >
      <div className="mb-8 text-center lg:text-left">
        {tenantName ? (
          <>
            <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 mx-auto lg:mx-0 rounded-xl lg:hidden shadow-sm" />
            <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
              <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg shadow-sm" />
              <span className="font-bold text-slate-900 text-lg truncate max-w-[200px]" title={tenantName}>{tenantName}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng nhập tổ chức</h1>
            <p className="mt-1 text-sm text-slate-500 font-mono">{tenantSlug}.oni.vn</p>
          </>
        ) : (
          <>
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4 lg:hidden">
              <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="rounded-xl shadow-sm" />
            </Link>
            <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
              <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg shadow-sm" />
              <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
            <p className="mt-1 text-sm text-slate-500">Nhập thông tin để truy cập tổ chức của bạn.</p>
          </>
        )}
      </div>

      <div className="space-y-4">
        {isPreFilled && (
          <>
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
              </svg>
              Tiếp tục với Google
            </button>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              hoặc
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Subdomain */}
          {!isPreFilled && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Subdomain</label>
              <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="hokinhdoanh"
                  className="flex-1 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  required={!isPreFilled}
                  autoFocus={!isPreFilled}
                />
                <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-400 border-l border-slate-200 shrink-0">
                  .{ROOT_DOMAIN}
                </span>
              </div>
            </div>
          )}

          {/* Username / Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên đăng nhập hoặc Email</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value.trim())}
              placeholder="ten_dang_nhap hoặc email@gmail.com"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              required
              autoFocus={isPreFilled}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Mật khẩu</label>
              <Link href="#" className="text-xs font-semibold text-primary hover:underline">Quên mật khẩu?</Link>
            </div>
            <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                className="flex-1 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="px-3 text-slate-400 hover:text-slate-600 border-l border-slate-200 bg-slate-50 transition-colors"
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

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            {!loading && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
        </form>

        {!isPreFilled && (
          <>
            <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              hoặc
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
              Chưa có workspace?{' '}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Đăng ký miễn phí
              </Link>
            </p>

            <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Về trang chủ
            </Link>
          </>
        )}
      </div>
    </AuthSplitLayout>
  );
}
