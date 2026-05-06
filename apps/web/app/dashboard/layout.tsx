import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../lib/server/auth';
import { getShopsForTenant } from '../../lib/server/shops';
import { DashboardShell } from '../components/layout/DashboardShell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionUserWithTenant();
  if (!ctx) redirect('/auth/signin');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = ctx.tenant as unknown as { id: string; name: string } | null;
  const shops = tenant ? await getShopsForTenant(tenant.id).catch(() => []) : [];
  const firstShop = shops[0] as any;

  return (
    <DashboardShell
      tenantName={tenant?.name ?? ''}
      shopName={firstShop?.name}
      userEmail={ctx.user.email}
    >
      {children}
    </DashboardShell>
  );
}
