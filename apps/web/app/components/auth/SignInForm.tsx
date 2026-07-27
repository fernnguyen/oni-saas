'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { AuthSplitLayout } from '../layout/AuthSplitLayout';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';
import { getVerticalConfig } from '@oni/core';
import { Turnstile } from './Turnstile';
import { isValidVNPhone } from '../../../lib/utils/phone';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type QrLoginState = {
  isOpen: boolean;
  loading: boolean;
  token: string;
  qrDataUrl: string;
  requestedHost: string;
  tenantSlug: string;
  expiresAt: string;
  error: string | null;
  status: 'idle' | 'pending' | 'expired' | 'completing';
};

const INITIAL_QR_LOGIN_STATE: QrLoginState = {
  isOpen: false,
  loading: false,
  token: '',
  qrDataUrl: '',
  requestedHost: '',
  tenantSlug: '',
  expiresAt: '',
  error: null,
  status: 'idle',
};

function QrLoginIcon({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="3" y="15" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="17" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="14.5" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="18" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="14.5" y="18" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="18" y="18" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="11" y="11" width="1.75" height="1.75" rx="0.45" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function inferTenantSlugFromHost(hostname: string) {
  const rootBase = ROOT_DOMAIN.replace(/^https?:\/\//, '').split(':')[0];

  if (hostname === rootBase || !hostname.endsWith(`.${rootBase}`)) {
    return '';
  }

  const inferredSlug = hostname.slice(0, hostname.length - rootBase.length - 1);
  if (!inferredSlug || inferredSlug === 'www') {
    return '';
  }

  return inferredSlug;
}

export function SignInForm({ 
  tenantSlug, 
  tenantName,
  industryType,
}: { 
  tenantSlug?: string; 
  tenantName?: string; 
  industryType?: string;
}) {
  const searchParams = useSearchParams();
  const [detectedTenantSlug, setDetectedTenantSlug] = useState('');
  const [subdomain, setSubdomain] = useState(tenantSlug || '');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [qrLogin, setQrLogin] = useState<QrLoginState>(INITIAL_QR_LOGIN_STATE);
  const [qrCountdownNow, setQrCountdownNow] = useState(() => Date.now());

  function handleIdentifierBlur() {
    if (!identifier) return;
    const isEmail = identifier.includes('@');
    const isAllDigits = /^\d+$/.test(identifier);
    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        setFieldErrors(prev => ({ ...prev, identifier: 'Định dạng Email không hợp lệ' }));
      }
    } else if (isAllDigits) {
      if (!isValidVNPhone(identifier)) {
        setFieldErrors(prev => ({ ...prev, identifier: 'Số điện thoại không hợp lệ. Hỗ trợ 097..., 8497... hoặc +8497...' }));
      }
    }
  }

  function handlePasswordBlur() {
    if (password && password.length < 6) {
      setFieldErrors(prev => ({ ...prev, password: 'Mật khẩu thường có ít nhất 6 ký tự' }));
    }
  }

  const resetTurnstile = () => {
    setTurnstileToken(null);
    setTurnstileKey((prev) => prev + 1);
  };

  useEffect(() => {
    const inferredSlug = inferTenantSlugFromHost(window.location.hostname);
    if (inferredSlug) {
      setDetectedTenantSlug(inferredSlug);
      setSubdomain((prev) => prev || inferredSlug);
    }
  }, []);

  function getEffectiveTenantSlug() {
    if (tenantSlug) return tenantSlug;
    const inferredSlug = typeof window !== 'undefined' ? inferTenantSlugFromHost(window.location.hostname) : '';
    return inferredSlug || detectedTenantSlug;
  }

  function getEffectiveSubdomain() {
    const effectiveTenantSlug = getEffectiveTenantSlug();
    if (effectiveTenantSlug) return effectiveTenantSlug;
    return subdomain.trim().toLowerCase();
  }

  const effectiveTenantSlug = getEffectiveTenantSlug();

  useEffect(() => {
    if (effectiveTenantSlug) {
      setSubdomain((prev) => prev || effectiveTenantSlug);
    }
  }, [effectiveTenantSlug]);

  function handleForgotPassword() {
    // Preserve identifier if already typed so the forgot-password page can pre-fill
    const params = new URLSearchParams();
    if (identifier) params.set('identifier', identifier);
    window.location.href = `/auth/forgot-password${params.size ? `?${params}` : ''}`;
  }

  useEffect(() => {
    const err = searchParams.get('error');
    if (!err) return;

    if (err === 'oauth_failed') {
      setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
      return;
    }

    if (err === 'AuthFailed') {
      setError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.');
      return;
    }

    setError(decodeURIComponent(err.replace(/\+/g, ' ')));
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const activeTenantSlug = getEffectiveSubdomain();
    if (!subdomain.trim() && !isPreFilled) {
      setError('Vui lòng nhập địa chỉ gian hàng.');
      return;
    }
    // Check if there are field errors
    if (fieldErrors.identifier || fieldErrors.password) {
      setError('Vui lòng kiểm tra lại thông tin nhập.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Vui lòng hoàn thành xác thực bảo mật.');
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
          tenant_slug: activeTenantSlug,
          turnstile_token: turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Đăng nhập thất bại');
      }

      if (data.mfa_required) {
        if (activeTenantSlug) {
          window.location.href = '/auth/2fa?next=/';
        } else {
          const protocol = window.location.protocol;
          window.location.href = `${protocol}//${activeTenantSlug}.${ROOT_DOMAIN}/auth/2fa?next=/`;
        }
        return;
      }

      // Redirect to tenant workspace
      if (activeTenantSlug) {
        window.location.href = '/';
      } else {
        const protocol = window.location.protocol;
        window.location.href = `${protocol}//${activeTenantSlug}.${ROOT_DOMAIN}`;
      }
    } catch (err: unknown) {
      resetTurnstile();
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setLoading(true);
    setError(null);
    const protocol = window.location.hostname.includes('localhost') ? 'http' : 'https';
    const activeTenantSlug = getEffectiveTenantSlug();
    const callbackOrigin = activeTenantSlug ? window.location.origin : `${protocol}://${ROOT_DOMAIN}`;
    const redirectTo = new URL('/api/auth/callback', callbackOrigin);

    if (activeTenantSlug) {
      redirectTo.searchParams.set('next', '/');
    } else {
      redirectTo.searchParams.set('next', '/api/auth/login-success?intent=login');
    }
    
    const supabase = getSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const isPreFilled = !!effectiveTenantSlug;

  function closeQrLoginModal() {
    setQrLogin(INITIAL_QR_LOGIN_STATE);
  }

  async function onQrSignIn() {
    setQrLogin({
      ...INITIAL_QR_LOGIN_STATE,
      isOpen: true,
      loading: true,
    });

    try {
      const res = await fetch('/api/auth/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: getEffectiveSubdomain() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tạo mã QR đăng nhập');
      }

      setQrLogin({
        isOpen: true,
        loading: false,
        token: data.token || '',
        qrDataUrl: data.qrDataUrl || '',
        requestedHost: data.requestedHost || window.location.host,
        tenantSlug: data.tenantSlug || '',
        expiresAt: data.expiresAt || '',
        error: null,
        status: 'pending',
      });
    } catch (err) {
      setQrLogin({
        ...INITIAL_QR_LOGIN_STATE,
        isOpen: true,
        loading: false,
        error: err instanceof Error ? err.message : 'Không thể tạo mã QR đăng nhập',
      });
    }
  }

  useEffect(() => {
    if (!qrLogin.isOpen || !qrLogin.token || qrLogin.status !== 'pending') {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/auth/qr-login?token=${encodeURIComponent(qrLogin.token)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || cancelled) {
          return;
        }

        if (data.status === 'expired') {
          setQrLogin((prev) => ({
            ...prev,
            status: 'expired',
            error: 'Mã QR đã hết hạn. Vui lòng tạo mã mới.',
          }));
          return;
        }

        if (data.status === 'confirmed' && data.session?.access_token && data.session?.refresh_token) {
          setQrLogin((prev) => ({
            ...prev,
            status: 'completing',
            error: null,
          }));

          const supabase = getSupabaseBrowserClient();
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          if (sessionError) {
            throw sessionError;
          }

          window.location.href = '/api/auth/login-success?intent=login';
        }
      } catch (err) {
        if (cancelled) return;
        setQrLogin((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Không thể đồng bộ phiên đăng nhập QR',
        }));
      }
    };

    pollStatus();
    const timer = window.setInterval(pollStatus, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [qrLogin.isOpen, qrLogin.status, qrLogin.token]);

  useEffect(() => {
    if (!qrLogin.isOpen || !qrLogin.expiresAt || qrLogin.status !== 'pending') {
      return;
    }

    setQrCountdownNow(Date.now());
    const timer = window.setInterval(() => {
      setQrCountdownNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [qrLogin.expiresAt, qrLogin.isOpen, qrLogin.status]);

  const qrTimeRemainingMs = qrLogin.expiresAt ? new Date(qrLogin.expiresAt).getTime() - qrCountdownNow : 0;
  const qrCountdown = formatCountdown(qrTimeRemainingMs);

  const vertical = getVerticalConfig(industryType ?? 'retail');
  const workspaceLabel = vertical.workspaceLabel.toLowerCase();

  return (
    <AuthSplitLayout 
      title={tenantName ? `Chào mừng đến với\n${tenantName}` : "Chào mừng quay lại"} 
      subtitle={`Đăng nhập vào ${workspaceLabel} của bạn để quản lý đơn hàng, doanh thu và vận hành.`}
      features={tenantName ? [
        { label: "BẢO MẬT", value: "Bảo mật cao cấp" },
        { label: "QUẢN LÝ", value: "Đa chi nhánh" },
      ] : undefined}
    >
      <div className="mb-8 text-center lg:text-left">
        {tenantName ? (
          <>
            <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 mx-auto lg:mx-0 rounded-xl lg:hidden" />
            <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
              <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
              <span className="font-bold text-slate-900 text-lg" title={tenantName}>{tenantName}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng nhập vào quản lý</h1>
            <p className="mt-1 text-sm text-slate-500">{tenantName} ({effectiveTenantSlug}.{ROOT_DOMAIN})</p>
          </>
        ) : (
          <>
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4 lg:hidden">
              <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="rounded-xl" />
            </Link>
            <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
              <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
              <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
            <p className="mt-1 text-sm text-slate-500">Nhập thông tin để truy cập hệ thống của bạn.</p>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { 
              const rootProtocol = window.location.hostname.includes('localhost') ? 'http' : 'https';
              const rootOrigin = `${rootProtocol}://${ROOT_DOMAIN}`;
              window.location.href = `${rootOrigin}/api/auth/zalo?intent=login&redirect_back=${encodeURIComponent(window.location.origin)}`; 
            }}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-60 transition-all shadow-sm"
          >
            <Image src="/partners/zalo.svg" alt="Zalo" width={18} height={18} />
            Đăng nhập bằng Zalo
          </button>

          <button
            type="button"
            onClick={onQrSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-60 transition-all shadow-sm"
          >
            <QrLoginIcon size={18} />
            Đăng nhập bằng mã QR
          </button>
          
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
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          hoặc tài khoản cũ
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Subdomain */}
          {!isPreFilled && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Địa chỉ gian hàng</label>
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

          {/* Username / Email / Phone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên đăng nhập, Email hoặc Số điện thoại</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value.trim());
                setFieldErrors(prev => ({ ...prev, identifier: '' }));
              }}
              onBlur={handleIdentifierBlur}
              placeholder="ten_dang_nhap, email@gmail.com hoặc 0987654321"
              autoComplete="username"
              className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.identifier ? 'border-red-400 focus:border-red-400 focus:ring-red-200/50' : 'border-slate-200 focus:border-primary focus:ring-primary/20'
              }`}
              required
              autoFocus={isPreFilled}
            />
            {fieldErrors.identifier && (
              <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                <span className="shrink-0">⚠️</span> {fieldErrors.identifier}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Mật khẩu</label>
            </div>
            <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors(prev => ({ ...prev, password: '' }));
                }}
                onBlur={handlePasswordBlur}
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
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1 animate-in fade-in duration-200">
                <span className="shrink-0">⚠️</span> {fieldErrors.password}
              </p>
            )}
            <button
              type="button"
              onClick={handleForgotPassword}
              className="absolute top-0 right-0 text-xs font-semibold text-primary hover:underline focus:outline-none cursor-pointer"
            >
              Quên mật khẩu?
            </button>
          </div>

          {/* Cloudflare Turnstile */}
          {TURNSTILE_SITE_KEY && (
            <Turnstile
              key={turnstileKey}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || (TURNSTILE_SITE_KEY ? !turnstileToken : false)}
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
              Chưa có {workspaceLabel}?{' '}
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

      {qrLogin.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Đăng nhập bằng mã QR</h3>
                <div className="mt-1 flex items-start gap-2 text-sm text-slate-500">
                  <p>
                    Vào ứng dụng Zalo Mini App ONI, bấm biểu tượng quét mã QR <span className="inline-flex translate-y-[2px] items-center text-emerald-600">
                      <QrLoginIcon size={18} />
                    </span> để tiến hành đăng nhập
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeQrLoginModal}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Đóng"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              {qrLogin.loading ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
                  <p className="text-sm text-slate-500">Đang tạo mã QR...</p>
                </div>
              ) : qrLogin.qrDataUrl ? (
                <>
                  <div className="relative mx-auto h-64 w-64">
                    <img
                      src={qrLogin.qrDataUrl}
                      alt="QR đăng nhập ONI"
                      className={`h-64 w-64 rounded-2xl bg-white p-3 shadow-sm transition-all ${qrLogin.status === 'expired' ? 'scale-[0.985] opacity-35 blur-[1px]' : ''}`}
                    />
                    {qrLogin.status === 'expired' && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/35 p-4">
                        <button
                          type="button"
                          onClick={onQrSignIn}
                          disabled={qrLogin.loading}
                          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-50 disabled:opacity-60"
                        >
                          Tạo mã mới
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">{qrLogin.requestedHost}</p>
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center" hidden={qrLogin.status === 'expired'}>
                    <p className="text-sm font-semibold text-emerald-800">
                      Mã sẽ hết hạn sau{' '}
                      <span className={`tabular-nums ${qrTimeRemainingMs <= 60_000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {qrCountdown}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="py-10 text-sm text-slate-500">Không thể hiển thị mã QR đăng nhập.</p>
              )}
            </div>

            {qrLogin.error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {qrLogin.error}
              </div>
            )}

            {qrLogin.status === 'completing' && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Đã xác nhận trên Mini App. Đang hoàn tất đăng nhập...
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeQrLoginModal}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
              {qrLogin.status !== 'expired' && (
                <button
                  type="button"
                  onClick={onQrSignIn}
                  disabled={qrLogin.loading || qrLogin.status === 'completing'}
                  className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Tạo mã mới
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AuthSplitLayout>
  );
}
