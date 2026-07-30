import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeHrmTestDatabaseUrl } from '../helpers/databaseSafety';

test('accepts isolated PostgreSQL test databases', () => {
  const parsed = assertSafeHrmTestDatabaseUrl(
    'postgresql://hrm_runner:secret@127.0.0.1:5432/oni_hrm_test',
    { disposableConfirmation: 'true' },
  );

  assert.equal(parsed.pathname, '/oni_hrm_test');
});

test('rejects missing, non-PostgreSQL and production-like database URLs', () => {
  assert.throws(
    () => assertSafeHrmTestDatabaseUrl(undefined, { disposableConfirmation: 'true' }),
    /is required/,
  );
  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl('postgresql://localhost/oni_hrm_test', {
        disposableConfirmation: 'false',
      }),
    /DISPOSABLE=true/,
  );
  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl('mysql://localhost/oni_hrm_test', {
        disposableConfirmation: 'true',
      }),
    /PostgreSQL protocol/,
  );
  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl('postgresql://prod:secret@db.example.com/oni_saas', {
        disposableConfirmation: 'true',
        allowedHosts: ['db.example.com'],
      }),
    /must end with _test or _ci/,
  );
  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl('postgresql://prod:secret@prod.example.com/oni_test', {
        disposableConfirmation: 'true',
      }),
    /host is not allowlisted/,
  );
});

test('validation errors never echo credentials', () => {
  const secretUrl = 'postgresql://prod:super-secret@db.example.com/oni_saas';

  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl(secretUrl, {
        disposableConfirmation: 'true',
        allowedHosts: ['db.example.com'],
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes('super-secret'), false);
      return true;
    },
  );
});

test('rejects an allowlisted URL that matches configured production', () => {
  const candidate = 'postgresql://test-user:test-pass@db.internal/tenant_hrm_test';
  const production = 'postgres://prod-user:prod-pass@db.internal/tenant_hrm_test';

  assert.throws(
    () =>
      assertSafeHrmTestDatabaseUrl(candidate, {
        disposableConfirmation: 'true',
        allowedHosts: ['db.internal'],
        productionUrls: [production],
      }),
    /matches a configured production database/,
  );
});
