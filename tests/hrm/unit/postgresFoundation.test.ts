import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HRM_EXPECTED_TABLES,
  HRM_EXPECTED_COLUMNS,
  HrmPostgresRequiredError,
  createPostgresHrmRepository,
  isPostgresConnectorType,
  verifyPostgresHrmModule,
} from '../../../packages/adapters/src/hrm';
import * as sharedPostgresSchema from '../../../packages/adapters/src/schema_pg';

test('PostgreSQL is the only supported HRM operational connector', async () => {
  assert.equal(isPostgresConnectorType('postgres_local'), true);
  assert.equal(isPostgresConnectorType('postgres_remote'), true);

  for (const unsupported of [
    'supabase',
    'supabase_db',
    'mysql_local',
    'mysql_remote',
    'google_sheets',
    '',
  ]) {
    assert.equal(isPostgresConnectorType(unsupported), false);
  }

  const unsupportedInput = {
    connectorType: 'supabase_db',
  };

  await assert.rejects(
    verifyPostgresHrmModule(unsupportedInput),
    HrmPostgresRequiredError,
  );
  await assert.rejects(
    createPostgresHrmRepository({
      ...unsupportedInput,
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    }),
    HrmPostgresRequiredError,
  );
});

test('HRM schema contract is tenant-scoped and owned by db:push:pg', () => {
  assert.equal(HRM_EXPECTED_TABLES.length, 17);
  assert.deepEqual(Object.keys(HRM_EXPECTED_COLUMNS), HRM_EXPECTED_TABLES);

  for (const [tableName, columns] of Object.entries(HRM_EXPECTED_COLUMNS)) {
    assert.ok(columns.includes('tenant_id'), `${tableName} must include tenant_id`);
  }
});

test('default db:push:pg schema owns HRM tables without a second migration pipeline', () => {
  const sharedSchemaSource = readFileSync(
    resolve(process.cwd(), 'packages/adapters/src/schema_pg.ts'),
    'utf8',
  );
  const drizzleConfigSource = readFileSync(
    resolve(process.cwd(), 'packages/adapters/drizzle.pg.config.ts'),
    'utf8',
  );

  assert.match(sharedSchemaSource, /export \* from ['"]\.\/hrm\/schema['"]/);
  assert.match(drizzleConfigSource, /schema:\s*['"]\.\/src\/schema_pg\.ts['"]/);

  for (const tableExport of [
    'hrmEmployeeProfiles',
    'hrmEmployeeTransfers',
    'hrmCustomFieldDefinitions',
    'hrmSettings',
    'hrmHolidays',
    'hrmShiftTemplates',
    'hrmAttendanceDays',
    'hrmSalaryConfigs',
    'hrmSalaryGroups',
    'hrmEmployeeSalaryAssignments',
    'hrmPayrollRuns',
    'hrmPayrollItems',
    'hrmCashbookPostings',
    'hrmAuditLogs',
    'hrmLeaveRequests',
    'hrmLeaveBalances',
    'hrmSalaryAdvances',
  ]) {
    assert.ok(tableExport in sharedPostgresSchema, `${tableExport} must be exported`);
  }
});

test('foundation has no dedicated DDL runner or module migration registry', () => {
  const schemaSource = readFileSync(
    resolve(process.cwd(), 'packages/adapters/src/hrm/schema.ts'),
    'utf8',
  );
  const factorySource = readFileSync(
    resolve(process.cwd(), 'packages/adapters/src/hrm/factory.ts'),
    'utf8',
  );

  assert.doesNotMatch(schemaSource, /oni_module_migrations/);
  assert.doesNotMatch(factorySource, /runHrmMigrations|preparePostgresHrmModule/);
});
