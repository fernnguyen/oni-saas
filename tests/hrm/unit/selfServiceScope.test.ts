import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { PostgresHrmRepository } from '../../../packages/adapters/src/hrm';

function repositoryWithQueryRecorder() {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as unknown as Pool;

  return {
    queries,
    repository: new PostgresHrmRepository(pool, {
      tenantId: 'tenant-1',
      branchId: 'shop-1',
    }),
  };
}

function salaryAdvanceTransactionRepository() {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      if (/select a\.amount, a\.status/i.test(text)) {
        return {
          rowCount: 1,
          rows: [
            {
              amount: '1000000',
              status: 'approved',
              pay_period: '2026-08',
              reason: 'Tạm ứng',
              employee_name: 'Nguyễn Văn A',
              employee_code: 'NV001',
            },
          ],
        };
      }
      if (/select id, current_balance, type/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{ id: 'FUND-1', current_balance: '5000000', type: 'cash' }],
        };
      }
      if (/select count\(\*\)::text as n from cashbook/i.test(text)) {
        return { rowCount: 1, rows: [{ n: '0' }] };
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
  return {
    queries,
    repository: new PostgresHrmRepository(pool, {
      tenantId: 'tenant-1',
      branchId: 'shop-1',
    }),
  };
}

test('employee directory can be scoped to the linked employee in SQL', async () => {
  const { queries, repository } = repositoryWithQueryRecorder();

  await repository.listEmployees({ employeeId: 'EMP-SELF' });

  assert.deepEqual(queries[0]?.values, [
    'tenant-1',
    'shop-1',
    '',
    50,
    'EMP-SELF',
  ]);
  assert.match(queries[0]?.text ?? '', /e\.id = \$5/);
});

test('today and monthly attendance can be scoped before rows leave PostgreSQL', async () => {
  const today = repositoryWithQueryRecorder();
  await today.repository.listTodayAttendance({ employeeId: 'EMP-SELF' });
  assert.deepEqual(today.queries[0]?.values, [
    'tenant-1',
    'shop-1',
    'EMP-SELF',
  ]);
  assert.match(today.queries[0]?.text ?? '', /e\.id = \$3/);

  const monthly = repositoryWithQueryRecorder();
  await monthly.repository.listMonthlyAttendance({
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    employeeId: 'EMP-SELF',
  });
  assert.deepEqual(monthly.queries[0]?.values, [
    'tenant-1',
    'shop-1',
    '2026-08-01',
    '2026-08-31',
    null,
    'EMP-SELF',
  ]);
  assert.match(monthly.queries[0]?.text ?? '', /e\.id = \$6/);
});

test('salary advance listing returns no rows for an unlinked employee account', async () => {
  const { queries, repository } = repositoryWithQueryRecorder();

  await repository.listSalaryAdvances({
    canManage: false,
    selfProfileId: undefined,
  });

  assert.match(queries[0]?.text ?? '', /1 = 0/);
});

test('salary advance listing exposes approval and disbursement audit data safely', async () => {
  const rows = [
    {
      id: 'ADV-LEGACY',
      profile_id: 'PROFILE-1',
      employee_name: 'Nhân viên A',
      employee_code: 'NV001',
      amount: '1000000',
      request_date: '2026-08-03',
      pay_period: '2026-08',
      status: 'disbursed',
      reason: null,
      rejection_reason: null,
      approved_by: '00000000-0000-4000-8000-000000000001',
      approved_at: '2026-08-03T01:00:00.000Z',
      disbursed_by: null,
      disbursed_at: '2026-08-03T02:00:00.000Z',
      is_deducted: 0,
      created_at: '2026-08-03T00:00:00.000Z',
    },
    {
      id: 'ADV-REJECTED',
      profile_id: 'PROFILE-2',
      employee_name: 'Nhân viên B',
      employee_code: 'NV002',
      amount: '500000',
      request_date: '2026-08-03',
      pay_period: '2026-08',
      status: 'rejected',
      reason: null,
      rejection_reason: 'Không hợp lệ',
      approved_by: '00000000-0000-4000-8000-000000000002',
      approved_at: '2026-08-03T03:00:00.000Z',
      disbursed_by: null,
      disbursed_at: null,
      is_deducted: 0,
      created_at: '2026-08-03T00:00:00.000Z',
    },
  ];
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      return { rows };
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const advances = await repository.listSalaryAdvances({ canManage: true });

  assert.match(queries[0]?.text ?? '', /a\.approved_by, a\.approved_at/);
  assert.match(
    queries[0]?.text ?? '',
    /to_jsonb\(a\) ->> 'disbursed_by' as disbursed_by/,
  );
  assert.doesNotMatch(queries[0]?.text ?? '', /approved_at at time zone/);
  assert.equal(
    advances[0]?.disbursedBy,
    '00000000-0000-4000-8000-000000000001',
  );
  assert.equal(advances[1]?.approvedBy, null);
  assert.equal(advances[1]?.approvedAt, null);
});

test('manager-created salary advance is disbursed with its fund posting on insert', async () => {
  const { queries, repository } = salaryAdvanceTransactionRepository();

  const created = await repository.createSalaryAdvance({
    id: 'ADV-1',
    profileId: 'PROFILE-1',
    amount: 1_000_000,
    requestDate: '2026-08-03',
    payPeriod: '2026-08',
    reason: 'Tạo thay',
    createdBy: '00000000-0000-4000-8000-000000000001',
    autoApprove: true,
    disbursement: {
      fundId: 'FUND-1',
    },
  });

  assert.match(queries[0]?.text ?? '', /begin/i);
  assert.ok(queries.some((query) => /for update of a/i.test(query.text)));
  assert.ok(queries.some((query) => /from payment_funds[\s\S]*for update/i.test(query.text)));
  assert.ok(queries.some((query) => /insert into cashbook/i.test(query.text)));
  assert.ok(queries.some((query) => /update payment_funds/i.test(query.text)));
  assert.ok(queries.some((query) => /status = 'disbursed'/i.test(query.text)));
  assert.match(queries.at(-1)?.text ?? '', /commit/i);
  assert.match(created.cashbookTransactionId ?? '', /^CB-[A-F0-9]{8}-00001$/);
});

test('employee-created salary advance remains pending', async () => {
  const { queries, repository } = repositoryWithQueryRecorder();

  await repository.createSalaryAdvance({
    id: 'ADV-2',
    profileId: 'PROFILE-1',
    amount: 500_000,
    requestDate: '2026-08-03',
    payPeriod: '2026-08',
    createdBy: '00000000-0000-4000-8000-000000000001',
  });

  assert.equal(queries[0]?.values[8], 'pending');
  assert.equal(queries[0]?.values[9], null);
  assert.equal(queries[0]?.values[10], null);
  assert.equal(queries[0]?.values[11], null);
  assert.equal(queries[0]?.values[12], null);
  assert.equal(
    queries[0]?.values[13],
    '00000000-0000-4000-8000-000000000001',
  );
  assert.doesNotMatch(queries[0]?.text ?? '', /disbursed_by/);
});

test('manager can create an approved salary advance without a fund posting', async () => {
  const { queries, repository } = repositoryWithQueryRecorder();

  await repository.createSalaryAdvance({
    id: 'ADV-APPROVED',
    profileId: 'PROFILE-1',
    amount: 750_000,
    requestDate: '2026-08-03',
    payPeriod: '2026-08',
    createdBy: '00000000-0000-4000-8000-000000000001',
    autoApprove: true,
  });

  assert.equal(queries[0]?.values[8], 'approved');
  assert.equal(
    queries[0]?.values[9],
    '00000000-0000-4000-8000-000000000001',
  );
  assert.ok(queries[0]?.values[10] instanceof Date);
  assert.equal(queries[0]?.values[11], null);
  assert.equal(queries[0]?.values[12], null);
  assert.doesNotMatch(queries[0]?.text ?? '', /disbursed_by/);
});

test('approved salary advance can be disbursed with a selected fund', async () => {
  const { queries, repository } = salaryAdvanceTransactionRepository();

  const result = await repository.approveSalaryAdvance({
    advanceId: 'ADV-1',
    actorUserId: '00000000-0000-4000-8000-000000000001',
    fundId: 'FUND-1',
  });

  assert.ok(queries.some((query) => /status = 'disbursed'/i.test(query.text)));
  assert.ok(queries.some((query) => /disbursed_by = \$1::uuid/i.test(query.text)));
  assert.ok(queries.some((query) => /status in \('pending', 'approved'\)/i.test(query.text)));
  assert.match(result.cashbookTransactionId, /^CB-[A-F0-9]{8}-00001$/);
});

test('pending salary advance can be approved without creating a fund posting', async () => {
  const { queries, repository } = repositoryWithQueryRecorder();

  await repository.markSalaryAdvanceApproved({
    advanceId: 'ADV-3',
    actorUserId: '00000000-0000-4000-8000-000000000001',
  });

  assert.match(queries[0]?.text ?? '', /status = 'approved'/);
  assert.match(queries[0]?.text ?? '', /status = 'pending'/);
  assert.doesNotMatch(queries[0]?.text ?? '', /fund_id/);
  assert.doesNotMatch(queries[0]?.text ?? '', /cashbook_transaction_id/);
});
