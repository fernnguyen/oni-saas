'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmEmployeesPanel } from './HrmEmployeesPanel';

export function HrmEmployeesPageClient() {
  const { shopId } = useHrmModuleAccess();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <HrmEmployeesPanel shopId={shopId} />
    </div>
  );
}
