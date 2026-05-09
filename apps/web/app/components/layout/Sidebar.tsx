'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNavGroups, IconHelp } from './nav';

interface SidebarProps {
  basePath?: string;
  supportHref?: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  permissions?: string[];
  context?: 'control' | 'shop' | 'super';
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

export function Sidebar({
  basePath = '/dashboard',
  supportHref = '/dashboard/support',
  tenantHref,
  connectorsHref,
  settingsHref,
  permissions = [],
  context = 'shop',
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = buildNavGroups(
    { basePath, supportHref, tenantHref, connectorsHref, settingsHref, context },
    permissions,
  );

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`hidden md:flex md:flex-col bg-white border-r border-slate-200 shrink-0 overflow-hidden transition-all duration-200 ${
        collapsed ? 'md:w-[64px]' : 'md:w-[220px]'
      }`}
    >
      {/* Logo + toggle */}
      <div
        className={`flex items-center border-b border-slate-200 ${
          collapsed ? 'flex-col py-3 px-2 gap-2' : 'px-3 py-[13px] gap-2'
        }`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0268FF] text-white font-bold text-sm shrink-0">
          O
        </div>
        {!collapsed && (
          <>
            <span className="font-bold text-slate-900 text-base tracking-wide flex-1 truncate">
              ONI.vn
            </span>
            {context === 'super' ? (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                SUPER
              </span>
            ) : (
              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                BETA
              </span>
            )}
          </>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>

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
                    className={`flex items-center rounded-md py-2 text-sm transition-colors ${
                      collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'
                    } ${
                      active
                        ? 'bg-[#0268FF] text-white'
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

      <div className="p-2 border-t border-slate-200">
        {collapsed ? (
          <NavTooltip label="Công cụ hỗ trợ">
            <Link
              href={supportHref}
              className="flex items-center justify-center px-2 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <IconHelp className="h-4 w-4 shrink-0" />
            </Link>
          </NavTooltip>
        ) : (
          <Link
            href={supportHref}
            className="flex items-center gap-2.5 px-2.5 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <IconHelp className="h-4 w-4 shrink-0" />
            Công cụ hỗ trợ
          </Link>
        )}
      </div>
    </aside>
  );
}
