import type { RealtimeMessage } from '../realtime';
import {
  resolveHrmManagementNotificationRecipients,
  type HrmDepartmentManagerDirectory,
} from './managementNotificationRecipients';

type HrmStatusNotificationDirectory = HrmDepartmentManagerDirectory & {
  getAuthUserIdForProfileId(profileId: string): Promise<string | null>;
};

type HrmStatusNotificationPublisher = {
  sendNotification(message: RealtimeMessage): Promise<void>;
};

type HrmStatusNotificationInput = {
  repository: HrmStatusNotificationDirectory;
  publisher: HrmStatusNotificationPublisher;
  tenantId: string;
  branchId: string;
  eventName: string;
  actorUserId: string;
  profileId: string;
  path: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
};

export type HrmStatusNotificationDependencies = {
  resolveManagementRecipients(
    input: Parameters<typeof resolveHrmManagementNotificationRecipients>[0],
  ): Promise<string[]>;
};

const defaultDependencies: HrmStatusNotificationDependencies = {
  resolveManagementRecipients: resolveHrmManagementNotificationRecipients,
};

/**
 * Persists the same status update for the employee, configured management
 * recipients and the actor who processed it. Recipient IDs are deduplicated so
 * an owner who is also a department manager or approver receives only one row.
 * Notification failures never roll back the completed HRM mutation.
 */
export async function notifyHrmStatusChange(
  {
    repository,
    publisher,
    tenantId,
    branchId,
    eventName,
    actorUserId,
    profileId,
    path,
    title,
    content,
    metadata,
  }: HrmStatusNotificationInput,
  dependencies: HrmStatusNotificationDependencies = defaultDependencies,
): Promise<number> {
  const [employeeResult, managementResult] = await Promise.allSettled([
    repository.getAuthUserIdForProfileId(profileId),
    dependencies.resolveManagementRecipients({
      tenantId,
      branchId,
      eventName,
      profileId,
      departmentDirectory: repository,
    }),
  ]);

  if (employeeResult.status === 'rejected') {
    console.error('[HRM] Failed to resolve employee status notification recipient:', employeeResult.reason);
  }
  if (managementResult.status === 'rejected') {
    console.error('[HRM] Failed to resolve management status notification recipients:', managementResult.reason);
  }

  const employeeUserId = employeeResult.status === 'fulfilled'
    ? employeeResult.value
    : null;
  const managementUserIds = managementResult.status === 'fulfilled'
    ? managementResult.value
    : [];
  const recipientIds = Array.from(new Set([
    actorUserId,
    ...(employeeUserId ? [employeeUserId] : []),
    ...managementUserIds,
  ]));

  const deliveries = await Promise.allSettled(recipientIds.map((recipientId) =>
    publisher.sendNotification({
      tenantId,
      branchId,
      recipientId,
      type: eventName,
      title,
      content,
      metadata: {
        ...metadata,
        path,
        actorUserId,
      },
    }),
  ));

  deliveries.forEach((delivery, index) => {
    if (delivery.status === 'rejected') {
      console.error('[HRM] Failed to persist status notification:', {
        recipientId: recipientIds[index],
        error: delivery.reason,
      });
    }
  });

  return deliveries.filter((delivery) => delivery.status === 'fulfilled').length;
}
