import assert from 'node:assert/strict';
import test from 'node:test';

import { notifyLeaveManagers } from '../../../apps/web/lib/server/hrm/leaveManagerNotification';

test('leave request only notifies attendance managers other than the requester', async () => {
  const messages: Array<{ recipientId?: string; type: string }> = [];

  const recipientCount = await notifyLeaveManagers(
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      requesterUserId: 'EMPLOYEE-USER',
      leaveId: 'LEAVE-1',
      title: 'Đơn xin phép mới',
      content: 'Có một đơn xin phép cần duyệt.',
    },
    {
      async listCandidateUserIds() {
        return ['EMPLOYEE-USER', 'OWNER-USER', 'HR-MANAGER', 'UNRELATED-USER', 'OWNER-USER'];
      },
      async userHasPermission(userId, tenantId, permission, branchId) {
        assert.equal(tenantId, 'TENANT-1');
        assert.equal(permission, 'hrm.attendance.manage');
        assert.equal(branchId, 'SHOP-1');
        return userId === 'OWNER-USER' || userId === 'HR-MANAGER';
      },
      async sendNotification(message) {
        messages.push(message);
      },
    },
  );

  assert.equal(recipientCount, 2);
  assert.deepEqual(messages.map((message) => message.recipientId), [
    'OWNER-USER',
    'HR-MANAGER',
  ]);
  assert.ok(messages.every((message) => message.type === 'HRM_LEAVE_REQUESTED'));
});

test('leave manager resolution failure does not broadcast the request', async () => {
  let publishCount = 0;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const recipientCount = await notifyLeaveManagers(
      {
        tenantId: 'TENANT-1',
        branchId: 'SHOP-1',
        requesterUserId: 'EMPLOYEE-USER',
        leaveId: 'LEAVE-2',
        title: 'Yêu cầu huỷ đơn nghỉ phép',
        content: 'Có một yêu cầu cần xử lý.',
      },
      {
        async listCandidateUserIds() {
          throw new Error('permission service unavailable');
        },
        async userHasPermission() {
          return true;
        },
        async sendNotification() {
          publishCount += 1;
        },
      },
    );

    assert.equal(recipientCount, 0);
    assert.equal(publishCount, 0);
  } finally {
    console.error = originalConsoleError;
  }
});
