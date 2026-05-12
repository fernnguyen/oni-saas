'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';
import { ConnectorStatusPill } from '../connectors/ConnectorStatusPill';
import { PlanBadge } from './PlanBadge';

interface TopbarProps {
  tenantId?: string;
  tenantName: string;
  shopName?: string;
  userEmail?: string;
  displayName?: string;
  settingsHref?: string;
  accountHref?: string;
  permissions?: string[];
  planCode?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
  onMobileMenuClick?: () => void;
}

export function Topbar({
  tenantId,
  tenantName,
  shopName,
  userEmail,
  displayName,
  settingsHref = '/dashboard/settings',
  accountHref,
  permissions = [],
  planCode,
  planName,
  periodStart,
  periodEnd,
  onMobileMenuClick,
}: TopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/signin';
  }

  const canSeeConnector =
    permissions.includes('connectors.manage') || permissions.includes('connectors.view');

  return (
    <>
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-20 gap-3">
        {/* Left: mobile menu + plan card + connector pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onMobileMenuClick}
            className="md:hidden rounded p-1.5 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Plan info card */}
          {planCode && planName && tenantId && (
            <PlanBadge
              tenantId={tenantId}
              planCode={planCode}
              planName={planName}
              periodStart={periodStart}
              periodEnd={periodEnd}
              canUpgrade={permissions.includes('settings.manage') || permissions.includes('org.manage') || permissions.includes('billing.manage')}
            />
          )}

          {/* Connector status — only shows when not connected or error */}
          {canSeeConnector && (
            <div className="hidden sm:block">
              <ConnectorStatusPill permissions={permissions} settingsHref={settingsHref} />
            </div>
          )}
        </div>

        {/* Right: actions + user menu */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Connector pill on mobile */}
          {canSeeConnector && (
            <div className="sm:hidden">
              <ConnectorStatusPill permissions={permissions} settingsHref={settingsHref} />
            </div>
          )}

          <button className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>

          <button className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <button className="relative p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">3</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50 max-w-[180px] cursor-pointer"
            >
              <div className="h-6 w-6 rounded-full bg-[#0268FF] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(displayName || userEmail || tenantName).charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-slate-700 font-medium">{displayName || userEmail || tenantName}</span>
              <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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


