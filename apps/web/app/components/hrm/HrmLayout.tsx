'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  CircleDollarSign,
  LayoutDashboard,
  LockKeyhole,
  Settings2,
  UsersRound,
} from 'lucide-react';
import { useHrmModuleAccess } from './HrmModuleAccess';
import { requestPlanUpgrade } from '@/lib/subscriptions/upgradeAccess';

interface HrmNavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  href: string;
  /** Permission required to see this section. null = only hrm.view needed */
  permission: string | null;
}

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
  permissions,
  branchSlug,
}: {
  children: React.ReactNode;
  permissions: string[];
  branchSlug: string;
}) {
  const { enabled, canUpgrade } = useHrmModuleAccess();
  const pathname = usePathname();

  // Public-facing hrm base: /{branch}/hrm
  // The internal Next.js rewrite is /t/[slug]/[branch]/hrm but links must use
  // the subdomain-facing path so the browser URL stays correct.
  const hrmBase = `/${branchSlug}/hrm`;

  // isActive: match against both rewritten (/t/.../hrm/...) and public path
  function isActive(href: string, exact = false): boolean {
    // href is like /laking/hrm/dashboard — convert to rewritten form for matching
    const rewrittenSuffix = href.replace(`/${branchSlug}`, '');
    const matchPath = pathname.endsWith(rewrittenSuffix) || pathname === href;
    if (exact) return matchPath;
    return (
      pathname.includes(`/hrm${rewrittenSuffix}`) ||
      pathname === href
    );
  }

  const navItems: HrmNavItem[] = [
    {
      key: 'dashboard',
      label: 'Tổng quan',
      icon: LayoutDashboard,
      href: `${hrmBase}/dashboard`,
      permission: null, // hrm.view — default
    },
    {
      key: 'attendance',
      label: 'Chấm công',
      icon: CalendarClock,
      href: `${hrmBase}/attendance`,
      permission: null,
    },
    {
      key: 'employees',
      label: 'Nhân viên',
      icon: UsersRound,
      href: `${hrmBase}/employees`,
      permission: null,
    },
    {
      key: 'payroll',
      label: 'Tiền lương',
      icon: CircleDollarSign,
      href: `${hrmBase}/payroll`,
      permission: 'hrm.payroll.view',
    },
    {
      key: 'settings',
      label: 'Cài đặt HRM',
      icon: Settings2,
      href: `${hrmBase}/settings`,
      permission: 'hrm.settings.manage',
    },
  ];

  // Only show items the user has permission to access
  const visibleItems = navItems.filter(
    (item) => item.permission === null || permissions.includes(item.permission),
  );

  if (!enabled) {
    return <HrmLockedScreen canUpgrade={canUpgrade} />;
  }

  return (
    <div
      className="flex min-h-0 gap-0"
      data-hrm-state="enabled"
    >
      {/* ── Left sidebar nav ─────────────────────────────────── */}
      <aside
        aria-label="Điều hướng HRM"
        className="hidden w-48 shrink-0 lg:block xl:w-52"
      >
        <nav className="sticky top-4 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
          <p className="mb-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Nhân sự
          </p>
          <ul className="space-y-0.5" role="list">
            {visibleItems.map((item) => {
              const active = isActive(
                item.href,
                item.key === 'dashboard',
              );
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/8 text-primary'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon
                      className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* ── Mobile top nav strip (< lg) ──────────────────────── */}
      <div className="mb-4 flex gap-1 overflow-x-auto lg:hidden">
        {visibleItems.map((item) => {
          const active = isActive(
            item.href,
            item.key === 'dashboard',
          );
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-primary/20 bg-primary/8 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="min-w-0 flex-1 lg:pl-5">
        {children}
      </main>
    </div>
  );
}
