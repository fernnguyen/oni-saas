'use client';

import { useState, FormEvent } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

interface Props {
  tenantName: string;
  tenantSlug: string;
}

export function WorkspaceSignInForm({ tenantName, tenantSlug }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, tenant_slug: tenantSlug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Đăng nhập thất bại');
      }
      window.location.href = '/';
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

  const isEmail = identifier.includes('@');

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0268FF] text-white font-bold text-sm">
            {tenantName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-slate-900">Đăng nhập workspace</h1>
          <p className="mt-1 text-sm text-slate-500 font-medium">{tenantName}</p>
          <p className="mt-0.5 text-xs text-slate-400 font-mono">{tenantSlug}.oni.vn</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm space-y-4">
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

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.trim())}
                placeholder="john hoặc john@example.com"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                required
              />
              {identifier && !isEmail && (
                <p className="mt-1 text-xs text-slate-400">
                  Đăng nhập với tài khoản workspace
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20"
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#0268FF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] disabled:opacity-60 transition-colors"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Quản lý tổ chức?{' '}
          <a
            href={`http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`}
            className="text-slate-500 hover:text-slate-700 underline"
          >
            Control panel
          </a>
        </p>
      </div>
    </main>
  );
}
