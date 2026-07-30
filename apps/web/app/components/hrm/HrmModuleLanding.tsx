'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarCheck2,
  CircleDollarSign,
  LockKeyhole,
  Settings2,
  UsersRound,
  UserRoundCog,
} from 'lucide-react';
import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmEmployeesPanel } from './HrmEmployeesPanel';
import { HrmAttendancePanel } from './HrmAttendancePanel';
import { HrmCustomFieldsPanel } from './HrmCustomFieldsPanel';
import { HrmShiftsPanel } from './HrmShiftsPanel';
import { HrmSalaryConfigsPanel } from './HrmSalaryConfigsPanel';
import { requestPlanUpgrade } from '@/lib/subscriptions/upgradeAccess';

const HRM_CAPABILITIES = [
  {
    title: 'Hồ sơ nhân sự',
    description: 'Quản lý nhân viên độc lập với tài khoản đăng nhập.',
    icon: UserRoundCog,
  },
  {
    title: 'Chấm công',
    description: 'Theo dõi ca làm, ngày công và dữ liệu import.',
    icon: CalendarCheck2,
  },
  {
    title: 'Tiền lương',
    description: 'Tính lương, phụ cấp và đối soát với sổ quỹ.',
    icon: CircleDollarSign,
  },
] as const;

interface HrmOverview {
  employeeCount: number;
  presentToday: number;
  draftPayrollRuns: number | null;
}

type HrmOverviewState =
  | { status: 'loading' }
  | { status: 'ready'; data: HrmOverview }
  | { status: 'error'; code: string; message: string };

export function HrmModuleLanding() {
  const { enabled, canUpgrade, shopId } = useHrmModuleAccess();
  const pathname = usePathname();
  const branchBasePath = pathname.replace(/\/hrm(?:\/.*)?$/, '');
  const [overviewState, setOverviewState] = useState<HrmOverviewState>({
    status: 'loading',
  });
  const [activeTab, setActiveTab] = useState<
    'employees' | 'attendance' | 'shifts' | 'payroll' | 'settings'
  >('employees');

  useEffect(() => {
    if (!enabled) return;

    const abortController = new AbortController();
    setOverviewState({ status: 'loading' });

    void fetch(
      `/api/shops/${encodeURIComponent(shopId)}/hrm/overview`,
      {
        cache: 'no-store',
        signal: abortController.signal,
      },
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          ready?: boolean;
          overview?: HrmOverview;
          error?: { code?: string; message?: string };
        };

        if (!response.ok || !payload.ready || !payload.overview) {
          setOverviewState({
            status: 'error',
            code: payload.error?.code ?? 'HRM_DATA_PLANE_UNAVAILABLE',
            message: payload.error?.message ?? 'Không thể tải tổng quan HRM.',
          });
          return;
        }

        setOverviewState({ status: 'ready', data: payload.overview });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setOverviewState({
          status: 'error',
          code: 'HRM_DATA_PLANE_UNAVAILABLE',
          message: 'Không thể kết nối kho dữ liệu HRM.',
        });
      });

    return () => abortController.abort();
  }, [enabled, shopId]);

  if (!enabled) {
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

  return (
    <section
      className="space-y-6"
      data-hrm-state="enabled"
      aria-labelledby="hrm-overview-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            ONI HRM
          </p>
          <h1
            id="hrm-overview-title"
            className="mt-1 text-2xl font-bold text-slate-900"
          >
            Quản lý nhân sự
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Danh sách nhân viên và các công việc nhân sự hằng ngày.
          </p>
        </div>
        <Link
          href={`${branchBasePath}/settings/departments`}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Tạo phòng ban
        </Link>
      </div>

      {overviewState.status === 'ready' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {overviewState.data.presentToday}
              </p>
              <p className="text-xs text-slate-500">Có mặt hôm nay</p>
            </div>
          </div>

          {overviewState.data.draftPayrollRuns !== null && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {overviewState.data.draftPayrollRuns}
                </p>
                <p className="text-xs text-slate-500">Bảng lương nháp</p>
              </div>
            </div>
          )}
        </div>
      )}

      {overviewState.status === 'loading' && (
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Đang tải tổng quan">
          <div className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {overviewState.status === 'error' && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="alert"
          data-hrm-error={overviewState.code}
        >
          <div className="flex gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Chưa tải được số liệu chấm công và lương
              </p>
              <p className="mt-0.5 text-xs text-amber-900/75">
                Danh sách nhân viên bên dưới vẫn có thể sử dụng bình thường.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {[
          { key: 'employees' as const, label: 'Nhân viên', icon: UsersRound },
          { key: 'attendance' as const, label: 'Chấm công', icon: CalendarClock },
          { key: 'shifts' as const, label: 'Ca làm', icon: CalendarCheck2 },
          { key: 'payroll' as const, label: 'Tiền lương', icon: CircleDollarSign },
          { key: 'settings' as const, label: 'Trường tùy chỉnh', icon: Settings2 },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'employees' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <HrmEmployeesPanel shopId={shopId} />
        </div>
      )}
      {activeTab === 'attendance' && <HrmAttendancePanel shopId={shopId} />}
      {activeTab === 'shifts' && <HrmShiftsPanel shopId={shopId} />}
      {activeTab === 'payroll' && <HrmSalaryConfigsPanel shopId={shopId} />}
      {activeTab === 'settings' && <HrmCustomFieldsPanel shopId={shopId} />}
    </section>
  );
}
