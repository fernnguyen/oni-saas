import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHrmEntitlement,
  HrmEntitlementLookupError,
  resolveHrmEntitlement,
  type HrmEntitlementDependencies,
} from '../../../apps/web/lib/server/hrm/entitlement';

test('explicit enabled flag takes precedence over a plan without HRM', () => {
  assert.deepEqual(resolveHrmEntitlement(true, { hrm: false }), {
    enabled: true,
    source: 'feature_flag',
    reason: 'FEATURE_FLAG_ENABLED',
  });
});

test('explicit disabled flag is a kill switch even when the plan includes HRM', () => {
  assert.deepEqual(resolveHrmEntitlement(false, { hrm: true }), {
    enabled: false,
    source: 'feature_flag',
    reason: 'FEATURE_FLAG_DISABLED',
  });
});

test('plan metadata is used only when there is no tenant override', () => {
  assert.deepEqual(resolveHrmEntitlement(null, { hrm: true }), {
    enabled: true,
    source: 'plan',
    reason: 'PLAN_INCLUDED',
  });
  assert.deepEqual(resolveHrmEntitlement(null, {}), {
    enabled: false,
    source: 'plan',
    reason: 'PLAN_NOT_INCLUDED',
  });
  assert.equal(resolveHrmEntitlement(null, { hrm: 1 }).enabled, false);
});

test('explicit flag avoids reading plan metadata', async () => {
  let planReadCount = 0;
  const dependencies: HrmEntitlementDependencies = {
    getFeatureFlagOverride: async () => false,
    getPlanMetadata: async () => {
      planReadCount += 1;
      return { hrm: true };
    },
  };

  const result = await getHrmEntitlement(' tenant-1 ', dependencies);
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'FEATURE_FLAG_DISABLED');
  assert.equal(planReadCount, 0);
});

test('missing override falls back to plan metadata', async () => {
  const dependencies: HrmEntitlementDependencies = {
    getFeatureFlagOverride: async () => null,
    getPlanMetadata: async (tenantId) => {
      assert.equal(tenantId, 'tenant-1');
      return { hrm: true };
    },
  };

  const result = await getHrmEntitlement('tenant-1', dependencies);
  assert.equal(result.enabled, true);
  assert.equal(result.source, 'plan');
});

test('tenant id is required before any control-plane query', async () => {
  let queryCount = 0;
  const dependencies: HrmEntitlementDependencies = {
    getFeatureFlagOverride: async () => {
      queryCount += 1;
      return null;
    },
    getPlanMetadata: async () => {
      queryCount += 1;
      return {};
    },
  };

  await assert.rejects(() => getHrmEntitlement('  ', dependencies), TypeError);
  assert.equal(queryCount, 0);
});

test('feature flag lookup failures fail closed without consulting the plan', async () => {
  let planReadCount = 0;
  const dependencies: HrmEntitlementDependencies = {
    getFeatureFlagOverride: async () => {
      throw new HrmEntitlementLookupError('lookup failed');
    },
    getPlanMetadata: async () => {
      planReadCount += 1;
      return { hrm: true };
    },
  };

  await assert.rejects(
    () => getHrmEntitlement('tenant-1', dependencies),
    HrmEntitlementLookupError,
  );
  assert.equal(planReadCount, 0);
});
