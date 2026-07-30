import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260730010000_hrm_permissions.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase();

const permissionCodes = [
  'hrm.view',
  'hrm.employee.manage',
  'hrm.employee.transfer',
  'hrm.attendance.manage',
  'hrm.payroll.view',
  'hrm.payroll.manage',
  'hrm.payroll.pay',
  'hrm.settings.manage',
] as const;

test('HRM permission migration registers the exact MVP permission catalog', () => {
  for (const code of permissionCodes) {
    const occurrences = migrationSql.match(new RegExp(`'${code.replaceAll('.', '\\.')}'`, 'g'));
    assert.equal(occurrences?.length, 2, `${code} must be seeded and assigned to owner`);
  }

  assert.match(migrationSql, /group_code,\s*group_name,\s*sort_order/);
  assert.match(migrationSql, /'hrm',\s*'nhân sự',\s*8/);
});

test('HRM permissions are assigned only to owner by default', () => {
  assert.match(migrationSql, /where r\.code = 'owner'/);
  assert.doesNotMatch(migrationSql, /\br\.code\s+in\s*\(/);
  assert.doesNotMatch(migrationSql, /'(admin|staff)'/);
  assert.match(migrationSql, /on conflict do nothing/);
});

test('HRM permission migration is additive control-plane data only', () => {
  assert.match(migrationSql, /^begin;/m);
  assert.match(migrationSql, /^commit;/m);
  assert.match(migrationSql, /on conflict \(code\) do nothing/);
  assert.doesNotMatch(migrationSql, /\b(drop|truncate|delete|alter)\b/);
  assert.doesNotMatch(migrationSql, /\b(update|insert into)\s+public\.(plans|tenant_feature_flags)\b/);

  for (const table of ['employees', 'departments', 'cashbook', 'payment_funds']) {
    assert.equal(
      migrationSql.includes(`public.${table}`),
      false,
      `migration must not touch public.${table}`,
    );
  }
});
