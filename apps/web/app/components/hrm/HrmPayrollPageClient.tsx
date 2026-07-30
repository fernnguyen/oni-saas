'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmPayrollPanel } from './HrmPayrollPanel';

export function HrmPayrollPageClient() {
  const { shopId } = useHrmModuleAccess();
  return <HrmPayrollPanel shopId={shopId} />;
}
