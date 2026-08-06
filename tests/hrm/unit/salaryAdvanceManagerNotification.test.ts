import assert from 'node:assert/strict';
import test from 'node:test';

import { notifySalaryAdvanceManagers } from '../../../apps/web/lib/server/hrm/salaryAdvanceManagerNotification';

const departmentDirectory = {
  async getDepartmentIdForProfileId() {
    return 'DEPARTMENT-1';
  },
  async listDepartmentManagerUserIds() {
    return ['DEPARTMENT-MANAGER'];
  },
};

test('salary advance persists one notification per configured role or department manager', async () => {
  const messages: Array<{ recipientId?: string; type: string }> = [];
  const recipientCount = await notifySalaryAdvanceManagers(
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      requesterUserId: 'EMPLOYEE-USER',
      profileId: 'PROFILE-1',
      departmentDirectory,
      advanceId: 'ADVANCE-1',
      amount: 1_500_000,
      payPeriod: '08/2026',
    },
    {
      async resolveRecipients(input) {
        assert.equal(input.eventName, 'HRM_SALARY_ADVANCE_REQUESTED');
        assert.equal(input.profileId, 'PROFILE-1');
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
  assert.ok(messages.every((message) => Boolean(message.recipientId)));
  assert.ok(messages.every((message) => message.type === 'HRM_SALARY_ADVANCE_REQUESTED'));
});

test('salary advance recipient resolution failure never broadcasts or rolls back the request', async () => {
  let publishCount = 0;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const recipientCount = await notifySalaryAdvanceManagers(
      {
        tenantId: 'TENANT-1',
        branchId: 'SHOP-1',
        requesterUserId: 'EMPLOYEE-USER',
        profileId: 'PROFILE-1',
        departmentDirectory,
        advanceId: 'ADVANCE-2',
        amount: 500_000,
        payPeriod: '08/2026',
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
