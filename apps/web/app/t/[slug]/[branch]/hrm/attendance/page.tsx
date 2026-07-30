import type { Metadata } from 'next';
import { HrmAttendancePageClient } from '@/app/components/hrm/HrmAttendancePageClient';

export const metadata: Metadata = {
  title: 'Chấm công | HRM | ONI.vn',
  description: 'Theo dõi chấm công, ca làm và nhập dữ liệu công.',
};

/** /hrm/attendance — requires hrm.view (gated by HrmLayout) */
export default function HrmAttendancePage() {
  return <HrmAttendancePageClient />;
}
