import assert from 'node:assert/strict';
import test from 'node:test';

import { getHrmSchemaError } from '../../../apps/web/lib/server/hrm/schemaError';

test('HRM schema error maps a missing disbursed_by column to an actionable response', () => {
  assert.deepEqual(
    getHrmSchemaError({
      code: '42703',
      message: 'column a.disbursed_by does not exist',
    }),
    {
      code: 'HRM_SCHEMA_OUTDATED',
      message:
        'PostgreSQL HRM chưa có cột disbursed_by. Vui lòng chạy pnpm db:push:pg trước khi thực hiện chi tiền.',
    },
  );
});

test('HRM schema error ignores unrelated database errors', () => {
  assert.equal(
    getHrmSchemaError({ code: '23505', message: 'duplicate key value' }),
    null,
  );
  assert.equal(getHrmSchemaError(new Error('network unavailable')), null);
});
