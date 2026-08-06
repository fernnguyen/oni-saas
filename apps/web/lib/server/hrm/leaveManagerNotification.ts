import { HRM_NOTIFICATION_EVENTS } from '../../notifications/eventCatalog';
import { hasPermission } from '../permissions';
import { realtimeEngine, type RealtimeMessage } from '../realtime';
import { getSupabaseAdminClient } from '../supabaseAdmin';

type LeaveManagerNotificationInput = {
  tenantId: string;
  branchId: string;
  requesterUserId: string;
  leaveId: string;
  title: string;
  content: string;
};

type LeaveManagerNotificationDependencies = {
  listCandidateUserIds(tenantId: string, branchId: string): Promise<string[]>;
  userHasPermission(
    userId: string,
    tenantId: string,
    permission: string,
    branchId: string,
  ): Promise<boolean>;
  sendNotification(message: RealtimeMessage): Promise<void>;
};

async function listCandidateUserIds(
  tenantId: string,
  branchId: string,
): Promise<string[]> {
  const admin = getSupabaseAdminClient();
  const [tenantMemberships, branchMemberships] = await Promise.all([
    admin.from('user_tenants').select('user_id').eq('tenant_id', tenantId),
    admin.from('user_shops').select('user_id').eq('shop_id', branchId),
  ]);

  if (tenantMemberships.error) throw tenantMemberships.error;
  if (branchMemberships.error) throw branchMemberships.error;

  return Array.from(new Set([
    ...(tenantMemberships.data ?? []).map((membership) => membership.user_id),
    ...(branchMemberships.data ?? []).map((membership) => membership.user_id),
  ]));
}

const defaultDependencies: LeaveManagerNotificationDependencies = {
  listCandidateUserIds,
  userHasPermission: hasPermission,
  sendNotification: (message) => realtimeEngine.sendNotification(message),
};

export async function notifyLeaveManagers(
  {
    tenantId,
    branchId,
    requesterUserId,
    leaveId,
    title,
    content,
  }: LeaveManagerNotificationInput,
  dependencies: LeaveManagerNotificationDependencies = defaultDependencies,
): Promise<number> {
  try {
    const candidates = Array.from(new Set(
      await dependencies.listCandidateUserIds(tenantId, branchId),
    )).filter((userId) => userId !== requesterUserId);

    const checks = await Promise.all(candidates.map(async (userId) => ({
      userId,
      canManageAttendance: await dependencies.userHasPermission(
        userId,
        tenantId,
        'hrm.attendance.manage',
        branchId,
      ),
    })));
    const recipients = checks
      .filter(({ canManageAttendance }) => canManageAttendance)
      .map(({ userId }) => userId);

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
