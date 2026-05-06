'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

interface TopbarProps {
  tenantName: string;
  shopName?: string;
  userEmail?: string;
  settingsHref?: string;
}

export function Topbar({ tenantName, shopName, userEmail, settingsHref = '/dashboard/settings' }: TopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/signin';
  }

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-20 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button className="md:hidden rounded p-1.5 hover:bg-slate-100">
          <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>

        <button className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button className="relative p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">3</span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50 max-w-[180px]"
          >
            <div className="h-6 w-6 rounded-full bg-[#0268FF] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(shopName || tenantName).charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-slate-700 font-medium">{shopName || tenantName}</span>
            <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-50">
              <div className="p-3 border-b border-slate-100">
                <p className="text-xs text-slate-500">Đăng nhập với</p>
                <p className="text-sm font-medium text-slate-800 truncate">{userEmail || 'user@oni.vn'}</p>
              </div>
              <div className="p-1">
                <Link
                  href={settingsHref}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setDropdownOpen(false)}
                >
                  Cài đặt tài khoản
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
