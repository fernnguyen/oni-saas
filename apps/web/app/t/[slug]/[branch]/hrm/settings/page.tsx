import type { Metadata } from 'next';
import { HrmSettingsPageClient } from '@/app/components/hrm/HrmSettingsPageClient';

export const metadata: Metadata = {
  title: 'Cài đặt HRM | ONI.vn',
  description: 'Quản lý ca làm việc và trường thông tin nhân viên tùy chỉnh.',
};

/** /hrm/settings — requires hrm.settings.manage (gated by HrmLayout sidebar) */
export default function HrmSettingsPage() {
  return <HrmSettingsPageClient />;
}
