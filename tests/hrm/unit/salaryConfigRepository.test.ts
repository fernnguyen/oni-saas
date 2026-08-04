import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import {
  HrmSalaryConfigConflictError,
  PostgresHrmRepository,
} from '../../../packages/adapters/src/hrm';

test('salary configuration list is branch-scoped and returns full bank account', async () => {
  let queryText = '';
  let queryValues: unknown[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      queryText = text;
      queryValues = values;
      return {
        rows: [
          {
            employee_id: 'EMP-1',
            profile_id: 'HRMP-1',
            employee_code: 'NV001',
            employee_name: 'Nguyễn Văn A',
            department_name: 'Bán hàng',
            bank_name: 'VCB',
            bank_account_ciphertext: '01234567891234',
            config_id: 'HRMSC-1',
            salary_type: 'monthly',
            base_amount: '22000000',
            standard_work_days: 22,
            standard_work_hours: '176.00',
            overtime_multiplier: '1.5000',
            recurring_allowances: [{ label: 'Ăn trưa', amount: 500000 }],
            effective_from: '2026-07-01',
            effective_to: null,
            config_created_at: '2026-07-01T00:00:00.000Z',
          },
        ],
      };
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const result = await repository.listEmployeeSalaryConfigurations();

  assert.deepEqual(queryValues, ['tenant-1', 'shop-1']);
  assert.equal(result[0]?.bankAccount, '01234567891234');
  assert.equal(result[0]?.configurations[0]?.baseAmount, 22_000_000);
  assert.match(queryText, /bank_account_ciphertext/i);
});

test('salary configuration rejects a duplicate effective date atomically', async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (/select p\.id as profile_id/i.test(text)) {
        return { rowCount: 1, rows: [{ profile_id: 'HRMP-1' }] };
      }
      if (/select id from hrm_employee_profiles/i.test(text)) {
        return { rowCount: 1, rows: [{ id: 'HRMP-1' }] };
      }
      if (/select effective_from::text/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{ effective_from: '2026-07-01' }],
        };
      }
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

  await assert.rejects(
    repository.createSalaryConfiguration({
      id: 'HRMSC-2',
      profileId: 'HRMP-1',
      auditId: 'HRML-1',
      employeeId: 'EMP-1',
      salaryType: 'monthly',
      baseAmount: 22_000_000,
      standardWorkDays: 22,
      standardWorkHours: 176,
      overtimeMultiplier: 1.5,
      recurringAllowances: [],
      effectiveFrom: '2026-07-01',
      actorUserId: '00000000-0000-4000-8000-000000000001',
    }),
    (error: unknown) => error instanceof HrmSalaryConfigConflictError,
  );
  assert.match(statements.at(-1) ?? '', /rollback/i);
});

test('salary configuration switches the employee to custom mode atomically', async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (/select p\.id as profile_id/i.test(text)) {
        return { rowCount: 1, rows: [{ profile_id: 'HRMP-1' }] };
      }
      if (/select id from hrm_employee_profiles/i.test(text)) {
        return { rowCount: 1, rows: [{ id: 'HRMP-1' }] };
      }
      if (/select effective_from::text/i.test(text)) {
        return { rowCount: 0, rows: [] };
      }
      if (/insert into hrm_salary_configs/i.test(text)) {
        return { rowCount: 1, rows: [{ id: 'HRMSC-1' }] };
      }
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

  await repository.createSalaryConfiguration({
    id: 'HRMSC-1',
    profileId: 'HRMP-1',
    assignmentId: 'HRMSA-1',
    auditId: 'HRML-1',
    employeeId: 'EMP-1',
    salaryType: 'monthly',
    baseAmount: 22_000_000,
    standardWorkDays: 22,
    standardWorkHours: 176,
    overtimeMultiplier: 1.5,
    recurringAllowances: [],
    effectiveFrom: '2026-08-01',
    actorUserId: '00000000-0000-4000-8000-000000000001',
  });

  assert.ok(
    statements.some(
      (statement) =>
        /insert into hrm_employee_salary_assignments/i.test(statement) &&
        /'custom'/i.test(statement),
    ),
  );
  assert.match(statements.at(-1) ?? '', /commit/i);
});
