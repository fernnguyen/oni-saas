import {
  DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
  type HrmManagementNotificationRoutingConfig,
} from '../../notifications/eventCatalog';
import { getSupabaseAdminClient } from '../supabaseAdmin';

export type HrmDepartmentManagerDirectory = {
  getDepartmentIdForProfileId(profileId: string): Promise<string | null>;
  listDepartmentManagerUserIds(departmentIds: string[]): Promise<string[]>;
};

type ResolveManagementNotificationRecipientsInput = {
  tenantId: string;
  branchId: string;
  eventName: string;
  requesterUserId: string;
  profileId: string;
  departmentDirectory: HrmDepartmentManagerDirectory;
};

type ManagementNotificationRecipientDependencies = {
  getRoutingConfig(
    tenantId: string,
    branchId: string,
    eventName: string,
  ): Promise<HrmManagementNotificationRoutingConfig>;
  listScopeUserIds(tenantId: string, branchId: string): Promise<string[]>;
  listRoleUserIds(
    tenantId: string,
    branchId: string,
    roleCodes: string[],
  ): Promise<string[]>;
};

export function normalizeHrmManagementRouting(
  value: unknown,
): HrmManagementNotificationRoutingConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
      role_codes: [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes],
      department_ids: [],
    };
  }

  const routing = value as Record<string, unknown>;
  const legacyFallback = routing.fallback_to_owner;
  const roleCodes = Array.isArray(routing.role_codes)
    ? routing.role_codes
        .filter((code): code is string => typeof code === 'string')
        .map((code) => code.trim())
        .filter(Boolean)
    : legacyFallback === false
      ? []
      : [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes];

  return {
    role_codes: Array.from(new Set(roleCodes)),
    requester_department_managers:
      typeof routing.requester_department_managers === 'boolean'
        ? routing.requester_department_managers
        : DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.requester_department_managers,
    department_ids: Array.isArray(routing.department_ids)
      ? Array.from(new Set(
          routing.department_ids
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean),
        ))
      : [],
  };
}

async function getRoutingConfig(
  tenantId: string,
  branchId: string,
  eventName: string,
): Promise<HrmManagementNotificationRoutingConfig> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenant_notification_events')
    .select('channels_config')
    .eq('tenant_id', tenantId)
    .eq('shop_id', branchId)
    .eq('event_name', eventName)
    .maybeSingle();
  if (error) throw error;

  const channels = data?.channels_config;
  const routing = channels && typeof channels === 'object' && !Array.isArray(channels)
    ? (channels as Record<string, unknown>).routing
    : undefined;
  return normalizeHrmManagementRouting(routing);
}

async function listScopeUserIds(
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

async function listRoleUserIds(
  tenantId: string,
  branchId: string,
  roleCodes: string[],
): Promise<string[]> {
  if (roleCodes.length === 0) return [];

  const admin = getSupabaseAdminClient();
  const { data: roleRows, error: roleError } = await admin
    .from('roles')
    .select('id, code')
    .in('code', roleCodes);
  if (roleError) throw roleError;
  const roleIds = Array.from(new Set((roleRows ?? []).map((role) => role.id)));
  if (roleIds.length === 0) return [];

  const [tenantMemberships, branchMemberships] = await Promise.all([
    admin
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('role_id', roleIds),
    admin
      .from('user_shops')
      .select('user_id')
      .eq('shop_id', branchId)
      .in('role_id', roleIds),
  ]);
  if (tenantMemberships.error) throw tenantMemberships.error;
  if (branchMemberships.error) throw branchMemberships.error;

  return Array.from(new Set([
    ...(tenantMemberships.data ?? []).map((membership) => membership.user_id),
    ...(branchMemberships.data ?? []).map((membership) => membership.user_id),
  ]));
}

const defaultDependencies: ManagementNotificationRecipientDependencies = {
  getRoutingConfig,
  listScopeUserIds,
  listRoleUserIds,
};

export async function resolveHrmManagementNotificationRecipients(
  {
    tenantId,
    branchId,
    eventName,
    requesterUserId,
    profileId,
    departmentDirectory,
  }: ResolveManagementNotificationRecipientsInput,
  dependencies: ManagementNotificationRecipientDependencies = defaultDependencies,
): Promise<string[]> {
  const [routing, scopeUserIds, requesterDepartmentId] = await Promise.all([
    dependencies.getRoutingConfig(tenantId, branchId, eventName),
    dependencies.listScopeUserIds(tenantId, branchId),
    departmentDirectory.getDepartmentIdForProfileId(profileId),
  ]);
  const scopeUserSet = new Set(scopeUserIds);
  const departmentIds = Array.from(new Set([
    ...routing.department_ids,
    ...(routing.requester_department_managers && requesterDepartmentId
      ? [requesterDepartmentId]
      : []),
  ]));
  const [roleUserIds, departmentManagerIds] = await Promise.all([
    dependencies.listRoleUserIds(tenantId, branchId, routing.role_codes),
    departmentIds.length > 0
      ? departmentDirectory.listDepartmentManagerUserIds(departmentIds)
      : Promise.resolve([]),
  ]);

  return Array.from(new Set([...roleUserIds, ...departmentManagerIds]))
    .filter((userId) => userId !== requesterUserId && scopeUserSet.has(userId));
}
