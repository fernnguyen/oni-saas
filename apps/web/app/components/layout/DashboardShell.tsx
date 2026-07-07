'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ExpirationBanner } from './ExpirationBanner';
import { ConfirmProvider } from '@/app/components/ui/ConfirmProvider';
import { PermissionsProvider } from '@/app/components/ui/PermissionGate';
import { useNavPreference } from './useNavPreference';
import { NavHorizontal } from './NavHorizontal';
import { NavSortModal } from './NavSortModal';
import { buildNavGroups } from './nav';
import { NavModeProvider } from './NavModeContext';

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
  const [sortModalOpen, setSortModalOpen] = useState(false);

  // Build nav groups for horizontal mode
  const navGroups = useMemo(() => buildNavGroups(
    {
      basePath: sidebarBasePath,
      supportHref,
      tenantHref,
      connectorsHref,
      settingsHref,
      tenantBillingHref,
      tenantSettingsHref,
      tenantTeamHref,
      tenantRolesHref,
      context: sidebarContext,
      industryType,
      hasP2pAccess,
      planCode,
    },
    permissions,
  ), [sidebarBasePath, supportHref, tenantHref, connectorsHref, settingsHref, tenantBillingHref, tenantSettingsHref, tenantTeamHref, tenantRolesHref, sidebarContext, industryType, hasP2pAccess, planCode, permissions]);

  // Extract group labels for preference hook (exclude unlabelled groups)
  const groupLabels = useMemo(
    () => navGroups.map((g) => g.label).filter(Boolean) as string[],
    [navGroups],
  );

  const { mode, groupPrefs, setMode, setGroupPrefs, resetGroupPrefs, mounted: prefMounted } = useNavPreference(groupLabels);

  // No need to wait for prefMounted: default state is already 'horizontal'.
  // Waiting for prefMounted causes a vertical→horizontal flash on every F5.
  const isHorizontal = mode === 'horizontal' && sidebarContext === 'shop';

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

  function toggleMode() {
    setMode(mode === 'vertical' ? 'horizontal' : 'vertical');
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
            collapsed={isHorizontal ? false : collapsed}
            onToggleCollapsed={isHorizontal ? undefined : toggleCollapsed}
            basePath={sidebarBasePath}
            industryType={industryType}
            navMode={mode}
            onToggleNavMode={sidebarContext === 'shop' ? toggleMode : undefined}
            onOpenSort={sidebarContext === 'shop' ? () => setSortModalOpen(true) : undefined}
          />

          {/* Horizontal sub-nav (shop context only, desktop) */}
          {isHorizontal && (
            <NavHorizontal
              navGroups={navGroups}
              groupPrefs={groupPrefs}
              planCode={planCode}
              planName={planName}
              tenantId={tenantId}
              periodStart={periodStart}
              periodEnd={periodEnd}
              hidePlanBadge={hidePlanBadge}
              permissions={permissions}
              onOpenSort={() => setSortModalOpen(true)}
              onToggleMode={toggleMode}
            />
          )}

          <div className="flex-1 flex min-w-0 w-full">
            {/* Sidebar: hidden when horizontal mode on desktop */}
            {!isHorizontal && (
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
                onToggleMode={sidebarContext === 'shop' ? toggleMode : undefined}
                onOpenSort={sidebarContext === 'shop' ? () => setSortModalOpen(true) : undefined}
              />
            )}

            {/* Mobile drawer (always available regardless of mode) */}
            {isHorizontal && mobileNavOpen && (
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
                collapsed={false}
                hasP2pAccess={hasP2pAccess}
                mobileOnly
              />
            )}

            <main className="flex-1 min-w-0 p-4 md:p-6">
              <ExpirationBanner periodEnd={periodEnd} systemSettings={systemSettings} planCode={planCode} />
              <NavModeProvider isHorizontal={isHorizontal}>
                {children}
              </NavModeProvider>
            </main>
          </div>
        </div>

        {/* Sort/customize modal */}
        <NavSortModal
          open={sortModalOpen}
          onClose={() => setSortModalOpen(false)}
          groupPrefs={groupPrefs}
          onSave={setGroupPrefs}
          onReset={() => resetGroupPrefs(groupLabels)}
        />
      </PermissionsProvider>
    </ConfirmProvider>
  );
}
