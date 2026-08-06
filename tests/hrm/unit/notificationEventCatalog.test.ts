import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HRM_NOTIFICATION_EVENTS,
  getDefaultNotificationChannels,
  getNotificationEventDefinition,
} from '../../../apps/web/lib/notifications/eventCatalog';

test('all four HRM notification groups are enabled with push by default', () => {
  for (const eventName of Object.values(HRM_NOTIFICATION_EVENTS)) {
    const definition = getNotificationEventDefinition(eventName);
    assert.ok(definition);
    assert.equal(definition.group, 'hrm');
    assert.equal(definition.defaultEnabled, true);
    assert.equal(definition.allowTelegram, false);
    assert.equal(getDefaultNotificationChannels(eventName).push.enabled, true);
  }

  for (const eventName of Object.values(HRM_NOTIFICATION_EVENTS)) {
    assert.deepEqual(getDefaultNotificationChannels(eventName).routing, {
      role_codes: ['owner', 'admin'],
      requester_department_managers: true,
      department_ids: [],
    });
  }
});
