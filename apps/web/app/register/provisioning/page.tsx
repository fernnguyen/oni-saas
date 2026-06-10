'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AuthSplitLayout } from '../../components/layout/AuthSplitLayout';

type StepState = 'pending' | 'running' | 'done' | 'error';

const STEPS = [
  { key: 'user',         label: 'Tạo tài khoản admin' },
  { key: 'workspace',    label: 'Khởi tạo hệ thống quản lý' },
  { key: 'branch',       label: 'Tạo chi nhánh cửa hàng' },
  { key: 'ready',        label: 'Hoàn tất thiết lập' },
];

const STEP_DELAYS_MS = [300, 900, 1500, 2200];

export default function ProvisioningPage() {
  const router = useRouter();
  const [steps, setSteps] = useState<StepState[]>(['pending', 'pending', 'pending', 'pending']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [workspaceUrl, setWorkspaceUrl] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const raw = sessionStorage.getItem('oni_register');
    if (!raw) { router.replace('/register'); return; }

    let data: { slug: string; name: string; email: string; password: string; plan_code?: string; invitation_code?: string };
    try { data = JSON.parse(raw); } catch { router.replace('/register'); return; }

    const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
    const proto = ROOT.startsWith('localhost') ? 'http' : 'https';
    setWorkspaceUrl(`${proto}://${data.slug}.${ROOT}`);

    // Animate first 3 steps while API call is in flight
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEP_DELAYS_MS.slice(0, 3).forEach((delay, i) => {
      timers.push(setTimeout(() => {
        setSteps((prev) => {
          const next = [...prev];
          if (i > 0) next[i - 1] = 'done';
          next[i] = 'running';
          return next;
        });
      }, delay));
    });

    // Kick off the actual API call
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body.field) {
            const fieldName = body.field === 'invitation_code' ? 'invitationCode' : body.field;
            sessionStorage.setItem('oni_register_field_errors', JSON.stringify({ [fieldName]: body.message }));
          }
          sessionStorage.setItem('oni_register_error', body.message || 'Đã xảy ra lỗi. Vui lòng thử lại.');
          throw new Error(body.message || 'Đã xảy ra lỗi. Vui lòng thử lại.');
        }
        return body as { tenant_id: string; workspace_url: string; email: string; slug: string };
      })
      .then((result) => {
        // Mark all steps done, then navigate
        timers.forEach(clearTimeout);
        setSteps(['done', 'done', 'done', 'running']);
        setTimeout(() => {
          setSteps(['done', 'done', 'done', 'done']);
          // Store result for success page (keep password for one-time display)
          sessionStorage.setItem('oni_workspace', JSON.stringify({ ...result, password: data.password }));
          sessionStorage.removeItem('oni_register');
          setTimeout(() => router.push('/register/success'), 600);
        }, 600);
      })
      .catch((err: Error) => {
        timers.forEach(clearTimeout);
        setSteps((prev) => {
          const next = [...prev];
          const runningIdx = next.findIndex((s) => s === 'running');
          if (runningIdx !== -1) next[runningIdx] = 'error';
          return next;
        });
        setErrorMsg(err.message);
      });

    return () => timers.forEach(clearTimeout);
  }, [router]);

  function handleRetry() {
    sessionStorage.removeItem('oni_workspace');
    router.replace('/register');
  }

  return (
    <AuthSplitLayout
      title="Hệ thống đang chuẩn bị"
      subtitle="Quá trình này chỉ mất vài giây. Chúng tôi đang thiết lập cơ sở dữ liệu riêng biệt và an toàn cho cửa hàng của bạn."
      features={[
        { label: "BẢO MẬT", value: "Database riêng" },
        { label: "TỐC ĐỘ", value: "Siêu tốc" },
      ]}
    >
      <div className="mb-8 text-center lg:text-left">
        <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 mx-auto lg:mx-0 rounded-xl" />
        <h1 className="text-2xl font-bold text-slate-900">Đang thiết lập cửa hàng</h1>
        <p className="mt-1 text-sm text-slate-500">Thường mất chưa đến 30 giây. Vui lòng đừng đóng trang này.</p>
      </div>

      <div className="space-y-5">
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${(steps.filter((s) => s === 'done').length / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Workspace URL */}
        {workspaceUrl && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
            <span className="text-sm text-slate-600 font-mono truncate">{workspaceUrl}</span>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center gap-3">
              <StepIcon state={steps[i]} />
              <span className={`text-sm ${
                steps[i] === 'done'    ? 'text-green-700 font-medium' :
                steps[i] === 'running' ? 'text-slate-800 font-medium' :
                steps[i] === 'error'   ? 'text-red-600 font-medium' :
                'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="space-y-3 mt-6">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMsg}
            </div>
            <button
              onClick={handleRetry}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Quay lại
            </button>
          </div>
        )}
      </div>
    </AuthSplitLayout>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100">
        <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === 'running') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary border-t-transparent animate-spin" />
    );
  }
  if (state === 'error') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100">
        <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return <div className="h-6 w-6 shrink-0 rounded-full border-2 border-slate-200" />;
}
