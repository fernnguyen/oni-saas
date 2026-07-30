import type { Metadata } from 'next';
import { HrmEmployeesPageClient } from '@/app/components/hrm/HrmEmployeesPageClient';

export const metadata: Metadata = {
  title: 'Nhân viên | HRM | ONI.vn',
  description: 'Quản lý hồ sơ nhân viên, tìm kiếm và phân công phòng ban.',
};

/** /hrm/employees — requires hrm.view (gated by HrmLayout) */
export default function HrmEmployeesPage() {
  return <HrmEmployeesPageClient />;
}
