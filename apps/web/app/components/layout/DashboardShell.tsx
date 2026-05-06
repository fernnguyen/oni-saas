import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface DashboardShellProps {
  children: React.ReactNode;
  tenantName: string;
  shopName?: string;
  userEmail?: string;
  sidebarBasePath?: string;
  supportHref?: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
}

export function DashboardShell({
  children,
  tenantName,
  shopName,
  userEmail,
  sidebarBasePath = '/dashboard',
  supportHref = '/dashboard/support',
  tenantHref = '/dashboard/tenants',
  connectorsHref = '/dashboard/connectors',
  settingsHref = '/dashboard/settings',
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        basePath={sidebarBasePath}
        supportHref={supportHref}
        tenantHref={tenantHref}
        connectorsHref={connectorsHref}
        settingsHref={settingsHref}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar tenantName={tenantName} shopName={shopName} userEmail={userEmail} settingsHref={settingsHref} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
