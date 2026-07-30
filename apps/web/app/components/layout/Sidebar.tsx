'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNavGroups, IconHelp } from './nav';
import { PlanBadge } from './PlanBadge';
import { LayoutPanelTop, Settings2 } from 'lucide-react';
import {
  canManageSubscription,
  requestPlanUpgrade,
} from '@/lib/subscriptions/upgradeAccess';

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
  hasP2pAccess?: boolean;
  hrmEnabled?: boolean;
  /** Callback to toggle between vertical/horizontal nav mode */
  onToggleMode?: () => void;
  /** Callback to open nav sort/customize modal */
  onOpenSort?: () => void;
  /** When true, only renders mobile overlay (no desktop sidebar) */
  mobileOnly?: boolean;
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
  hasP2pAccess,
  hrmEnabled,
  onToggleCollapsed,
  onClose,
  onToggleMode,
  onOpenSort,
}: {
  hasP2pAccess?: boolean;
  hrmEnabled?: boolean;
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
  onToggleMode?: () => void;
  onOpenSort?: () => void;
}) {
  const pathname = usePathname();
  const navGroups = buildNavGroups(
    { basePath, supportHref, tenantHref, connectorsHref, settingsHref, tenantBillingHref, tenantSettingsHref, tenantTeamHref, tenantRolesHref, context, industryType, hasP2pAccess, planCode, hrmEnabled },
    permissions,
  );
  const canUpgrade = canManageSubscription(permissions);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});

  const toggleGroup = (index: number) => {
    setCollapsedGroups(prev => ({ ...prev, [index]: !prev[index] }));
  };

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo + close button (only for mobile drawer) */}
      {onClose && (
        <div className="flex items-center px-3 py-[13px] gap-2 border-b border-slate-200">
          <Image src="/logo.png" alt="ONI Logo" width={32} height={32} className="shrink-0 rounded-lg" />
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
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium select-none">
            {process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0-dev'}
          </span>
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
      <style>{`
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
        .sidebar-scroll:hover::-webkit-scrollbar-thumb { background: #cbd5e1; }
      `}</style>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 sidebar-scroll">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <button
                onClick={() => toggleGroup(gi)}
                className="w-full flex items-center justify-between px-2 mb-1 cursor-pointer group"
              >
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold group-hover:text-slate-600 transition-colors">
                  {group.label}
                </span>
                <svg 
                  className={`h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${collapsedGroups[gi] ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {group.label && collapsed && <div className="mb-1 h-px bg-slate-100 mx-1" />}
            <div 
              className={`space-y-0.5 overflow-hidden transition-all duration-200 ${
                !collapsed && collapsedGroups[gi] ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
              }`}
            >
              {group.items.map((item) => {
                const isLocked = item.locked === true;
                const active = !isLocked && isActive(item.href, item.exact);
                const isHighlight = item.highlight;
                const isProOnlyDisabled = item.proOnly && planCode === 'plan_mini';
                const isDisabled = isLocked || isProOnlyDisabled;
                const linkEl = (
                  <Link
                    href={isProOnlyDisabled ? '#plan-modal' : item.href}
                    onClick={(e) => {
                      if (isLocked && canUpgrade) {
                        e.preventDefault();
                        const openUpgrade = () =>
                          requestPlanUpgrade(item.upgradeFeature ?? 'hrm');

                        if (onClose) {
                          onClose();
                          window.setTimeout(openUpgrade, 0);
                        } else {
                          openUpgrade();
                        }
                        return;
                      }
                      if (item.href === '#plan-modal' || isProOnlyDisabled) {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent('open-plan-modal'));
                        if (onClose) onClose();
                        return;
                      }
                      if (onClose) onClose();
                    }}
                    className={`relative overflow-hidden flex items-center rounded-md py-2 text-sm transition-all duration-200 ${
                      collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'
                    } ${
                      active
                        ? 'bg-primary text-white font-medium shadow-sm'
                        : isHighlight
                          ? 'bg-gradient-to-r from-orange-50 to-orange-50/20 text-orange-600 hover:from-orange-100 hover:to-orange-50/50 font-medium border border-orange-100'
                          : isDisabled
                            ? 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    aria-label={isLocked ? `${item.label} — cần bật module` : item.label}
                  >
                    {isHighlight && (
                      <>
                        <div className={`absolute left-[85%] top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full transition-colors ${active ? 'bg-white/10' : 'bg-orange-500/5'}`} />
                        <div className={`absolute left-[85%] top-0 h-10 w-10 rounded-full blur-[1px] transition-colors ${active ? 'bg-white/20' : 'bg-orange-500/5'}`} />
                      </>
                    )}
                    <item.icon className={`h-4 w-4 shrink-0 relative z-10 ${isHighlight && !active ? 'text-orange-500' : ''} ${isDisabled ? 'opacity-50' : ''}`} />
                    {!collapsed && <span className={`relative z-10 flex-1 truncate ${isLocked ? 'opacity-80' : isProOnlyDisabled ? 'opacity-70 line-through decoration-slate-300' : ''}`}>{item.label}</span>}
                    {!collapsed && isDisabled && (
                      <svg className="h-3.5 w-3.5 text-amber-500 shrink-0 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                  </Link>
                );

                return collapsed ? (
                  <NavTooltip key={item.href} label={isLocked ? `${item.label} — cần bật module HRM` : item.label}>
                    {linkEl}
                  </NavTooltip>
                ) : (
                  <div key={item.href}>{linkEl}</div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Quick action row — inside nav block, bottom-aligned */}
        {(onToggleMode || onOpenSort) && (
          <div className={`mt-1 pt-2 border-t border-slate-100 flex items-center gap-0 px-2 ${
            collapsed ? 'justify-center' : 'justify-center'
          }`}>
            {onOpenSort && (
              <button
                onClick={onOpenSort}
                className="flex items-center justify-center h-6 w-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tùy chỉnh menu"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onToggleMode && (
              <button
                onClick={onToggleMode}
                className="flex items-center gap-1 px-1.5 h-6 rounded-md text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                title="Chuyển sang menu ngang"
              >
                <LayoutPanelTop className="h-3.5 w-3.5 shrink-0" />
               
              </button>
            )}
          </div>
        )}
      </nav>

      <div className="p-1 border-t border-slate-200 flex flex-col gap-1 items-center">
        {!hidePlanBadge && planCode && planName && tenantId && (
          <PlanBadge
            tenantId={tenantId}
            planCode={planCode}
            planName={planName}
            periodStart={periodStart}
            periodEnd={periodEnd}
            canUpgrade={canUpgrade}
            collapsed={collapsed}
          />
        )}
        {collapsed && (
          <div className="text-[9px] text-slate-400 font-semibold select-none mt-1.5 mb-1 px-1 text-center truncate w-full transition-all duration-200">
            <span title={`Phiên bản: ${process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0-dev'}`}>
              {(process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0-dev').split('-')[0]}
            </span>
          </div>
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
  hasP2pAccess,
  hrmEnabled,
  onToggleMode,
  onOpenSort,
  mobileOnly = false,
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
    hasP2pAccess,
    hrmEnabled,
    onToggleMode,
    onOpenSort,
  };

  return (
    <>
      {/* Desktop sidebar — hidden when mobileOnly */}
      {!mobileOnly && (
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
      )}

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
