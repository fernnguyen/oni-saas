import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../lib/server/auth';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';
import Image from 'next/image';

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionUserWithTenant();
  if (!ctx) redirect('/auth/signin');
  return (
    <AuthSplitLayout
      title="Thiết lập thông tin cửa hàng"
      subtitle="Bổ sung thông tin chi tiết về doanh nghiệp của bạn để cá nhân hóa trải nghiệm quản lý trên ONI.vn."
      features={[
        { label: "NHANH CHÓNG", value: "3 Phút" },
        { label: "CÁ NHÂN HÓA", value: "Tùy chỉnh" },
      ]}
    >
      <div className="mb-8 text-center lg:text-left">
        <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="mb-4 mx-auto lg:mx-0 rounded-xl lg:hidden" />
        <div className="hidden lg:inline-flex items-center gap-2.5 mb-6">
          <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-slate-900 text-lg">ONI.vn</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Thiết lập hồ sơ</h1>
        <p className="mt-1 text-sm text-slate-500">Hoàn thành thông tin cửa hàng để bắt đầu</p>
      </div>

      <div className="w-full">
        {children}
      </div>
    </AuthSplitLayout>
  );
}
