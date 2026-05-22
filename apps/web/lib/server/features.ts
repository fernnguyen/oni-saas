import { getTenantPlanMeta } from './subscriptions';
import { getSupabaseAdminClient } from './supabaseAdmin';

/**
 * Checks if a tenant has access to a specific premium feature.
 * Features can be unlocked either via:
 *   1. A specific standalone Feature Flag (Add-on bought separately).
 *   2. The metadata of their current active Subscription Plan.
 *
 * @param tenantId The ID of the tenant (company)
 * @param featureKey The key identifying the feature (e.g., 'qr_table_ordering')
 * @returns boolean True if the feature is unlocked, false otherwise.
 */
export async function checkFeatureAccess(tenantId: string, featureKey: string): Promise<boolean> {
  // 1. Check standalone Feature Flags first
  const admin = getSupabaseAdminClient();
  const { data: flag } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('key', featureKey)
    .maybeSingle();

  if (flag?.enabled) return true;

  // 2. Fallback to active Subscription Plan metadata
  const planMeta = await getTenantPlanMeta(tenantId);
  return !!planMeta[featureKey];
}
