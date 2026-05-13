'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

interface Props {
  tenantName: string;
  tenantSlug: string;
  next: string;
}

export function TwoFactorForm({ tenantName, tenantSlug, next }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length !== 6) { setError('Vui lòng nhập đúng 6 chữ số.'); return; }
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const factor = factorsData?.totp?.find((f) => f.status === 'verified');
      if (!factor) throw new Error('Không tìm thấy thiết bị xác thực. Vui lòng đăng nhập lại.');

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: trimmed,
      });

      if (verifyError) {
        const msg =
          verifyError.message.toLowerCase().includes('invalid') ||
          verifyError.message.toLowerCase().includes('totp')
            ? 'Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.'
            : verifyError.message;
        setError(msg);
        setCode('');
        setLoading(false);
        inputRef.current?.focus();
        return;
      }

      window.location.href = next;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Xác thực thất bại.');
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/signin';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm">
            {tenantName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-slate-900">Xác thực 2 yếu tố</h1>
          <p className="mt-1 text-sm text-slate-500 font-medium">{tenantName}</p>
          <p className="mt-0.5 text-xs text-slate-400 font-mono">{tenantSlug}.oni.vn</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600 text-center mb-6">
            Nhập mã 6 chữ số từ ứng dụng Authenticator của bạn.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 text-center">
                Mã xác thực
              </label>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
                placeholder="000000"
                autoComplete="one-time-code"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-2xl font-mono tracking-[0.4em] text-center focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
            >
              {loading ? 'Đang xác thực...' : 'Xác nhận'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Không phải bạn?{' '}
          <button
            onClick={handleSignOut}
            className="text-slate-500 hover:text-slate-700 underline cursor-pointer"
          >
            Đăng xuất
          </button>
        </p>
      </div>
    </main>
  );
}
