import { redirect } from 'next/navigation';
import { getSuperAdminUser } from '@/lib/server/auth';
import { AccountSettingsForm } from '@/app/components/settings/AccountSettingsForm';

export default async function SuperAccountPage() {
  const user = await getSuperAdminUser();
  if (!user) redirect('/auth/signin');

  const displayName: string =
    user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? '';

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt tài khoản</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý thông tin cá nhân và bảo mật tài khoản của bạn</p>
      </div>
      <AccountSettingsForm
        initialDisplayName={displayName}
        userEmail={user.email ?? ''}
      />
    </div>
  );
}
