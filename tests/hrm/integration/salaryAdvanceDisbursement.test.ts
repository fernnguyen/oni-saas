/**
 * Salary advance disbursement must be one PostgreSQL transaction.
 * Requires the guarded disposable HRM integration database.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HrmInsufficientFundBalanceError,
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

assertSafeHrmTestDatabaseUrl(process.env.HRM_TEST_DATABASE_URL, {
  disposableConfirmation: process.env.HRM_TEST_DATABASE_DISPOSABLE,
  productionUrls: [
    process.env.DATABASE_URL,
    process.env.LOCAL_PG_URI,
    process.env.POSTGRES_URL,
  ],
});

const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';
const ADVANCE_AMOUNT = 1_000_000;
const FUND_BALANCE = 5_000_000;

function uid(prefix: string) {
  return `${prefix}${crypto.randomUUID()}`;
}

function makePool() {
  return new Pool({
    connectionString: process.env.HRM_TEST_DATABASE_URL,
    max: 5,
  });
}

async function setup(pool: import('pg').Pool) {
  const tenantId = uid('HRM-ADV-TENANT-');
  const branchId = uid('HRM-ADV-BRANCH-');
  const employeeId = uid('EMP-');
  const profileId = uid('HRMP-');
  const fundId = uid('FUND-');
  const advanceId = uid('ADV-');

  await pool.query(
    `insert into employees (
       id, tenant_id, branch_id, employee_code, name, active, created_at, updated_at
     ) values ($1, $2, $3, 'NV-ADV', 'Nhân viên ứng lương', 'TRUE', now(), now())`,
    [employeeId, tenantId, branchId],
  );
  await pool.query(
    `insert into hrm_employee_profiles (
       id, tenant_id, branch_id, source_employee_id,
       employment_status, employment_type, custom_data, created_at, updated_at
     ) values ($1, $2, $3, $4, 'active', 'monthly', '{}'::jsonb, now(), now())`,
    [profileId, tenantId, branchId, employeeId],
  );
  await pool.query(
    `insert into payment_funds (
       id, tenant_id, branch_id, name, type, current_balance,
       is_default, active, created_at, updated_at
     ) values ($1, $2, $3, 'Quỹ ứng lương test', 'cash', $4, 'TRUE', 'TRUE', now(), now())`,
    [fundId, tenantId, branchId, String(FUND_BALANCE)],
  );

  const repository = new PostgresHrmRepository(pool, { tenantId, branchId });
  await repository.createSalaryAdvance({
    id: advanceId,
    profileId,
    amount: ADVANCE_AMOUNT,
    requestDate: '2026-08-04',
    payPeriod: '2026-08',
    reason: 'Kiểm thử transaction',
    createdBy: ACTOR_USER_ID,
    autoApprove: true,
  });

  return {
    tenantId,
    branchId,
    employeeId,
    profileId,
    fundId,
    advanceId,
    repository,
  };
}

async function cleanup(
  pool: import('pg').Pool,
  fixture: Awaited<ReturnType<typeof setup>>,
) {
  await pool.query(`delete from cashbook where tenant_id = $1`, [fixture.tenantId]);
  await pool.query(`delete from hrm_salary_advances where tenant_id = $1`, [fixture.tenantId]);
  await pool.query(`delete from payment_funds where id = $1`, [fixture.fundId]);
  await pool.query(`delete from hrm_employee_profiles where id = $1`, [fixture.profileId]);
  await pool.query(`delete from employees where id = $1`, [fixture.employeeId]);
}

test('salary advance disbursement updates advance, cashbook and fund atomically', async () => {
  const pool = makePool();
  const fixture = await setup(pool);
  try {
    const result = await fixture.repository.approveSalaryAdvance({
      advanceId: fixture.advanceId,
      actorUserId: ACTOR_USER_ID,
      fundId: fixture.fundId,
    });

    const advance = await pool.query<{
      status: string;
      cashbook_transaction_id: string;
    }>(
      `select status, cashbook_transaction_id
       from hrm_salary_advances where id = $1`,
      [fixture.advanceId],
    );
    assert.equal(advance.rows[0]?.status, 'disbursed');
    assert.equal(
      advance.rows[0]?.cashbook_transaction_id,
      result.cashbookTransactionId,
    );

    const fund = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fixture.fundId],
    );
    assert.equal(
      Number(fund.rows[0]?.current_balance),
      FUND_BALANCE - ADVANCE_AMOUNT,
    );

    const cashbook = await pool.query(
      `select id from cashbook
       where id = $1 and tenant_id = $2 and reference_id = $3`,
      [result.cashbookTransactionId, fixture.tenantId, fixture.advanceId],
    );
    assert.equal(cashbook.rowCount, 1);
  } finally {
    await cleanup(pool, fixture);
    await pool.end();
  }
});

test('insufficient advance fund balance rolls back every write', async () => {
  const pool = makePool();
  const fixture = await setup(pool);
  await pool.query(`update payment_funds set current_balance = '100' where id = $1`, [fixture.fundId]);
  try {
    await assert.rejects(
      fixture.repository.approveSalaryAdvance({
        advanceId: fixture.advanceId,
        actorUserId: ACTOR_USER_ID,
        fundId: fixture.fundId,
      }),
      (error: unknown) => error instanceof HrmInsufficientFundBalanceError,
    );
    const advance = await pool.query<{ status: string }>(
      `select status from hrm_salary_advances where id = $1`,
      [fixture.advanceId],
    );
    assert.equal(advance.rows[0]?.status, 'approved');
    const cashbook = await pool.query(
      `select id from cashbook where tenant_id = $1 and reference_id = $2`,
      [fixture.tenantId, fixture.advanceId],
    );
    assert.equal(cashbook.rowCount, 0);
  } finally {
    await cleanup(pool, fixture);
    await pool.end();
  }
});

test('concurrent advance disbursement deducts the fund exactly once', async () => {
  const pool = makePool();
  const fixture = await setup(pool);
  try {
    const results = await Promise.allSettled([
      fixture.repository.approveSalaryAdvance({
        advanceId: fixture.advanceId,
        actorUserId: ACTOR_USER_ID,
        fundId: fixture.fundId,
      }),
      fixture.repository.approveSalaryAdvance({
        advanceId: fixture.advanceId,
        actorUserId: ACTOR_USER_ID,
        fundId: fixture.fundId,
      }),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );

    const fund = await pool.query<{ current_balance: string }>(
      `select current_balance from payment_funds where id = $1`,
      [fixture.fundId],
    );
    assert.equal(
      Number(fund.rows[0]?.current_balance),
      FUND_BALANCE - ADVANCE_AMOUNT,
    );
    const cashbook = await pool.query(
      `select id from cashbook where tenant_id = $1 and reference_id = $2`,
      [fixture.tenantId, fixture.advanceId],
    );
    assert.equal(cashbook.rowCount, 1);
  } finally {
    await cleanup(pool, fixture);
    await pool.end();
  }
});
