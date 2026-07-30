import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import {
  HrmSchemaNotReadyError,
  PostgresHrmRepository,
  type CreatePostgresHrmRepositoryInput,
} from '../../../packages/adapters/src/hrm';
import {
  HrmAccessError,
  authorizeHrmControlPlane,
  requireHrmAccess,
  type HrmAccessDependencies,
} from '../../../apps/web/lib/server/hrm/access';

const repository = {} as PostgresHrmRepository;

function createDependencies(
  overrides: Partial<HrmAccessDependencies> = {},
): HrmAccessDependencies {
  return {
    async getAuthenticatedUserId() {
      return 'user-1';
    },
    async getShop(shopId) {
      return { id: shopId, tenant_id: 'tenant-1' };
    },
    async hasShopAccess() {
      return true;
    },
    async getPermissions() {
      return ['hrm.view'];
    },
    async isHrmEnabled() {
      return true;
    },
    async getConnectorMetadata() {
      return {
        type: 'postgres_remote',
        config: { connection_uri: 'postgresql://test-only' },
      };
    },
    async createRepository() {
      return repository;
    },
    ...overrides,
  };
}

test('access: disabled tenant never reads connector metadata', async () => {
  let connectorReads = 0;
  const dependencies = createDependencies({
    async isHrmEnabled() {
      return false;
    },
    async getConnectorMetadata() {
      connectorReads += 1;
      return null;
    },
  });

  await assert.rejects(
    requireHrmAccess('shop-1', 'hrm.view', dependencies),
    (error: unknown) =>
      error instanceof HrmAccessError &&
      error.status === 402 &&
      error.code === 'HRM_MODULE_NOT_ENABLED',
  );
  assert.equal(connectorReads, 0);
});

test('access: permission is checked before entitlement and data plane', async () => {
  let entitlementReads = 0;
  let connectorReads = 0;
  const dependencies = createDependencies({
    async getPermissions() {
      return [];
    },
    async isHrmEnabled() {
      entitlementReads += 1;
      return true;
    },
    async getConnectorMetadata() {
      connectorReads += 1;
      return null;
    },
  });

  await assert.rejects(
    authorizeHrmControlPlane('shop-1', 'hrm.view', dependencies),
    (error: unknown) =>
      error instanceof HrmAccessError &&
      error.status === 403 &&
      error.code === 'HRM_PERMISSION_DENIED',
  );
  assert.equal(entitlementReads, 0);
  assert.equal(connectorReads, 0);
});

test('access: enabled PostgreSQL tenant creates a scoped repository', async () => {
  let repositoryInput: CreatePostgresHrmRepositoryInput | undefined;
  const dependencies = createDependencies({
    async createRepository(input) {
      repositoryInput = input;
      return repository;
    },
  });

  const access = await requireHrmAccess('shop-1', 'hrm.view', dependencies);

  assert.equal(access.tenantId, 'tenant-1');
  assert.equal(access.shopId, 'shop-1');
  assert.equal(access.repository, repository);
  assert.deepEqual(repositoryInput, {
    connectorType: 'postgres_remote',
    connectionUri: 'postgresql://test-only',
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });
});

test('access: non-PostgreSQL connector returns capability error', async () => {
  let repositoryCreates = 0;
  const dependencies = createDependencies({
    async getConnectorMetadata() {
      return { type: 'google_sheets', config: {} };
    },
    async createRepository() {
      repositoryCreates += 1;
      return repository;
    },
  });

  await assert.rejects(
    requireHrmAccess('shop-1', 'hrm.view', dependencies),
    (error: unknown) =>
      error instanceof HrmAccessError &&
      error.status === 409 &&
      error.code === 'HRM_POSTGRES_REQUIRED',
  );
  assert.equal(repositoryCreates, 0);
});

test('access: missing physical schema returns a safe readiness error', async () => {
  const dependencies = createDependencies({
    async createRepository() {
      throw new HrmSchemaNotReadyError();
    },
  });

  await assert.rejects(
    requireHrmAccess('shop-1', 'hrm.view', dependencies),
    (error: unknown) =>
      error instanceof HrmAccessError &&
      error.status === 503 &&
      error.code === 'HRM_SCHEMA_NOT_READY' &&
      !error.message.includes('postgresql://'),
  );
});

test('repository overview is scoped to the current tenant and branch', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [
          {
            employee_count: 12,
            present_today: '8',
            draft_payroll_runs: 1,
          },
        ],
      };
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const overview = await scopedRepository.getOverview({ includePayroll: true });

  assert.deepEqual(overview, {
    employeeCount: 12,
    presentToday: 8,
    draftPayrollRuns: 1,
  });
  assert.deepEqual(queries[0]?.values, ['tenant-1', 'shop-1']);
  assert.match(queries[0]?.text ?? '', /from employees/);
  assert.match(queries[0]?.text ?? '', /from hrm_attendance_days/);
  assert.match(queries[0]?.text ?? '', /from hrm_payroll_runs/);
});

test('repository overview does not query payroll without payroll permission', async () => {
  let queryText = '';
  const pool = {
    async query(text: string) {
      queryText = text;
      return {
        rows: [
          {
            employee_count: 12,
            present_today: 8,
            draft_payroll_runs: null,
          },
        ],
      };
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const overview = await scopedRepository.getOverview();

  assert.equal(overview.draftPayrollRuns, null);
  assert.doesNotMatch(queryText, /from hrm_payroll_runs/);
});

test('repository employee list reads only the current tenant and branch', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: 'EMP-1',
            employee_code: 'NV001',
            name: 'Nguyễn Văn A',
            phone: '0900000000',
            job_title: 'Thu ngân',
            employment_status: 'active',
            joined_at: '2026-07-30',
            total_count: 1,
          },
        ],
      };
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const result = await scopedRepository.listEmployees({
    search: 'Nguyễn',
    limit: 50,
  });

  assert.equal(result.total, 1);
  assert.equal(result.data[0]?.name, 'Nguyễn Văn A');
  assert.deepEqual(queries[0]?.values, [
    'tenant-1',
    'shop-1',
    'Nguyễn',
    50,
  ]);
  assert.match(queries[0]?.text ?? '', /left join hrm_employee_profiles/);
});

test('creating an HRM employee writes source employee and profile atomically', async () => {
  const statements: Array<{ text: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(text: string, values?: unknown[]) {
      statements.push({ text, values });
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const created = await scopedRepository.createEmployee({
    employeeId: 'EMP-1',
    profileId: 'HRMP-1',
    employeeCode: 'NV001',
    name: 'Nguyễn Văn A',
    phone: '0900000000',
    jobTitle: 'Thu ngân',
    employmentType: 'monthly',
    joinedAt: '2026-07-30',
    email: '',
    address: '',
  });

  assert.deepEqual(created, {
    employeeId: 'EMP-1',
    profileId: 'HRMP-1',
  });
  assert.match(statements[0]?.text ?? '', /begin/i);
  assert.match(statements[1]?.text ?? '', /insert into employees/);
  assert.deepEqual(statements[1]?.values?.slice(0, 3), [
    'EMP-1',
    'tenant-1',
    'shop-1',
  ]);
  assert.match(statements[2]?.text ?? '', /insert into hrm_employee_profiles/);
  assert.deepEqual(statements[2]?.values?.slice(0, 4), [
    'HRMP-1',
    'tenant-1',
    'shop-1',
    'EMP-1',
  ]);
  assert.match(statements[3]?.text ?? '', /commit/i);
  assert.equal(released, true);
});
