import type { Metadata } from 'next';
import { HrmPayrollPageClient } from '@/app/components/hrm/HrmPayrollPageClient';

export const metadata: Metadata = {
  title: 'Tiền lương | HRM | ONI.vn',
  description: 'Tính lương, cấu hình và nhóm lương nhân viên.',
};

/** /hrm/payroll — requires hrm.payroll.view (gated by HrmLayout sidebar) */
export default function HrmPayrollPage() {
  return <HrmPayrollPageClient />;
}
