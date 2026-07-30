import type { Metadata } from 'next';
import { HrmModuleLanding } from '@/app/components/hrm/HrmModuleLanding';

export const metadata: Metadata = {
  title: 'Quản lý nhân sự HRM | ONI.vn',
  description: 'Quản lý hồ sơ nhân sự, chấm công và tiền lương trên ONI.',
};

export default function HrmPage() {
  return <HrmModuleLanding />;
}
