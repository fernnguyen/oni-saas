import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../lib/server/auth';
import { getUserPermissions } from '../../lib/server/permissions';
import { DashboardShell } from '../components/layout/DashboardShell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionUserWithTenant();
  if (!ctx) redirect('/auth/signin');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = ctx.tenant as unknown as { id: string; name: string } | null;

  const permissions = tenant
    ? await getUserPermissions(ctx.user.id, tenant.id).catch(() => [])
    : [];

  return (
    <DashboardShell
      tenantName={tenant?.name ?? ''}
      userEmail={ctx.user.email}
      permissions={permissions}
      sidebarContext="control"
      planName="Chuyên nghiệp"
    >
      {children}
    </DashboardShell>
  );
}
