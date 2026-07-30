'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  UsersRound,
} from 'lucide-react';
import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmAttendanceSummaryWidget } from './HrmAttendanceSummaryWidget';

interface HrmOverview {
  employeeCount: number;
  presentToday: number;
  draftPayrollRuns: number | null;
}

interface OverviewResponse {
  ready: boolean;
  overview?: HrmOverview;
  error?: { code: string; message: string };
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'blue' | 'emerald' | 'amber' | 'rose';
  href?: string;
}) {
  const colorMap = {
    blue: 'border-blue-100 bg-blue-50/60 text-blue-600',
    emerald: 'border-emerald-100 bg-emerald-50/60 text-emerald-600',
    amber: 'border-amber-100 bg-amber-50/60 text-amber-600',
    rose: 'border-rose-100 bg-rose-50/60 text-rose-600',
  };

  const card = (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium opacity-80">{label}</p>
        <Icon className="h-4 w-4 opacity-60" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-80">
        {card}
      </Link>
    );
  }
  return card;
}

/**
 * HrmDashboardPanel — default landing for /hrm/dashboard
 *
 * Permissions:
 *  - KPI cards: hrm.view (overview endpoint)
 *  - Tiền lương KPI: only shown if hrm.payroll.view
 *  - Bảng công: hrm.view (attendance endpoint)
 */
export function HrmDashboardPanel() {
  const { shopId, branchSlug } = useHrmModuleAccess();
  const hrmBase = `/${branchSlug}/hrm`;

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ['hrm-overview', shopId],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/overview`,
        { cache: 'no-store' },
      );
      return res.json() as Promise<OverviewResponse>;
    },
  });

  const overview = overviewQuery.data?.overview;
  const loading = overviewQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan nhân sự</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nhanh chóng kiểm tra công cán, nhân sự và lương trong ngày.
        </p>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Nhân viên đang làm"
          value={loading ? '...' : (overview?.employeeCount ?? 0)}
          icon={UsersRound}
          color="blue"
          href={`${hrmBase}/employees`}
        />
        <StatCard
          label="Có mặt hôm nay"
          value={loading ? '...' : (overview?.presentToday ?? 0)}
          icon={CalendarClock}
          color="emerald"
          href={`${hrmBase}/attendance`}
        />
        {overview?.draftPayrollRuns !== null && (
          <StatCard
            label="Kỳ lương chưa chốt"
            value={loading ? '...' : (overview?.draftPayrollRuns ?? 0)}
            icon={CircleDollarSign}
            color={
              overview && overview.draftPayrollRuns && overview.draftPayrollRuns > 0
                ? 'amber'
                : 'emerald'
            }
            href={`${hrmBase}/payroll`}
          />
        )}
      </div>

      {overviewQuery.isError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Không tải được tổng quan. Vui lòng thử lại.
        </p>
      )}

      {/* ── Bảng công tháng (compact) ─────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Bảng công tháng
            </h2>
          </div>
          <Link
            href={`${hrmBase}/attendance`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Xem đầy đủ
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="p-4">
          <HrmAttendanceSummaryWidget shopId={shopId} />
        </div>
      </div>
    </div>
  );
}
