import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HrmPayrollRunStateError,
  HrmPayrollVersionConflictError,
  PostgresHrmRepository,
} from '../../../packages/adapters/src/hrm';

const requireFromAdapters = createRequire(
  resolve(process.cwd(), 'packages/adapters/package.json'),
);
const { Pool } = requireFromAdapters('pg') as {
  Pool: new (config: {
    connectionString: string | undefined;
    max: number;
  }) => import('pg').Pool;
};

test('payroll run snapshot, CAS and finalize work on disposable PostgreSQL', async () => {
  const pool = new Pool({
    connectionString: process.env.HRM_TEST_DATABASE_URL,
    max: 3,
  });
  const suffix = crypto.randomUUID();
  const tenantId = `HRM-TEST-${suffix}`;
  const branchId = `HRM-BRANCH-${suffix}`;
  const runId = `HRMPR-${suffix}`;
  const itemId = `HRMPI-${suffix}`;
  const actorUserId = '00000000-0000-4000-8000-000000000001';
  const repository = new PostgresHrmRepository(pool, { tenantId, branchId });

  try {
    const created = await repository.savePayrollRunDraft({
      id: runId,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      standardWorkDays: 26,
      expectedVersion: null,
      actorUserId,
      auditId: `AUDIT-CREATE-${suffix}`,
      items: [
        {
          id: itemId,
          profileId: `PROFILE-${suffix}`,
          employeeName: 'Nhân viên kiểm thử',
          employeeCode: 'TEST001',
          departmentId: null,
          salaryType: 'monthly',
          baseAmount: 26_000_000,
          workUnits: 1,
          regularPay: 1_000_000,
          overtimePay: 0,
          allowanceTotal: 500_000,
          bonusTotal: 0,
          commissionTotal: 0,
          deductionTotal: 0,
          netPay: 1_500_000,
          breakdown: {
            calculationInput: {
              salaryType: 'monthly',
              baseAmount: 26_000_000,
              standardWorkDays: 26,
              standardWorkHoursMilli: 208_000,
              paidWorkDaysMilli: 1_000,
              workedMinutes: 480,
              overtimeMinutes: 0,
              overtimeMultiplierBasisPoints: 15_000,
              recurringAllowances: [
                { label: 'Ăn trưa', amount: 500_000 },
              ],
            },
            adjustments: {
              additionalAllowances: [],
              bonuses: [],
              commissions: [],
              deductions: [],
            },
            lines: [],
          },
          manualNote: null,
        },
      ],
    });

    assert.equal(created.status, 'draft');
    assert.equal(created.version, 1);
    assert.equal(created.totalNet, 1_500_000);
    assert.equal(created.items.length, 1);

    await assert.rejects(
      repository.savePayrollRunDraft({
        id: runId,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        standardWorkDays: 26,
        expectedVersion: 99,
        actorUserId,
        auditId: `AUDIT-STALE-${suffix}`,
        items: [],
      }),
      (error: unknown) => error instanceof HrmPayrollVersionConflictError,
    );

    const finalized = await repository.finalizePayrollRun({
      runId,
      expectedVersion: 1,
      actorUserId,
      auditId: `AUDIT-FINALIZE-${suffix}`,
    });
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.version, 2);

    await assert.rejects(
      repository.updatePayrollItem({
        runId,
        itemId,
        expectedVersion: 2,
        actorUserId,
        auditId: `AUDIT-UPDATE-${suffix}`,
        regularPay: 1_000_000,
        overtimePay: 0,
        allowanceTotal: 500_000,
        bonusTotal: 0,
        commissionTotal: 0,
        deductionTotal: 0,
        netPay: 1_500_000,
        breakdown: finalized.items[0]!.breakdown,
        manualNote: 'Không được ghi sau chốt',
      }),
      (error: unknown) => error instanceof HrmPayrollRunStateError,
    );
  } finally {
    await pool.query(
      `delete from hrm_audit_logs where tenant_id = $1 and branch_id = $2`,
      [tenantId, branchId],
    );
    await pool.query(
      `delete from hrm_payroll_items where tenant_id = $1 and payroll_run_id = $2`,
      [tenantId, runId],
    );
    await pool.query(
      `delete from hrm_payroll_runs where tenant_id = $1 and branch_id = $2`,
      [tenantId, branchId],
    );
    await pool.end();
  }
});
