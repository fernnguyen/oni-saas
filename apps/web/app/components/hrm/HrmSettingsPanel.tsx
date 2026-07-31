'use client';

import { useState } from 'react';
import { CalendarCheck2, SlidersHorizontal, Settings2 } from 'lucide-react';
import { HrmShiftsPanel } from './HrmShiftsPanel';
import { HrmCustomFieldsPanel } from './HrmCustomFieldsPanel';
import { HrmGeneralSettingsPanel } from './HrmGeneralSettingsPanel';
import { usePermissions } from '@/app/components/ui/PermissionGate';

type SettingsTab = 'general' | 'shifts' | 'custom-fields';

const TABS: Array<{
  key: SettingsTab;
  label: string;
  icon: React.ElementType;
  permission: string;
}> = [
  {
    key: 'general',
    label: 'Cấu hình chung',
    icon: Settings2,
    permission: 'hrm.settings.manage',
  },
  {
    key: 'shifts',
    label: 'Ca làm việc',
    icon: CalendarCheck2,
    permission: 'hrm.settings.manage',
  },
  {
    key: 'custom-fields',
    label: 'Trường tùy chỉnh',
    icon: SlidersHorizontal,
    permission: 'hrm.settings.manage',
  },
];

/**
 * HrmSettingsPanel — wraps settings sub-tabs:
 *   Cấu hình chung | Ca làm việc | Trường tùy chỉnh
 *
 * Requires hrm.settings.manage — gated in HrmLayout sidebar nav.
 */
export function HrmSettingsPanel({ shopId }: { shopId: string }) {
  const { permissions } = usePermissions() ?? { permissions: [] };
  const [activeTab, setActiveTab] = useState<SettingsTab>('shifts');

  const visibleTabs = TABS.filter((tab) =>
    permissions.includes(tab.permission),
  );

  const safeTab =
    visibleTabs.find((t) => t.key === activeTab)?.key ??
    visibleTabs[0]?.key ??
    'general';

  if (visibleTabs.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <SlidersHorizontal className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Bạn không có quyền truy cập cài đặt HRM.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              safeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {safeTab === 'general' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <HrmGeneralSettingsPanel shopId={shopId} />
        </div>
      )}
      {safeTab === 'shifts' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <HrmShiftsPanel shopId={shopId} />
        </div>
      )}
      {safeTab === 'custom-fields' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <HrmCustomFieldsPanel shopId={shopId} />
        </div>
      )}
    </div>
  );
}
