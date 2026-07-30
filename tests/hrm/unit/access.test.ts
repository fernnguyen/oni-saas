import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import {
  HrmAttendanceStateError,
  HrmCustomFieldInUseError,
  HrmDepartmentScopeError,
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

test('creating an HRM employee validates and stores its department', async () => {
  const statements: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      statements.push({ text, values });
      if (/select id\s+from departments/i.test(text)) {
        return { rowCount: 1, rows: [{ id: 'DEP-1' }] };
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await scopedRepository.createEmployee({
    employeeId: 'EMP-1',
    profileId: 'HRMP-1',
    name: 'Nguyễn Văn A',
    employmentType: 'monthly',
    departmentId: 'DEP-1',
  });

  assert.match(statements[1]?.text ?? '', /from departments/i);
  assert.deepEqual(statements[1]?.values, [
    'DEP-1',
    'tenant-1',
    'shop-1',
  ]);
  assert.match(statements[3]?.text ?? '', /department_id/i);
  assert.equal(statements[3]?.values?.[4], 'DEP-1');
});

test('creating an HRM employee rejects a department outside its shop', async () => {
  const client = {
    async query(text: string) {
      if (/select id\s+from departments/i.test(text)) {
        return { rowCount: 0, rows: [] };
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await assert.rejects(
    scopedRepository.createEmployee({
      employeeId: 'EMP-1',
      profileId: 'HRMP-1',
      name: 'Nguyễn Văn A',
      employmentType: 'monthly',
      departmentId: 'DEP-OTHER',
    }),
    (error: unknown) =>
      error instanceof HrmDepartmentScopeError &&
      error.code === 'HRM_DEPARTMENT_NOT_FOUND',
  );
});

test('updating an HRM profile keeps employee and dynamic data in one transaction', async () => {
  const statements: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      statements.push({ text, values });
      if (/update employees/i.test(text)) {
        return { rowCount: 1, rows: [{ id: 'EMP-1' }] };
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await scopedRepository.updateEmployeeProfile({
    employeeId: 'EMP-1',
    profileId: 'HRMP-1',
    employeeCode: 'NV001',
    name: 'Nguyễn Văn A',
    phone: '0900000000',
    jobTitle: 'Thu ngân',
    employmentStatus: 'active',
    employmentType: 'monthly',
    joinedAt: '2026-07-30',
    email: 'a@example.com',
    address: 'Hồ Chí Minh',
    customData: { uniform_size: 'M' },
  });

  assert.match(statements[0]?.text ?? '', /begin/i);
  assert.match(statements[1]?.text ?? '', /update employees/i);
  assert.deepEqual(statements[1]?.values?.slice(0, 3), [
    'EMP-1',
    'tenant-1',
    'shop-1',
  ]);
  assert.match(
    statements[2]?.text ?? '',
    /insert into hrm_employee_profiles/i,
  );
  assert.equal(statements[2]?.values?.[4], null);
  assert.equal(
    statements[2]?.values?.[12],
    JSON.stringify({ uniform_size: 'M' }),
  );
  assert.match(statements[3]?.text ?? '', /commit/i);
});

test('clock-in rejects a second attendance record for the same work day', async () => {
  const client = {
    async query(text: string) {
      if (/select p\.department_id/i.test(text)) {
        return { rowCount: 1, rows: [{ department_id: null }] };
      }
      if (/select id, department_id/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{ id: 'HRMP-1', department_id: null }],
        };
      }
      if (/insert into hrm_attendance_days/i.test(text)) {
        return { rowCount: 0, rows: [] };
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await assert.rejects(
    scopedRepository.clockIn({
      attendanceId: 'ATD-2',
      profileId: 'HRMP-1',
      employeeId: 'EMP-1',
      actorUserId: 'user-1',
      source: 'manual',
    }),
    (error: unknown) =>
      error instanceof HrmAttendanceStateError &&
      error.code === 'HRM_ATTENDANCE_INVALID_STATE',
  );
});

test('creating a custom field casts shared tenant parameters consistently', async () => {
  let queryText = '';
  const pool = {
    async query(text: string) {
      queryText = text;
      return { rowCount: 1, rows: [] };
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await scopedRepository.createCustomField({
    id: 'HRMF-1',
    key: 'uniform_size',
    label: 'Cỡ đồng phục',
    fieldType: 'text',
    options: [],
    required: false,
    tenantWide: false,
  });

  assert.match(queryText, /\$2::varchar/);
  assert.match(queryText, /where tenant_id = \$2::varchar/);
});

test('custom field settings include inactive fields and profile usage counts', async () => {
  let queryValues: unknown[] = [];
  let queryText = '';
  const pool = {
    async query(text: string, values: unknown[]) {
      queryText = text;
      queryValues = values;
      return {
        rows: [
          {
            id: 'HRMF-1',
            key: 'uniform_size',
            label: 'Cỡ đồng phục',
            field_type: 'text',
            options: [],
            required: 0,
            active: 0,
            sort_order: 1,
            usage_count: '2',
          },
        ],
      };
    },
  } as unknown as Pool;
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  const fields = await scopedRepository.listCustomFields({
    includeInactive: true,
  });

  assert.equal(fields[0]?.active, false);
  assert.equal(fields[0]?.usageCount, 2);
  assert.deepEqual(queryValues, ['tenant-1', 'shop-1', true]);
  assert.match(queryText, /custom_data \? d\.key/i);
});

test('a custom field with profile data cannot be hard-deleted', async () => {
  const client = {
    async query(text: string) {
      if (/from hrm_custom_field_definitions d/i.test(text)) {
        return {
          rowCount: 1,
          rows: [
            {
              key: 'uniform_size',
              branch_id: 'shop-1',
              usage_count: 1,
            },
          ],
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await assert.rejects(
    scopedRepository.deleteUnusedCustomField('HRMF-1'),
    (error: unknown) =>
      error instanceof HrmCustomFieldInUseError &&
      error.code === 'HRM_CUSTOM_FIELD_IN_USE',
  );
});

test('an unused custom field can be hard-deleted inside one transaction', async () => {
  const statements: string[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (/from hrm_custom_field_definitions d/i.test(text)) {
        return {
          rowCount: 1,
          rows: [
            {
              key: 'uniform_size',
              branch_id: 'shop-1',
              usage_count: 0,
            },
          ],
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await scopedRepository.deleteUnusedCustomField('HRMF-1');

  assert.equal(
    statements.some((statement) =>
      /delete from hrm_custom_field_definitions/i.test(statement),
    ),
    true,
  );
  assert.match(statements.at(-1) ?? '', /commit/i);
});

test('clock-out rejects an employee without an open attendance record', async () => {
  let attendanceQuery = '';
  const client = {
    async query(text: string) {
      if (/from hrm_attendance_days a/i.test(text)) {
        attendanceQuery = text;
        return { rowCount: 0, rows: [] };
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
  const scopedRepository = new PostgresHrmRepository(pool, {
    tenantId: 'tenant-1',
    branchId: 'shop-1',
  });

  await assert.rejects(
    scopedRepository.clockOut({
      employeeId: 'EMP-1',
      actorUserId: 'user-1',
    }),
    (error: unknown) =>
      error instanceof HrmAttendanceStateError &&
      error.code === 'HRM_ATTENDANCE_INVALID_STATE',
  );
  assert.match(attendanceQuery, /a\.work_date\s*=/i);
});
