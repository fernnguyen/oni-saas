import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNavGroups } from '../../../apps/web/app/components/layout/nav';
import {
  canManageSubscription,
  requestPlanUpgrade,
} from '../../../apps/web/lib/subscriptions/upgradeAccess';
import { isLockedHrmPath } from '../../../apps/web/lib/hrm/routing';

function getHrmItem(hrmEnabled: boolean) {
  const groups = buildNavGroups(
    {
      basePath: '/main',
      supportHref: '/main/support',
      context: 'shop',
      hrmEnabled,
    },
    [],
  );

  return groups
    .flatMap((group) => group.items)
    .find((item) => item.href === '/main/hrm');
}

test('entitlement-ui: HRM navigation is locked when entitlement is disabled', () => {
  const item = getHrmItem(false);

  assert.ok(item);
  assert.equal(item.href, '/main/hrm');
  assert.equal(item.locked, true);
  assert.equal(item.upgradeFeature, 'hrm');
});

test('entitlement-ui: HRM navigation is unlocked when entitlement is enabled', () => {
  const item = getHrmItem(true);

  assert.ok(item);
  assert.equal(item.locked, false);
});

test('entitlement-ui: only real subscription permissions can open upgrade CTA', () => {
  assert.equal(canManageSubscription(['settings.manage']), true);
  assert.equal(canManageSubscription(['tenants.manage']), true);
  assert.equal(canManageSubscription(['billing.manage']), true);
  assert.equal(canManageSubscription(['org.manage']), false);
  assert.equal(canManageSubscription(['dashboard.view']), false);
});

test('entitlement-ui: locked HRM paths suppress branch data-plane providers', () => {
  assert.equal(isLockedHrmPath('/main/hrm', false), true);
  assert.equal(isLockedHrmPath('/t/acme/main/hrm/employees', false), true);
  assert.equal(isLockedHrmPath('/main/orders', false), false);
  assert.equal(isLockedHrmPath('/main/hrm', true), false);
  assert.equal(isLockedHrmPath('/hrm/orders', false), false);
  assert.equal(isLockedHrmPath('/t/hrm/main/orders', false), false);
  assert.equal(isLockedHrmPath('/t/acme/hrm/orders', false), false);
});

test('entitlement-ui: HRM upgrade CTA reuses plan modal with feature context', () => {
  const target = new EventTarget();
  let feature: string | undefined;

  target.addEventListener('open-plan-modal', (event) => {
    feature = (event as CustomEvent<{ feature: string }>).detail.feature;
  });

  requestPlanUpgrade('hrm', target);

  assert.equal(feature, 'hrm');
});
