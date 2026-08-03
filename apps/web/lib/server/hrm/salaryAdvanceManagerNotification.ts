import { hasPermission } from '../permissions';
import {
  realtimeEngine,
  type RealtimeMessage,
} from '../realtime';
import { getSupabaseAdminClient } from '../supabaseAdmin';

type SalaryAdvanceManagerNotificationInput = {
  tenantId: string;
  branchId: string;
  requesterUserId: string;
  advanceId: string;
  amount: number;
  payPeriod: string;
};

type SalaryAdvanceManagerNotificationDependencies = {
  listCandidateUserIds(
    tenantId: string,
    branchId: string,
  ): Promise<string[]>;
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

  return Array.from(
    new Set([
      ...(tenantMemberships.data ?? []).map((membership) => membership.user_id),
      ...(branchMemberships.data ?? []).map((membership) => membership.user_id),
    ]),
  );
}

const defaultDependencies: SalaryAdvanceManagerNotificationDependencies = {
  listCandidateUserIds,
  userHasPermission: hasPermission,
  sendNotification: (message) => realtimeEngine.sendNotification(message),
};

/**
 * Notifies payroll managers about an employee-created salary advance without
 * broadcasting the request back to the employee or unrelated shop users.
 */
export async function notifySalaryAdvanceManagers(
  {
    tenantId,
    branchId,
    requesterUserId,
    advanceId,
    amount,
    payPeriod,
  }: SalaryAdvanceManagerNotificationInput,
  dependencies: SalaryAdvanceManagerNotificationDependencies = defaultDependencies,
): Promise<number> {
  try {
    const candidates = await dependencies.listCandidateUserIds(
      tenantId,
      branchId,
    );
    const uniqueCandidates = Array.from(new Set(candidates)).filter(
      (userId) => userId !== requesterUserId,
    );
    const permissionChecks = await Promise.all(
      uniqueCandidates.map(async (userId) => ({
        userId,
        canManagePayroll: await dependencies.userHasPermission(
          userId,
          tenantId,
          'hrm.payroll.manage',
          branchId,
        ),
      })),
    );
    const recipients = permissionChecks
      .filter(({ canManagePayroll }) => canManagePayroll)
      .map(({ userId }) => userId);

    await Promise.all(
      recipients.map((recipientId) =>
        dependencies.sendNotification({
          tenantId,
          branchId,
          recipientId,
          type: 'system',
          title: 'Yêu cầu ứng lương mới',
          content: `Có một yêu cầu ứng lương mới ${amount.toLocaleString('vi-VN')}đ cho kỳ lương ${payPeriod}.`,
          metadata: {
            path: '/hrm/salary-advances',
            advanceId,
          },
        }),
      ),
    );

    return recipients.length;
  } catch (error) {
    console.error(
      '[HRM] Failed to notify payroll managers about a salary advance request:',
      error,
    );
    return 0;
  }
}
