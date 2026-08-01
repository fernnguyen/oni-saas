import type { Metadata } from 'next';
import { HrmLeavesPageClient } from '@/app/components/hrm/HrmLeavesPageClient';

export const metadata: Metadata = {
  title: 'Nghỉ phép | HRM | ONI.vn',
  description: 'Quản lý đơn xin nghỉ phép, theo dõi quỹ phép và duyệt nghỉ phép nhân viên.',
};

/** /hrm/leaves — requires hrm.view (gated by HrmLayout) */
export default function HrmLeavesPage() {
  return <HrmLeavesPageClient />;
}
