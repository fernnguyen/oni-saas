'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthSplitLayout } from '../../components/layout/AuthSplitLayout';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

type Step = 'loading' | 'form' | 'success' | 'expired';

export function ResetPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();
  const passwordsMatch = password === confirmPassword || confirmPassword === '';
  const isValid = password.length >= 8 && password === confirmPassword;

  useEffect(() => {
    /**
     * SECURITY: Chỉ hiển thị form khi nhận được PASSWORD_RECOVERY event từ Supabase.
     *
     * KHÔNG dùng getSession() để detect — nếu admin đang logged in,
     * getSession() trả về session của admin → updateUser sẽ đổi MK của admin,
     * không phải user trong recovery link.
     *
     * Flow:
     *  - Implicit (hash):  URL chứa #access_token=...&type=recovery
     *    → Supabase JS tự detect, fire PASSWORD_RECOVERY event
     *  - PKCE (code):      URL chứa ?code=...
     *    → Gọi exchangeCodeForSession(code) → fire PASSWORD_RECOVERY event
     */
    let resolved = false;

    function resolve(nextStep: Step) {
      if (!resolved) {
        resolved = true;
        setStep(nextStep);
      }
    }

    // ── Lắng nghe auth state change ────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        // Session đúng là của user trong recovery link
        resolve('form');
      } else if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED'
      ) {
        // Bất kỳ event thông thường nào (không phải PASSWORD_RECOVERY)
        // → đây là session admin đang login, KHÔNG cho phép đổi mật khẩu
        if (!resolved) resolve('expired');
      }
      // INITIAL_SESSION → bỏ qua, chờ PASSWORD_RECOVERY
    });

    // ── PKCE flow: URL có ?code= thay vì #hash ─────────────────────
    // Supabase project settings → Auth → Auth Providers → Email có thể dùng PKCE
    if (typeof window !== 'undefined') {
      const code = new URL(window.location.href).searchParams.get('code');
      if (code) {
        supabase.auth.exchangeCodeForSession(code).catch(() => {
          resolve('expired');
        });
        // exchangeCodeForSession sẽ trigger onAuthStateChange → PASSWORD_RECOVERY
      }
    }

    // ── Timeout: nếu không nhận được event sau 10s → expired ───────
    const timeout = setTimeout(() => resolve('expired'), 10_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);

    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
      setLoading(false);
      return;
    }

    // Sign out ngay sau khi đổi mật khẩu thành công để xóa recovery session
    await supabase.auth.signOut();

    setStep('success');
    setTimeout(() => router.push('/auth/signin'), 3000);
  }

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-6">

        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-slate-500">Đang xác thực liên kết...</p>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Đặt mật khẩu mới</h1>
              <p className="text-sm text-slate-500">Chọn một mật khẩu mạnh, ít nhất 8 ký tự.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 8 ký tự"
                    required minLength={8} autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
                {password && password.length < 8 && (
                  <p className="text-xs text-amber-600">Mật khẩu cần ít nhất 8 ký tự</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  Xác nhận mật khẩu
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                  className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                    !passwordsMatch && confirmPassword
                      ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100'
                      : 'border-slate-200 bg-white focus:border-primary focus:ring-primary/20'
                  }`}
                />
                {!passwordsMatch && confirmPassword && (
                  <p className="text-xs text-red-500">Mật khẩu không khớp</p>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !isValid}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Đang lưu...
                  </>
                ) : 'Đặt mật khẩu mới'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Thành công! 🎉</h1>
              <p className="text-sm text-slate-500">Mật khẩu của bạn đã được cập nhật.</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-700 leading-relaxed">
                Mật khẩu đã được đặt lại thành công. Đang chuyển về trang đăng nhập...
              </p>
            </div>
            <Link href="/auth/signin" className="text-sm font-semibold text-primary hover:underline">
              Đăng nhập ngay
            </Link>
          </div>
        )}

        {step === 'expired' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Liên kết không hợp lệ</h1>
              <p className="text-sm text-slate-500">Link đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng.</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-amber-700 leading-relaxed">
                Link đặt lại mật khẩu chỉ có hiệu lực trong <strong>1 giờ</strong> và chỉ dùng được một lần.
                Vui lòng yêu cầu link mới.
              </p>
            </div>
            <Link href="/auth/forgot-password"
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Yêu cầu link mới
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        )}

        {step !== 'success' && (
          <Link href="/auth/signin"
            className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Quay lại đăng nhập
          </Link>
        )}
      </div>
    </AuthSplitLayout>
  );
}
