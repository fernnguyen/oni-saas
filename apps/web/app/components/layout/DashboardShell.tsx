import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ConfirmProvider } from '@/app/components/ui/ConfirmProvider';

interface DashboardShellProps {
  children: React.ReactNode;
  tenantId?: string;
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
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
}

export function DashboardShell({
  children,
  tenantId,
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
  planCode,
  planName,
  periodStart,
  periodEnd,
}: DashboardShellProps) {
  return (
    <ConfirmProvider>
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
          <Topbar
            tenantId={tenantId}
            tenantName={tenantName}
            shopName={shopName}
            userEmail={userEmail}
            settingsHref={settingsHref}
            permissions={permissions}
            planCode={planCode}
            planName={planName}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <main className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
