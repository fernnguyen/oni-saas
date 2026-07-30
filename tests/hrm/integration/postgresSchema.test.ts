import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HRM_EXPECTED_TABLES,
  createPostgresHrmRepository,
  verifyPostgresHrmModule,
} from '../../../packages/adapters/src/hrm';

type AdapterPool = NonNullable<
  Parameters<typeof verifyPostgresHrmModule>[0]['pool']
>;

const requireFromAdapters = createRequire(
  resolve(process.cwd(), 'packages/adapters/package.json'),
);
const { Pool } = requireFromAdapters('pg') as {
  Pool: new (config: {
    connectionString: string | undefined;
    max: number;
  }) => AdapterPool;
};

test('verifies the shared db:push:pg schema and preserves existing operational data', async () => {
  const pool = new Pool({
    connectionString: process.env.HRM_TEST_DATABASE_URL,
    max: 3,
  });

  try {
    const verification = await verifyPostgresHrmModule({
      connectorType: 'postgres_local',
      pool,
    });
    assert.equal(verification.ready, true);
    assert.deepEqual(verification.missingTables, []);
    assert.deepEqual(verification.missingColumns, []);

    const repository = await createPostgresHrmRepository({
      connectorType: 'postgres_local',
      pool,
      tenantId: 'tenant-a',
      branchId: 'branch-a',
    });
    assert.deepEqual(repository.getScope(), {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
    });

    const installedTables = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [HRM_EXPECTED_TABLES],
    );
    assert.equal(installedTables.rowCount, HRM_EXPECTED_TABLES.length);

    const legacyEmployeeTable = await pool.query<{ relation: string | null }>(
      "select to_regclass('public.employees')::text as relation",
    );
    if (legacyEmployeeTable.rows[0]?.relation) {
      const before = await pool.query<{ rows: string }>(
        'select count(*)::text as rows from employees',
      );
      const repeatedVerification = await verifyPostgresHrmModule({
        connectorType: 'postgres_remote',
        pool,
      });
      const after = await pool.query<{ rows: string }>(
        'select count(*)::text as rows from employees',
      );
      assert.equal(repeatedVerification.ready, true);
      assert.equal(after.rows[0]?.rows, before.rows[0]?.rows);
    }
  } finally {
    await pool.end();
  }
});
