'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ConfirmProvider } from '@/app/components/ui/ConfirmProvider';

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
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-slate-50 flex">
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
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex-1 min-w-0 flex flex-col">
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
            planCode={planCode}
            planName={planName}
            periodStart={periodStart}
            periodEnd={periodEnd}
            currentBranchSlug={currentBranchSlug}
            currentBranchAddress={currentBranchAddress}
            context={sidebarContext}
            onMobileMenuClick={() => setMobileNavOpen(true)}
            hidePlanBadge={hidePlanBadge}
          />
          <main className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
