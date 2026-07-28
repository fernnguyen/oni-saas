import { getSupabaseAdminClient } from './supabaseAdmin';

export const DEFAULT_MAX_TENANTS_PER_ACCOUNT = 1;
export const MAX_CONFIGURED_TENANTS_PER_ACCOUNT = 100;
export const MAX_TENANTS_PER_ACCOUNT_CODE = 'MAX_TENANTS_PER_ACCOUNT_REACHED';

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

export type TenantCreationStatus = {
  ownedCount: number;
  maxPerAccount: number;
  canCreate: boolean;
  message: string | null;
};

export function normalizeMaxTenantsPerAccount(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TENANTS_PER_ACCOUNT;
  return Math.min(
    MAX_CONFIGURED_TENANTS_PER_ACCOUNT,
    Math.max(DEFAULT_MAX_TENANTS_PER_ACCOUNT, parsed),
  );
}

export function getMaxTenantMessage(maxPerAccount: number): string {
  return `Bạn đã đạt giới hạn ${maxPerAccount} gian hàng cho mỗi tài khoản. Vui lòng sử dụng tài khoản khác để tạo thêm gian hàng.`;
}

export async function getTenantCreationStatus(
  userId: string,
  admin: AdminClient = getSupabaseAdminClient(),
  suppliedConfig?: Record<string, unknown> | null,
): Promise<TenantCreationStatus> {
  const [ownerRoleResult, settingsResult] = await Promise.all([
    admin.from('roles').select('id').eq('code', 'owner').maybeSingle(),
    suppliedConfig
      ? Promise.resolve({ data: { config: suppliedConfig }, error: null })
      : admin.from('system_settings').select('config').eq('id', 'global').maybeSingle(),
  ]);

  if (ownerRoleResult.error || !ownerRoleResult.data) {
    throw ownerRoleResult.error ?? new Error('Không tìm thấy vai trò chủ sở hữu');
  }
  if (settingsResult.error) throw settingsResult.error;

  const config = (settingsResult.data?.config ?? {}) as Record<string, unknown>;
  const maxPerAccount = normalizeMaxTenantsPerAccount(config.max_tenants_per_account);
  const { count, error: countError } = await admin
    .from('user_tenants')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role_id', ownerRoleResult.data.id);

  if (countError) throw countError;

  const ownedCount = count ?? 0;
  const canCreate = ownedCount < maxPerAccount;
  return {
    ownedCount,
    maxPerAccount,
    canCreate,
    message: canCreate ? null : getMaxTenantMessage(maxPerAccount),
  };
}
