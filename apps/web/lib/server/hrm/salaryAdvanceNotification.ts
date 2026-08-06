import type { RealtimeMessage } from '@/lib/server/realtime';
import { HRM_NOTIFICATION_EVENTS } from '../../notifications/eventCatalog';
import type { HrmDepartmentManagerDirectory } from './managementNotificationRecipients';
import {
  notifyHrmStatusChange,
  type HrmStatusNotificationDependencies,
} from './statusNotification';

type SalaryAdvanceStatusDirectory = HrmDepartmentManagerDirectory & {
  getAuthUserIdForProfileId(profileId: string): Promise<string | null>;
};

type NotificationPublisher = {
  sendNotification(message: RealtimeMessage): Promise<void>;
};

type SalaryAdvanceEmployeeNotificationInput = {
  repository: SalaryAdvanceStatusDirectory;
  publisher: NotificationPublisher;
  tenantId: string;
  branchId: string;
  actorUserId: string;
  profileId: string;
  advanceId: string;
  title: string;
  content: string;
};

/**
 * Compatibility wrapper for salary-advance status events. Updates are sent to
 * the linked employee, configured management recipients and the processing
 * actor through the shared HRM status broadcaster.
 */
export async function notifySalaryAdvanceEmployee({
  repository,
  publisher,
  tenantId,
  branchId,
  actorUserId,
  profileId,
  advanceId,
  title,
  content,
}: SalaryAdvanceEmployeeNotificationInput,
dependencies?: HrmStatusNotificationDependencies,
): Promise<number> {
  return notifyHrmStatusChange({
    repository,
    publisher,
    tenantId,
    branchId,
    eventName: HRM_NOTIFICATION_EVENTS.salaryAdvanceStatusChanged,
    actorUserId,
    profileId,
    path: '/hrm/salary-advances',
    title,
    content,
    metadata: {
      advanceId,
    },
  }, dependencies);
}
