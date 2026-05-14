'use client';

import { useTransition } from 'react';
import { togglePlanPushNotify } from './actions';

export function TogglePlanNotify({ planId, meta }: { planId: number; meta: any }) {
  const [isPending, startTransition] = useTransition();
  const isSharedEnabled = !!meta?.can_use_push_notify;
  const isCustomEnabled = !!meta?.can_use_custom_notify;

  return (
    <div className="flex gap-6">
      <label className="flex items-center cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={isSharedEnabled}
            disabled={isPending}
            onChange={(e) => {
              const newValue = e.target.checked;
              startTransition(() => {
                togglePlanPushNotify(planId, meta, 'can_use_push_notify', newValue);
              });
            }}
          />
          <div className={`block w-10 h-6 rounded-full transition-colors ${isSharedEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isSharedEnabled ? 'transform translate-x-4' : ''}`}></div>
        </div>
        <div className="ml-3 text-sm font-medium text-slate-700">
          Push Notify (Shared Bot)
        </div>
      </label>

      <label className="flex items-center cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={isCustomEnabled}
            disabled={isPending}
            onChange={(e) => {
              const newValue = e.target.checked;
              startTransition(() => {
                togglePlanPushNotify(planId, meta, 'can_use_custom_notify', newValue);
              });
            }}
          />
          <div className={`block w-10 h-6 rounded-full transition-colors ${isCustomEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isCustomEnabled ? 'transform translate-x-4' : ''}`}></div>
        </div>
        <div className="ml-3 text-sm font-medium text-slate-700">
          Custom Notify (Private Bot)
        </div>
      </label>
    </div>
  );
}
