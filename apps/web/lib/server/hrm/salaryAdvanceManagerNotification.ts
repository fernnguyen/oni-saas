import { HRM_NOTIFICATION_EVENTS } from '../../notifications/eventCatalog';
import {
  resolveHrmManagementNotificationRecipients,
  type HrmDepartmentManagerDirectory,
} from './managementNotificationRecipients';
import { realtimeEngine, type RealtimeMessage } from '../realtime';

type SalaryAdvanceManagerNotificationInput = {
  tenantId: string;
  branchId: string;
  requesterUserId: string;
  profileId: string;
  departmentDirectory: HrmDepartmentManagerDirectory;
  advanceId: string;
  amount: number;
  payPeriod: string;
};

type SalaryAdvanceManagerNotificationDependencies = {
  resolveRecipients(
    input: Parameters<typeof resolveHrmManagementNotificationRecipients>[0],
  ): Promise<string[]>;
  sendNotification(message: RealtimeMessage): Promise<void>;
};

const defaultDependencies: SalaryAdvanceManagerNotificationDependencies = {
  resolveRecipients: resolveHrmManagementNotificationRecipients,
  sendNotification: (message) => realtimeEngine.sendNotification(message),
};

/** Sends one persisted notification per configured management recipient. */
export async function notifySalaryAdvanceManagers(
  {
    tenantId,
    branchId,
    requesterUserId,
    profileId,
    departmentDirectory,
    advanceId,
    amount,
    payPeriod,
  }: SalaryAdvanceManagerNotificationInput,
  dependencies: SalaryAdvanceManagerNotificationDependencies = defaultDependencies,
): Promise<number> {
  try {
    const recipients = await dependencies.resolveRecipients({
      tenantId,
      branchId,
      eventName: HRM_NOTIFICATION_EVENTS.salaryAdvanceRequested,
      requesterUserId,
      profileId,
      departmentDirectory,
    });

    await Promise.all(recipients.map((recipientId) =>
      dependencies.sendNotification({
        tenantId,
        branchId,
        recipientId,
        type: HRM_NOTIFICATION_EVENTS.salaryAdvanceRequested,
        title: 'Yêu cầu ứng lương mới',
        content: `Có một yêu cầu ứng lương mới ${amount.toLocaleString('vi-VN')}đ cho kỳ lương ${payPeriod}.`,
        metadata: {
          path: '/hrm/salary-advances',
          advanceId,
        },
      }),
    ));

    return recipients.length;
  } catch (error) {
    console.error(
      '[HRM] Failed to notify management about a salary advance request:',
      error,
    );
    return 0;
  }
}
