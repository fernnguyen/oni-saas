import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import {
  HrmPayrollVersionConflictError,
  PostgresHrmRepository,
  type SaveHrmPayrollRunDraftInput,
} from '../../../packages/adapters/src/hrm';
import {
  calculatePayrollRun,
  HrmPayrollValidationError,
} from '../../../apps/web/lib/server/hrm/payrollService';

test('payroll run list is scoped to tenant and branch', async () => {
  let queryValues: unknown[] = [];
  const pool = {
    async query(_text: string, values: unknown[]) {
      queryValues = values;
      return {
        rows: [
          {
            id: 'RUN-1',
            period_start: '2026-07-01',
            period_end: '2026-07-31',
            status: 'draft',
            standard_work_days: 26,
            total_gross: '1000000',
            total_allowances: '0',
            total_deductions: '0',
            total_net: '1000000',
            version: 1,
            calculated_at: '2026-07-31T00:00:00.000Z',
            finalized_at: null,
            paid_at: null,
            created_at: '2026-07-31T00:00:00.000Z',
            updated_at: '2026-07-31T00:00:00.000Z',
          },
        ],
      };
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
  });

  const rows = await repository.listPayrollRuns();

  assert.deepEqual(queryValues, ['tenant-1', 'branch-1']);
  assert.equal(rows[0]?.totalNet, 1_000_000);
  assert.equal(rows[0]?.status, 'draft');
});

test('payroll draft rejects stale version before replacing snapshot items', async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (/select id, status, version/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{ id: 'RUN-1', status: 'draft', version: 2 }],
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
    branchId: 'branch-1',
  });

  await assert.rejects(
    repository.savePayrollRunDraft({
      id: 'RUN-1',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      standardWorkDays: 26,
      expectedVersion: 1,
      actorUserId: '00000000-0000-4000-8000-000000000001',
      auditId: 'AUDIT-1',
      items: [],
    }),
    (error: unknown) => error instanceof HrmPayrollVersionConflictError,
  );
  assert.equal(
    statements.some((statement) =>
      /delete from hrm_payroll_items/i.test(statement),
    ),
    false,
  );
  assert.match(statements.at(-1) ?? '', /rollback/i);
});

test('payroll service calculates an immutable draft snapshot input', async () => {
  let captured: SaveHrmPayrollRunDraftInput | null = null;
  const repository = {
    async listEmployeeSalaryConfigurations() {
      return [
        {
          employeeId: 'EMP-1',
          profileId: 'PROFILE-1',
          employeeCode: 'NV001',
          employeeName: 'Nguyễn Văn A',
          departmentId: 'DEP-1',
          departmentName: 'Bán hàng',
          bankName: null,
          bankAccount: null,
          configurations: [
            {
              id: 'CONFIG-1',
              salaryType: 'monthly' as const,
              baseAmount: 26_000_000,
              standardWorkDays: 26,
              standardWorkHours: 208,
              overtimeMultiplier: 1.5,
              recurringAllowances: [{ label: 'Ăn trưa', amount: 1_000_000 }],
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ];
    },
    async listSalaryGroups() {
      return [];
    },
    async listEmployeeSalaryAssignments() {
      return [];
    },
    async listMonthlyAttendance() {
      return [
        {
          employeeId: 'EMP-1',
          status: 'present',
          workdayCount: 0.5,
          workedMinutes: 480,
          overtimeMinutes: 0,
        },
      ];
    },
    async listSalaryAdvances() {
      return [
        {
          id: 'ADV-DISBURSED',
          profileId: 'PROFILE-1',
          amount: 200_000,
          status: 'disbursed',
          isDeducted: false,
          reason: 'Tạm ứng tháng 7',
        },
        {
          id: 'ADV-APPROVED-ONLY',
          profileId: 'PROFILE-1',
          amount: 300_000,
          status: 'approved',
          isDeducted: false,
          reason: 'Chưa giải ngân',
        },
      ];
    },
    async listPayrollRuns() {
      return [];
    },
    async savePayrollRunDraft(input: SaveHrmPayrollRunDraftInput) {
      captured = input;
      return {
        id: input.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'draft' as const,
        standardWorkDays: input.standardWorkDays,
        totalGross: input.items[0]?.netPay ?? 0,
        totalAllowances: input.items[0]?.allowanceTotal ?? 0,
        totalDeductions: 0,
        totalNet: input.items[0]?.netPay ?? 0,
        version: 1,
        calculatedAt: null,
        finalizedAt: null,
        paidAt: null,
        createdAt: '',
        updatedAt: '',
        items: [],
      };
    },
  } as unknown as PostgresHrmRepository;

  await calculatePayrollRun({
    repository,
    period: '2026-07',
    standardWorkDays: 26,
    expectedVersion: null,
    actorUserId: '00000000-0000-4000-8000-000000000001',
  });

  const snapshot = captured as SaveHrmPayrollRunDraftInput | null;
  assert.ok(snapshot);
  assert.equal(snapshot.items[0]?.regularPay, 500_000);
  assert.equal(snapshot.items[0]?.allowanceTotal, 19_231);
  assert.equal(snapshot.items[0]?.deductionTotal, 200_000);
  assert.equal(snapshot.items[0]?.netPay, 319_231);
  assert.deepEqual(snapshot.items[0]?.breakdown.salaryAdvanceIds, [
    'ADV-DISBURSED',
  ]);
  assert.equal(snapshot.items[0]?.departmentId, 'DEP-1');
});

test('payroll service refuses a run when salary policy is missing', async () => {
  const repository = {
    async listEmployeeSalaryConfigurations() {
      return [
        {
          employeeId: 'EMP-1',
          profileId: 'PROFILE-1',
          employeeCode: 'NV001',
          employeeName: 'Nguyễn Văn A',
          departmentId: null,
          departmentName: null,
          bankName: null,
          bankAccount: null,
          configurations: [],
        },
      ];
    },
    async listSalaryGroups() {
      return [];
    },
    async listEmployeeSalaryAssignments() {
      return [];
    },
    async listMonthlyAttendance() {
      return [];
    },
    async listSalaryAdvances() {
      return [];
    },
    async listPayrollRuns() {
      return [];
    },
  } as unknown as PostgresHrmRepository;

  await assert.rejects(
    calculatePayrollRun({
      repository,
      period: '2026-07',
      standardWorkDays: 26,
      expectedVersion: null,
      actorUserId: '00000000-0000-4000-8000-000000000001',
    }),
    (error: unknown) => error instanceof HrmPayrollValidationError,
  );
});
