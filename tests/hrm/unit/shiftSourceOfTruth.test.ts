import assert from 'node:assert/strict';
import test from 'node:test';

import { createHrmSalaryConfigSchema } from '../../../apps/web/lib/validators/hrm/salaryConfigs';

test('salary configuration does not accept a second shift assignment', () => {
  const parsed = createHrmSalaryConfigSchema.parse({
    employee_id: 'EMP-1',
    salary_type: 'monthly',
    base_amount: 10_000_000,
    standard_work_days: 26,
    standard_work_hours: 208,
    overtime_multiplier: 1.5,
    recurring_allowances: [],
    effective_from: '2026-08-01',
    shift_template_id: 'SHIFT-LEGACY',
    annual_leave_days: 12,
  });

  assert.equal('shift_template_id' in parsed, false);
});
