'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmSettingsPanel } from './HrmSettingsPanel';

export function HrmSettingsPageClient() {
  const { shopId } = useHrmModuleAccess();
  return <HrmSettingsPanel shopId={shopId} />;
}
