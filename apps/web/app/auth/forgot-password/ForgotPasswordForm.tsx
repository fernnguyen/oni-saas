'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Turnstile } from '../../components/auth/Turnstile';
import { AuthSplitLayout } from '../../components/layout/AuthSplitLayout';
import { isValidVNPhone } from '../../../lib/utils/phone';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Step = 'form' | 'sent';

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from SignInForm redirect
  useEffect(() => {
    const pre = searchParams.get('identifier');
    if (pre) setIdentifier(pre);
  }, [searchParams]);

  const isEmail = identifier.includes('@');
  const isPhone = !isEmail && isValidVNPhone(identifier);
  const isValid = identifier.trim().length > 0 && (isEmail || isPhone);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), turnstile_token: turnstileToken }),
      });

      // Always show success (don't reveal existence) — but catch validation errors
      if (!res.ok && res.status === 400) {
        const data = await res.json().catch(() => ({}));
        if (data.message) {
          setError(data.message);
          setTurnstileKey((k) => k + 1);
          setTurnstileToken(null);
          setLoading(false);
          return;
        }
      }

      setStep('sent');
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
      setTurnstileKey((k) => k + 1);
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {step === 'form' ? 'Quên mật khẩu?' : 'Kiểm tra email của bạn'}
          </h1>
          <p className="text-sm text-slate-500">
            {step === 'form'
              ? 'Nhập email hoặc số điện thoại để nhận hướng dẫn đặt lại mật khẩu.'
              : 'Nếu tài khoản tồn tại với thông tin này, chúng tôi đã gửi email hướng dẫn.'}
          </p>
        </div>

        {step === 'form' ? (
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Identifier input */}
            <div className="space-y-1.5">
              <label htmlFor="identifier" className="block text-sm font-medium text-slate-700">
                Email hoặc số điện thoại
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="linh@gmail.com hoặc 0901234567"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
              />
              {identifier && !isValid && (
                <p className="text-xs text-amber-600">Vui lòng nhập email hợp lệ hoặc số điện thoại Việt Nam</p>
              )}
            </div>

            {/* Turnstile */}
            {TURNSTILE_SITE_KEY && (
              <Turnstile
                key={turnstileKey}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
              />
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !isValid || (TURNSTILE_SITE_KEY ? !turnstileToken : false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang gửi...
                </>
              ) : (
                <>
                  Xác nhận
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Success state */
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-800">Email đã được gửi</p>
                <p className="text-sm text-emerald-700 leading-relaxed">
                  Kiểm tra hộp thư đến (và thư mục Spam) của bạn. Link đặt lại mật khẩu có hiệu lực trong vòng <strong>1 giờ</strong>.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Nếu bạn không nhận được email sau vài phút, hãy thử lại hoặc kiểm tra lại địa chỉ email/số điện thoại đã nhập.
            </p>

            <button
              onClick={() => { setStep('form'); setTurnstileKey((k) => k + 1); setTurnstileToken(null); }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Thử lại với thông tin khác
            </button>
          </div>
        )}

        {/* Back to login */}
        <Link
          href="/auth/signin"
          className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Quay lại đăng nhập
        </Link>
      </div>
    </AuthSplitLayout>
  );
}
