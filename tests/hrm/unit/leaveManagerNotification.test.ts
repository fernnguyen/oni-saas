import assert from 'node:assert/strict';
import test from 'node:test';

import { notifyLeaveManagers } from '../../../apps/web/lib/server/hrm/leaveManagerNotification';

const departmentDirectory = {
  async getDepartmentIdForProfileId() {
    return 'DEPARTMENT-1';
  },
  async listDepartmentManagerUserIds() {
    return ['DEPARTMENT-MANAGER'];
  },
};

test('leave request persists one notification per resolved management recipient', async () => {
  const messages: Array<{ recipientId?: string; type: string }> = [];
  const recipientCount = await notifyLeaveManagers(
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      requesterUserId: 'EMPLOYEE-USER',
      profileId: 'PROFILE-1',
      leaveId: 'LEAVE-1',
      title: 'Đơn xin phép mới',
      content: 'Có một đơn xin phép cần duyệt.',
      departmentDirectory,
    },
    {
      async resolveRecipients(input) {
        assert.equal(input.eventName, 'HRM_LEAVE_REQUESTED');
        assert.equal(input.requesterUserId, 'EMPLOYEE-USER');
        return ['OWNER-USER', 'ADMIN-USER', 'DEPARTMENT-MANAGER'];
      },
      async sendNotification(message) {
        messages.push(message);
      },
    },
  );

  assert.equal(recipientCount, 3);
  assert.deepEqual(messages.map((message) => message.recipientId), [
    'OWNER-USER',
    'ADMIN-USER',
    'DEPARTMENT-MANAGER',
  ]);
  assert.ok(messages.every((message) => message.type === 'HRM_LEAVE_REQUESTED'));
});

test('leave management resolution failure does not broadcast the request', async () => {
  let publishCount = 0;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const recipientCount = await notifyLeaveManagers(
      {
        tenantId: 'TENANT-1',
        branchId: 'SHOP-1',
        requesterUserId: 'EMPLOYEE-USER',
        profileId: 'PROFILE-1',
        leaveId: 'LEAVE-2',
        title: 'Yêu cầu huỷ đơn nghỉ phép',
        content: 'Có một yêu cầu cần xử lý.',
        departmentDirectory,
      },
      {
        async resolveRecipients() {
          throw new Error('control plane unavailable');
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
