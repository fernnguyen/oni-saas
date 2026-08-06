import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notificationContextSource = readFileSync(
  new URL('../../../apps/web/app/components/notifications/NotificationContext.tsx', import.meta.url),
  'utf8',
);
const notificationDropdownSource = readFileSync(
  new URL('../../../apps/web/app/components/notifications/NotificationDropdown.tsx', import.meta.url),
  'utf8',
);
const notificationApiSource = readFileSync(
  new URL('../../../apps/web/app/api/notifications/route.ts', import.meta.url),
  'utf8',
);

test('web Notification Center reconciles persisted HRM notifications across realtime timing gaps', () => {
  assert.match(notificationContextSource, /newNoti\.recipient_id && !authUserRef\.current\?\.id/);
  assert.match(notificationContextSource, /setNotifications\(\(current\) =>/);
  assert.match(notificationContextSource, /newNoti\.type\.startsWith\('HRM_'\)/);
  assert.match(notificationContextSource, /status === 'SUBSCRIBED'.*fetchData\(\)/);
  assert.match(notificationDropdownSource, /if \(nextOpen\) void refreshNotifications\(\)/);
  assert.match(notificationApiSource, /recipient_id\.is\.null,recipient_id\.eq\.\$\{auth\.user\.id\}/);
});
