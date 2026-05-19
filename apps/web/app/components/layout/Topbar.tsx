'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';
import { ConnectorStatusPill } from '../connectors/ConnectorStatusPill';
import { PlanBadge } from './PlanBadge';
import { BranchSelector } from './BranchSelector';
import { CreateMenu } from './CreateMenu';
import { GlobalSearch } from './GlobalSearch';
import { AskAIPanel } from './AskAIPanel';
import { getVerticalConfig } from '@oni/core';

interface TopbarProps {
  tenantId?: string;
  tenantName: string;
  shopName?: string;
  userEmail?: string;
  displayName?: string;
  roleName?: string;
  settingsHref?: string;
  accountHref?: string;
  permissions?: string[];
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
  currentBranchSlug?: string;
  currentBranchAddress?: string | null;
  context?: 'control' | 'shop' | 'super';
  onMobileMenuClick?: () => void;
  hidePlanBadge?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  basePath?: string;
  industryType?: string;
}

export function Topbar({
  tenantId,
  tenantName,
  shopName,
  userEmail,
  displayName,
  roleName,
  settingsHref = '/dashboard/settings',
  accountHref,
  permissions = [],
  planCode,
  planName,
  periodStart,
  periodEnd,
  currentBranchSlug,
  currentBranchAddress,
  context = 'shop',
  onMobileMenuClick,
  hidePlanBadge,
  collapsed,
  onToggleCollapsed,
  basePath,
  industryType,
}: TopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const vertical = getVerticalConfig(industryType || 'retail');
  const posLabel = vertical.posLabel || 'Bán tại quầy';
  const posHref = basePath ? `${basePath}/channels/pos` : undefined;

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/signin';
  }

  const canSeeConnector =
    permissions.includes('connectors.manage') || permissions.includes('connectors.view');

  return (
    <>
      <header className="h-14 bg-white border-b border-slate-200 flex items-center sticky top-0 z-20 w-full min-w-0">
        {/* Left: Logo + Toggle (width matches Sidebar) */}
        <div className={`relative hidden md:flex items-center border-r border-slate-200 h-full shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[64px] justify-center' : 'w-[220px] px-3'
        }`}>
          {collapsed ? (
             <Image src="/logo.png" alt="ONI Logo" width={32} height={32} className="shrink-0 rounded-lg shadow-sm" />
          ) : (
             <div className="flex items-center gap-2 overflow-hidden">
                <Image src="/logo.png" alt="ONI Logo" width={32} height={32} className="shrink-0 rounded-lg shadow-sm" />
                <span className="font-bold text-slate-900 text-base tracking-wide truncate">
                  ONI.vn
                </span>
                {context === 'super' ? (
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                    SUPER
                  </span>
                ) : (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                    BETA
                  </span>
                )}
             </div>
          )}
          {/* Absolute toggle button on the border */}
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 bg-white border border-slate-200 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer z-10 shadow-sm"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                {collapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Right: Main Topbar Content */}
        <div className="flex-1 flex items-center h-full min-w-0 gap-3 px-4 md:pl-5">
          {/* Left of right section: mobile menu + Branch selector + Create Menu */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onMobileMenuClick}
              className="md:hidden rounded p-1.5 hover:bg-slate-100 cursor-pointer"
            >
              <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>


            {/* Branch selector */}
            {context === 'shop' && tenantId && currentBranchSlug && shopName && (
            <BranchSelector
              tenantId={tenantId}
              currentSlug={currentBranchSlug}
              currentName={shopName}
              currentAddress={currentBranchAddress}
              collapsed={false}
              canCreate={permissions.includes('shops.create')}
              branchLabel={vertical.branchLabel}
            />
          )}

            </div>

          {/* Middle: Global Search */}
          <div className="flex-1 hidden sm:flex justify-center px-2 sm:px-4 max-w-2xl mx-auto">
            {context === 'shop' && (
              <GlobalSearch />
            )}
          </div>

        {/* Right: actions + user menu */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Create Menu */}
          {context === 'shop' && (
            <div className="hidden sm:block">
              <CreateMenu />
            </div>
          )}
          
          {/* <AskAIPanel /> */}
          {context === 'shop' && tenantId && currentBranchSlug && posHref && (
            <Link
              href={posHref}
              className="flex items-center justify-center gap-1.5 sm:gap-2 p-1.5 sm:px-3 sm:py-1.5 text-sm font-semibold text-orange-600 bg-gradient-to-r from-orange-50 to-orange-50/20 hover:from-orange-100 hover:to-orange-50/50 border border-orange-100 rounded-lg shadow-sm transition-all"
            >
              <svg className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="hidden sm:inline-block">{posLabel}</span>
            </Link>
          )}

          {/* Connector status — only shows when not connected or error */}
          {canSeeConnector && (
            <div className="hidden sm:block">
              <ConnectorStatusPill permissions={permissions} settingsHref={settingsHref} />
            </div>
          )}
          {/* Plan info card */}
          {!hidePlanBadge && planCode && planName && tenantId && (
            <div className="hidden md:block">
              <PlanBadge
                tenantId={tenantId}
                planCode={planCode}
                planName={planName}
                periodStart={periodStart}
                periodEnd={periodEnd}
                canUpgrade={permissions.includes('settings.manage') || permissions.includes('org.manage') || permissions.includes('billing.manage')}
              />
            </div>
          )}
          {/* Connector pill on mobile - Hiding to save space on mobile */}

          {settingsHref && (
            <Link href={settingsHref} className="hidden sm:flex p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}

          <button className="hidden sm:flex relative p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">3</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg sm:border sm:border-slate-200 p-1 sm:px-2.5 sm:py-1.5 text-sm hover:bg-slate-50 sm:max-w-[180px] cursor-pointer"
            >
              <div className="h-7 w-7 sm:h-6 sm:w-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(displayName || userEmail || tenantName).charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-slate-700 font-medium hidden sm:inline-block">{displayName || userEmail || tenantName}</span>
              <svg className="h-4 w-4 text-slate-400 shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-50">
                  <div className="p-3 border-b border-slate-100">
                    <p className="text-xs text-slate-500">Đăng nhập với</p>
                    <p className="text-sm font-medium text-slate-800 truncate">{userEmail || 'user@oni.vn'}</p>
                    {roleName && (
                      <div className="mt-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        Vai trò: {roleName}
                      </div>
                    )}
                  </div>
                  <div className="p-1">
                    {accountHref && (
                      <Link
                        href={accountHref}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setDropdownOpen(false)}
                      >
                        Quản lý tài khoản
                      </Link>
                    )}
                    <button
                      onClick={() => { setDropdownOpen(false); setLogoutConfirm(true); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>

      {/* Logout confirm dialog */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 shrink-0">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-900">Đăng xuất</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500 pl-[52px]">
              Bạn có chắc muốn đăng xuất khỏi hệ thống không?
            </p>
            <div className="mt-5 flex gap-3 justify-end">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-700 font-medium"
              >
                Hủy
              </button>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 cursor-pointer font-medium"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


