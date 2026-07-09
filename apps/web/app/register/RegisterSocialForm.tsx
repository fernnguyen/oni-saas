'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';
import { toast } from 'sonner';

export function RegisterSocialForm() {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState(null);

  async function onGoogleSignIn() {
    setLoadingGoogle(true);
    setError(null);
    const rootProtocol = window.location.hostname.includes('localhost') ? 'http' : 'https';
    const rootOrigin = `${rootProtocol}://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`;
    const redirectTo = new URL('/api/auth/callback', rootOrigin);
    redirectTo.searchParams.set('next', `${window.location.origin}/api/auth/login-success?intent=register`);
    
    const supabase = getSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoadingGoogle(false);
    }
  }

  return (
    <AuthSplitLayout 
      title="Bắt đầu hành trình số hóa"
      subtitle="Thiết lập hệ thống quản lý chuyên nghiệp cho doanh nghiệp của bạn chỉ trong vài phút."
      features={[
        { label: "Nhanh chóng", value: "30 giây thiết lập" },
        { label: "Bảo mật", value: "An toàn tuyệt đối" },
      ]}
    >
      <div className="mb-8 text-center lg:text-left">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-4 lg:hidden">
          <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="rounded-xl" />
        </Link>
        <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
          <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Đăng ký tài khoản</h1>
        <p className="mt-1 text-sm text-slate-500">Sử dụng tài khoản mạng xã hội để đăng ký nhanh chóng.</p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { 
              const rootProtocol = window.location.hostname.includes('localhost') ? 'http' : 'https';
              const rootOrigin = `${rootProtocol}://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`;
              window.location.href = `${rootOrigin}/api/auth/zalo?intent=register&redirect_back=${encodeURIComponent(window.location.origin)}`; 
            }}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm"
          >
            <Image src="/partners/zalo.svg" alt="Zalo" width={18} height={18} />
            Tiếp tục với Zalo
          </button>
          
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={loadingGoogle}
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

        <p className="mt-6 text-center text-sm text-slate-500">
          Bằng việc tiếp tục, bạn đồng ý với{' '}
          <Link href="/terms" className="font-semibold text-primary hover:underline">
            Điều khoản dịch vụ
          </Link>
          {' '}và{' '}
          <Link href="/privacy" className="font-semibold text-primary hover:underline">
            Chính sách bảo mật
          </Link>
          {' '}của chúng tôi.
        </p>

        <p className="mt-8 text-center text-sm text-slate-500">
          Đã có tài khoản?{' '}
          <Link href="/auth/signin" className="font-semibold text-primary hover:underline">
            Đăng nhập ngay
          </Link>
        </p>

        <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Về trang chủ
        </Link>
      </div>
    </AuthSplitLayout>
  );
}
