import assert from 'node:assert/strict';
import test from 'node:test';

import { notifySalaryAdvanceManagers } from '../../../apps/web/lib/server/hrm/salaryAdvanceManagerNotification';

test('employee-created salary advance only notifies payroll managers other than the requester', async () => {
  const checkedUserIds: string[] = [];
  const messages: Array<{ recipientId?: string }> = [];

  const recipientCount = await notifySalaryAdvanceManagers(
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      requesterUserId: 'EMPLOYEE-USER',
      advanceId: 'ADVANCE-1',
      amount: 1_500_000,
      payPeriod: '2026-08',
    },
    {
      async listCandidateUserIds() {
        return [
          'EMPLOYEE-USER',
          'OWNER-USER',
          'PAYROLL-MANAGER',
          'UNRELATED-USER',
          'OWNER-USER',
        ];
      },
      async userHasPermission(userId, tenantId, permission, branchId) {
        checkedUserIds.push(userId);
        assert.equal(tenantId, 'TENANT-1');
        assert.equal(permission, 'hrm.payroll.manage');
        assert.equal(branchId, 'SHOP-1');
        return userId === 'OWNER-USER' || userId === 'PAYROLL-MANAGER';
      },
      async sendNotification(message) {
        messages.push(message);
      },
    },
  );

  assert.equal(recipientCount, 2);
  assert.deepEqual(checkedUserIds, [
    'OWNER-USER',
    'PAYROLL-MANAGER',
    'UNRELATED-USER',
  ]);
  assert.deepEqual(
    messages.map((message) => message.recipientId),
    ['OWNER-USER', 'PAYROLL-MANAGER'],
  );
  assert.ok(messages.every((message) => Boolean(message.recipientId)));
});

test('manager notification resolution failure never broadcasts or rolls back the request', async () => {
  let publishCount = 0;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const recipientCount = await notifySalaryAdvanceManagers(
      {
        tenantId: 'TENANT-1',
        branchId: 'SHOP-1',
        requesterUserId: 'EMPLOYEE-USER',
        advanceId: 'ADVANCE-2',
        amount: 500_000,
        payPeriod: '2026-08',
      },
      {
        async listCandidateUserIds() {
          throw new Error('control plane unavailable');
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
