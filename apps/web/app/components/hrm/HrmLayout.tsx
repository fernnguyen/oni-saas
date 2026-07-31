'use client';

import { LockKeyhole, UsersRound, CalendarClock, CircleDollarSign } from 'lucide-react';
import { useHrmModuleAccess } from './HrmModuleAccess';
import { requestPlanUpgrade } from '@/lib/subscriptions/upgradeAccess';

const HRM_CAPABILITIES = [
  {
    title: 'Hồ sơ nhân sự',
    description: 'Quản lý nhân viên độc lập với tài khoản đăng nhập.',
    icon: UsersRound,
  },
  {
    title: 'Chấm công',
    description: 'Theo dõi ca làm, ngày công và dữ liệu import.',
    icon: CalendarClock,
  },
  {
    title: 'Tiền lương',
    description: 'Tính lương, phụ cấp và đối soát với sổ quỹ.',
    icon: CircleDollarSign,
  },
] as const;

function HrmLockedScreen({
  canUpgrade,
}: {
  canUpgrade: boolean;
}) {
  return (
    <section
      className="mx-auto max-w-3xl"
      data-hrm-state="locked"
      aria-labelledby="hrm-locked-title"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-amber-50 px-6 py-8 sm:px-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Module mở rộng
          </p>
          <h1
            id="hrm-locked-title"
            className="mt-2 text-2xl font-bold text-slate-900"
          >
            Quản lý nhân sự HRM
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            HRM chưa được bật cho cửa hàng này. Dữ liệu nhân sự, chấm công và
            tiền lương chưa được khởi tạo hoặc truy vấn.
          </p>
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
          {HRM_CAPABILITIES.map((capability) => (
            <div
              key={capability.title}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <capability.icon
                className="h-5 w-5 text-slate-500"
                aria-hidden="true"
              />
              <h2 className="mt-3 text-sm font-semibold text-slate-800">
                {capability.title}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {capability.description}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm text-slate-600">
            {canUpgrade
              ? 'Bạn có quyền quản lý gói dịch vụ của tenant.'
              : 'Liên hệ chủ cửa hàng để bật module HRM.'}
          </p>
          {canUpgrade && (
            <button
              type="button"
              onClick={() => requestPlanUpgrade('hrm')}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              Xem gói có HRM
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * HrmLayout — client wrapper shared by all /hrm/* sub-pages.
 *
 * Responsibilities:
 *  1. Render HrmLockedScreen if HRM module is not enabled.
 *  2. Render a left sidebar nav with permission-aware items.
 *  3. Render children (the active sub-page) in the main area.
 *
 * Permissions gating (sidebar items hidden, not errored):
 *  - Dashboard / Chấm công: hrm.view (everyone with HRM access)
 *  - Nhân viên:             hrm.view (read) — manage actions gated inside panel
 *  - Tiền lương:            hrm.payroll.view
 *  - Cài đặt:               hrm.settings.manage
 */
export function HrmLayout({
  children,
}: {
  children: React.ReactNode;
  permissions: string[];
  branchSlug: string;
}) {
  const { enabled, canUpgrade } = useHrmModuleAccess();

  if (!enabled) {
    return <HrmLockedScreen canUpgrade={canUpgrade} />;
  }

  return (
    <div data-hrm-state="enabled">
      {children}
    </div>
  );
}
