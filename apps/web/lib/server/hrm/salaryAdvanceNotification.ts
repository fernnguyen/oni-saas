import type { RealtimeMessage } from '@/lib/server/realtime';
import { HRM_NOTIFICATION_EVENTS } from '../../notifications/eventCatalog';

type ProfileAuthUserResolver = {
  getAuthUserIdForProfileId(profileId: string): Promise<string | null>;
};

type NotificationPublisher = {
  sendNotification(message: RealtimeMessage): Promise<void>;
};

type SalaryAdvanceEmployeeNotificationInput = {
  repository: ProfileAuthUserResolver;
  publisher: NotificationPublisher;
  tenantId: string;
  branchId: string;
  profileId: string;
  advanceId: string;
  title: string;
  content: string;
};

/**
 * HRM profiles can exist without a login account. Only dispatch a personal
 * notification after resolving the profile to its linked Supabase auth user.
 */
export async function notifySalaryAdvanceEmployee({
  repository,
  publisher,
  tenantId,
  branchId,
  profileId,
  advanceId,
  title,
  content,
}: SalaryAdvanceEmployeeNotificationInput): Promise<'sent' | 'skipped'> {
  const recipientId = await repository.getAuthUserIdForProfileId(profileId);

  if (!recipientId) {
    console.info(
      '[HRM] Skipped salary advance notification because the employee has no linked login account.',
      { advanceId },
    );
    return 'skipped';
  }

  await publisher.sendNotification({
    tenantId,
    branchId,
    recipientId,
    type: HRM_NOTIFICATION_EVENTS.salaryAdvanceStatusChanged,
    title,
    content,
    metadata: {
      path: '/hrm/salary-advances',
      advanceId,
    },
  });

  return 'sent';
}
