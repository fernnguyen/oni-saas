import type { Metadata } from 'next';
import { HrmDashboardPanel } from '@/app/components/hrm/HrmDashboardPanel';

export const metadata: Metadata = {
  title: 'Tổng quan nhân sự | ONI.vn',
  description: 'Dashboard tổng quan nhân sự: KPI, chấm công và lương.',
};

/** /hrm/dashboard — requires hrm.view (gated by HrmLayout) */
export default function HrmDashboardPage() {
  return <HrmDashboardPanel />;
}
