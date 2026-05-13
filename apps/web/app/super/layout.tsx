import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSuperAdminUser } from '../../lib/server/auth';
import { DashboardShell } from '../components/layout/DashboardShell';

export default async function SuperLayout({ children }: { children: ReactNode }) {
  const user = await getSuperAdminUser();
  if (!user) redirect('/admin-login');

  const displayName: string =
    user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? '';

  return (
    <DashboardShell
      tenantName="Superadmin"
      userEmail={user.email}
      displayName={displayName || undefined}
      permissions={[]}
      sidebarContext="super"
      sidebarBasePath="/super"
      supportHref="/super/audit-logs"
      tenantHref="/super/tenants"
      settingsHref="/super/plans"
      accountHref="/super/account"
    >
      {children}
    </DashboardShell>
  );
}
