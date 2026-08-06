import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeHrmManagementRouting,
  resolveHrmManagementNotificationRecipients,
} from '../../../apps/web/lib/server/hrm/managementNotificationRecipients';

test('management routing defaults to owner, admin and current department manager', () => {
  assert.deepEqual(normalizeHrmManagementRouting(undefined), {
    role_codes: ['owner', 'admin'],
    requester_department_managers: true,
    department_ids: [],
  });
});

test('management recipients combine configured roles and department managers safely', async () => {
  const recipients = await resolveHrmManagementNotificationRecipients(
    {
      tenantId: 'TENANT-1',
      branchId: 'SHOP-1',
      eventName: 'HRM_LEAVE_REQUESTED',
      requesterUserId: 'REQUESTER',
      profileId: 'PROFILE-1',
      departmentDirectory: {
        async getDepartmentIdForProfileId(profileId) {
          assert.equal(profileId, 'PROFILE-1');
          return 'DEPARTMENT-CURRENT';
        },
        async listDepartmentManagerUserIds(departmentIds) {
          assert.deepEqual(departmentIds, [
            'DEPARTMENT-EXTRA',
            'DEPARTMENT-CURRENT',
          ]);
          return ['REQUESTER', 'DEPARTMENT-MANAGER', 'OUTSIDE-TENANT'];
        },
      },
    },
    {
      async getRoutingConfig(tenantId, branchId, eventName) {
        assert.deepEqual([tenantId, branchId, eventName], [
          'TENANT-1',
          'SHOP-1',
          'HRM_LEAVE_REQUESTED',
        ]);
        return {
          role_codes: ['owner', 'admin'],
          requester_department_managers: true,
          department_ids: ['DEPARTMENT-EXTRA'],
        };
      },
      async listScopeUserIds() {
        return [
          'REQUESTER',
          'OWNER-USER',
          'ADMIN-USER',
          'DEPARTMENT-MANAGER',
        ];
      },
      async listRoleUserIds(_tenantId, _branchId, roleCodes) {
        assert.deepEqual(roleCodes, ['owner', 'admin']);
        return ['REQUESTER', 'OWNER-USER', 'ADMIN-USER'];
      },
    },
  );

  assert.deepEqual(recipients, [
    'OWNER-USER',
    'ADMIN-USER',
    'DEPARTMENT-MANAGER',
  ]);
});

test('legacy disabled owner fallback remains an explicit empty role selection', () => {
  assert.deepEqual(normalizeHrmManagementRouting({
    requester_department_managers: false,
    department_ids: [],
    fallback_to_owner: false,
  }), {
    role_codes: [],
    requester_department_managers: false,
    department_ids: [],
  });
});
