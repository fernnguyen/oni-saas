import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260730000000_register_hrm_module.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase();

test('HRM control-plane migration is additive and disabled by default', () => {
  assert.match(migrationSql, /insert into public\.system_modules/);
  assert.match(migrationSql, /jsonb_build_object\('hrm', false\)/);
  assert.match(migrationSql, /where not/);
  assert.doesNotMatch(migrationSql, /\b(drop|truncate)\b/);
});

test('HRM control-plane migration does not touch operational data tables', () => {
  for (const table of ['employees', 'departments', 'cashbook', 'payment_funds']) {
    assert.equal(
      migrationSql.includes(`public.${table}`),
      false,
      `migration must not touch public.${table}`,
    );
  }
});
