import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSuperAdminUser } from '../../lib/server/auth';
import { DashboardShell } from '../components/layout/DashboardShell';

export default async function SuperLayout({ children }: { children: ReactNode }) {
  const user = await getSuperAdminUser();
  if (!user) redirect('/auth/signin');

  return (
    <DashboardShell
      tenantName="Superadmin"
      userEmail={user.email}
      permissions={[]}
      sidebarContext="super"
      sidebarBasePath="/super"
      supportHref="/super/audit-logs"
      tenantHref="/super/tenants"
      settingsHref="/super/plans"
    >
      {children}
    </DashboardShell>
  );
}
