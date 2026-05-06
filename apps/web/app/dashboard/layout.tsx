import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../lib/server/auth';
import { DashboardShell } from '../components/layout/DashboardShell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionUserWithTenant();
  if (!ctx) redirect('/auth/signin');

  return <DashboardShell tenantName={ctx.tenant?.name ?? 'Chưa có gian hàng'}>{children}</DashboardShell>;
}
