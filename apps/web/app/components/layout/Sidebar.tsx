'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNavGroups, IconHelp } from './nav';

interface SidebarProps {
  basePath?: string;
  supportHref?: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  /** Permission codes for the current user — nav items are filtered by these. */
  permissions?: string[];
  /** 'control' = org management; 'shop' = shop operations (default); 'super' = superadmin */
  context?: 'control' | 'shop' | 'super';
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
  const navGroups = buildNavGroups(
    { basePath, supportHref, tenantHref, connectorsHref, settingsHref, context },
    permissions,
  );

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden md:flex md:w-[220px] md:flex-col bg-[#0D1526] text-slate-300 shrink-0">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0268FF] text-white font-bold text-sm">O</div>
        <span className="font-bold text-white text-base tracking-wide">ONI.vn</span>
        {context === 'super' ? (
          <span className="ml-auto text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">SUPER</span>
        ) : (
          <span className="ml-auto text-[10px] bg-[#0268FF]/20 text-[#60A5FA] px-1.5 py-0.5 rounded font-medium">BETA</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-2 mb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-[#0268FF] text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <Link
          href={supportHref}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <IconHelp className="h-4 w-4 shrink-0" />
          Công cụ hỗ trợ
        </Link>
      </div>
    </aside>
  );
}
