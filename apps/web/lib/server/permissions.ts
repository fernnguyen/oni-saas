import { getSupabaseAdminClient } from './supabaseAdmin';

/**
 * Returns the full list of permission codes for a user in a tenant/shop context.
 * Call once per request and pass the result around — avoids repeated DB round-trips.
 *
 * Resolution order (mirrors the SQL function):
 *   1. tenant-level role (owner → all, others → role_permissions)
 *   2. shop-level role   (staff/viewer/custom assigned to a specific shop)
 */
export async function getUserPermissions(
  userId: string,
  tenantId: string,
  shopId?: string,
): Promise<string[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc('get_user_permissions', {
    p_user_id:   userId,
    p_tenant_id: tenantId,
    p_shop_id:   shopId ?? null,
  });

  if (error) {
    console.error('[getUserPermissions]', error.message);
    return [];
  }

  return (data as { code: string }[] ?? []).map((r) => r.code);
}

/**
 * Single permission check — prefer getUserPermissions() + can() for multiple checks
 * in the same request to avoid N+1 queries.
 */
export async function hasPermission(
  userId: string,
  tenantId: string,
  permission: string,
  shopId?: string,
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc('user_has_permission', {
    p_user_id:    userId,
    p_tenant_id:  tenantId,
    p_shop_id:    shopId ?? null,
    p_permission: permission,
  });

  if (error) {
    console.error('[hasPermission]', error.message);
    return false;
  }

  return !!data;
}

/**
 * Convenience: build a can() function from a fetched permission list.
 * Usage:
 *   const perms = await getUserPermissions(userId, tenantId);
 *   const can   = buildCan(perms);
 *   if (can('orders.delete')) { ... }
 */
export function buildCan(permissions: string[]) {
  const set = new Set(permissions);
  return (permission: string) => set.has(permission);
}
