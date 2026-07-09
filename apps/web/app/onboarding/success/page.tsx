'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { resendVerificationEmail } from './actions';

interface WorkspaceInfo {
  slug:                  string;
  email:                 string;
  workspace_url:         string;
  verification_required?: boolean;
  temp_password?:        string;
  phone_login?:          string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="ml-1 rounded p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export default function RegisterSuccessPage() {
  const router = useRouter();
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  async function handleResend() {
    if (!info) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await resendVerificationEmail(info.email, info.slug);
      setResendSuccess(true);
      toast.success('Đã gửi lại email kích hoạt!');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi gửi lại email.');
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem('oni_workspace');
    if (!raw) { router.replace('/onboarding'); return; }
    try {
      const parsed = JSON.parse(raw);
      setInfo(parsed);
      // Defer cleanup so the data survives Strict Mode double-invoke
      // sessionStorage clears naturally on tab close; manual clear on navigate away
      const handleUnload = () => sessionStorage.removeItem('oni_workspace');
      window.addEventListener('beforeunload', handleUnload);
      return () => window.removeEventListener('beforeunload', handleUnload);
    } catch {
      router.replace('/onboarding');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!info) return null;

  if (info.verification_required) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-12">
        <div className="w-full max-w-[640px] bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-10 border border-slate-100">
          <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 rounded-xl lg:hidden" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 mb-3 shadow-inner">
              <svg className="h-8 w-8 text-blue-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Xác minh Email của bạn</h1>
            <p className="mt-2 text-sm text-slate-500 max-w-sm">
              Chúng tôi đã gửi email kích hoạt hệ thống đến địa chỉ email:
              <br />
              <strong className="text-slate-800 font-semibold select-all text-base">{info.email}</strong>
            </p>
          </div>

          {/* Verification Status Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0 mt-0.5">1</div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Kiểm tra hộp thư của bạn</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                  Tìm email từ **ONI.vn** với tiêu đề xác nhận đăng ký. Hãy nhớ kiểm tra cả thư mục **Spam (Thư rác)** hoặc **Quảng cáo** nếu không thấy trong hộp thư đến.
                </p>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0 mt-0.5">2</div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Nhấp vào liên kết kích hoạt</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                  Liên kết sẽ tự động xác thực email và chuyển hướng bạn đến trang quản trị của workspace **{info.slug}.oni.vn** để bắt đầu sử dụng.
                </p>
              </div>
            </div>
          </div>

          {/* Credentials Preview Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thông tin tài khoản đã tạo</span>
              <span className="rounded bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide border border-amber-200/50">Chưa kích hoạt</span>
            </div>
            <div className="p-4 space-y-2.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Workspace:</span>
                <strong className="font-mono text-slate-800 select-all">{info.slug}.oni.vn</strong>
              </div>
              <div className="flex justify-between">
                <span>Tài khoản Admin:</span>
                <strong className="font-mono text-slate-800 select-all">{info.email}</strong>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <div className="text-center text-xs text-slate-400">
              Bạn chưa nhận được email?
            </div>
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {resending ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  Đang gửi lại...
                </>
              ) : resendSuccess ? (
                <>
                  <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Đã gửi lại thành công!
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Gửi lại email xác nhận
                </>
              )}
            </button>
            
            <Link
              href="/auth/signin"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors"
            >
              ← Quay lại Đăng nhập
            </Link>
          </div>

            <p className="text-center text-xs text-slate-400">
              Hệ thống đang chờ kích hoạt. © {new Date().getFullYear()} ONI.vn
            </p>
          </div>
        </div>
      </div>
    );
  }

  const signinUrl = `${info.workspace_url}/auth/signin`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-[640px] bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-10 border border-slate-100">
        <div className="space-y-6">
        {/* Header - matching login/register layout */}
        <div className="flex flex-col items-center text-center">
          <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 rounded-xl lg:hidden" />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-3">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Hoàn tất thiết lập!</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{info.slug}</span> đã được thiết lập thành công.
            Bạn có thể đăng nhập và bắt đầu sử dụng ngay.
          </p>
        </div>

        {/* Workspace info */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thông tin cửa hàng</span>
          </div>
          <div className="divide-y divide-slate-100">
            <InfoRow label="Tên miền" value={info.slug} mono />
            <InfoRow label="URL" value={info.workspace_url} mono link={info.workspace_url} />
            <InfoRow label="Tài khoản Admin" value={info.email} mono />
            {info.phone_login && (
              <InfoRow label="SĐT đăng nhập" value={info.phone_login} mono />
            )}
            {info.temp_password && (
              <InfoRow label="Mật khẩu tạm" value={info.temp_password} mono />
            )}
          </div>
        </div>

        {info.temp_password && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-2.5">
            <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>
              Hệ thống đã tạo mật khẩu ngẫu nhiên cho số điện thoại của bạn. Bạn có thể dùng <strong>{info.phone_login}</strong> và mật khẩu trên để đăng nhập nếu không dùng được Zalo/Google. Hãy lưu lại mật khẩu này!
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={info.workspace_url}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Truy cập cửa hàng
          </a>
          <a
            href={signinUrl}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Đăng nhập
          </a>
        </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Hệ thống được bảo mật và sẵn sàng sử dụng. © {new Date().getFullYear()} ONI.vn
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-xs text-slate-500 uppercase tracking-wider font-medium w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        {link ? (
          <a href={link} className={`text-sm text-primary hover:underline truncate ${mono ? 'font-mono' : ''}`}>{value}</a>
        ) : (
          <span className={`text-sm text-slate-800 truncate select-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}
