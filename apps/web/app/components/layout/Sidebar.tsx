'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNavGroups, IconHelp } from './nav';
import { PlanBadge } from './PlanBadge';

interface SidebarProps {
  basePath?: string;
  supportHref?: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  tenantBillingHref?: string;
  tenantSettingsHref?: string;
  tenantTeamHref?: string;
  tenantRolesHref?: string;
  permissions?: string[];
  context?: 'control' | 'shop' | 'super';
  tenantId?: string;
  currentBranchSlug?: string;
  currentBranchName?: string;
  currentBranchAddress?: string | null;
  /** Controlled open state for mobile overlay */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  /** Industry type for vertical-aware nav */
  industryType?: string;
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
  hidePlanBadge?: boolean;
}

/** Fixed-position tooltip that escapes any overflow container */
function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tipY, setTipY] = useState<number | null>(null);
  const [tipX, setTipX] = useState<number>(0);

  function show() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setTipY(rect.top + rect.height / 2);
    setTipX(rect.right + 8);
  }

  function hide() {
    setTipY(null);
  }

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {tipY !== null && (
        <span
          style={{ top: tipY, left: tipX }}
          className="fixed -translate-y-1/2 rounded-md bg-slate-800 px-2 py-1 text-xs text-white whitespace-nowrap z-[200] pointer-events-none shadow-sm"
        >
          {label}
        </span>
      )}
    </div>
  );
}

function SidebarContent({
  collapsed,
  basePath,
  supportHref,
  tenantHref,
  connectorsHref,
  settingsHref,
  tenantBillingHref,
  tenantSettingsHref,
  tenantTeamHref,
  tenantRolesHref,
  permissions,
  context,
  tenantId,
  currentBranchSlug,
  currentBranchName,
  currentBranchAddress,
  industryType,
  planCode,
  planName,
  periodStart,
  periodEnd,
  hidePlanBadge,
  onToggleCollapsed,
  onClose,
}: {
  collapsed: boolean;
  basePath: string;
  supportHref: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  tenantBillingHref?: string;
  tenantSettingsHref?: string;
  tenantTeamHref?: string;
  tenantRolesHref?: string;
  permissions: string[];
  context: 'control' | 'shop' | 'super';
  tenantId?: string;
  currentBranchSlug?: string;
  currentBranchName?: string;
  currentBranchAddress?: string | null;
  industryType?: string;
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
  hidePlanBadge?: boolean;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const navGroups = buildNavGroups(
    { basePath, supportHref, tenantHref, connectorsHref, settingsHref, tenantBillingHref, tenantSettingsHref, tenantTeamHref, tenantRolesHref, context, industryType },
    permissions,
  );

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo + close button (only for mobile drawer) */}
      {onClose && (
        <div className="flex items-center px-3 py-[13px] gap-2 border-b border-slate-200">
          <Image src="/logo.png" alt="ONI Logo" width={32} height={32} className="shrink-0 rounded-lg shadow-sm" />
          <span className="font-bold text-slate-900 text-base tracking-wide flex-1 truncate">
            ONI.vn
          </span>
          {context === 'super' ? (
            <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
              SUPER
            </span>
          ) : (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
              BETA
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Branch selector removed, moved to Topbar */}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <div className="px-2 mb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                {group.label}
              </div>
            )}
            {group.label && collapsed && <div className="mb-1 h-px bg-slate-100 mx-1" />}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                const linkEl = (
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      if (item.href === '#plan-modal') {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent('open-plan-modal'));
                        if (onClose) onClose();
                        return;
                      }
                      if (onClose) onClose();
                    }}
                    className={`flex items-center rounded-md py-2 text-sm transition-colors ${
                      collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'
                    } ${
                      active
                        ? 'bg-primary text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );

                return collapsed ? (
                  <NavTooltip key={item.href} label={item.label}>
                    {linkEl}
                  </NavTooltip>
                ) : (
                  <div key={item.href}>{linkEl}</div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200">
        {!hidePlanBadge && planCode && planName && tenantId && (
          <PlanBadge
            tenantId={tenantId}
            planCode={planCode}
            planName={planName}
            periodStart={periodStart}
            periodEnd={periodEnd}
            canUpgrade={permissions.includes('settings.manage') || permissions.includes('org.manage') || permissions.includes('billing.manage')}
            collapsed={collapsed}
          />
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  basePath = '/dashboard',
  supportHref = '/dashboard/support',
  tenantHref,
  connectorsHref,
  settingsHref,
  tenantBillingHref,
  tenantSettingsHref,
  tenantTeamHref,
  tenantRolesHref,
  permissions = [],
  context = 'shop',
  tenantId,
  currentBranchSlug,
  currentBranchName,
  currentBranchAddress,
  mobileOpen = false,
  onMobileClose,
  industryType,
  planCode,
  planName,
  periodStart,
  periodEnd,
  hidePlanBadge,
  collapsed = false,
}: SidebarProps) {
  const sharedProps = {
    basePath,
    supportHref,
    tenantHref,
    connectorsHref,
    settingsHref,
    tenantBillingHref,
    tenantSettingsHref,
    tenantTeamHref,
    tenantRolesHref,
    permissions,
    context,
    tenantId,
    currentBranchSlug,
    currentBranchName,
    currentBranchAddress,
    industryType,
    planCode,
    planName,
    periodStart,
    periodEnd,
    hidePlanBadge,
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex md:flex-col bg-white border-r border-slate-200 shrink-0 overflow-hidden transition-all duration-200 sticky top-14 h-[calc(100vh-3.5rem)] ${
          collapsed ? 'md:w-[64px]' : 'md:w-[220px]'
        }`}
      >
        <SidebarContent
          {...sharedProps}
          collapsed={collapsed}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 w-[280px] bg-white z-50 flex flex-col md:hidden shadow-xl">
            <SidebarContent
              {...sharedProps}
              collapsed={false}
              onClose={onMobileClose}
            />
          </aside>
        </>
      )}
    </>
  );
}
