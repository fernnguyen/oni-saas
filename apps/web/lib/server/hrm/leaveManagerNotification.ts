import { HRM_NOTIFICATION_EVENTS } from '../../notifications/eventCatalog';
import {
  resolveHrmManagementNotificationRecipients,
  type HrmDepartmentManagerDirectory,
} from './managementNotificationRecipients';
import { realtimeEngine, type RealtimeMessage } from '../realtime';

type LeaveManagerNotificationInput = {
  tenantId: string;
  branchId: string;
  requesterUserId: string;
  profileId: string;
  leaveId: string;
  title: string;
  content: string;
  departmentDirectory: HrmDepartmentManagerDirectory;
};

type LeaveManagerNotificationDependencies = {
  resolveRecipients(
    input: Parameters<typeof resolveHrmManagementNotificationRecipients>[0],
  ): Promise<string[]>;
  sendNotification(message: RealtimeMessage): Promise<void>;
};

const defaultDependencies: LeaveManagerNotificationDependencies = {
  resolveRecipients: resolveHrmManagementNotificationRecipients,
  sendNotification: (message) => realtimeEngine.sendNotification(message),
};

export async function notifyLeaveManagers(
  {
    tenantId,
    branchId,
    requesterUserId,
    profileId,
    leaveId,
    title,
    content,
    departmentDirectory,
  }: LeaveManagerNotificationInput,
  dependencies: LeaveManagerNotificationDependencies = defaultDependencies,
): Promise<number> {
  try {
    const recipients = await dependencies.resolveRecipients({
      tenantId,
      branchId,
      eventName: HRM_NOTIFICATION_EVENTS.leaveRequested,
      requesterUserId,
      profileId,
      departmentDirectory,
    });

    await Promise.all(recipients.map((recipientId) =>
      dependencies.sendNotification({
        tenantId,
        branchId,
        recipientId,
        type: HRM_NOTIFICATION_EVENTS.leaveRequested,
        title,
        content,
        metadata: {
          path: '/hrm/leaves',
          leaveId,
        },
      }),
    ));

    return recipients.length;
  } catch (error) {
    console.error('[HRM] Failed to notify leave managers:', error);
    return 0;
  }
}
