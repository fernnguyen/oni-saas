import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { PostgresHrmRepository } from '../../../packages/adapters/src/hrm';

test('department notification resolver is tenant/branch scoped and maps manager references', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      if (/select department_id/i.test(text)) {
        return { rows: [{ department_id: 'DEPARTMENT-1' }] };
      }
      return { rows: [{ user_id: 'AUTH-USER-1' }, { user_id: 'AUTH-USER-2' }] };
    },
  } as unknown as Pool;
  const repository = new PostgresHrmRepository(pool, {
    tenantId: 'TENANT-1',
    branchId: 'SHOP-1',
  });

  assert.equal(
    await repository.getDepartmentIdForProfileId('PROFILE-1'),
    'DEPARTMENT-1',
  );
  assert.deepEqual(
    await repository.listDepartmentManagerUserIds([
      'DEPARTMENT-1',
      'DEPARTMENT-2',
      'DEPARTMENT-1',
      ' ',
    ]),
    ['AUTH-USER-1', 'AUTH-USER-2'],
  );

  assert.deepEqual(queries[0]?.values, ['TENANT-1', 'SHOP-1', 'PROFILE-1']);
  assert.deepEqual(queries[1]?.values, [
    'TENANT-1',
    'SHOP-1',
    ['DEPARTMENT-1', 'DEPARTMENT-2'],
  ]);
  assert.match(queries[1]?.text ?? '', /d\.tenant_id = \$1/);
  assert.match(queries[1]?.text ?? '', /d\.branch_id = \$2/);
  assert.match(queries[1]?.text ?? '', /ud\.is_manager/);
  assert.match(queries[1]?.text ?? '', /profile\.source_employee_id = refs\.user_ref/);
});
