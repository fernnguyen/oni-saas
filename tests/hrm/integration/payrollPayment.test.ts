/**
 * HRM-501 — Payroll Payment Integration Tests
 *
 * Tests run on a disposable PostgreSQL database.
 * Required env vars:
 *   HRM_TEST_DATABASE_URL   — must end with _test or _ci
 *   HRM_TEST_DATABASE_DISPOSABLE=true
 *
 * Four scenarios:
 *   1. Happy path: payment succeeds, posting+cashbook+fund balance all match
 *   2. Insufficient balance: balance < total_net → full rollback
 *   3. Concurrency: two simultaneous pay requests → only one posting created
 *   4. Idempotency: retry same runId → existing posting returned, no double-deduction
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HrmInsufficientFundBalanceError,
  HrmPayrollRunStateError,
  PostgresHrmRepository,
} from '../../../packages/adapters/src/hrm/index.js';
import { assertSafeHrmTestDatabaseUrl } from '../helpers/databaseSafety.js';

const requireFromAdapters = createRequire(
  resolve(process.cwd(), 'packages/adapters/package.json'),
);
const { Pool } = requireFromAdapters('pg') as {
  Pool: new (config: {
    connectionString: string | undefined;
    max: number;
  }) => import('pg').Pool;
};

// ── Safety guard ─────────────────────────────────────────────────────────────
assertSafeHrmTestDatabaseUrl(process.env.HRM_TEST_DATABASE_URL, {
  disposableConfirmation: process.env.HRM_TEST_DATABASE_DISPOSABLE,
  productionUrls: [
    process.env.DATABASE_URL,
    process.env.LOCAL_PG_URI,
    process.env.POSTGRES_URL,
  ],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePool() {
  return new Pool({
    connectionString: process.env.HRM_TEST_DATABASE_URL,
    max: 5,
  });
}

function uid(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';
const SALARY_AMOUNT = 10_000_000; // 10M VND total_net
const FUND_INITIAL_BALANCE = 50_000_000; // 50M VND

async function setupFinalized(
  pool: import('pg').Pool,
  tenantId: string,
  branchId: string,
) {
  const runId = uid('HRMPR-');
  const itemId = uid('HRMPI-');
  const fundId = uid('FUND-TEST-');
  const cashbookId = uid('CB-SETUP-');

  // Insert payment fund with enough balance
  await pool.query(
    `
      insert into payment_funds (id, tenant_id, branch_id, name, type, current_balance, is_default, active, created_at, updated_at)
      values ($1, $2, $3, 'Quỹ kiểm thử HRM', 'cash', $4, 'TRUE', 'TRUE', now(), now())
    `,
    [fundId, tenantId, branchId, String(FUND_INITIAL_BALANCE)],
  );

  const repository = new PostgresHrmRepository(pool, { tenantId, branchId });

  // Create draft payroll run
  await repository.savePayrollRunDraft({
    id: runId,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    standardWorkDays: 26,
    expectedVersion: null,
    actorUserId: ACTOR_USER_ID,
    auditId: uid('HRMAUD-SETUP-'),
    items: [
      {
        id: itemId,
        profileId: uid('PROFILE-'),
        employeeName: 'Nhân viên kiểm thử thanh toán',
        employeeCode: 'TEST-PAY-001',
        departmentId: null,
        salaryType: 'monthly',
        baseAmount: SALARY_AMOUNT,
        workUnits: 26,
        regularPay: SALARY_AMOUNT,
        overtimePay: 0,
        allowanceTotal: 0,
        bonusTotal: 0,
        commissionTotal: 0,
        deductionTotal: 0,
        netPay: SALARY_AMOUNT,
        breakdown: {
          calculationInput: {
            salaryType: 'monthly',
            baseAmount: SALARY_AMOUNT,
            standardWorkDays: 26,
            standardWorkHoursMilli: 208_000,
            paidWorkDaysMilli: 26_000,
            workedMinutes: 12_480,
            overtimeMinutes: 0,
            overtimeMultiplierBasisPoints: 15_000,
            recurringAllowances: [],
          },
          adjustments: { additionalAllowances: [], bonuses: [], commissions: [], deductions: [] },
          lines: [],
        },
        manualNote: null,
      },
    ],
  });

  // Finalize it
  await repository.finalizePayrollRun({
    runId,
    expectedVersion: 1,
    actorUserId: ACTOR_USER_ID,
    auditId: uid('HRMAUD-FIN-'),
  });

  // Unused cashbookId — kept to match variable name convention; actual IDs generated per-test
  void cashbookId;

  return { runId, fundId, repository };
}

async function cleanup(
  pool: import('pg').Pool,
  tenantId: string,
  branchId: string,
  runIds: string[],
  fundIds: string[],
) {
  await pool.query(
    `delete from hrm_cashbook_postings where tenant_id = $1`,
    [tenantId],
  );
  await pool.query(
    `delete from hrm_audit_logs where tenant_id = $1`,
    [tenantId],
  );
  for (const runId of runIds) {
    await pool.query(`delete from hrm_payroll_items where payroll_run_id = $1`, [runId]);
  }
  await pool.query(`delete from hrm_payroll_runs where tenant_id = $1 and branch_id = $2`, [tenantId, branchId]);
  for (const fundId of fundIds) {
    await pool.query(`delete from payment_funds where id = $1`, [fundId]);
  }
  // Cleanup cashbook entries created by tests
  await pool.query(
    `delete from cashbook where tenant_id = $1`,
    [tenantId],
  );
}

// ── Test 1: Happy path ────────────────────────────────────────────────────────
test('HRM-501: thanh toán thành công — posting, cashbook và fund balance khớp', async () => {
  const pool = makePool();
  const tenantId = `HRM-PAY-HAPPY-${uid()}`;
  const branchId = `BR-HAPPY-${uid()}`;

  const { runId, fundId, repository } = await setupFinalized(pool, tenantId, branchId);

  try {
    const postingId = uid('HRMPST-');
    const cashbookTxId = uid('CB-HRM-');
    const result = await repository.payPayrollRun({
      runId,
      postingId,
      cashbookTransactionId: cashbookTxId,
      fundId,
      expectedVersion: 2, // version after finalize
      actorUserId: ACTOR_USER_ID,
      auditId: uid('HRMAUD-PAY-'),
      periodLabel: 'Bảng lương 07/2026',
    });

    // 1. Payroll run is now 'paid' with incremented version
    assert.equal(result.payrollRun.status, 'paid');
    assert.equal(result.payrollRun.version, 3);
    assert.ok(result.payrollRun.paidAt);

    // 2. Posting reference matches
    assert.equal(result.posting.id, postingId);
    assert.equal(result.posting.cashbookTransactionId, cashbookTxId);
    assert.equal(result.posting.fundId, fundId);
    assert.equal(result.posting.amount, SALARY_AMOUNT);

    // 3. Fund balance was actually deducted in DB
    const fundRow = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fundId],
    );
    const newBalance = parseFloat(fundRow.rows[0]!.current_balance);
    assert.equal(newBalance, FUND_INITIAL_BALANCE - SALARY_AMOUNT);

    // 4. Cashbook entry exists
    const cbRow = await pool.query<{ amount: string; category: string; reference_id: string }>(
      `select amount, category, reference_id from cashbook where id = $1`,
      [cashbookTxId],
    );
    assert.equal(cbRow.rows.length, 1);
    assert.equal(cbRow.rows[0]!.category, 'salary_payment');
    assert.equal(cbRow.rows[0]!.reference_id, runId);
    assert.equal(parseFloat(cbRow.rows[0]!.amount), SALARY_AMOUNT);

    // 5. Posting record exists
    const postingRow = await pool.query<{ id: string }>(
      `select id from hrm_cashbook_postings where payroll_run_id = $1`,
      [runId],
    );
    assert.equal(postingRow.rows.length, 1);
    assert.equal(postingRow.rows[0]!.id, postingId);
  } finally {
    await cleanup(pool, tenantId, branchId, [runId], [fundId]);
    await pool.end();
  }
});

// ── Test 2: Insufficient balance → full rollback ──────────────────────────────
test('HRM-501: số dư quỹ không đủ → rollback toàn bộ, không tạo phiếu chi', async () => {
  const pool = makePool();
  const tenantId = `HRM-PAY-INSUF-${uid()}`;
  const branchId = `BR-INSUF-${uid()}`;

  const { runId, fundId, repository } = await setupFinalized(pool, tenantId, branchId);

  // Drain the fund to below the required amount
  await pool.query(
    `update payment_funds set current_balance = '1000' where id = $1`,
    [fundId],
  );

  try {
    await assert.rejects(
      () =>
        repository.payPayrollRun({
          runId,
          postingId: uid('HRMPST-'),
          cashbookTransactionId: uid('CB-HRM-'),
          fundId,
          expectedVersion: 2,
          actorUserId: ACTOR_USER_ID,
          auditId: uid('HRMAUD-'),
          periodLabel: 'Bảng lương 07/2026',
        }),
      (err: unknown) => err instanceof HrmInsufficientFundBalanceError,
    );

    // Verify: fund balance unchanged (still 1000)
    const fundRow = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fundId],
    );
    assert.equal(fundRow.rows[0]!.current_balance, '1000');

    // Verify: no posting created
    const posting = await pool.query(
      `select id from hrm_cashbook_postings where payroll_run_id = $1`,
      [runId],
    );
    assert.equal(posting.rows.length, 0);

    // Verify: payroll run still finalized (not paid)
    const run = await pool.query<{ status: string }>(
      `select status from hrm_payroll_runs where id = $1`,
      [runId],
    );
    assert.equal(run.rows[0]!.status, 'finalized');

    // Verify: no cashbook entry
    const cb = await pool.query(
      `select id from cashbook where reference_id = $1 and tenant_id = $2`,
      [runId, tenantId],
    );
    assert.equal(cb.rows.length, 0);
  } finally {
    await cleanup(pool, tenantId, branchId, [runId], [fundId]);
    await pool.end();
  }
});

// ── Test 3: Concurrency — two simultaneous requests → exactly one posting ─────
test('HRM-501: hai request đồng thời → chỉ một posting và một phiếu chi', async () => {
  const pool = makePool();
  const tenantId = `HRM-PAY-CONC-${uid()}`;
  const branchId = `BR-CONC-${uid()}`;

  const { runId, fundId, repository } = await setupFinalized(pool, tenantId, branchId);

  try {
    const results = await Promise.allSettled([
      repository.payPayrollRun({
        runId,
        postingId: uid('HRMPST-A-'),
        cashbookTransactionId: uid('CB-HRM-A-'),
        fundId,
        expectedVersion: 2,
        actorUserId: ACTOR_USER_ID,
        auditId: uid('HRMAUD-A-'),
        periodLabel: 'Bảng lương 07/2026',
      }),
      repository.payPayrollRun({
        runId,
        postingId: uid('HRMPST-B-'),
        cashbookTransactionId: uid('CB-HRM-B-'),
        fundId,
        expectedVersion: 2,
        actorUserId: ACTOR_USER_ID,
        auditId: uid('HRMAUD-B-'),
        periodLabel: 'Bảng lương 07/2026',
      }),
    ]);

    // Exactly one should succeed, one should fail (or both succeed idempotently)
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // At least one must succeed
    assert.ok(successes.length >= 1, 'At least one payment must succeed');
    // Total: success + failure = 2
    assert.equal(successes.length + failures.length, 2);

    // Exactly ONE posting in DB
    const postingRows = await pool.query<{ id: string }>(
      `select id from hrm_cashbook_postings where payroll_run_id = $1`,
      [runId],
    );
    assert.equal(postingRows.rows.length, 1, 'Exactly one posting must exist');

    // Exactly ONE cashbook entry
    const cbRows = await pool.query<{ id: string }>(
      `select id from cashbook where reference_id = $1 and tenant_id = $2`,
      [runId, tenantId],
    );
    assert.equal(cbRows.rows.length, 1, 'Exactly one cashbook entry must exist');

    // Fund balance deducted exactly once
    const fundRow = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fundId],
    );
    const newBalance = parseFloat(fundRow.rows[0]!.current_balance);
    assert.equal(newBalance, FUND_INITIAL_BALANCE - SALARY_AMOUNT, 'Fund deducted exactly once');
  } finally {
    await cleanup(pool, tenantId, branchId, [runId], [fundId]);
    await pool.end();
  }
});

// ── Test 4: Idempotency — retry same runId → no second deduction ──────────────
test('HRM-501: retry request → trả kết quả idempotent, không trừ quỹ lần hai', async () => {
  const pool = makePool();
  const tenantId = `HRM-PAY-IDPT-${uid()}`;
  const branchId = `BR-IDPT-${uid()}`;

  const { runId, fundId, repository } = await setupFinalized(pool, tenantId, branchId);

  const postingId = uid('HRMPST-');
  const cashbookTxId = uid('CB-HRM-');

  try {
    // First call — should succeed
    const first = await repository.payPayrollRun({
      runId,
      postingId,
      cashbookTransactionId: cashbookTxId,
      fundId,
      expectedVersion: 2,
      actorUserId: ACTOR_USER_ID,
      auditId: uid('HRMAUD-1-'),
      periodLabel: 'Bảng lương 07/2026',
    });
    assert.equal(first.payrollRun.status, 'paid');

    // Read fund balance after first payment
    const fundAfterFirst = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fundId],
    );
    const balanceAfterFirst = parseFloat(fundAfterFirst.rows[0]!.current_balance);
    assert.equal(balanceAfterFirst, FUND_INITIAL_BALANCE - SALARY_AMOUNT);

    // Second call with different IDs — same runId, so already paid
    const second = await repository.payPayrollRun({
      runId,
      postingId: uid('HRMPST-RETRY-'),
      cashbookTransactionId: uid('CB-HRM-RETRY-'),
      fundId,
      expectedVersion: 3, // updated version after first payment
      actorUserId: ACTOR_USER_ID,
      auditId: uid('HRMAUD-2-'),
      periodLabel: 'Bảng lương 07/2026',
    });

    // Same run, same posting
    assert.equal(second.payrollRun.status, 'paid');
    assert.equal(second.posting.id, first.posting.id, 'Same posting returned on retry');

    // Fund balance unchanged after retry
    const fundAfterRetry = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fundId],
    );
    const balanceAfterRetry = parseFloat(fundAfterRetry.rows[0]!.current_balance);
    assert.equal(
      balanceAfterRetry,
      balanceAfterFirst,
      'Fund balance must NOT change on idempotent retry',
    );

    // Still exactly one posting
    const postingRows = await pool.query(
      `select id from hrm_cashbook_postings where payroll_run_id = $1`,
      [runId],
    );
    assert.equal(postingRows.rows.length, 1);
  } finally {
    await cleanup(pool, tenantId, branchId, [runId], [fundId]);
    await pool.end();
  }
});

// ── Test 5: State guard — cannot pay a draft run ──────────────────────────────
test('HRM-501: kỳ lương draft không thể thanh toán', async () => {
  const pool = makePool();
  const tenantId = `HRM-PAY-STATE-${uid()}`;
  const branchId = `BR-STATE-${uid()}`;

  const fundId = uid('FUND-STATE-');
  await pool.query(
    `
      insert into payment_funds (id, tenant_id, branch_id, name, type, current_balance, is_default, active, created_at, updated_at)
      values ($1, $2, $3, 'Quỹ state test', 'cash', '100000000', 'FALSE', 'TRUE', now(), now())
    `,
    [fundId, tenantId, branchId],
  );

  const repository = new PostgresHrmRepository(pool, { tenantId, branchId });
  const runId = uid('HRMPR-STATE-');

  await repository.savePayrollRunDraft({
    id: runId,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    standardWorkDays: 26,
    expectedVersion: null,
    actorUserId: ACTOR_USER_ID,
    auditId: uid('HRMAUD-STATE-'),
    items: [
      {
        id: uid('HRMPI-STATE-'),
        profileId: uid('PROFILE-STATE-'),
        employeeName: 'Nhân viên state test',
        employeeCode: null,
        departmentId: null,
        salaryType: 'monthly',
        baseAmount: 5_000_000,
        workUnits: 26,
        regularPay: 5_000_000,
        overtimePay: 0,
        allowanceTotal: 0,
        bonusTotal: 0,
        commissionTotal: 0,
        deductionTotal: 0,
        netPay: 5_000_000,
        breakdown: {
          calculationInput: {
            salaryType: 'monthly',
            baseAmount: 5_000_000,
            standardWorkDays: 26,
            standardWorkHoursMilli: null,
            paidWorkDaysMilli: 26_000,
            workedMinutes: 0,
            overtimeMinutes: 0,
            overtimeMultiplierBasisPoints: 10_000,
            recurringAllowances: [],
          },
          adjustments: { additionalAllowances: [], bonuses: [], commissions: [], deductions: [] },
          lines: [],
        },
        manualNote: null,
      },
    ],
  });

  try {
    await assert.rejects(
      () =>
        repository.payPayrollRun({
          runId,
          postingId: uid('HRMPST-'),
          cashbookTransactionId: uid('CB-HRM-'),
          fundId,
          expectedVersion: 1,
          actorUserId: ACTOR_USER_ID,
          auditId: uid('HRMAUD-PAY-'),
          periodLabel: 'Bảng lương 08/2026',
        }),
      (err: unknown) => err instanceof HrmPayrollRunStateError,
    );
  } finally {
    await cleanup(pool, tenantId, branchId, [runId], [fundId]);
    await pool.end();
  }
});
