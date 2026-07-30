'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmAttendancePanel } from './HrmAttendancePanel';

/**
 * Thin client wrapper so the server page.tsx can import without using context.
 * Reads shopId from HrmModuleAccessContext (injected by branch/layout.tsx).
 */
export function HrmAttendancePageClient() {
  const { shopId } = useHrmModuleAccess();
  return <HrmAttendancePanel shopId={shopId} />;
}
