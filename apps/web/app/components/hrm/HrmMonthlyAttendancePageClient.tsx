'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmMonthlyAttendancePanel } from './HrmMonthlyAttendancePanel';

export function HrmMonthlyAttendancePageClient() {
  const { shopId } = useHrmModuleAccess();
  return <HrmMonthlyAttendancePanel shopId={shopId} />;
}
