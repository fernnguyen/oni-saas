import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ConfirmProvider } from '@/app/components/ui/ConfirmProvider';

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
  permissions?: string[];
  /** 'control' = org management; 'shop' = shop operations (default); 'super' = superadmin */
  sidebarContext?: 'control' | 'shop' | 'super';
}

export function DashboardShell({
  children,
  tenantName,
  shopName,
  userEmail,
  sidebarBasePath = '/dashboard',
  supportHref = '/dashboard/support',
  tenantHref,
  connectorsHref,
  settingsHref,
  permissions = [],
  sidebarContext = 'shop',
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        basePath={sidebarBasePath}
        supportHref={supportHref}
        tenantHref={tenantHref}
        connectorsHref={connectorsHref}
        settingsHref={settingsHref}
        permissions={permissions}
        context={sidebarContext}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar tenantName={tenantName} shopName={shopName} userEmail={userEmail} settingsHref={settingsHref} permissions={permissions} />
        <main className="flex-1 p-4 md:p-6">
          <ConfirmProvider>{children}</ConfirmProvider>
        </main>
      </div>
    </div>
  );
}
