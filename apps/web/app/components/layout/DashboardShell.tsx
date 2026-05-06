import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardShell({ children, tenantName }: { children: React.ReactNode; tenantName: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar tenantName={tenantName} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
