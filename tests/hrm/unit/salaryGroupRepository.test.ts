import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { PostgresHrmRepository } from '../../../packages/adapters/src/hrm';

test('salary groups are branch-scoped and expose assignment counts', async () => {
  let queryValues: unknown[] = [];
  const pool = {
    async query(_text: string, values: unknown[]) {
      queryValues = values;
      return {
        rows: [
          {
            id: 'HRMSG-1',
            name: 'Bán hàng',
            salary_type: 'monthly',
            base_amount: '12000000',
            standard_work_days: 26,
            standard_work_hours: '208.00',
            overtime_multiplier: '1.5000',
            recurring_allowances: [{ label: 'Ăn trưa', amount: 500000 }],
            is_default: 1,
            active: 1,
            employee_count: 3,
            created_at: '2026-07-30T00:00:00.000Z',
            updated_at: '2026-07-30T00:00:00.000Z',
          },
        ],
      };
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const result = await repository.listSalaryGroups();

  assert.deepEqual(queryValues, ['tenant-1', 'shop-1']);
  assert.equal(result[0]?.baseAmount, 12_000_000);
  assert.equal(result[0]?.isDefault, true);
  assert.equal(result[0]?.employeeCount, 3);
});

test('creating a default salary group clears the prior default atomically', async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await repository.createSalaryGroup({
    id: 'HRMSG-1',
    auditId: 'HRML-1',
    name: 'Mặc định',
    salaryType: 'monthly',
    baseAmount: 12_000_000,
    standardWorkDays: 26,
    standardWorkHours: 208,
    overtimeMultiplier: 1.5,
    recurringAllowances: [],
    isDefault: true,
    active: true,
    actorUserId: '00000000-0000-4000-8000-000000000001',
  });

  assert.match(statements[0] ?? '', /begin/i);
  assert.ok(
    statements.some(
      (statement) =>
        /update hrm_salary_groups/i.test(statement) &&
        /is_default = 0/i.test(statement),
    ),
  );
  assert.ok(
    statements.some((statement) =>
      /insert into hrm_salary_groups/i.test(statement),
    ),
  );
  assert.match(statements.at(-1) ?? '', /commit/i);
});
