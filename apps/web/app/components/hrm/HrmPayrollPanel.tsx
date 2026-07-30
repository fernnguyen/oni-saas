'use client';

import { HrmSalaryConfigsPanel } from './HrmSalaryConfigsPanel';

/**
 * HrmPayrollPanel — renders the full salary management panel.
 *
 * HrmSalaryConfigsPanel already contains sub-tabs internally:
 *   Tính lương | Cấu hình nhân viên | Nhóm lương
 *
 * Requires hrm.payroll.view — gated in HrmLayout sidebar.
 */
export function HrmPayrollPanel({ shopId }: { shopId: string }) {
  return <HrmSalaryConfigsPanel shopId={shopId} />;
}
