'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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

export function HrmModuleLanding() {
  const { enabled, canUpgrade, shopId } = useHrmModuleAccess();
  const pathname = usePathname();
  const branchBasePath = pathname.replace(/\/hrm(?:\/.*)?$/, '');
  const [activeTab, setActiveTab] = useState<
    'employees' | 'attendance' | 'shifts' | 'payroll' | 'settings'
  >('attendance');


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
      className="space-y-4"
      data-hrm-state="enabled"
      aria-labelledby="hrm-overview-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            id="hrm-overview-title"
            className="text-xl font-bold text-slate-900"
          >
            Quản lý nhân sự
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Công cán, nhân viên, ca làm và tiền lương.
          </p>
        </div>
        <Link
          href={`${branchBasePath}/settings/departments`}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Tạo phòng ban
        </Link>
      </div>

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
