import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface DashboardShellProps {
  children: React.ReactNode;
  tenantName: string;
  shopName?: string;
  userEmail?: string;
}

export function DashboardShell({ children, tenantName, shopName, userEmail }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar tenantName={tenantName} shopName={shopName} userEmail={userEmail} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
