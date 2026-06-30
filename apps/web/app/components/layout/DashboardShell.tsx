'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ExpirationBanner } from './ExpirationBanner';
import { ConfirmProvider } from '@/app/components/ui/ConfirmProvider';
import { PermissionsProvider } from '@/app/components/ui/PermissionGate';

interface DashboardShellProps {
  children: React.ReactNode;
  tenantId?: string;
  tenantName: string;
  shopName?: string;
  userEmail?: string;
  displayName?: string;
  roleName?: string;
  sidebarBasePath?: string;
  supportHref?: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  tenantBillingHref?: string;
  tenantSettingsHref?: string;
  tenantTeamHref?: string;
  tenantRolesHref?: string;
  accountHref?: string;
  permissions?: string[];
  /** 'control' = org management; 'shop' = shop operations (default); 'super' = superadmin */
  sidebarContext?: 'control' | 'shop' | 'super';
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
  currentBranchSlug?: string;
  currentBranchAddress?: string | null;
  hidePlanBadge?: boolean;
  /** Industry type of the tenant for vertical-aware nav filtering */
  industryType?: string;
  hasP2pAccess?: boolean;
  systemSettings?: any;
}

export function DashboardShell({
  children,
  tenantId,
  tenantName,
  shopName,
  userEmail,
  displayName,
  roleName,
  sidebarBasePath = '/dashboard',
  supportHref = '/dashboard/support',
  tenantHref,
  connectorsHref,
  settingsHref,
  tenantBillingHref,
  tenantSettingsHref,
  tenantTeamHref,
  tenantRolesHref,
  accountHref,
  permissions = [],
  sidebarContext = 'shop',
  planCode,
  planName,
  periodStart,
  periodEnd,
  currentBranchSlug,
  currentBranchAddress,
  hidePlanBadge,
  industryType,
  hasP2pAccess,
  systemSettings,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
    setMounted(true);
  }, []);

  useEffect(() => {
    // Xóa Local DB nếu gói dịch vụ đã bị khóa/xóa
    // Thời gian ân hạn + 30 ngày hard delete
    if (periodEnd) {
      const graceDays = systemSettings?.plan_lock_grace_days ?? 3;
      const end = new Date(periodEnd).getTime();
      const now = new Date().getTime();
      const diffMs = end - now;
      const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
      
      if (diffDays <= -(graceDays + 30)) {
        import('@/lib/localDb/hydration').then((m) => {
          m.clearLocalDb().catch(console.error);
        });
      }
    }
  }, [periodEnd, systemSettings]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }

  return (
    <ConfirmProvider>
      <PermissionsProvider permissions={permissions}>
        <div className="min-h-screen bg-slate-50 flex flex-col">
          <Topbar
            tenantId={tenantId}
            tenantName={tenantName}
            shopName={shopName}
            userEmail={userEmail}
            displayName={displayName}
            roleName={roleName}
            settingsHref={settingsHref}
            accountHref={accountHref}
            permissions={permissions}
            currentBranchSlug={currentBranchSlug}
            currentBranchAddress={currentBranchAddress}
            context={sidebarContext}
            onMobileMenuClick={() => setMobileNavOpen(true)}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            basePath={sidebarBasePath}
            industryType={industryType}
          />
          <div className="flex-1 flex min-w-0 w-full">
            <Sidebar
              basePath={sidebarBasePath}
              supportHref={supportHref}
              tenantHref={tenantHref}
              connectorsHref={connectorsHref}
              settingsHref={settingsHref}
              tenantBillingHref={tenantBillingHref}
              tenantSettingsHref={tenantSettingsHref}
              tenantTeamHref={tenantTeamHref}
              tenantRolesHref={tenantRolesHref}
              permissions={permissions}
              context={sidebarContext}
              tenantId={tenantId}
              currentBranchSlug={currentBranchSlug}
              currentBranchName={shopName}
              currentBranchAddress={currentBranchAddress}
              industryType={industryType}
              planCode={planCode}
              planName={planName}
              periodStart={periodStart}
              periodEnd={periodEnd}
              hidePlanBadge={hidePlanBadge}
              mobileOpen={mobileNavOpen}
              onMobileClose={() => setMobileNavOpen(false)}
              collapsed={collapsed}
              hasP2pAccess={hasP2pAccess}
            />
            <main className="flex-1 min-w-0 p-4 md:p-6">
              <ExpirationBanner periodEnd={periodEnd} systemSettings={systemSettings} planCode={planCode} />
              {children}
            </main>
          </div>
        </div>
      </PermissionsProvider>
    </ConfirmProvider>
  );
}
