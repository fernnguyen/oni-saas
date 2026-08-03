import assert from 'node:assert/strict';
import test from 'node:test';

import { notifySalaryAdvanceEmployee } from '../../../apps/web/lib/server/hrm/salaryAdvanceNotification';

test('salary advance notification targets the auth user linked to the HRM profile', async () => {
  const messages: unknown[] = [];
  const result = await notifySalaryAdvanceEmployee({
    repository: {
      async getAuthUserIdForProfileId(profileId) {
        assert.equal(profileId, 'PROFILE-1');
        return 'AUTH-USER-1';
      },
    },
    publisher: {
      async sendNotification(message) {
        messages.push(message);
      },
    },
    tenantId: 'TENANT-1',
    branchId: 'SHOP-1',
    profileId: 'PROFILE-1',
    advanceId: 'ADVANCE-1',
    title: 'Đã duyệt',
    content: 'Phiếu ứng lương đã được duyệt.',
  });

  assert.equal(result, 'sent');
  assert.deepEqual(messages, [
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      recipientId: 'AUTH-USER-1',
      type: 'system',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
      metadata: {
        path: '/hrm/salary-advances',
        advanceId: 'ADVANCE-1',
      },
    },
  ]);
});

test('salary advance notification is not broadcast when employee has no login account', async () => {
  let publishCount = 0;
  const result = await notifySalaryAdvanceEmployee({
    repository: {
      async getAuthUserIdForProfileId() {
        return null;
      },
    },
    publisher: {
      async sendNotification() {
        publishCount += 1;
      },
    },
    tenantId: 'TENANT-1',
    branchId: 'SHOP-1',
    profileId: 'PROFILE-WITHOUT-LOGIN',
    advanceId: 'ADVANCE-2',
    title: 'Từ chối',
    content: 'Phiếu ứng lương đã bị từ chối.',
  });

  assert.equal(result, 'skipped');
  assert.equal(publishCount, 0);
});
