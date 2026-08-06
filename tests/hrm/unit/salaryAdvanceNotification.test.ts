import assert from 'node:assert/strict';
import test from 'node:test';

import { notifySalaryAdvanceEmployee } from '../../../apps/web/lib/server/hrm/salaryAdvanceNotification';

test('salary advance status targets employee, approver and configured management without duplicates', async () => {
  const messages: unknown[] = [];
  const result = await notifySalaryAdvanceEmployee(
    {
      repository: {
      async getAuthUserIdForProfileId(profileId) {
        assert.equal(profileId, 'PROFILE-1');
        return 'EMPLOYEE-USER';
      },
      async getDepartmentIdForProfileId() {
        return 'DEPARTMENT-1';
      },
      async listDepartmentManagerUserIds() {
        return ['DEPARTMENT-MANAGER'];
      },
      },
      publisher: {
        async sendNotification(message) {
          messages.push(message);
        },
      },
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      actorUserId: 'APPROVER-USER',
      profileId: 'PROFILE-1',
      advanceId: 'ADVANCE-1',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
    },
    {
      async resolveManagementRecipients(input) {
        assert.equal(input.eventName, 'HRM_SALARY_ADVANCE_STATUS_CHANGED');
        return ['OWNER-USER', 'APPROVER-USER', 'DEPARTMENT-MANAGER', 'EMPLOYEE-USER'];
      },
    },
  );

  assert.equal(result, 4);
  assert.deepEqual(messages, [
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      recipientId: 'APPROVER-USER',
      type: 'HRM_SALARY_ADVANCE_STATUS_CHANGED',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
      metadata: {
        path: '/hrm/salary-advances',
        advanceId: 'ADVANCE-1',
        actorUserId: 'APPROVER-USER',
      },
    },
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      recipientId: 'EMPLOYEE-USER',
      type: 'HRM_SALARY_ADVANCE_STATUS_CHANGED',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
      metadata: {
        path: '/hrm/salary-advances',
        advanceId: 'ADVANCE-1',
        actorUserId: 'APPROVER-USER',
      },
    },
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      recipientId: 'OWNER-USER',
      type: 'HRM_SALARY_ADVANCE_STATUS_CHANGED',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
      metadata: {
        path: '/hrm/salary-advances',
        advanceId: 'ADVANCE-1',
        actorUserId: 'APPROVER-USER',
      },
    },
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      recipientId: 'DEPARTMENT-MANAGER',
      type: 'HRM_SALARY_ADVANCE_STATUS_CHANGED',
      title: 'Đã duyệt',
      content: 'Phiếu ứng lương đã được duyệt.',
      metadata: {
        path: '/hrm/salary-advances',
        advanceId: 'ADVANCE-1',
        actorUserId: 'APPROVER-USER',
      },
    },
  ]);
});

test('salary advance status still reports to approver and management when employee has no login', async () => {
  const recipients: Array<string | undefined> = [];
  const result = await notifySalaryAdvanceEmployee(
    {
      repository: {
        async getAuthUserIdForProfileId() {
          return null;
        },
        async getDepartmentIdForProfileId() {
          return null;
        },
        async listDepartmentManagerUserIds() {
          return [];
        },
      },
      publisher: {
        async sendNotification(message) {
          recipients.push(message.recipientId);
        },
      },
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      actorUserId: 'APPROVER-USER',
      profileId: 'PROFILE-WITHOUT-LOGIN',
      advanceId: 'ADVANCE-2',
      title: 'Từ chối',
      content: 'Phiếu ứng lương đã bị từ chối.',
    },
    {
      async resolveManagementRecipients() {
        return ['OWNER-USER'];
      },
    },
  );

  assert.equal(result, 2);
  assert.deepEqual(recipients, ['APPROVER-USER', 'OWNER-USER']);
});

test('management lookup failure does not block employee and approver status notifications', async () => {
  const recipients: Array<string | undefined> = [];
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const result = await notifySalaryAdvanceEmployee(
      {
        repository: {
          async getAuthUserIdForProfileId() {
            return 'EMPLOYEE-USER';
          },
          async getDepartmentIdForProfileId() {
            return null;
          },
          async listDepartmentManagerUserIds() {
            return [];
          },
        },
        publisher: {
          async sendNotification(message) {
            recipients.push(message.recipientId);
          },
        },
        tenantId: 'TENANT-1',
        branchId: 'SHOP-1',
        actorUserId: 'APPROVER-USER',
        profileId: 'PROFILE-1',
        advanceId: 'ADVANCE-3',
        title: 'Đã duyệt',
        content: 'Phiếu ứng lương đã được duyệt.',
      },
      {
        async resolveManagementRecipients() {
          throw new Error('control plane unavailable');
        },
      },
    );

    assert.equal(result, 2);
    assert.deepEqual(recipients, ['APPROVER-USER', 'EMPLOYEE-USER']);
  } finally {
    console.error = originalConsoleError;
  }
});
