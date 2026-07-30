'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, MoreHorizontal, Settings2, LayoutPanelLeft } from 'lucide-react';
import type { NavGroup } from './nav';
import type { NavGroupPref } from './useNavPreference';
import { applyGroupPrefs } from './useNavPreference';
import { PlanBadge } from './PlanBadge';
import {
  canManageSubscription,
  requestPlanUpgrade,
} from '@/lib/subscriptions/upgradeAccess';

interface NavHorizontalProps {
  navGroups: NavGroup[];
  groupPrefs: NavGroupPref[];
  planCode?: string;
  planName?: string;
  tenantId?: string;
  periodStart?: string;
  periodEnd?: string;
  hidePlanBadge?: boolean;
  permissions?: string[];
  onOpenSort: () => void;
  onToggleMode: () => void;
}

export function NavHorizontal({
  navGroups,
  groupPrefs,
  planCode,
  planName,
  tenantId,
  periodStart,
  periodEnd,
  hidePlanBadge,
  permissions = [],
  onOpenSort,
  onToggleMode,
}: NavHorizontalProps) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowStart, setOverflowStart] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canUpgrade = canManageSubscription(permissions);

  // Ensure unlabelled group (Tổng quan) is always first, then apply prefs to the rest
  const unlabelledGroups = navGroups.filter((g) => !g.label);
  const labelledGroups = navGroups.filter((g) => !!g.label);
  const { main: labelledMain, overflow } = applyGroupPrefs(labelledGroups, groupPrefs);
  // Tổng quan always first in main
  const main = [...unlabelledGroups, ...labelledMain];

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  function groupHasActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href, item.exact));
  }

  // Measure tab widths to detect overflow
  // Reserve space for right actions area (~220px: Thêm + Settings + Toggle + PlanBadge)
  const measureOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const reservedWidth = 220;
    const containerWidth = container.offsetWidth - reservedWidth;
    let accumulated = 0;
    let cutoff: number | null = null;

    for (let i = 0; i < tabRefs.current.length; i++) {
      const el = tabRefs.current[i];
      if (!el) continue;
      accumulated += el.offsetWidth;
      if (accumulated > containerWidth && cutoff === null) {
        cutoff = i;
      }
    }
    setOverflowStart(cutoff);
  }, []);

  useEffect(() => {
    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measureOverflow, main.length]);

  // Close "Thêm" dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick() { setMoreOpen(false); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [moreOpen]);

  // Groups that overflow into "Thêm" based on measured width
  const visibleMain = overflowStart === null ? main : main.slice(0, overflowStart);
  const overflowedMain = overflowStart === null ? [] : main.slice(overflowStart);
  const allOverflow = [...overflowedMain, ...overflow];

  function renderGroupDropdown(group: NavGroup, inMore = false) {
    return (
      <div className={inMore ? 'py-1' : ''} key={group.label ?? 'unlabelled'}>
        {inMore && group.label && (
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              {group.label}
            </span>
          </div>
        )}
        {group.items.map((item) => {
          const isLocked = item.locked === true;
          const active = !isLocked && isActive(item.href, item.exact);
          const isProOnlyDisabled = item.proOnly && planCode === 'plan_mini';
          const isDisabled = isLocked || isProOnlyDisabled;
          return (
            <Link
              key={item.href}
              href={isProOnlyDisabled ? '#plan-modal' : item.href}
              onClick={(e) => {
                if (isLocked && canUpgrade) {
                  e.preventDefault();
                  requestPlanUpgrade(item.upgradeFeature ?? 'hrm');
                } else if (item.href === '#plan-modal' || isProOnlyDisabled) {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent('open-plan-modal'));
                }
                setMoreOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-md mx-1 ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : isDisabled
                  ? 'text-slate-400'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
              aria-label={isLocked ? `${item.label} — cần bật module` : item.label}
            >
              <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-slate-400'} ${isDisabled ? 'opacity-60' : ''}`} />
              <span className={`flex-1 ${isLocked ? 'opacity-80' : isProOnlyDisabled ? 'line-through decoration-slate-300 opacity-70' : ''}`}>
                {item.label}
              </span>
              {isDisabled && (
                <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .nav-h-group { position: relative; }
        .nav-h-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 210px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 32px -4px rgba(0,0,0,0.14), 0 4px 12px -2px rgba(0,0,0,0.07);
          padding: 6px 0;
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          transform: translateY(4px);
          transition: opacity 150ms ease, visibility 150ms ease, transform 150ms ease;
          pointer-events: none;
        }
        /* Invisible bridge fills the gap between the trigger button and dropdown
           so the mouse doesn't "fall through" and close the menu */
        .nav-h-dropdown::before {
          content: '';
          position: absolute;
          top: -10px;
          left: 0;
          right: 0;
          height: 10px;
        }
        .nav-h-group:hover .nav-h-dropdown {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          pointer-events: auto;
        }
      `}</style>

      {/* sticky below topbar (top-14), z-[20] = above normal content but below overlays (SlideOver z-50+) */}
      <nav
        className="hidden md:block bg-white border-b border-slate-200 sticky top-14 z-[20]"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <div
          ref={containerRef}
          className="flex items-center h-10 px-3 gap-0.5"
          style={{ overflow: 'visible' }}
        >
          {/* ── Left: Tab groups ─────────────────────────── */}
          {visibleMain.map((group, gi) => {
            // Unlabelled group (Tổng quan) — render as direct link(s), always shown first
            if (!group.label) {
              return group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <div
                    key={item.href}
                    ref={(el) => { tabRefs.current[gi] = el; }}
                    className="shrink-0"
                  >
                    <Link
                      href={item.href}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </Link>
                  </div>
                );
              });
            }

            const active = groupHasActive(group);
            const GroupIcon = group.items[0]?.icon;
            return (
              <div
                key={group.label}
                className="nav-h-group shrink-0"
                ref={(el) => { tabRefs.current[gi] = el; }}
              >
                <button
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-default ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {GroupIcon && (
                    <GroupIcon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-slate-400'}`} />
                  )}
                  {group.label}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>

                {/* Dropdown — z-index 9999 via CSS class */}
                <div className="nav-h-dropdown">
                  {renderGroupDropdown(group)}
                </div>
              </div>
            );
          })}

          {/* ── Spacer ──────────────────────────────────── */}
          <div className="flex-1 min-w-2" />

          {/* ── Right actions ───────────────────────────── */}

          {/* "Thêm" overflow button */}
          {allOverflow.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setMoreOpen((v) => !v); }}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  moreOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span>Thêm</span>
                <ChevronDown className={`h-3 w-3 opacity-50 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="max-h-[70vh] overflow-y-auto">
                    {allOverflow.map((group) => renderGroupDropdown(group, true))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 mx-1.5 shrink-0" />

          {/* Customize / sort button */}
          <button
            onClick={onOpenSort}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Tùy chỉnh menu"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {/* Switch to vertical button */}
          <button
            onClick={onToggleMode}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer shrink-0"
            title="Chuyển sang menu dọc"
          >
            <LayoutPanelLeft className="h-3.5 w-3.5" />
          </button>

          {/* Plan Badge — icon-only inline pill */}
          {!hidePlanBadge && planCode && planName && tenantId && (
            <div className="shrink-0 ml-1">
              <PlanBadge
                tenantId={tenantId}
                planCode={planCode}
                planName={planName}
                periodStart={periodStart}
                periodEnd={periodEnd}
                canUpgrade={
                  canUpgrade
                }
                inline
                iconOnly
              />
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
